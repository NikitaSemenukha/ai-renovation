import { roomFinishesOf, roomHasWindow, roomNeedsDoor } from './finishes';
import { pointInPolygon, roomAt } from './geometry';
import type {
  EngineeringPointType,
  FurnitureItem,
  Opening,
  PlanGeometry,
  PlumbingItem,
  Point,
  ProjectDraft,
  Room,
  RoomFinishes,
} from './types';
import { DEFAULT_CEILING_HEIGHT_MM } from './wizard';

/**
 * Дизайн комнаты от ИИ: бриф для модели, формат ответа и проверка ответа.
 * Модель только проектирует; всё, что можно проверить кодом (габариты, проходы,
 * стояки, обязательная мебель), проверяется здесь, а не принимается на веру.
 * Координаты — миллиметры в системе комнаты: (0,0) — левый верхний угол её габарита.
 */

export const DESIGN_ITEM_KINDS = [
  'sofa', 'armchairs', 'coffee_table', 'tv_zone', 'shelving', 'dining_table', 'chairs', 'kitchen_set', 'stove',
  'fridge', 'bed', 'wardrobe', 'nightstands', 'dresser', 'desk', 'shoe_rack', 'mirror', 'vanity', 'washer',
  'sink', 'shower', 'bathtub', 'toilet', 'rug', 'plant', 'floor_lamp', 'artwork', 'other',
] as const;
export type DesignItemKind = (typeof DESIGN_ITEM_KINDS)[number];

export const DESIGN_LIGHT_KINDS = ['chandelier', 'pendant', 'spot', 'led_strip', 'wall_light', 'floor_lamp'] as const;
export type DesignLightKind = (typeof DESIGN_LIGHT_KINDS)[number];

export type ItemMount = 'floor' | 'wall';

export interface DesignItem {
  kind: DesignItemKind;
  /** Подпись для клиента, например «Диван угловой, серый велюр». */
  label: string;
  /** Центр предмета в координатах комнаты, мм. */
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** Поворот по часовой стрелке; только кратно 90°, чтобы проверка проходов была точной. */
  rotationDeg: 0 | 90 | 180 | 270;
  /** Цвет #rrggbb. */
  color: string;
  material: string;
  mount: ItemMount;
}

export interface DesignLight {
  kind: DesignLightKind;
  x: number;
  y: number;
}

/** Ответ модели — то, что проверяется и рисуется. */
export interface RoomDesignProposal {
  concept: string;
  palette: { walls: string; floor: string; ceiling: string; accent: string };
  items: DesignItem[];
  lights: DesignLight[];
  notes: string[];
}

export interface RoomDesign extends RoomDesignProposal {
  roomId: string;
  /** Отпечаток входных данных: если отделка или план изменились, дизайн устарел. */
  inputsHash: string;
  createdAt: string;
  model: string;
  /** Замечания проверки, которые не удалось исправить автоматически. */
  unresolved: string[];
}

// ---------- Система координат комнаты ----------

export interface RoomFrame {
  origin: Point;
  width: number;
  depth: number;
}

export function roomFrame(room: Room): RoomFrame {
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { origin: { x: minX, y: minY }, width: Math.max(...xs) - minX, depth: Math.max(...ys) - minY };
}

const toLocal = (f: RoomFrame, p: Point): Point => ({ x: Math.round(p.x - f.origin.x), y: Math.round(p.y - f.origin.y) });

// ---------- Бриф для модели ----------

export interface BriefOpening {
  kind: Opening['kind'];
  /** Концы проёма по линии стены, координаты комнаты. */
  a: Point;
  b: Point;
  widthMm: number;
  /** Единичный вектор от стены внутрь комнаты. */
  inward: Point;
}

export interface RoomBrief {
  room: { id: string; name: string; kind: Room['kind']; widthMm: number; depthMm: number; areaM2: number; polygon: Point[] };
  ceilingHeightMm: number;
  openings: BriefOpening[];
  engineering: { type: EngineeringPointType; at: Point }[];
  finishes: RoomFinishes;
  socketColor?: string;
  fixtureColor?: string;
  /** Что клиент точно хочет видеть в комнате. */
  requiredItems: (FurnitureItem | PlumbingItem)[];
  styles: string[];
  goal?: ProjectDraft['goal'];
  occupants: unknown;
  wishes: { goals: string[]; text: string; budget?: ProjectDraft['wishes']['budget'] };
  needsDoor: boolean;
  hasWindow: boolean;
}

