import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { buildGeometryFromRecognition, roomNetAreaM2, type PlanGeometry, type RecognizedPlan } from '@air/domain';
import { DESIGN_MODEL, DesignError } from './designer';
import { ROOM_COLORS, renderPlanPng } from './planRaster';

/**
 * Распознавание плана квартиры на Claude: картинка или PDF (техпаспорт, план застройщика, фото)
 * либо текстовое описание. Модель читает план, код строит стены и проверяет геометрию;
 * при замечаниях модель один раз исправляет ответ. Затем — визуальная сверка: результат рисуется
 * картинкой и вместе с оригиналом отправляется модели; найденные расхождения она исправляет.
 */

const MAX_REPAIRS = 1;
/** Сколько раз сверять картинку результата с оригиналом (каждый раз — ещё один запрос, ~20–40 с). */
const MAX_VISUAL_CHECKS = 2;

const point = z.object({ x: z.number(), y: z.number() });

const PlanSchema = z.object({
  rooms: z.array(
    z.object({
      name: z.string().describe('Название по-русски: «Кухня», «Гостиная», «Спальня 2», «Санузел», «Коридор», «Кладовая»'),
      kind: z.enum(['kitchen', 'living', 'bedroom', 'bathroom', 'hall', 'other']),
      polygon: z.array(point).describe('Контур по осям стен, мм, по часовой стрелке'),
      labeledAreaM2: z.number().nullable().describe('Площадь, подписанная на плане, м²; нет подписи — null'),
    }),
  ),
  openings: z.array(
    z.object({
      kind: z.enum(['door', 'window']),
      x: z.number().describe('Центр проёма на оси стены, мм'),
      y: z.number(),
      widthMm: z.number(),
    }),
  ),
  thickWalls: z.array(z.object({ a: point, b: point, thicknessMm: z.number() })).describe('Внутренние стены, нарисованные заметно толще перегородок'),
  uncertain: z.array(z.string()).describe('До 8 сомнительных мест по-русски, без координат'),
});

const CheckSchema = z.object({
  originalDoors: z
    .array(z.string())
    .describe('Сначала: каждая дверь на ОРИГИНАЛЕ по одной (дуга открывания или разрыв в стене) — «между прихожей и кухней, в нижней стене прихожей справа»'),
  originalWindows: z.array(z.string()).describe('Каждое окно на ОРИГИНАЛЕ по одной — в какой комнате и на какой наружной стене'),
  discrepancies: z
    .array(z.string())
    .describe('Конкретные расхождения картинки результата с оригиналом, по-русски; совпадает — пустой список'),
  matches: z.boolean().describe('true — результат совпадает с оригиналом и исправлять нечего'),
  corrected: PlanSchema.nullable().describe('Если matches=false — распознавание целиком с исправлениями, иначе null'),
});

// Стабильный системный промпт — кешируется; данные конкретного плана сюда не вставлять.
const SYSTEM_PROMPT = `Ты — инженер, который переводит планы квартир в точную геометрию. На входе — изображение или PDF плана (украинский или российский техпаспорт БТИ, план застройщика, фото или скан, иногда нарисованный от руки) либо текстовое описание квартиры. Ты возвращаешь комнаты контурами, двери и окна, толстые стены и список сомнительных мест. По этой геометрии строятся 3D, расстановка мебели и смета, поэтому размеры важнее красоты.

Система координат: миллиметры, начало — левый верхний угол квартиры, x вправо, y вниз. Контуры проводи по осям стен (середине толщины). У соседних комнат общая стена — одна и та же линия: одинаковые координаты у обеих комнат, без зазоров и наложений.

Как читать размеры:
1. Техпаспорт БТИ: размеры обычно в метрах с запятой («3,40», «2,95») вдоль стен внутри комнат, площади — числом в центре («17,3»). План застройщика: размеры в миллиметрах, площади в м².
2. Подписанный размер — это внутренний размер комнаты (от стены до стены). Ось стены находится на половину толщины дальше: прибавь половину толщины с каждой стороны (перегородка ≈ 100 мм, несущая внутренняя 140–380 мм, наружная 300–500 мм).
3. Сверяй ширину × глубину с подписанной площадью; если не сходится больше чем на 10% — перечитай цифры (типичная путаница: 3,04 и 3,40; 2,7 и 7,2) и отметь в uncertain.
4. Если размеров нет, оцени масштаб по площадям, по масштабной линейке или по типичной ширине двери 800 мм и обязательно напиши в uncertain, что размеры оценочные.

Комнаты:
- kitchen — кухня, кухня-ниша; bathroom — санузел, ванная, туалет, совмещённый санузел; hall — коридор, прихожая, холл; living — самая большая жилая комната («Гостиная»); bedroom — остальные жилые («Спальня», «Спальня 2», «Детская»); other — кладовая, гардеробная, постирочная.
- Балконы и лоджии не включай в комнаты — упомяни их в uncertain одной фразой.
- Контур — многоугольник с прямыми углами (стены вдоль осей), по часовой стрелке, без самопересечений; Г-образная комната — 6 точек. Скосы ставь, только если они явно нарисованы.
- Каждое помещение, отделённое стенами, — отдельная комната; встроенный шкаф без стен — не комната.

Проёмы:
- door — двери (дуга открывания, разрыв в стене), включая входную и балконную; точка — центр проёма на оси стены, ширина — ширина проёма (обычно 700–900 мм).
- window — окна на наружных стенах (тонкие двойные/тройные линии в толще стены).

thickWalls: внутренние стены, нарисованные заметно толще перегородок (вероятно несущие), с оценкой толщины. Наружные стены сюда не включай.

uncertain: конкретно и по-русски, что клиенту стоит сверить: «Ширина кухни: на плане 3,04 — возможно 3,40», «Размеры оценены по площадям — подписей нет», «Балкон не включён». Без координат. Если всё прочитано уверенно — пустой список.

Если на изображении не план квартиры — верни пустой список комнат и объясни в uncertain, что не так.
Если на входе текстовое описание — построй правдоподобную планировку по нему, а всё, что пришлось додумать (расположение комнат, неуказанные размеры), перечисли в uncertain.`;

