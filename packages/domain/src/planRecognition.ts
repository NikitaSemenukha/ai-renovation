import { pointInPolygon } from './geometry';
import type { Opening, OpeningKind, PlanGeometry, Point, Room, RoomKind, Wall } from './types';

/**
 * Распознавание плана: модель читает картинку и возвращает комнаты контурами, проёмы точками
 * и подсказки о толстых стенах. Стены, их тип (наружная/межкомнатная) и привязка проёмов
 * строятся здесь, кодом: так геометрия всегда согласована, а ошибки модели видны как замечания.
 */

export interface RecognizedRoom {
  name: string;
  kind: RoomKind;
  /** Контур по осям стен, мм; x — вправо, y — вниз, начало — левый верхний угол плана. */
  polygon: Point[];
  /** Площадь с плана, м², если подписана. Нужна для сверки размеров. */
  labeledAreaM2?: number | null;
}

export interface RecognizedOpening {
  kind: OpeningKind;
  /** Центр проёма на оси стены, мм. */
  x: number;
  y: number;
  widthMm: number;
}

export interface RecognizedThickWall {
  a: Point;
  b: Point;
  thicknessMm: number;
}

export interface RecognizedPlan {
  rooms: RecognizedRoom[];
  openings: RecognizedOpening[];
  thickWalls: RecognizedThickWall[];
  /** Сомнительные места по-русски — показываются клиенту для проверки. */
  uncertain: string[];
}

export interface PlanBuildResult {
  geometry: PlanGeometry;
  /** Проблемы геометрии: отправляются модели на исправление, остаток показывается клиенту. */
  issues: string[];
}

/** Координаты ближе этого считаются одной линией стены. */
const SNAP_MM = 150;
const EXTERIOR_MM = 400;
const PARTITION_MM = 100;
/** Проём ищет стену в пределах этого расстояния от своей точки. */
const OPENING_SNAP_MM = 400;
const MIN_ROOM_M2 = 0.8;
const MAX_ROOM_M2 = 150;

const round10 = (v: number) => Math.round(v / 10) * 10;

/** Близкие значения стягиваются к общему: стены соседних комнат совпадают точно. */
function clusterValues(values: number[]): (v: number) => number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const v of sorted) {
    const g = groups[groups.length - 1];
    if (g && v - g[g.length - 1]! <= SNAP_MM) g.push(v);
    else groups.push([v]);
  }
  const map = new Map<number, number>();
  for (const g of groups) {
    const mean = round10(g.reduce((s, v) => s + v, 0) / g.length);
    for (const v of g) map.set(v, mean);
  }
  return (v) => map.get(v) ?? round10(v);
}

function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Половина средней толщины стен, м: перевод площади по осям в площадь «в чистоте». */
const INNER_STRIP_M = 0.1;

function perimeter(poly: Point[]): number {
  return poly.reduce((s, a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return s + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
}

function cleanPolygon(poly: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  if (out.length > 1 && out[0]!.x === out[out.length - 1]!.x && out[0]!.y === out[out.length - 1]!.y) out.pop();
  // Убираем промежуточные точки на прямой
  return out.filter((p, i) => {
    const a = out[(i - 1 + out.length) % out.length]!;
    const b = out[(i + 1) % out.length]!;
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) !== 0;
  });
}

/** Точка для подписи: центр масс, а если он снаружи (Г-образная комната) — ближайшая к нему точка внутри. */
function labelPoint(poly: Point[]): Point {
  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const c = { x: round10(cx), y: round10(cy) };
  if (pointInPolygon(c, poly)) return c;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  let best = poly[0]!;
  let bestD = Infinity;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 100) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 100) {
      const p = { x, y };
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD && pointInPolygon(p, poly)) {
        best = p;
        bestD = d;
      }
    }
  }
  return best;
}

const KIND_IDS: Record<RoomKind, string> = { kitchen: 'kitchen', living: 'living', bedroom: 'bedroom', bathroom: 'bath', hall: 'hall', other: 'room' };

interface Interval {
  from: number;
  to: number;
  room: number;
}

/**
 * Стены из контуров комнат. Ребро, общее для двух комнат, — межкомнатная стена;
 * ребро одной комнаты — наружная (или граница с нераспознанной зоной; это видно на шаге «Стены»).
 */
