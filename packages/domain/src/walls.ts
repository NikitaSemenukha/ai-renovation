import type { BuildingType, Wall, WallStatus, WallStatusSource } from './types';

/**
 * Пороги толщины — ГИПОТЕЗА. Нужно уточнить по типам домов страны запуска.
 * Толщина — подсказка, а не доказательство: финальный статус подтверждает
 * клиент по документу или инженер.
 */
export const THIN_WALL_MAX_MM = 120;

const LOAD_BEARING_MIN_MM: Record<BuildingType, number> = {
  panel: 140,
  brick: 250,
  monolith: 200,
  unknown: 250,
};

export interface WallSuggestion {
  status: Exclude<WallStatus, 'unknown'>;
  reason: string;
}

export function suggestWallStatus(wall: Wall, buildingType: BuildingType = 'unknown'): WallSuggestion | null {
  if (wall.isExterior) {
    return { status: 'load_bearing', reason: 'Наружная стена — всегда считается несущей' };
  }
  if (wall.thicknessMm <= THIN_WALL_MAX_MM) {
    return { status: 'partition', reason: `Тонкая стена (≤${THIN_WALL_MAX_MM} мм) — вероятно перегородка` };
  }
  if (wall.thicknessMm >= LOAD_BEARING_MIN_MM[buildingType]) {
    return { status: 'load_bearing', reason: 'Толстая стена — вероятно несущая' };
  }
  return null;
}

/** Автоматически помечает наружные стены как несущие. Остальные не трогает. */
export function autoMarkWalls(walls: Wall[]): Wall[] {
  return walls.map((w) =>
    w.isExterior ? { ...w, status: 'load_bearing', statusSource: 'auto' } : w,
  );
}

/**
 * Меняет статус стены. Наружную стену нельзя сделать перегородкой или «неизвестной».
 * Возвращает исходный массив, если изменение запрещено.
 */
export function setWallStatus(
  walls: Wall[],
  wallId: string,
  status: WallStatus,
  source: WallStatusSource,
): Wall[] {
  const target = walls.find((w) => w.id === wallId);
  if (!target) return walls;
  if (target.isExterior && status !== 'load_bearing') return walls;
  return walls.map((w) =>
    w.id === wallId
      ? { ...w, status, statusSource: status === 'unknown' ? undefined : source }
      : w,
  );
}

/**
 * Выбор клиента противоречит подсказке системы — например, «перегородка»
 * для стены, которая по толщине вероятно несущая. UI должен попросить подтверждение.
 */
export function contradictsSuggestion(
  wall: Wall,
  status: WallStatus,
  buildingType: BuildingType = 'unknown',
): WallSuggestion | null {
  if (status === 'unknown') return null;
  const s = suggestWallStatus(wall, buildingType);
  return s && s.status !== status ? s : null;
}

/** Сносить или менять можно только подтверждённые перегородки. */
export function canDemolish(wall: Wall): boolean {
  return wall.status === 'partition' && !wall.isExterior;
}

export function wallLengthMm(wall: Wall): number {
  return Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
}
