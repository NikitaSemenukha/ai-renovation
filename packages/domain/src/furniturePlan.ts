import type { PlanGeometry, Point, ProjectDraft, Wall } from './types';
import {
  briefHash,
  buildZoneBrief,
  designZones,
  itemFootprint,
  roomFrame,
  MERGED_KITCHEN_ZONE_ID,
  type DesignItem,
  type DesignLight,
  type DesignZone,
  type Rect,
  type RoomDesign,
} from './design';

/**
 * План размещения мебели — лист проекта, как у дизайнера: вся квартира, мебель сверху, привязки к стенам,
 * экспликация помещений и спецификация. Собирается из дизайнов комнат, сделанных ИИ.
 * Координаты листа — координаты плана, мм.
 */

export interface PlacedItem {
  /** Номер в спецификации. */
  n: number;
  zoneId: string;
  zoneName: string;
  item: DesignItem;
  /** Габарит в плане, мм, координаты квартиры. */
  rect: Rect;
  /** Расстояние от предмета до чистовой стены (за вычетом половины толщины), мм; нет стены — нет значения. */
  gaps: Partial<Record<'left' | 'right' | 'top' | 'bottom', number>>;
}

export interface FurniturePlanRoom {
  id: string;
  name: string;
  areaM2: number;
  position: Point;
}

export interface FurniturePlanSheet {
  /** Геометрия листа: при объединении кухни с гостиной — без перегородки. */
  geometry: PlanGeometry;
  rooms: FurniturePlanRoom[];
  items: PlacedItem[];
  lights: (DesignLight & { zoneId: string })[];
  /** Зоны, которые ещё не спроектированы. */
  missing: { id: string; name: string }[];
  /** Зоны, дизайн которых сделан по старой отделке или плану. */
  stale: string[];
  /** Какие зоны входят в лист — в этом порядке их и проектировать. */
  zones: DesignZone[];
}

/** Ковёр, картины и зеркала на стене не мешают проходу — у них нет привязок. */
const HAS_GAPS = (it: DesignItem) => it.mount === 'floor' && it.kind !== 'rug' && it.kind !== 'plant' && it.kind !== 'floor_lamp';

/** Площадь «в чистоте», как в техпаспорте: контур идёт по осям стен, вычитаем полосу ~100 мм по периметру. */
export function roomNetAreaM2(poly: Point[]): number {
  let s = 0;
  let per = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
    per += Math.hypot(b.x - a.x, b.y - a.y);
  });
  return Math.max(0, Math.abs(s) / 2e6 - (per / 1000) * 0.1);
}

/**
 * Какие зоны составляют квартиру на листе. Если объединение кухни с гостиной разрешено и для него есть
 * дизайн (или нет отдельных дизайнов кухни и гостиной) — берётся общая зона вместо двух комнат.
 */
export function furniturePlanZones(d: ProjectDraft, designs: Record<string, RoomDesign[]> | undefined): DesignZone[] {
  const zones = designZones(d);
  const merged = zones.find((z) => z.id === MERGED_KITCHEN_ZONE_ID && !z.blockedReason);
  const rooms = zones.filter((z) => z.id !== MERGED_KITCHEN_ZONE_ID);
  if (!merged) return rooms;
  const kitchenLiving = new Set(d.geometry.rooms.filter((r) => r.kind === 'kitchen' || r.kind === 'living').map((r) => r.id));
  const separateDone = [...kitchenLiving].every((id) => designs?.[id]?.length);
  const useMerged = Boolean(designs?.[merged.id]?.length) || !separateDone;
  if (!useMerged) return rooms;
  // Общая зона встаёт на место гостиной, чтобы порядок комнат не прыгал
  const out: DesignZone[] = [];
  for (const z of rooms) {
    if (!kitchenLiving.has(z.id)) out.push(z);
    else if (!out.includes(merged)) out.push(merged);
  }
  return out;
}

const isHorizontal = (w: Wall) => Math.abs(w.a.y - w.b.y) < 1;
const isVertical = (w: Wall) => Math.abs(w.a.x - w.b.x) < 1;
const between = (v: number, a: number, b: number) => v >= Math.min(a, b) - 1 && v <= Math.max(a, b) + 1;
const MAX_GAP_MM = 6000;