function buildWalls(rooms: Room[]): Wall[] {
  const horizontal = new Map<number, Interval[]>();
  const vertical = new Map<number, Interval[]>();
  const diagonal: { a: Point; b: Point; rooms: Set<number> }[] = [];

  rooms.forEach((room, ri) => {
    room.polygon.forEach((a, i) => {
      const b = room.polygon[(i + 1) % room.polygon.length]!;
      if (a.y === b.y) {
        const list = horizontal.get(a.y) ?? [];
        list.push({ from: Math.min(a.x, b.x), to: Math.max(a.x, b.x), room: ri });
        horizontal.set(a.y, list);
      } else if (a.x === b.x) {
        const list = vertical.get(a.x) ?? [];
        list.push({ from: Math.min(a.y, b.y), to: Math.max(a.y, b.y), room: ri });
        vertical.set(a.x, list);
      } else {
        const same = diagonal.find(
          (d) => (d.a.x === a.x && d.a.y === a.y && d.b.x === b.x && d.b.y === b.y) || (d.a.x === b.x && d.a.y === b.y && d.b.x === a.x && d.b.y === a.y),
        );
        if (same) same.rooms.add(ri);
        else diagonal.push({ a, b, rooms: new Set([ri]) });
      }
    });
  });

  const walls: Wall[] = [];
  const add = (a: Point, b: Point, owners: Set<number>) => {
    const exterior = owners.size === 1;
    walls.push({
      id: `w${walls.length + 1}`,
      a,
      b,
      thicknessMm: exterior ? EXTERIOR_MM : PARTITION_MM,
      isExterior: exterior,
      status: 'unknown',
    });
  };

  const sweep = (lines: Map<number, Interval[]>, toPoint: (along: number, at: number) => Point) => {
    for (const [at, list] of lines) {
      const cuts = [...new Set(list.flatMap((iv) => [iv.from, iv.to]))].sort((a, b) => a - b);
      let start: number | undefined;
      let owners: Set<number> | undefined;
      const flush = (end: number) => {
        if (start !== undefined && owners && owners.size > 0 && end > start) add(toPoint(start, at), toPoint(end, at), owners);
      };
      for (let i = 0; i < cuts.length - 1; i++) {
        const from = cuts[i]!;
        const to = cuts[i + 1]!;
        const here = new Set(list.filter((iv) => iv.from <= from && iv.to >= to).map((iv) => iv.room));
        const sameAsCurrent = owners && here.size === owners.size && [...here].every((r) => owners!.has(r));
        if (sameAsCurrent) continue;
        flush(from);
        start = from;
        owners = here;
      }
      flush(cuts[cuts.length - 1]!);
    }
  };
  sweep(horizontal, (along, at) => ({ x: along, y: at }));
  sweep(vertical, (along, at) => ({ x: at, y: along }));
  for (const d of diagonal) add(d.a, d.b, d.rooms);
  return walls;
}

function projectOnWall(p: Point, w: Wall): { dist: number; perp: number; along: number; len: number } {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy);
  const t = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / len;
  const clamped = Math.max(0, Math.min(len, t));
  const px = w.a.x + (dx * clamped) / len;
  const py = w.a.y + (dy * clamped) / len;
  return { dist: Math.hypot(p.x - px, p.y - py), perp: Math.abs((p.x - w.a.x) * dy - (p.y - w.a.y) * dx) / len, along: t, len };
}

/** Толстые стены с картинки переносятся на построенные стены: это подсказка для шага «Стены». */
function applyThickness(walls: Wall[], thick: RecognizedThickWall[], snap: (p: Point) => Point): void {
  for (const t of thick) {
    const a = snap(t.a);
    const b = snap(t.b);
    for (const w of walls) {
      if (w.isExterior) continue;
      const pa = projectOnWall(a, w);
      const pb = projectOnWall(b, w);
      // Толстый отрезок может быть длиннее стены (одна линия на несколько комнат) — сравниваем расстояние до прямой
      if (pa.perp > SNAP_MM || pb.perp > SNAP_MM) continue;
      const overlap = Math.min(pa.len, Math.max(pa.along, pb.along)) - Math.max(0, Math.min(pa.along, pb.along));
      if (overlap > pa.len * 0.5) w.thicknessMm = Math.max(w.thicknessMm, round10(t.thicknessMm));
    }
  }
}

function roomOverlapM2(a: Room, b: Room): number {
  const box = (r: Room) => ({
    x1: Math.min(...r.polygon.map((p) => p.x)),
    x2: Math.max(...r.polygon.map((p) => p.x)),
    y1: Math.min(...r.polygon.map((p) => p.y)),
    y2: Math.max(...r.polygon.map((p) => p.y)),
  });
  const A = box(a);
  const B = box(b);
  const x1 = Math.max(A.x1, B.x1);
  const x2 = Math.min(A.x2, B.x2);
  const y1 = Math.max(A.y1, B.y1);
  const y2 = Math.min(A.y2, B.y2);
  if (x2 - x1 < 200 || y2 - y1 < 200) return 0;
  const step = 100;
  let hits = 0;
  for (let x = x1 + step / 2; x < x2; x += step) {
    for (let y = y1 + step / 2; y < y2; y += step) {
      if (pointInPolygon({ x, y }, a.polygon) && pointInPolygon({ x, y }, b.polygon)) hits++;
    }
  }
  return (hits * step * step) / 1e6;
}