export type PlanInput =
  | { kind: 'file'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; base64: string }
  | { kind: 'text'; description: string };

export interface PlanRecognitionResult {
  geometry: PlanGeometry;
  uncertain: string[];
  issues: string[];
  model: string;
  /** Что нашла визуальная сверка с оригиналом (по раундам; пусто — совпало с первого раза). */
  checks: string[][];
}

function inputBlocks(input: PlanInput, notes?: string): Anthropic.Beta.BetaContentBlockParam[] {
  const extra = notes?.trim() ? `\n\nУточнения клиента к прошлому распознаванию (они важнее того, что видно на плане):\n${notes.trim()}` : '';
  if (input.kind === 'text') {
    return [{ type: 'text', text: `Текстовое описание квартиры от клиента:\n${input.description.trim()}${extra}` }];
  }
  const file: Anthropic.Beta.BetaContentBlockParam =
    input.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.base64 } };
  return [file, { type: 'text', text: `Распознай план квартиры.${extra}` }];
}

/** Легенда к картинке результата: цвет/номер → комната, площади по контуру и подписанные. */
function checkPrompt(geometry: PlanGeometry, rec: RecognizedPlan): string {
  const rooms = geometry.rooms.map((r, i) => {
    const xs = r.polygon.map((p) => p.x), ys = r.polygon.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const labeled = rec.rooms.find((x) => x.name === r.name)?.labeledAreaM2;
    return `${i + 1} (${ROOM_COLORS[i % ROOM_COLORS.length]!.name}) — «${r.name}»: габарит по осям ${w}×${h} мм, в чистоте ≈ ${roomNetAreaM2(r.polygon).toFixed(1)} м²${labeled ? `, на плане подписано ${labeled} м²` : ''}`;
  });
  const doors = geometry.openings.filter((o) => o.kind === 'door').length;
  const windows = geometry.openings.length - doors;
  return `Это картинка того, что получилось из твоего распознавания (построено программой по твоим координатам). Комнаты залиты цветом и пронумерованы, стены чёрные, двери — красные отрезки (${doors} шт.), окна — синие (${windows} шт.), чёрная линия внизу слева — 1 метр.

Комнаты:
${rooms.join('\n')}

Сравни картинку с оригиналом плана (первое изображение) так, будто проверяешь работу чертёжника:
1. Те же ли помещения, в тех же местах и с теми же соседями? Ничего не пропущено и не лишнее (балконы и лоджии в комнаты не входят)?
2. Совпадают ли пропорции и размеры комнат с оригиналом и его подписями (размеры, площади)?
3. Двери и окна: сначала заново, не глядя на своё прошлое распознавание, найди на оригинале КАЖДУЮ дверь (каждую дугу открывания, включая входную, балконную и двери в перегородках между комнатами) и каждое окно — запиши их в originalDoors и originalWindows. Затем сверь списки с красными и синими отрезками на картинке: пропущенные, лишние и стоящие не в той стене — это расхождения. Выход на балкон — дверь, а не окно; не рисуй окно там, где на оригинале глухая стена.
4. Совпадают ли толстые (несущие) стены?

Мелкие отличия до ~5% и условность рисунка не считаются расхождениями. Если всё совпадает — matches=true, corrected=null. Если есть реальные расхождения — перечисли их в discrepancies и верни в corrected исправленное распознавание целиком (в тех же правилах, что и раньше).`;
}