function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (a && b) s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Проём в координатах плана и направление внутрь заданной комнаты (или null, если проём не её). */
function openingForRoom(g: PlanGeometry, o: Opening, room: Room): { a: Point; b: Point; inward: Point } | null {
  const wall = g.walls.find((w) => w.id === o.wallId);
  if (!wall) return null;
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  const a = { x: wall.a.x + ux * o.offsetMm, y: wall.a.y + uy * o.offsetMm };
  const b = { x: a.x + ux * o.widthMm, y: a.y + uy * o.widthMm };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const n = { x: -uy, y: ux };
  const probe = 300;
  if (roomAt(g, { x: mid.x + n.x * probe, y: mid.y + n.y * probe })?.id === room.id) return { a, b, inward: n };
  if (roomAt(g, { x: mid.x - n.x * probe, y: mid.y - n.y * probe })?.id === room.id) return { a, b, inward: { x: -n.x, y: -n.y } };
  return null;
}

export function buildRoomBrief(d: ProjectDraft, room: Room): RoomBrief {
  const g = d.geometry;
  const frame = roomFrame(room);
  const f = roomFinishesOf(d.finishes, room);
  const openings: BriefOpening[] = [];
  for (const o of g.openings) {
    const r = openingForRoom(g, o, room);
    if (r) openings.push({ kind: o.kind, a: toLocal(frame, r.a), b: toLocal(frame, r.b), widthMm: o.widthMm, inward: r.inward });
  }
  const occupants = d.goal ? { live: d.occupants.live, rent_long: d.occupants.rentLong, rent_daily: d.occupants.rentDaily, sale: d.occupants.sale }[d.goal] : undefined;
  return {
    room: {
      id: room.id,
      name: room.name,
      kind: room.kind,
      widthMm: frame.width,
      depthMm: frame.depth,
      areaM2: Math.round(polygonArea(room.polygon) / 10_000) / 100,
      polygon: room.polygon.map((p) => toLocal(frame, p)),
    },
    ceilingHeightMm: d.property.ceilingHeightMm ?? DEFAULT_CEILING_HEIGHT_MM,
    openings,
    engineering: d.engineering
      .filter((p) => pointInPolygon(p.position, room.polygon))
      .map((p) => ({ type: p.type, at: toLocal(frame, p.position) })),
    finishes: f,
    socketColor: d.finishes.socketColor,
    fixtureColor: d.finishes.fixtureColor,
    requiredItems: [...f.furniture, ...f.plumbing],
    styles: d.wishes.styles,
    goal: d.goal,
    occupants,
    wishes: { goals: d.wishes.goals, text: d.wishes.text.trim(), budget: d.wishes.budget },
    needsDoor: roomNeedsDoor(g, room),
    hasWindow: roomHasWindow(g, room),
  };
}

