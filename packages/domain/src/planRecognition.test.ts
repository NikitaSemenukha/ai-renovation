import { describe, expect, it } from 'vitest';
import { designZones } from './design';
import { wallsBetween } from './geometry';
import { buildGeometryFromRecognition, type RecognizedPlan } from './planRecognition';
import { createEmptyDraft } from './wizard';

const rect = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** Как ответила бы модель: координаты «плавают» на десятки мм, начало не в нуле. */
const recognized = (): RecognizedPlan => ({
  rooms: [
    { name: 'Кухня', kind: 'kitchen', polygon: rect(1000, 500, 4520, 3480), labeledAreaM2: 9.4 },
    { name: 'Гостиная', kind: 'living', polygon: rect(1030, 3520, 4480, 7000) },
    { name: 'Санузел', kind: 'bathroom', polygon: rect(4510, 520, 6300, 2700) },
    { name: 'Коридор', kind: 'hall', polygon: rect(4490, 2720, 6290, 6980) },
    { name: 'Спальня', kind: 'bedroom', polygon: rect(6310, 480, 10000, 7020) },
  ],
  openings: [
    { kind: 'window', x: 2700, y: 510, widthMm: 1400 },
    { kind: 'window', x: 10010, y: 4000, widthMm: 1500 },
    { kind: 'door', x: 4500, y: 3000, widthMm: 700 }, // кухня → коридор... стоит на общей стене кухни и коридора
    { kind: 'door', x: 4500, y: 5000, widthMm: 800 },
    { kind: 'door', x: 5000, y: 2710, widthMm: 700 },
    { kind: 'door', x: 6300, y: 4500, widthMm: 800 },
    { kind: 'door', x: 5400, y: 7000, widthMm: 900 },
  ],
  thickWalls: [{ a: { x: 4500, y: 500 }, b: { x: 4500, y: 7000 }, thicknessMm: 380 }],
  uncertain: [],
});

describe('распознавание плана: сборка геометрии', () => {
  it('выравнивает координаты, строит стены и привязывает проёмы', () => {
    const { geometry: g, issues } = buildGeometryFromRecognition(recognized());
    expect(issues).toEqual([]);
    expect(g.source).toBe('recognized');
    expect(g.rooms.map((r) => r.id)).toEqual(['kitchen', 'living', 'bath', 'hall', 'bedroom']);
    // Начало в нуле, соседние стены совпадают
    const kitchen = g.rooms[0]!.polygon;
    expect(Math.min(...kitchen.map((p) => p.x))).toBe(0);
    expect(Math.min(...kitchen.map((p) => p.y))).toBe(0);
    const living = g.rooms[1]!.polygon;
    expect(Math.max(...kitchen.map((p) => p.y))).toBe(Math.min(...living.map((p) => p.y)));
    // Между кухней и гостиной — одна межкомнатная стена
    const between = wallsBetween(g, 'kitchen', 'living');
    expect(between).toHaveLength(1);
    expect(between[0]!.isExterior).toBe(false);
    // Толстая стена с картинки — подсказка толщины
    expect(wallsBetween(g, 'kitchen', 'hall')[0]!.thicknessMm).toBe(380);
    // Наружный контур — наружные стены
    expect(g.walls.filter((w) => w.isExterior).length).toBeGreaterThanOrEqual(4);
    expect(g.openings.filter((o) => o.kind === 'window')).toHaveLength(2);
    expect(g.openings.filter((o) => o.kind === 'door')).toHaveLength(5);
    for (const o of g.openings) {
      const w = g.walls.find((x) => x.id === o.wallId)!;
      expect(o.offsetMm + o.widthMm).toBeLessThanOrEqual(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
    }
    expect(Math.abs(g.bounds.width - 9000)).toBeLessThanOrEqual(30);
    expect(Math.abs(g.bounds.height - 6500)).toBeLessThanOrEqual(30);
  });

  it('распознанный план работает дальше: кухня-гостиная собирается', () => {
    const d = createEmptyDraft(buildGeometryFromRecognition(recognized()).geometry);
    d.wishes.goals = ['merge_kitchen'];
    const merged = designZones(d).find((z) => z.mergedFrom);
    expect(merged?.blockedReason).toBeUndefined();
    expect(merged?.room.polygon).toHaveLength(4);
  });

  it('находит перекрытие комнат, несовпадение площади, окно не на стене и комнату без двери', () => {
    const rec = recognized();
    rec.rooms[1]!.polygon = rect(1030, 2500, 4480, 7000); // гостиная залезла на кухню
    rec.rooms[0]!.labeledAreaM2 = 14;
    rec.openings.push({ kind: 'window', x: 2500, y: 3000, widthMm: 1200 });
    rec.openings = rec.openings.filter((o) => !(o.x === 6300 && o.y === 4500));
    const issues = buildGeometryFromRecognition(rec).issues.join('\n');
    expect(issues).toContain('перекрываются');
    expect(issues).toContain('подписано 14 м²');
    expect(issues).toContain('окно в точке');
    expect(issues).toContain('без двери: «Спальня»');
  });

  it('пустой ответ — понятное замечание, а не падение', () => {
    const r = buildGeometryFromRecognition({ rooms: [], openings: [], thickWalls: [], uncertain: [] });
    expect(r.issues).toEqual(['не найдено ни одной комнаты']);
  });
});
