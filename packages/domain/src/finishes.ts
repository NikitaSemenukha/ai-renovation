import { roomAt } from './geometry';
import type {
  CeilingType,
  DoorType,
  Finishes,
  FloorFinish,
  FurnitureItem,
  Opening,
  OpeningKind,
  PlanGeometry,
  PlumbingItem,
  Room,
  RoomFinishes,
  RoomKind,
  StyleCode,
  WallFinish,
} from './types';

/**
 * Правила выбора отделки по комнатам. Источник — созвон 09.11.2026
 * (docs/meeting-2026-11-09-finishes.md). Здесь только бизнес-логика, без UI.
 */

export const CEILING_TYPES: CeilingType[] = ['stretch', 'combined', 'drywall'];

/** Мокрая зона: санузел. */
export const isWetRoom = (kind: RoomKind) => kind === 'bathroom';

/** Стены: в санузле только краска или плитка, в остальных — обои, краска, панели. */
export function wallOptions(kind: RoomKind): WallFinish[] {
  return isWetRoom(kind) ? ['paint', 'tile'] : ['wallpaper', 'paint', 'panels'];
}

/**
 * Пол: в санузле только плитка. Микроцемент в мастер не входит —
 * это индивидуальный заказ, обсуждается отдельно.
 */
export function floorOptions(kind: RoomKind): FloorFinish[] {
  return isWetRoom(kind) ? ['tile'] : ['tile', 'laminate', 'vinyl', 'self_leveling'];
}

const isClassic = (styles: StyleCode[]) => styles.includes('classic');

/** Под классику скрытые двери не ставят — только классические с наличниками. */
export function doorOptions(styles: StyleCode[]): DoorType[] {
  return isClassic(styles) ? ['classic'] : ['hidden', 'classic'];
}

/** Рамки-молдинги на стенах уместны только в классике (не в хай-теке, минимализме и т.п.). */
export function moldingsAvailable(styles: StyleCode[], kind: RoomKind): boolean {
  return isClassic(styles) && !isWetRoom(kind);
}

/** Набор мебели и техники, который предлагаем для типа комнаты. */
export const FURNITURE_BY_ROOM: Record<RoomKind, FurnitureItem[]> = {
  living: ['sofa', 'armchairs', 'coffee_table', 'tv_zone', 'shelving'],
  kitchen: ['kitchen_set', 'stove', 'fridge', 'dining_table', 'chairs'],
  bedroom: ['bed', 'wardrobe', 'nightstands', 'dresser', 'desk'],
  hall: ['wardrobe', 'shoe_rack', 'mirror'],
  bathroom: ['vanity', 'mirror', 'washer'],
  other: ['wardrobe', 'shelving', 'desk', 'armchairs'],
};

export const PLUMBING_ITEMS: PlumbingItem[] = ['sink', 'shower', 'bathtub', 'toilet'];

// ---------- Проёмы: какие окна и двери у комнаты ----------

const PROBE_MM = 300;

/** Комнаты по обе стороны проёма (снаружи — undefined). */
export function roomsAtOpening(geometry: PlanGeometry, o: Opening): (Room | undefined)[] {
  const wall = geometry.walls.find((w) => w.id === o.wallId);
  if (!wall) return [];
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const t = (o.offsetMm + o.widthMm / 2) / len;
  const cx = wall.a.x + dx * t;
  const cy = wall.a.y + dy * t;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    roomAt(geometry, { x: cx + nx * PROBE_MM, y: cy + ny * PROBE_MM }),
    roomAt(geometry, { x: cx - nx * PROBE_MM, y: cy - ny * PROBE_MM }),
  ];
}

export function roomOpenings(geometry: PlanGeometry, roomId: string, kind: OpeningKind): Opening[] {
  return geometry.openings.filter(
    (o) => o.kind === kind && roomsAtOpening(geometry, o).some((r) => r?.id === roomId),
  );
}

const openingsKnown = (g: PlanGeometry, kind: OpeningKind) => g.openings.some((o) => o.kind === kind);

/**
 * Есть ли в комнате окно (нужны шторы). Если окна на плане не размечены —
 * предполагаем окна во всех комнатах, кроме санузла и коридора.
 */
export function roomHasWindow(geometry: PlanGeometry, room: Room): boolean {
  if (!openingsKnown(geometry, 'window')) return room.kind !== 'bathroom' && room.kind !== 'hall';
  return roomOpenings(geometry, room.id, 'window').length > 0;
}

/**
 * Спрашиваем тип двери для комнаты. Коридор не спрашиваем: его проёмы ведут
 * в другие комнаты, а входная дверь — отдельная позиция.
 */
export function roomNeedsDoor(geometry: PlanGeometry, room: Room): boolean {
  if (room.kind === 'hall') return false;
  if (!openingsKnown(geometry, 'door')) return true;
  return roomOpenings(geometry, room.id, 'door').length > 0;
}

// ---------- Черновик отделки и проверка заполненности ----------