/** Собирает геометрию плана из ответа модели и перечисляет найденные проблемы. */
export function buildGeometryFromRecognition(rec: RecognizedPlan): PlanBuildResult {
  const issues: string[] = [];
  const allPts = rec.rooms.flatMap((r) => r.polygon).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (allPts.length === 0) {
    return { geometry: { source: 'recognized', walls: [], rooms: [], openings: [], bounds: { width: 0, height: 0 } }, issues: ['не найдено ни одной комнаты'] };
  }
  // Начало координат — левый верхний угол плана
  const minX = Math.min(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const sx = clusterValues(allPts.map((p) => p.x - minX));
  const sy = clusterValues(allPts.map((p) => p.y - minY));
  // После стягивания крайняя линия может сместиться от нуля — сдвигаем обратно
  const ox = Math.min(...allPts.map((p) => sx(p.x - minX)));
  const oy = Math.min(...allPts.map((p) => sy(p.y - minY)));
  const snap = (p: Point): Point => ({ x: sx(p.x - minX) - ox, y: sy(p.y - minY) - oy });

  const used = new Map<string, number>();
  const rooms: Room[] = [];
  rec.rooms.forEach((r) => {
    const polygon = cleanPolygon(r.polygon.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map(snap));
    const name = r.name.trim() || 'Помещение';
    if (polygon.length < 3) {
      issues.push(`«${name}»: контур меньше трёх углов — комната пропущена`);
      return;
    }
    const areaM2 = polygonArea(polygon) / 1e6;
    if (areaM2 < MIN_ROOM_M2 || areaM2 > MAX_ROOM_M2) {
      issues.push(`«${name}»: площадь ${areaM2.toFixed(1)} м² неправдоподобна — проверь масштаб и размеры`);
      if (areaM2 < MIN_ROOM_M2) return;
    }
    // Подписанная площадь — «в чистоте», а контур идёт по осям стен: вычитаем полосу в половину средней толщины
    const innerM2 = areaM2 - (perimeter(polygon) / 1000) * INNER_STRIP_M;
    if (r.labeledAreaM2 && Math.abs(innerM2 - r.labeledAreaM2) / r.labeledAreaM2 > 0.15) {
      issues.push(`«${name}»: по контуру около ${innerM2.toFixed(1)} м² в чистоте, а на плане подписано ${r.labeledAreaM2} м² — сверь размеры комнаты`);
    }
    const base = KIND_IDS[r.kind] ?? 'room';
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    rooms.push({ id: n === 1 ? base : `${base}-${n}`, name, kind: r.kind, position: labelPoint(polygon), polygon });
  });

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const ov = roomOverlapM2(rooms[i]!, rooms[j]!);
      if (ov > 0.3) issues.push(`«${rooms[i]!.name}» и «${rooms[j]!.name}» перекрываются на ${ov.toFixed(1)} м² — контуры комнат не должны заходить друг на друга`);
    }
  }

  const walls = buildWalls(rooms);
  applyThickness(walls, rec.thickWalls, snap);

  const openings: Opening[] = [];
  rec.openings.forEach((o, i) => {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !(o.widthMm > 0)) return;
    const p = { x: o.x - minX - ox, y: o.y - minY - oy };
    const candidates = walls
      .filter((w) => (o.kind === 'window' ? w.isExterior : true))
      .map((w) => ({ w, ...projectOnWall(p, w) }))
      .filter((c) => c.dist <= OPENING_SNAP_MM && c.along >= -100 && c.along <= c.len + 100)
      .sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    const what = o.kind === 'window' ? 'окно' : 'дверь';
    if (!best) {
      issues.push(`${what} в точке (${Math.round(p.x)}; ${Math.round(p.y)}) не стоит ни на одной ${o.kind === 'window' ? 'наружной ' : ''}стене`);
      return;
    }
    const width = Math.min(round10(o.widthMm), round10(best.len));
    const offset = Math.max(0, Math.min(best.len - width, round10(best.along - width / 2)));
    openings.push({ id: `${o.kind === 'window' ? 'win' : 'door'}-${i + 1}`, kind: o.kind, wallId: best.w.id, offsetMm: offset, widthMm: width });
  });

  const roomsWithoutDoor = rooms.filter((r) => {
    const roomWalls = walls.filter((w) => r.polygon.some((p, i) => {
      const q = r.polygon[(i + 1) % r.polygon.length]!;
      const onEdge = (pt: Point) => Math.abs((q.x - p.x) * (pt.y - p.y) - (q.y - p.y) * (pt.x - p.x)) < 1 &&
        pt.x >= Math.min(p.x, q.x) - 1 && pt.x <= Math.max(p.x, q.x) + 1 && pt.y >= Math.min(p.y, q.y) - 1 && pt.y <= Math.max(p.y, q.y) + 1;
      return onEdge(w.a) && onEdge(w.b);
    }));
    return !openings.some((o) => o.kind === 'door' && roomWalls.some((w) => w.id === o.wallId));
  });
  if (rooms.length > 1 && roomsWithoutDoor.length) {
    issues.push(`без двери: ${roomsWithoutDoor.map((r) => `«${r.name}»`).join(', ')} — проверь, не пропущен ли проём (или это ниша/гардероб без двери)`);
  }

  const width = Math.max(...rooms.flatMap((r) => r.polygon.map((p) => p.x)), 0);
  const height = Math.max(...rooms.flatMap((r) => r.polygon.map((p) => p.y)), 0);
  return { geometry: { source: 'recognized', walls, rooms, openings, bounds: { width, height } }, issues };
}
