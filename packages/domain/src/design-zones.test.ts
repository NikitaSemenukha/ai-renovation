import { describe, expect, it } from 'vitest';
import { applyCatalog, catalogOptionsForBrief, designCost, type Catalog } from './catalog';
import {
  MERGED_KITCHEN_ZONE_ID,
  buildRoomBrief,
  buildZoneBrief,
  designZones,
  sanitizeDesignText,
  validateRoomDesign,
  type DesignItem,
  type RoomDesignProposal,
} from './design';
import { createRoomFinishes } from './finishes';
import { TEST_PLAN } from './testPlan.fixture';
import type { ProjectDraft } from './types';
import { createEmptyDraft } from './wizard';

const draft = (): ProjectDraft => {
  const d = createEmptyDraft(TEST_PLAN);
  d.goal = 'live';
  return d;
};
const item = (o: Partial<DesignItem>): DesignItem => ({
  kind: 'sofa', label: 'Предмет', x: 1000, y: 1000, widthMm: 600, depthMm: 600, heightMm: 800,
  rotationDeg: 0, color: '#999999', material: 'дерево', mount: 'floor', ...o,
});
const proposal = (items: DesignItem[]): RoomDesignProposal => ({
  concept: '', palette: { walls: '#ffffff', floor: '#cccccc', ceiling: '#ffffff', accent: '#000000' }, items, lights: [], notes: [],
});

describe('мокрые точки и стояк', () => {
  it('мойка далеко от стояка — замечание; рядом — нет', () => {
    const d = draft();
    d.engineering = [{ id: 'r', type: 'riser', position: { x: 200, y: 200 } }];
    const b = buildRoomBrief(d, TEST_PLAN.rooms[0]!); // кухня 3500×3000
    const far = validateRoomDesign(proposal([item({ kind: 'sink', label: 'Мойка', x: 3200, y: 2700, widthMm: 500, depthMm: 500 })]), b);
    expect(far.join()).toContain('от стояка');
    const near = validateRoomDesign(proposal([item({ kind: 'sink', label: 'Мойка', x: 700, y: 400, widthMm: 500, depthMm: 500 })]), b);
    expect(near.join()).not.toContain('от стояка');
  });

  it('с кухонным гарнитуром требуется мойка, и она может стоять внутри гарнитура', () => {
    const d = draft();
    d.finishes.rooms.kitchen = { ...createRoomFinishes('kitchen'), furniture: ['kitchen_set'] };
    const b = buildRoomBrief(d, TEST_PLAN.rooms[0]!);
    expect(b.requiredItems).toEqual(['kitchen_set', 'sink']);
    const issues = validateRoomDesign(
      proposal([
        item({ kind: 'kitchen_set', label: 'Гарнитур', x: 1750, y: 300, widthMm: 3000, depthMm: 600, heightMm: 850 }),
        item({ kind: 'sink', label: 'Мойка', x: 1200, y: 300, widthMm: 600, depthMm: 500, heightMm: 850 }),
      ]),
      b,
    );
    expect(issues.join()).not.toContain('пересекаются');
  });
});

describe('тексты для клиента', () => {
  it('убирает координаты и латиницу внутри русских слов', () => {
    expect(sanitizeDesignText('Мойка у окна (3040; 1100), тянуть с уклонom 2%')).toBe('Мойка у окна, тянуть с уклоном 2%');
    expect(sanitizeDesignText('LED-лента и IKEA остаются')).toBe('LED-лента и IKEA остаются');
  });
});

describe('зона «кухня-гостиная»', () => {
  it('без пожелания объединения зоны нет', () => {
    expect(designZones(draft()).map((z) => z.id)).not.toContain(MERGED_KITCHEN_ZONE_ID);
  });

  it('объединяет кухню и гостиную в одну комнату без перегородки', () => {
    const d = draft();
    d.wishes.goals = ['merge_kitchen'];
    d.finishes.rooms.kitchen = { ...createRoomFinishes('kitchen'), furniture: ['kitchen_set', 'fridge'] };
    d.finishes.rooms.living = { ...createRoomFinishes('living'), furniture: ['sofa'] };
    const zone = designZones(d).find((z) => z.id === MERGED_KITCHEN_ZONE_ID)!;
    expect(zone.blockedReason).toBeUndefined();
    const b = buildZoneBrief(d, zone);
    expect(b.room).toMatchObject({ widthMm: 3500, depthMm: 6500, areaM2: 22.75 });
    expect(zone.geometry.walls.map((w) => w.id)).not.toContain('kitchen-living');
    expect(b.requiredItems).toEqual(['kitchen_set', 'fridge', 'sofa', 'sink']);
    expect(b.mergedFrom?.map((m) => m.name)).toEqual(['Кухня', 'Гостиная']);
  });

  it('несущая стена или газ блокируют объединение с понятной причиной', () => {
    const d = draft();
    d.wishes.goals = ['merge_kitchen'];
    d.engineering = [{ id: 'g', type: 'gas', position: { x: 300, y: 300 } }];
    expect(designZones(d).find((z) => z.id === MERGED_KITCHEN_ZONE_ID)?.blockedReason).toContain('газ');
    d.engineering = [];
    d.geometry = { ...d.geometry, walls: d.geometry.walls.map((w) => (w.id === 'kitchen-living' ? { ...w, status: 'load_bearing' } : w)) };
    expect(designZones(d).find((z) => z.id === MERGED_KITCHEN_ZONE_ID)?.blockedReason).toContain('несущая');
  });
});

describe('каталог', () => {
  const catalog: Catalog = {
    source: 'тест',
    updatedAt: '2026-11-15',
    products: [
      { id: 'sofa-1', kind: 'sofa', name: 'Диван прямой 200', supplier: 'Тест', widthMm: 2000, depthMm: 900, heightMm: 820, color: '#7a7f88', priceUah: 20000 },
      { id: 'sofa-huge', kind: 'sofa', name: 'Диван угловой 4 м', supplier: 'Тест', widthMm: 4000, depthMm: 4000, heightMm: 820, color: '#7a7f88' },
      { id: 'bed-1', kind: 'bed', name: 'Кровать 160', supplier: 'Тест', widthMm: 1700, depthMm: 2100, heightMm: 1000, color: '#c8b49a' },
    ],
  };

  it('предлагает модели только подходящие по категории и размеру товары', () => {
    const b = buildRoomBrief(draft(), TEST_PLAN.rooms[1]!); // гостиная 3500×3500
    expect(catalogOptionsForBrief(catalog, b, ['sofa']).map((o) => o.id)).toEqual(['sofa-1']);
  });

  it('подставляет настоящие размеры товара и снимает неизвестный', () => {
    const { proposal: p, issues } = applyCatalog(
      proposal([item({ kind: 'sofa', productId: 'sofa-1', widthMm: 1800 }), item({ kind: 'bed', productId: 'nope' })]),
      catalog,
    );
    expect(p.items[0]).toMatchObject({ widthMm: 2000, depthMm: 900, label: 'Диван прямой 200' });
    expect(p.items[1]?.productId).toBeUndefined();
    expect(issues.join()).toContain('нет в каталоге');
    expect(designCost(p.items, catalog)).toEqual({ totalUah: 20000, priced: 1, unpriced: 1 });
  });
});