/** Другой предмет перекрывает путь от стороны до стены — такую привязку не показываем. */
function blocked(r: Rect, dir: 'left' | 'right' | 'top' | 'bottom', dist: number, others: Rect[]): boolean {
  const cx = (r.x1 + r.x2) / 2;
  const cy = (r.y1 + r.y2) / 2;
  return others.some((o) => {
    if (dir === 'left') return cy > o.y1 && cy < o.y2 && o.x2 <= r.x1 + 1 && o.x2 > r.x1 - dist;
    if (dir === 'right') return cy > o.y1 && cy < o.y2 && o.x1 >= r.x2 - 1 && o.x1 < r.x2 + dist;
    if (dir === 'top') return cx > o.x1 && cx < o.x2 && o.y2 <= r.y1 + 1 && o.y2 > r.y1 - dist;
    return cx > o.x1 && cx < o.x2 && o.y1 >= r.y2 - 1 && o.y1 < r.y2 + dist;
  });
}

/** Расстояние от стороны прямоугольника до ближайшей стены в заданном направлении (от середины стороны). */
function gapToWall(g: PlanGeometry, r: Rect, dir: 'left' | 'right' | 'top' | 'bottom'): number | undefined {
  const cx = (r.x1 + r.x2) / 2;
  const cy = (r.y1 + r.y2) / 2;
  let best: number | undefined;
  for (const w of g.walls) {
    const half = w.thicknessMm / 2;
    let dist: number | undefined;
    if ((dir === 'left' || dir === 'right') && isVertical(w) && between(cy, w.a.y, w.b.y)) {
      dist = dir === 'left' ? r.x1 - (w.a.x + half) : w.a.x - half - r.x2;
      // Стена, внутри которой стоит край предмета, тоже считается: зазор 0
      if (dist < -half - 1) dist = undefined;
    } else if ((dir === 'top' || dir === 'bottom') && isHorizontal(w) && between(cx, w.a.x, w.b.x)) {
      dist = dir === 'top' ? r.y1 - (w.a.y + half) : w.a.y - half - r.y2;
      if (dist < -half - 1) dist = undefined;
    }
    if (dist !== undefined && (best === undefined || dist < best)) best = dist;
  }
  if (best === undefined || best > MAX_GAP_MM) return undefined;
  return Math.max(0, Math.round(best));
}

/**
 * Собирает лист из последних (или выбранных) вариантов дизайна зон.
 * pick — номер варианта по зонам (0 — последний), как в переключателе вариантов; zones — лист одной комнаты.
 */
export function assembleFurniturePlan(
  d: ProjectDraft,
  designs: Record<string, RoomDesign[]> | undefined,
  pick: Record<string, number> = {},
  zones: DesignZone[] = furniturePlanZones(d, designs),
): FurniturePlanSheet {
  const merged = zones.find((z) => z.id === MERGED_KITCHEN_ZONE_ID);
  const geometry = merged ? merged.geometry : d.geometry;
  const items: PlacedItem[] = [];
  const lights: FurniturePlanSheet['lights'] = [];
  const missing: FurniturePlanSheet['missing'] = [];
  const stale: string[] = [];

  for (const zone of zones) {
    const list = designs?.[zone.id] ?? [];
    const design = list[Math.min(pick[zone.id] ?? 0, list.length - 1)];
    if (!design || zone.blockedReason) {
      missing.push({ id: zone.id, name: zone.name });
      continue;
    }
    if (design.inputsHash !== briefHash(buildZoneBrief(d, zone))) stale.push(zone.name);
    const o = roomFrame(zone.room).origin;
    const placed = design.items.map((it) => {
      const f = itemFootprint(it);
      return { it, rect: { x1: f.x1 + o.x, y1: f.y1 + o.y, x2: f.x2 + o.x, y2: f.y2 + o.y } };
    });
    const obstacles = placed.filter((p) => HAS_GAPS(p.it));
    for (const { it, rect } of placed) {
      const gaps: PlacedItem['gaps'] = {};
      if (HAS_GAPS(it)) {
        const others = obstacles.filter((p) => p.rect !== rect).map((p) => p.rect);
        for (const dir of ['left', 'right', 'top', 'bottom'] as const) {
          const v = gapToWall(geometry, rect, dir);
          if (v !== undefined && !blocked(rect, dir, v, others)) gaps[dir] = v;
        }
      }
      items.push({ n: items.length + 1, zoneId: zone.id, zoneName: zone.name, item: it, rect, gaps });
    }
    for (const l of design.lights) lights.push({ ...l, x: l.x + o.x, y: l.y + o.y, zoneId: zone.id });
  }

  const rooms = geometry.rooms.map((r) => ({ id: r.id, name: r.name, areaM2: roomNetAreaM2(r.polygon), position: r.position }));
  return { geometry, rooms, items, lights, missing, stale, zones };
}
