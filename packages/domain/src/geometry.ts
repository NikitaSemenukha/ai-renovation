import type { PlanGeometry, Point, Room, RoomKind, Wall } from './types';

/** Точка внутри многоугольника (ray casting). */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function roomAt(geometry: PlanGeometry, p: Point): Room | undefined {
  return geometry.rooms.find((r) => pointInPolygon(p, r.polygon));
}

/** Сколько миллиметров отступать от оси стены, чтобы попасть в соседнее помещение. */
const PROBE_OFFSET_MM = 300;

/**
 * Пары помещений по разные стороны стены. Проверяем точки по нормали
 * на 10 участках вдоль стены — так длинная стена, которая с одной стороны
 * граничит с несколькими комнатами, разбирается правильно.
 */
export function roomPairsAcrossWall(geometry: PlanGeometry, wall: Wall): [Room, Room][] {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const nx = -dy / len;
  const ny = dx / len;
  const pairs: [Room, Room][] = [];
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const mx = wall.a.x + dx * t;
    const my = wall.a.y + dy * t;
    const left = roomAt(geometry, { x: mx + nx * PROBE_OFFSET_MM, y: my + ny * PROBE_OFFSET_MM });
    const right = roomAt(geometry, { x: mx - nx * PROBE_OFFSET_MM, y: my - ny * PROBE_OFFSET_MM });
    if (left && right && left.id !== right.id) pairs.push([left, right]);
  }
  return pairs;
}

/** Стены, которые разделяют помещения двух заданных типов. */
export function wallsBetween(geometry: PlanGeometry, kindA: RoomKind, kindB: RoomKind): Wall[] {
  return geometry.walls.filter((w) =>
    roomPairsAcrossWall(geometry, w).some(
      ([l, r]) => (l.kind === kindA && r.kind === kindB) || (l.kind === kindB && r.kind === kindA),
    ),
  );
}
