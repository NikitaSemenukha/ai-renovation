import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
  DESIGN_ITEM_KINDS,
  DESIGN_LIGHT_KINDS,
  briefHash,
  buildRoomBrief,
  validateRoomDesign,
  type ProjectDraft,
  type Room,
  type RoomDesign,
  type RoomDesignProposal,
} from '@air/domain';

/**
 * ИИ-дизайнер комнаты на Claude. Модель проектирует, код проверяет:
 * ответ валидируется доменными правилами (стены, двери, окна, стояки, выбор клиента),
 * и при замечаниях модель один раз получает их на исправление.
 */

export const DESIGN_MODEL = 'claude-opus-5-5';
/** Сколько раз просим исправить замечания. Каждая попытка — отдельный платный запрос. */
const MAX_REPAIRS = 1;

const hex = z.string().describe('Цвет #rrggbb');

const ProposalSchema = z.object({
  concept: z.string().describe('2–4 предложения по-русски: идея комнаты и почему расставлено именно так'),
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
    }),
  ),
  lights: z.array(z.object({ kind: z.enum(DESIGN_LIGHT_KINDS), x: z.number(), y: z.number() })),
  notes: z.array(z.string()).describe('1–4 практических замечания по-русски: что уточнить или учесть при ремонте'),
});

// Стабильный системный промпт — кешируется (cache_control), не вставлять сюда изменяемые данные.
const SYSTEM_PROMPT = `Ты — опытный дизайнер интерьеров. Ты проектируешь ОДНУ комнату квартиры по брифу в JSON и возвращаешь расстановку мебели, освещение и палитру. Твой проект будет нарисован в 3D и проверен программой, поэтому геометрия должна быть точной.

Система координат:
- миллиметры; (0,0) — левый верхний угол габарита комнаты; X растёт вправо, Y — вниз;
- room.polygon — контур комнаты по осям стен; предметы должны полностью помещаться внутри него;
- x, y предмета — его центр; widthMm — размер вдоль X, depthMm — вдоль Y при rotationDeg = 0;
- rotationDeg (по часовой): 0 — предмет стоит спинкой к стене y = 0, 90 — к правой стене, 180 — к стене с наибольшим Y, 270 — к стене x = 0. При 90 и 270 ширина и глубина меняются местами в плане.

Обязательные правила:
1. Перед каждой дверью (openings.kind = "door") оставь свободную зону глубиной, равной ширине двери, в направлении inward. Перед окнами ставь только предметы ниже 900 мм.
2. Не закрывай инженерные точки (engineering: riser — стояк, vent — вентканал, gas — газ, electrical_panel — щиток): к ним нужен доступ, отступ от предмета не меньше 100 мм.
3. Напольные предметы не пересекаются. Ковёр (rug) можно класть под мебель. Картины и зеркала на стене — mount = "wall".
4. Оставляй проходы не уже 700 мм там, где ходят люди. Используй реальные размеры мебели.
5. Включи КАЖДЫЙ предмет из requiredItems, указав его kind точно так же. Остальное добавляй по смыслу, без перегруза.
6. Освещение — по finishes.mainLight: "chandelier" — люстра или подвес по центру зоны; "spots" — не меньше 2 точечных; "chandelier_spots" — оба. При finishes.wallLighting или ceilingLighting добавь led_strip или wall_light.
7. Палитра должна соответствовать выбранной отделке: стены — finishes.walls (обои, краска, панели, плитка), пол — finishes.floor (ламинат, винил, плитка, наливной), потолок — finishes.ceiling. Учитывай стиль (styles), жильцов, цель ремонта (для сдачи — износостойко и практично, для продажи — нейтрально) и бюджет.
8. В санузле ставь унитаз ближе к стояку, если он отмечен.

Пиши по-русски. Не выдумывай бренды, цены и нормы, которых нет в брифе.`;

export class DesignError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 | 503,
  ) {
    super(message);
  }
}

function proposalOf(parsed: z.infer<typeof ProposalSchema> | null): RoomDesignProposal {
  if (!parsed) throw new DesignError('Модель вернула ответ, который не удалось разобрать. Попробуйте ещё раз.', 502);
  return parsed;
}

export async function designRoom(client: Anthropic, draft: ProjectDraft, room: Room): Promise<RoomDesign> {
  const brief = buildRoomBrief(draft, room);
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: 'user', content: `Бриф комнаты:\n\`\`\`json\n${JSON.stringify(brief, null, 2)}\n\`\`\`` },
  ];

  let proposal: RoomDesignProposal | undefined;
  let issues: string[] = [];
  let model: string = DESIGN_MODEL;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const started = Date.now();
    const response = await client.beta.messages.parse({
      model: DESIGN_MODEL,
      max_tokens: 16000,
      // Пространственная расстановка — задача, где глубина рассуждений заметна
      output_config: { effort: 'high', format: zodOutputFormat(ProposalSchema) },
      // При отказе классификатора запрос автоматически повторяется на рекомендованной модели
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    model = response.model;
    console.info(
      `[design] room=${room.id} attempt=${attempt} stop=${response.stop_reason} ms=${Date.now() - started}` +
        ` in=${response.usage.input_tokens} out=${response.usage.output_tokens} cached=${response.usage.cache_read_input_tokens ?? 0}`,
    );

    if (response.stop_reason === 'refusal') {
      throw new DesignError('Модель отказалась выполнять запрос. Измените описание пожеланий и попробуйте снова.', 502);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new DesignError('Ответ модели оборвался. Попробуйте ещё раз.', 502);
    }

    proposal = proposalOf(response.parsed_output);
    issues = validateRoomDesign(proposal, brief);
    if (issues.length === 0 || attempt === MAX_REPAIRS) break;

    // Ответ модели возвращается в историю как есть (вместе с блоками рассуждений)
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `Программа проверки нашла проблемы:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nИсправь их, сохранив удачные решения, и верни проект целиком.`,
    });
  }

  if (!proposal) throw new DesignError('Не удалось получить дизайн', 502);
  return {
    ...proposal,
    roomId: room.id,
    inputsHash: briefHash(brief),
    createdAt: new Date().toISOString(),
    model,
    unresolved: issues,
  };
}