export async function recognizePlan(client: Anthropic, input: PlanInput, notes: string | undefined, signal?: AbortSignal): Promise<PlanRecognitionResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: inputBlocks(input, notes) }];
  let built: ReturnType<typeof buildGeometryFromRecognition> | undefined;
  let uncertain: string[] = [];
  let model: string = DESIGN_MODEL;
  let lastRec: RecognizedPlan | undefined;
  let lastContent: Anthropic.Beta.BetaContentBlock[] | undefined;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const started = Date.now();
    const response = await client.beta.messages.parse(
      {
        model: DESIGN_MODEL,
        max_tokens: 20000,
        output_config: { effort: 'high', format: zodOutputFormat(PlanSchema) },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages,
      },
      { signal },
    );
    model = response.model;
    console.info(
      `[plan] ${input.kind} attempt=${attempt} stop=${response.stop_reason} ms=${Date.now() - started}` +
        ` in=${response.usage.input_tokens} out=${response.usage.output_tokens} cached=${response.usage.cache_read_input_tokens ?? 0}`,
    );
    if (response.stop_reason === 'refusal') throw new DesignError('Модель отказалась обрабатывать этот файл. Попробуйте другой план.', 502);
    if (response.stop_reason === 'max_tokens') throw new DesignError('Ответ модели оборвался. Попробуйте ещё раз.', 502);
    const parsed = response.parsed_output;
    if (!parsed) throw new DesignError('Модель вернула ответ, который не удалось разобрать. Попробуйте ещё раз.', 502);

    const rec: RecognizedPlan = parsed;
    lastRec = rec;
    lastContent = response.content;
    uncertain = parsed.uncertain.slice(0, 8);
    if (rec.rooms.length === 0) {
      throw new DesignError(uncertain[0] ? `Не удалось распознать план: ${uncertain[0]}` : 'На изображении не найден план квартиры.', 400);
    }
    built = buildGeometryFromRecognition(rec);
    if (built.issues.length) console.info(`[plan] замечания проверки (${built.issues.length}): ${built.issues.join(' | ')}`);
    if (built.issues.length === 0 || attempt === MAX_REPAIRS) break;

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `Программа проверки геометрии нашла проблемы:\n${built.issues.map((i) => `- ${i}`).join('\n')}\n\nПерепроверь план и верни распознавание целиком, исправив их. Если проблема есть на самом плане (например, ниша без двери), оставь как есть и упомяни в uncertain.`,
    });
  }

  if (!built || !lastRec || !lastContent) throw new DesignError('Не удалось распознать план', 502);

  // Визуальная сверка с оригиналом — только для файла: у текстового описания нет картинки для сравнения
  const checks: string[][] = [];
  if (input.kind === 'file') {
    for (let round = 0; round < MAX_VISUAL_CHECKS; round++) {
      messages.push({ role: 'assistant', content: lastContent });
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: renderPlanPng(built.geometry).toString('base64') } },
          { type: 'text', text: checkPrompt(built.geometry, lastRec) },
        ],
      });
      const started = Date.now();
      const response = await client.beta.messages.parse(
        {
          model: DESIGN_MODEL,
          max_tokens: 20000,
          output_config: { effort: 'high', format: zodOutputFormat(CheckSchema) },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages,
        },
        { signal },
      );
      const check = response.parsed_output;
      console.info(
        `[plan] check=${round} stop=${response.stop_reason} ms=${Date.now() - started} in=${response.usage.input_tokens} out=${response.usage.output_tokens}` +
          ` matches=${check?.matches} найдено: ${check?.discrepancies.join(' | ') || '—'}`,
      );
      // Сбой проверки не ломает распознавание: остаётся уже построенный план
      if (!check || response.stop_reason !== 'end_turn') break;
      if (check.matches || !check.corrected || check.corrected.rooms.length === 0) break;
      checks.push(check.discrepancies);
      const next = buildGeometryFromRecognition(check.corrected);
      // Исправление, которое ломает геометрию сильнее прежнего, не принимаем
      if (next.geometry.rooms.length === 0 || next.issues.length > built.issues.length + 1) break;
      built = next;
      lastRec = check.corrected;
      uncertain = check.corrected.uncertain.slice(0, 8);
      lastContent = response.content;
      model = response.model;
    }
  }

  return { geometry: built.geometry, uncertain, issues: built.issues, model, checks };
}
