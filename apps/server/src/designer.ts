import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  DESIGN_ITEM_KINDS,
  DESIGN_LIGHT_KINDS,
  FURNITURE_BY_ROOM,
  applyCatalog,
  briefHash,
  buildZoneBrief,
  catalogOptionsForBrief,
  sanitizeProposal,
  validateRoomDesign,
  type Catalog,
  type DesignItemKind,
  type DesignZone,
  type ProjectDraft,
  type RoomDesign,
  type RoomDesignProposal,
} from '@air/domain';

/**
 * ИИ-дизайнер на Claude. Модель проектирует, код проверяет:
 * ответ чистится, товары из каталога подставляются с настоящими размерами,
 * затем проверяется доменными правилами; при замечаниях модель один раз их исправляет.
 */

export const DESIGN_MODEL = 'claude-opus-5-5';
/** Сколько раз просим исправить замечания. Каждая попытка — отдельный платный запрос. */
const MAX_REPAIRS = 1;

const hex = z.string().describe('Цвет #rrggbb');

const ProposalSchema = z.object({
  concept: z.string().describe('2–4 предложения по-русски: идея и почему расставлено именно так. Без координат и чисел в мм.'),
  palette: z.object({ walls: hex, floor: hex, ceiling: hex, accent: hex }),
  items: z.array(
    z.object({
      kind: z.enum(DESIGN_ITEM_KINDS),
      label: z.string().describe('Короткая подпись по-русски с цветом и материалом'),
      x: z.number().describe('Центр предмета по X, мм, в координатах комнаты'),
      y: z.number().describe('Центр предмета по Y, мм, в координатах комнаты'),
      widthMm: z.number(),
      depthMm: z.number(),
      heightMm: z.number(),
      rotationDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      color: hex,
      material: z.string(),
      mount: z.enum(['floor', 'wall']),
      productId: z.string().nullable().describe('id товара из catalog, если выбран товар; иначе null'),
    }),
  ),
  lights: z.array(z.object({ kind: z.enum(DESIGN_LIGHT_KINDS), x: z.number(), y: z.number() })),
  notes: z.array(z.string()).describe('1–4 практических совета по-русски, без координат'),
});

// Стабильный системный промпт — кешируется (cache_control), изменяемые данные сюда не вставлять.
const SYSTEM_PROMPT = `Ты — опытный дизайнер интерьеров. Ты проектируешь ОДНУ зону квартиры (комнату или объединённую кухню-гостиную) по брифу в JSON и возвращаешь расстановку мебели, освещение и палитру. Проект рисуется в 3D и проверяется программой, поэтому геометрия должна быть точной.

Система координат:
- миллиметры; (0,0) — левый верхний угол габарита зоны; X растёт вправо, Y — вниз;
- room.polygon — контур по осям стен; предметы должны полностью помещаться внутри него;
- x, y предмета — его центр; widthMm — размер вдоль X, depthMm — вдоль Y при rotationDeg = 0;
- rotationDeg (по часовой): 0 — предмет стоит спинкой к стене y = 0, а лицевой стороной смотрит в сторону роста Y; 90 — спинкой к правой стене; 180 — к стене с наибольшим Y; 270 — к стене x = 0. При 90 и 270 ширина и глубина меняются местами в плане. Диван, кровать, шкаф, тумба, гарнитур ставь спинкой к стене.

Обязательные правила:
1. Перед каждой дверью (openings.kind = "door") оставь свободную зону глубиной, равной ширине двери, в направлении inward. Перед окнами ставь только предметы ниже 900 мм.
2. Не закрывай инженерные точки (engineering: riser — стояк, vent — вентканал, gas — газ, electrical_panel — щиток), отступ не меньше 100 мм.
3. Мокрые точки (мойка, унитаз, душ, ванна, стиральная машина) ставь близко к стояку, если он отмечен: унитаз не дальше 1,5 м, остальное не дальше 3 м. Не предлагай тянуть канализацию далеко — лучше переставь.
4. Напольные предметы не пересекаются. Исключения: ковёр (rug) под мебелью; мойка (sink) и варочная панель (stove) внутри кухонного гарнитура (kitchen_set) — укажи их отдельными предметами в месте установки поверх гарнитура. Картины и зеркала — mount = "wall".
5. Проходы не уже 700 мм там, где ходят. Реальные размеры мебели.
6. Включи КАЖДЫЙ предмет из requiredItems с тем же kind. Остальное — по смыслу, без перегруза.
7. Если в брифе есть catalog — для подходящих предметов выбирай товары оттуда: укажи productId и размеры этого товара. Если подходящего нет — productId = null.
8. Освещение — по finishes.mainLight: "chandelier" — люстра или подвес по центру зоны; "spots" — не меньше 2 точечных; "chandelier_spots" — оба. При wallLighting или ceilingLighting добавь led_strip или wall_light.
9. Палитра соответствует отделке: стены — finishes.walls, пол — finishes.floor, потолок — finishes.ceiling. Учитывай стиль, жильцов, цель ремонта (сдача — износостойко, продажа — нейтрально) и бюджет.
10. Если есть mergedFrom — это объединённая кухня-гостиная: перегородки больше нет. Раздели пространство на кухонную и гостиную зоны (остров, барная стойка, обеденная группа, ковёр, свет), кухонную часть ставь у стояка и вентканала.

Тексты (concept, label, notes) — по-русски, без координат, без латинских букв в русских словах. Не выдумывай бренды, цены и нормы, которых нет в брифе.`;