/** Короткий отпечаток брифа (djb2) — чтобы заметить, что дизайн устарел. */
export function briefHash(brief: RoomBrief): string {
  const s = JSON.stringify(brief);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------- Проверка ответа модели ----------

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function itemFootprint(it: DesignItem): Rect {
  const turned = it.rotationDeg === 90 || it.rotationDeg === 270;
  const w = turned ? it.depthMm : it.widthMm;
  const d = turned ? it.widthMm : it.depthMm;
  return { x1: it.x - w / 2, y1: it.y - d / 2, x2: it.x + w / 2, y2: it.y + d / 2 };
}

const overlap = (a: Rect, b: Rect, tol = 0) =>
  Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > tol && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > tol;

/** Зона перед проёмом внутри комнаты: для двери — на ширину полотна, для окна — 500 мм. */
function openingZone(o: BriefOpening): Rect {
  const depth = o.kind === 'door' ? o.widthMm : 500;
  const pts = [o.a, o.b, { x: o.a.x + o.inward.x * depth, y: o.a.y + o.inward.y * depth }, { x: o.b.x + o.inward.x * depth, y: o.b.y + o.inward.y * depth }];
  return {
    x1: Math.min(...pts.map((p) => p.x)),
    y1: Math.min(...pts.map((p) => p.y)),
    x2: Math.max(...pts.map((p) => p.x)),
    y2: Math.max(...pts.map((p) => p.y)),
  };
}

/** Ковёр и картины не мешают проходам и не «сталкиваются» с мебелью. */
const isObstacle = (it: DesignItem) => it.mount === 'floor' && it.kind !== 'rug';
/** Окно перекрывают только высокие предметы (выше подоконника). */
const WINDOW_SILL_MM = 900;
const HEX = /^#[0-9a-fA-F]{6}$/;
const NEEDS_CLEARANCE: EngineeringPointType[] = ['riser', 'vent', 'gas', 'electrical_panel'];

/**
 * Замечания к предложенному дизайну — на русском, чтобы их можно было показать
 * клиенту и отправить модели на исправление. Пустой массив — дизайн проходит проверку.
 */
export function validateRoomDesign(p: RoomDesignProposal, brief: RoomBrief): string[] {
  const issues: string[] = [];
  const poly = brief.room.polygon;
  const label = (it: DesignItem) => `«${it.label}»`;

  for (const it of p.items) {
    const nums = [it.x, it.y, it.widthMm, it.depthMm, it.heightMm];
    if (nums.some((n) => !Number.isFinite(n)) || it.widthMm <= 0 || it.depthMm <= 0 || it.heightMm <= 0) {
      issues.push(`${label(it)}: некорректные размеры или координаты`);
      continue;
    }
    if (it.heightMm > brief.ceilingHeightMm) issues.push(`${label(it)} выше потолка (${it.heightMm} мм при потолке ${brief.ceilingHeightMm} мм)`);
    if (!HEX.test(it.color)) issues.push(`${label(it)}: цвет должен быть в формате #rrggbb`);
    // Углы чуть сдвинуты внутрь: предмет вплотную к стене допустим
    const r = itemFootprint(it);
    const e = 5;
    const corners = [
      { x: r.x1 + e, y: r.y1 + e },
      { x: r.x2 - e, y: r.y1 + e },
      { x: r.x2 - e, y: r.y2 - e },
      { x: r.x1 + e, y: r.y2 - e },
    ];
    if (corners.some((c) => !pointInPolygon(c, poly))) issues.push(`${label(it)} выходит за стены комнаты`);
  }

  const obstacles = p.items.filter(isObstacle);
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const a = obstacles[i];
      const b = obstacles[j];
      if (a && b && overlap(itemFootprint(a), itemFootprint(b), 50)) issues.push(`${label(a)} и ${label(b)} пересекаются`);
    }
  }

  for (const o of brief.openings) {
    const zone = openingZone(o);
    for (const it of obstacles) {
      if (!overlap(itemFootprint(it), zone, 20)) continue;
      if (o.kind === 'door') issues.push(`${label(it)} мешает открыванию двери (нужна свободная зона ${o.widthMm} мм перед дверью)`);
      else if (it.heightMm > WINDOW_SILL_MM) issues.push(`${label(it)} закрывает окно (высота ${it.heightMm} мм)`);
    }
  }

  for (const e of brief.engineering.filter((x) => NEEDS_CLEARANCE.includes(x.type))) {
    for (const it of p.items) {
      const r = itemFootprint(it);
      const pad = 100;
      if (e.at.x > r.x1 - pad && e.at.x < r.x2 + pad && e.at.y > r.y1 - pad && e.at.y < r.y2 + pad) {
        issues.push(`${label(it)} перекрывает инженерную точку (${e.type}) — к ней нужен доступ`);
      }
    }
  }

  const present = new Set(p.items.map((it) => it.kind));
  for (const req of brief.requiredItems) if (!present.has(req)) issues.push(`нет предмета, который выбрал клиент: ${req}`);

  const lightKinds = new Set(p.lights.map((l) => l.kind));
  const ml = brief.finishes.mainLight;
  const hasCentral = lightKinds.has('chandelier') || lightKinds.has('pendant');
  if ((ml === 'chandelier' || ml === 'chandelier_spots') && !hasCentral) issues.push('клиент выбрал люстру, а её нет в освещении');
  if ((ml === 'spots' || ml === 'chandelier_spots') && p.lights.filter((l) => l.kind === 'spot').length < 2) {
    issues.push('клиент выбрал точечные светильники — нужно минимум 2');
  }
  if (brief.finishes.wallLighting || brief.finishes.ceilingLighting) {
    if (!lightKinds.has('led_strip') && !lightKinds.has('wall_light')) issues.push('клиент выбрал подсветку — добавьте LED-ленту или настенные светильники');
  }
  for (const l of p.lights) if (!pointInPolygon(l, poly)) issues.push(`светильник ${l.kind} вне комнаты`);

  for (const [k, v] of Object.entries(p.palette)) if (!HEX.test(v)) issues.push(`цвет палитры ${k} должен быть в формате #rrggbb`);

  return [...new Set(issues)];
}
