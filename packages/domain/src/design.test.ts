import { describe, expect, it } from 'vitest';
import { briefHash, buildRoomBrief, validateRoomDesign, type DesignItem, type RoomDesignProposal } from './design';
import { createRoomFinishes } from './finishes';
import { TEST_PLAN } from './testPlan.fixture';
import type { ProjectDraft, Room } from './types';
import { createEmptyDraft } from './wizard';

const room = (id: string): Room => {
  const r = TEST_PLAN.rooms.find((x) => x.id === id);
  if (!r) throw new Error(id);
  return r;
};

function draft(): ProjectDraft {
  const d = createEmptyDraft(TEST_PLAN);
  d.goal = 'live';
  d.finishes.rooms.living = { ...createRoomFinishes('living'), furniture: ['sofa'] };
  return d;
}

const item = (over: Partial<DesignItem>): DesignItem => ({
  kind: 'sofa',
  label: 'Диван',
  x: 1750,
  y: 3000,
  widthMm: 2200,
  depthMm: 900,
  heightMm: 850,
  rotationDeg: 0,
  color: '#8a8f99',
  material: 'велюр',
  mount: 'floor',
  ...over,
});

const proposal = (items: DesignItem[], over: Partial<RoomDesignProposal> = {}): RoomDesignProposal => ({
  concept: 'Спокойная гостиная',
  palette: { walls: '#eeeeee', floor: '#c8a27a', ceiling: '#ffffff', accent: '#3d5a80' },
  items,
  lights: [],
  notes: [],
  ...over,
});

describe('дизайн от ИИ: бриф', () => {
  it('переводит комнату и проёмы в локальные координаты', () => {
    const b = buildRoomBrief(draft(), room('living'));
    expect(b.room).toMatchObject({ widthMm: 3500, depthMm: 3500, areaM2: 12.25 });
    expect(b.openings).toHaveLength(1);
    expect(b.openings[0]).toMatchObject({ kind: 'door', a: { x: 3500, y: 1000 }, b: { x: 3500, y: 1800 }, inward: { x: -1, y: 0 } });
    expect(b.requiredItems).toEqual(['sofa']);
  });

  it('отпечаток меняется, когда меняется отделка', () => {
    const d = draft();
    const h1 = briefHash(buildRoomBrief(d, room('living')));
    d.finishes.rooms.living = { ...createRoomFinishes('living'), furniture: ['sofa', 'armchairs'] };
    expect(briefHash(buildRoomBrief(d, room('living')))).not.toBe(h1);
  });
});

describe('дизайн от ИИ: проверка ответа', () => {
  it('корректный дизайн проходит', () => {
    expect(validateRoomDesign(proposal([item({})]), buildRoomBrief(draft(), room('living')))).toEqual([]);
  });

  it('находит выход за стены, пересечения, перекрытую дверь и пропущенную мебель', () => {
    const b = buildRoomBrief(draft(), room('living'));
    const issues = validateRoomDesign(
      proposal([
        item({ kind: 'armchairs', label: 'Кресло у двери', x: 3100, y: 1400, widthMm: 700, depthMm: 700 }),
        item({ kind: 'shelving', label: 'Стеллаж', x: 300, y: 3400, widthMm: 1000, depthMm: 400 }),
        item({ kind: 'coffee_table', label: 'Столик', x: 1000, y: 1000, widthMm: 900, depthMm: 600 }),
        item({ kind: 'plant', label: 'Фикус', x: 1100, y: 1100, widthMm: 400, depthMm: 400 }),
      ]),
      b,
    );
    expect(issues.join('\n')).toContain('«Кресло у двери» мешает открыванию двери');
    expect(issues.join('\n')).toContain('«Стеллаж» выходит за стены');
    expect(issues.join('\n')).toContain('«Столик» и «Фикус» пересекаются');
    expect(issues.join('\n')).toContain('нет предмета, который выбрал клиент: sofa');
  });

  it('высокий шкаф перед окном — замечание, низкий комод — нет', () => {
    const d = draft();
    const b = buildRoomBrief(d, room('kitchen'));
    const tall = item({ kind: 'wardrobe', label: 'Шкаф', x: 1700, y: 300, widthMm: 1000, depthMm: 500, heightMm: 2100 });
    const low = item({ kind: 'dresser', label: 'Комод', x: 1700, y: 300, widthMm: 1000, depthMm: 500, heightMm: 800 });
    expect(validateRoomDesign(proposal([tall]), b).join()).toContain('закрывает окно');
    expect(validateRoomDesign(proposal([low]), b).join()).not.toContain('закрывает окно');
  });

  it('свет должен соответствовать выбору клиента, стояк — оставаться доступным', () => {
    const d = draft();
    d.finishes.rooms.living = { ...createRoomFinishes('living'), furniture: ['sofa'], mainLight: 'chandelier_spots', wallLighting: true };
    d.engineering = [{ id: 'r', type: 'riser', position: { x: 1750, y: 6000 } }];
    const b = buildRoomBrief(d, room('living'));
    const issues = validateRoomDesign(proposal([item({})], { lights: [{ kind: 'spot', x: 500, y: 500 }] }), b).join('\n');
    expect(issues).toContain('люстру');
    expect(issues).toContain('минимум 2');
    expect(issues).toContain('подсветку');
    expect(issues).toContain('перекрывает инженерную точку (riser)');
  });
});