export class DesignError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 | 503,
  ) {
    super(message);
  }
}

function toProposal(parsed: z.infer<typeof ProposalSchema> | null): RoomDesignProposal {
  if (!parsed) throw new DesignError('Модель вернула ответ, который не удалось разобрать. Попробуйте ещё раз.', 502);
  return { ...parsed, items: parsed.items.map(({ productId, ...it }) => ({ ...it, ...(productId ? { productId } : {}) })) };
}

export async function designZone(
  client: Anthropic,
  draft: ProjectDraft,
  zone: DesignZone,
  catalog: Catalog | undefined,
  signal?: AbortSignal,
): Promise<RoomDesign> {
  const brief = buildZoneBrief(draft, zone);
  const kinds: DesignItemKind[] = [
    ...new Set<DesignItemKind>([
      ...brief.requiredItems,
      ...FURNITURE_BY_ROOM[zone.room.kind],
      ...(zone.mergedFrom?.flatMap((m) => FURNITURE_BY_ROOM[m.kind]) ?? []),
      'rug', 'plant', 'floor_lamp', 'mirror',
    ]),
  ];
  const options = catalogOptionsForBrief(catalog, brief, kinds);
  const payload = options.length ? { ...brief, catalog: options } : brief;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Бриф зоны:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`` },
  ];

  let proposal: RoomDesignProposal | undefined;
  let issues: string[] = [];
  let model: string = DESIGN_MODEL;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const started = Date.now();
    const response = await client.beta.messages.parse(
      {
        model: DESIGN_MODEL,
        max_tokens: 16000,
        // Пространственная расстановка — задача, где глубина рассуждений заметна
        output_config: { effort: 'high', format: zodOutputFormat(ProposalSchema) },
        // При отказе классификатора запрос автоматически повторяется на рекомендованной модели
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
      },
      // Клиент отменил запрос — прекращаем и платный вызов модели
      { signal },
    );
    model = response.model;
    console.info(
      `[design] zone=${zone.id} attempt=${attempt} stop=${response.stop_reason} ms=${Date.now() - started}` +
        ` in=${response.usage.input_tokens} out=${response.usage.output_tokens} cached=${response.usage.cache_read_input_tokens ?? 0} catalog=${options.length}`,
    );

    if (response.stop_reason === 'refusal') {
      throw new DesignError('Модель отказалась выполнять запрос. Измените описание пожеланий и попробуйте снова.', 502);
    }
    if (response.stop_reason === 'max_tokens') throw new DesignError('Ответ модели оборвался. Попробуйте ещё раз.', 502);

    const applied = applyCatalog(sanitizeProposal(toProposal(response.parsed_output)), catalog);
    proposal = applied.proposal;
    issues = [...applied.issues, ...validateRoomDesign(proposal, brief)];
    if (issues.length === 0 || attempt === MAX_REPAIRS) break;

    // Ответ модели возвращается в историю как есть (вместе с блоками рассуждений)
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `Программа проверки нашла проблемы (размеры товаров из каталога уже подставлены):\n${issues.map((i) => `- ${i}`).join('\n')}\n\nИсправь их, сохранив удачные решения, и верни проект целиком.`,
    });
  }

  if (!proposal) throw new DesignError('Не удалось получить дизайн', 502);
  return {
    ...proposal,
    roomId: zone.id,
    inputsHash: briefHash(brief),
    createdAt: new Date().toISOString(),
    model,
    unresolved: issues,
  };
}
