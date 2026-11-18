import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { designZones, type ProjectDraft } from '@air/domain';
import { loadCatalog } from './catalog';
import { DESIGN_MODEL, DesignError, designZone } from './designer';
import { recognizePlan, type PlanInput } from './planReader';

/**
 * API прототипа: распознавание плана и дизайн комнаты от ИИ.
 * Ключ Anthropic живёт только здесь (apps/server/.env), во фронтенд не попадает.
 */

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // .env необязателен: ключ можно передать переменной окружения
}

const PORT = Number(process.env.PORT ?? 8787);
const RATE_LIMIT_PER_HOUR = Number(process.env.DESIGN_RATE_LIMIT_PER_HOUR ?? 30);
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
// Клиент создаётся лениво: без ключа сервер стартует и честно сообщает, что ИИ не настроен
let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

/** Простой лимит запросов на IP в памяти — защита от случайного перерасхода в прототипе. */
const hits = new Map<string, number[]>();
function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= RATE_LIMIT_PER_HOUR) return false;
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

// Черновик проверяется по ключевым полям, которые нужны для брифа; остальное доменная логика читает сама
const point = z.object({ x: z.number(), y: z.number() });
const RequestSchema = z.object({
  roomId: z.string().min(1),
  draft: z.looseObject({
    geometry: z.looseObject({
      walls: z.array(z.looseObject({ id: z.string(), a: point, b: point })),
      rooms: z.array(z.looseObject({ id: z.string(), name: z.string(), kind: z.string(), polygon: z.array(point).min(3) })),
      openings: z.array(z.looseObject({ wallId: z.string(), offsetMm: z.number(), widthMm: z.number() })),
    }),
    finishes: z.looseObject({ rooms: z.record(z.string(), z.unknown()) }),
    wishes: z.looseObject({ styles: z.array(z.string()), goals: z.array(z.string()), text: z.string() }),
    property: z.looseObject({}),
    occupants: z.looseObject({}),
    engineering: z.array(z.looseObject({ type: z.string(), position: point })),
  }),
});

const PlanRequestSchema = z
  .object({
    file: z.object({ mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']), base64: z.string().min(100) }).optional(),
    description: z.string().min(20).max(4000).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => v.file || v.description, 'Нужен файл плана или описание');

/** Ошибки вызова ИИ — в понятный клиенту ответ; подробности только в лог сервера. */
function aiErrorResponse(err: unknown, tag: string, signal: AbortSignal): Response {
  const json = (body: object, status: number) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (err instanceof Anthropic.APIUserAbortError || signal.aborted) {
    console.info(`[${tag}] отменено клиентом`);
    // Ответ клиент уже не ждёт; 499 — «клиент закрыл запрос»
    return new Response(null, { status: 499 });
  }
  if (err instanceof DesignError) return json({ error: err.message }, err.status);
  if (err instanceof Anthropic.AuthenticationError) {
    console.error(`[${tag}] invalid API key`);
    return json({ error: 'Ключ Anthropic не принят. Проверьте ANTHROPIC_API_KEY.' }, 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return json({ error: 'Сервис ИИ перегружен или исчерпан лимит аккаунта. Попробуйте через минуту.' }, 503);
  }
  if (err instanceof Anthropic.APIError) {
    console.error(`[${tag}] API error ${err.status}: ${err.message}`);
    return json({ error: 'Ошибка сервиса ИИ. Попробуйте ещё раз.' }, 502);
  }
  console.error(`[${tag}] unexpected`, err);
  return json({ error: 'Внутренняя ошибка сервера' }, 502);
}

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, ai: hasKey ? 'configured' : 'missing_key', model: DESIGN_MODEL }));

/** Каталог для витрины: названия, цены, ссылки на товары из дизайна. */
app.get('/api/catalog', (c) => {
  const catalog = loadCatalog();
  return catalog ? c.json(catalog) : c.json({ error: 'Каталог не загружен' }, 404);
});

app.post('/api/design/room', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
  if (!hasKey) {
    return c.json({ error: 'ИИ не настроен: добавьте ANTHROPIC_API_KEY в apps/server/.env и перезапустите сервер.' }, 503);
  }
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allow(ip)) return c.json({ error: `Лимит: не больше ${RATE_LIMIT_PER_HOUR} генераций в час. Попробуйте позже.` }, 429);

  const parsed = RequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Некорректные данные проекта' }, 400);
  const draft = parsed.data.draft as unknown as ProjectDraft;
  // roomId — id комнаты или объединённой зоны (например, кухни-гостиной)
  const zone = designZones(draft).find((z) => z.id === parsed.data.roomId);
  if (!zone) return c.json({ error: 'Комната не найдена в плане' }, 400);
  if (zone.blockedReason) return c.json({ error: `Эту зону нельзя спроектировать: ${zone.blockedReason}` }, 400);

  try {
    return c.json(await designZone(getClient(), draft, zone, loadCatalog(), c.req.raw.signal));
  } catch (err) {
    return aiErrorResponse(err, `design zone=${zone.id}`, c.req.raw.signal);
  }
});

/** Распознавание плана: файл (картинка/PDF, base64) или текстовое описание квартиры. */
app.post('/api/plan/recognize', bodyLimit({ maxSize: 32 * 1024 * 1024, onError: (c) => c.json({ error: 'Файл слишком большой для распознавания' }, 413) }), async (c) => {
  if (!hasKey) {
    return c.json({ error: 'ИИ не настроен: добавьте ANTHROPIC_API_KEY в apps/server/.env и перезапустите сервер.' }, 503);
  }
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allow(ip)) return c.json({ error: `Лимит: не больше ${RATE_LIMIT_PER_HOUR} запросов к ИИ в час. Попробуйте позже.` }, 429);

  const parsed = PlanRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Нужен файл плана (JPG, PNG, WebP, PDF) или описание квартиры от 20 символов' }, 400);
  const { file, description, notes } = parsed.data;
  const input: PlanInput = file ? { kind: 'file', ...file } : { kind: 'text', description: description! };

  try {
    return c.json(await recognizePlan(getClient(), input, notes, c.req.raw.signal));
  } catch (err) {
    return aiErrorResponse(err, 'plan', c.req.raw.signal);
  }
});

// Продакшен: собранный сайт (npm run build → apps/web/dist) отдаёт этот же сервер — один процесс, один порт.
// В разработке сайт отдаёт Vite (npm run dev), а сюда проксирует только /api.
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
const hasWeb = existsSync(`${webDist}/index.html`);
if (hasWeb) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), webDist) }));
  // Маршруты приложения (/projects/…) обслуживает React Router — отдаём index.html
  const indexHtml = readFileSync(`${webDist}/index.html`, 'utf-8');
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Не найдено' }, 404) : c.html(indexHtml)));
}

const HOST = process.env.HOST ?? '0.0.0.0';
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.info(`[server] http://${HOST}:${PORT}  AI: ${hasKey ? DESIGN_MODEL : 'ключ не задан (apps/server/.env)'}  сайт: ${hasWeb ? 'apps/web/dist' : 'не собран (npm run build) — в разработке используйте npm run dev'}`);
});
