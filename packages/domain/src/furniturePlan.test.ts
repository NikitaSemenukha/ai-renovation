import { describe, expect, it } from 'vitest';
import { MERGED_KITCHEN_ZONE_ID, type DesignItem, type RoomDesign } from './design';
import { assembleFurniturePlan, furniturePlanZones, roomNetAreaM2 } from './furniturePlan';
import { TEST_PLAN } from './testPlan.fixture';
import { createEmptyDraft } from './wizard';

const sofa: DesignItem = {
  kind: 'sofa', label: 'Диван', x: 1750, y: 2900, widthMm: 2200, depthMm: 900, heightMm: 850,
  rotationDeg: 180, color: '#888888', material: 'велюр', mount: 'floor',
};

const design = (roomId: string, items: DesignItem[]): RoomDesign => ({
  roomId, concept: '', palette: { walls: '#fff', floor: '#fff', ceiling: '#fff', accent: '#fff' }, items, lights: [{ kind: 'chandelier', x: 1750, y: 1750 }],
  notes: [], inputsHash: 'old', createdAt: '2026-11-16T10:00:00Z', model: 'm', unresolved: [],
});

describe('план размещения мебели', () => {
  it('переводит мебель в координаты квартиры и считает привязки к чистовым стенам', () => {
    const d = createEmptyDraft(TEST_PLAN);
    const sheet = assembleFurniturePlan(d, { living: [design('living', [sofa])] });
    expect(sheet.items).toHaveLength(1);
    const p = sheet.items[0]!;
    // Гостиная начинается в (0, 3000): диван 650…2850 по X, 5450…6350 по Y
    expect(p.rect).toEqual({ x1: 650, y1: 5450, x2: 2850, y2: 6350 });
    // В тестовом плане есть только три стены: слева и снизу стен нет — нет и привязок
    expect(p.gaps.left).toBeUndefined();
    expect(p.gaps.top).toBe(5450 - 3000 - 100 / 2);
    expect(p.gaps.right).toBe(3500 - 380 / 2 - 2850);
    expect(sheet.lights[0]).toMatchObject({ x: 1750, y: 4750 });
    expect(sheet.missing.map((m) => m.id)).toContain('kitchen');
    expect(sheet.stale).toEqual(['Гостиная']);
  });

  it('берёт общую кухню-гостиную вместо двух комнат, если её проектировали', () => {
    const d = createEmptyDraft(TEST_PLAN);
    d.wishes.goals = ['merge_kitchen'];
    const ids = furniturePlanZones(d, { [MERGED_KITCHEN_ZONE_ID]: [design(MERGED_KITCHEN_ZONE_ID, [])] }).map((z) => z.id);
    expect(ids).toContain(MERGED_KITCHEN_ZONE_ID);
    expect(ids).not.toContain('kitchen');
    expect(ids).not.toContain('living');
    // Отдельные дизайны обеих комнат есть, общего нет — лист из отдельных комнат
    const sep = furniturePlanZones(d, { kitchen: [design('kitchen', [])], living: [design('living', [])] }).map((z) => z.id);
    expect(sep).toContain('kitchen');
    expect(sep).not.toContain(MERGED_KITCHEN_ZONE_ID);
  });

  it('площадь в чистоте', () => {
    expect(roomNetAreaM2([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }, { x: 0, y: 4000 }])).toBeCloseTo(12 - 1.4, 5);
  });
});