export function createRoomFinishes(kind: RoomKind): RoomFinishes {
  // Пол санузла — единственный вариант, выбор не нужен
  return { plumbing: [], furniture: [], floor: isWetRoom(kind) ? 'tile' : undefined, tulle: true };
}

export function createFinishes(geometry: PlanGeometry): Finishes {
  return { rooms: Object.fromEntries(geometry.rooms.map((r) => [r.id, createRoomFinishes(r.kind)])) };
}

/** Отделка комнаты; если записи ещё нет — пустая. */
export function roomFinishesOf(finishes: Finishes, room: Room): RoomFinishes {
  return finishes.rooms[room.id] ?? createRoomFinishes(room.kind);
}

/** В комнате выбрано хоть что-то — её можно предлагать как источник копирования. */
export function hasAnyFinish(f: RoomFinishes | undefined): boolean {
  if (!f) return false;
  return Boolean(
    f.ceiling || f.mainLight || f.walls || f.door || f.curtainColor || f.plumbing.length || f.furniture.length,
  );
}

export interface FinishContext {
  geometry: PlanGeometry;
  styles: StyleCode[];
}

/** Чего не хватает в комнате — пустой массив, если комната заполнена. Мебель — по желанию. */
export function roomFinishMissing(room: Room, f: RoomFinishes, ctx: FinishContext): string[] {
  const m: string[] = [];
  if (!f.ceiling) m.push('потолок');
  else if ((f.ceiling === 'stretch' || f.ceiling === 'combined') && (!f.stretchFinish || !f.stretchJoint)) {
    m.push('фактура и примыкание натяжного потолка');
  } else if (f.ceiling === 'drywall' && !f.drywallShape) m.push('форма гипсокартонного потолка');
  if (!f.mainLight) m.push('освещение');
  if (!f.walls) m.push('стены');
  else if (f.walls === 'panels' && !f.panelMaterial) m.push('материал панелей');
  if (!f.floor) m.push('пол');
  if (roomNeedsDoor(ctx.geometry, room) && !f.door) m.push('двери');
  if (isWetRoom(room.kind) && f.plumbing.length === 0) m.push('сантехника');
  if (roomHasWindow(ctx.geometry, room) && !f.curtainColor) m.push('цвет штор');
  return m;
}

export function isRoomFinished(room: Room, finishes: Finishes, ctx: FinishContext): boolean {
  return roomFinishMissing(room, roomFinishesOf(finishes, room), ctx).length === 0;
}

export function finishedRoomCount(finishes: Finishes, ctx: FinishContext): number {
  return ctx.geometry.rooms.filter((r) => isRoomFinished(r, finishes, ctx)).length;
}

/** Отделка выбрана во всех комнатах и заданы розетки. */
export function finishesComplete(finishes: Finishes, ctx: FinishContext): boolean {
  return finishedRoomCount(finishes, ctx) === ctx.geometry.rooms.length && finishes.socketColor !== undefined;
}

/** Выбор, который противоречит правилам (например, стиль сменили после выбора отделки). */
export interface FinishViolation {
  roomId: string;
  roomName: string;
  message: string;
}

export function finishViolations(finishes: Finishes, ctx: FinishContext): FinishViolation[] {
  const out: FinishViolation[] = [];
  for (const room of ctx.geometry.rooms) {
    const f = finishes.rooms[room.id];
    if (!f) continue;
    const push = (message: string) => out.push({ roomId: room.id, roomName: room.name, message });
    if (f.walls && !wallOptions(room.kind).includes(f.walls)) push('такая отделка стен здесь не предлагается');
    if (f.floor && !floorOptions(room.kind).includes(f.floor)) push('в санузле пол только плитка');
    if (f.door && !doorOptions(ctx.styles).includes(f.door)) {
      push('скрытые двери не сочетаются с классикой — выберите классические с наличниками');
    }
    if (f.moldings && !moldingsAvailable(ctx.styles, room.kind)) push('рамки на стенах уместны только в классическом стиле');
  }
  return out;
}

/**
 * Скопировать отделку из другой комнаты — то, что подходит по правилам целевой комнаты.
 * Мебель и сантехника не копируются: они зависят от типа комнаты.
 */
export function copyRoomFinishes(from: RoomFinishes, to: Room, ctx: FinishContext): RoomFinishes {
  const next: RoomFinishes = { ...createRoomFinishes(to.kind), ...from, plumbing: [], furniture: [] };
  if (next.walls && !wallOptions(to.kind).includes(next.walls)) {
    next.walls = undefined;
    next.panelMaterial = undefined;
  }
  if (next.floor && !floorOptions(to.kind).includes(next.floor)) next.floor = floorOptions(to.kind)[0];
  if (!moldingsAvailable(ctx.styles, to.kind)) next.moldings = undefined;
  if (!roomNeedsDoor(ctx.geometry, to)) next.door = undefined;
  if (!roomHasWindow(ctx.geometry, to)) {
    next.curtainColor = undefined;
    next.tulle = undefined;
  }
  return next;
}
