import { describe, expect, it } from 'vitest';
import type { Wall } from './types';
import { autoMarkWalls, canDemolish, contradictsSuggestion, setWallStatus, suggestWallStatus } from './walls';

const wall = (over: Partial<Wall>): Wall => ({
  id: 'w',
  a: { x: 0, y: 0 },
  b: { x: 1000, y: 0 },
  thicknessMm: 200,
  isExterior: false,
  status: 'unknown',
  ...over,
});

describe('suggestWallStatus', () => {
  it('наружная стена — несущая', () => {
    expect(suggestWallStatus(wall({ isExterior: true, thicknessMm: 80 }))?.status).toBe('load_bearing');
  });
  it('тонкая стена — вероятно перегородка', () => {
    expect(suggestWallStatus(wall({ thicknessMm: 100 }))?.status).toBe('partition');
  });
  it('порог несущей зависит от типа дома', () => {
    const w = wall({ thicknessMm: 160 });
    expect(suggestWallStatus(w, 'panel')?.status).toBe('load_bearing');
    expect(suggestWallStatus(w, 'brick')).toBeNull();
  });
});

describe('autoMarkWalls', () => {
  it('помечает только наружные стены', () => {
    const res = autoMarkWalls([wall({ id: 'e', isExterior: true }), wall({ id: 'i' })]);
    expect(res[0]).toMatchObject({ status: 'load_bearing', statusSource: 'auto' });
    expect(res[1]?.status).toBe('unknown');
  });
});

describe('setWallStatus', () => {
  it('нельзя сделать наружную стену перегородкой', () => {
    const walls = [wall({ id: 'e', isExterior: true, status: 'load_bearing' })];
    expect(setWallStatus(walls, 'e', 'partition', 'owner_knowledge')).toBe(walls);
  });
  it('меняет статус и источник внутренней стены', () => {
    const res = setWallStatus([wall({ id: 'i' })], 'i', 'partition', 'document');
    expect(res[0]).toMatchObject({ status: 'partition', statusSource: 'document' });
  });
  it('сброс в «неизвестно» убирает источник', () => {
    const res = setWallStatus([wall({ id: 'i', status: 'partition', statusSource: 'guess' })], 'i', 'unknown', 'guess');
    expect(res[0]?.statusSource).toBeUndefined();
  });
});

describe('canDemolish', () => {
  it('сносить можно только перегородку', () => {
    expect(canDemolish(wall({ status: 'partition' }))).toBe(true);
    expect(canDemolish(wall({ status: 'unknown' }))).toBe(false);
    expect(canDemolish(wall({ status: 'load_bearing' }))).toBe(false);
  });
});

describe('contradictsSuggestion', () => {
  it('перегородка на толстой стене противоречит подсказке', () => {
    expect(contradictsSuggestion(wall({ thicknessMm: 380 }), 'partition', 'brick')?.status).toBe('load_bearing');
  });
  it('совпадение с подсказкой и «неизвестно» — без противоречия', () => {
    expect(contradictsSuggestion(wall({ thicknessMm: 380 }), 'load_bearing', 'brick')).toBeNull();
    expect(contradictsSuggestion(wall({ thicknessMm: 380 }), 'unknown', 'brick')).toBeNull();
  });
});
