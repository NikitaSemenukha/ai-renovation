import { describe, expect, it } from 'vitest';
import {
  copyRoomFinishes,
  createRoomFinishes,
  doorOptions,
  hasAnyFinish,
  finishViolations,
  finishesComplete,
  floorOptions,
  moldingsAvailable,
  roomFinishMissing,
  roomHasWindow,
  roomNeedsDoor,
  wallOptions,
} from './finishes';
import { findConflicts } from './issues';
import { TEST_PLAN } from './testPlan.fixture';
import type { PlanGeometry, Room, RoomFinishes } from './types';
import { createEmptyDraft, stepMissing } from './wizard';

const room = (id: string): Room => {
  const r = TEST_PLAN.rooms.find((x) => x.id === id);
  if (!r) throw new Error(id);
  return r;
};
const bath: Room = { id: 'bath', name: 'Санузел', kind: 'bathroom', position: { x: 0, y: 0 }, polygon: [] };
const ctx = { geometry: TEST_PLAN, styles: [] };

const fullRoom = (over: Partial<RoomFinishes> = {}): RoomFinishes => ({
  ...createRoomFinishes('kitchen'),
  ceiling: 'stretch',
  stretchFinish: 'satin',
  stretchJoint: 'shadow',
  mainLight: 'spots',
  walls: 'paint',
  floor: 'tile',
  door: 'hidden',
  curtainColor: 'beige',
  ...over,
});

describe('отделка: правила', () => {
  it('санузел: стены только краска/плитка, пол только плитка и выбран сразу', () => {
    expect(wallOptions('bathroom')).toEqual(['paint', 'tile']);
    expect(floorOptions('bathroom')).toEqual(['tile']);
    expect(createRoomFinishes('bathroom').floor).toBe('tile');
    expect(wallOptions('living')).toEqual(['wallpaper', 'paint', 'panels']);
    expect(floorOptions('living') as string[]).not.toContain('microcement');
  });

  it('классика: только классические двери и есть рамки; минимализм — без рамок', () => {
    expect(doorOptions(['classic'])).toEqual(['classic']);
    expect(doorOptions(['minimalism'])).toEqual(['hidden', 'classic']);
    expect(moldingsAvailable(['classic'], 'living')).toBe(true);
    expect(moldingsAvailable(['minimalism'], 'living')).toBe(false);
    expect(moldingsAvailable(['classic'], 'bathroom')).toBe(false);
  });

  it('окна и двери определяются по проёмам на плане', () => {
    expect(roomHasWindow(TEST_PLAN, room('kitchen'))).toBe(true);
    expect(roomHasWindow(TEST_PLAN, room('living'))).toBe(false);
    expect(roomNeedsDoor(TEST_PLAN, room('bedroom'))).toBe(true);
    expect(roomNeedsDoor(TEST_PLAN, room('kitchen'))).toBe(false);
  });

  it('если проёмы не размечены — шторы везде, кроме санузла и коридора', () => {
    const g: PlanGeometry = { ...TEST_PLAN, openings: [] };
    expect(roomHasWindow(g, room('living'))).toBe(true);
    expect(roomHasWindow(g, bath)).toBe(false);
    expect(roomNeedsDoor(g, room('living'))).toBe(true);
  });

  it('объясняет, чего не хватает в комнате', () => {
    const empty = createRoomFinishes('kitchen');
    expect(roomFinishMissing(room('kitchen'), empty, ctx)).toEqual(['потолок', 'освещение', 'стены', 'пол', 'цвет штор']);
    expect(roomFinishMissing(room('kitchen'), fullRoom({ stretchJoint: undefined }), ctx)).toEqual([
      'фактура и примыкание натяжного потолка',
    ]);
    expect(roomFinishMissing(room('kitchen'), fullRoom({ walls: 'panels' }), ctx)).toEqual(['материал панелей']);
    expect(roomFinishMissing(room('kitchen'), fullRoom(), ctx)).toEqual([]);
  });

  it('смена стиля на классику после выбора скрытых дверей — предупреждение', () => {
    const d = createEmptyDraft(TEST_PLAN);
    d.finishes.rooms.bedroom = fullRoom({ door: 'hidden', moldings: true });
    expect(findConflicts(d).filter((c) => c.step === 'finishes')).toHaveLength(1); // рамки без классики
    d.wishes.styles = ['classic'];
    const v = finishViolations(d.finishes, { geometry: d.geometry, styles: d.wishes.styles });
    expect(v.map((x) => x.message).join()).toContain('скрытые двери');
  });

  it('копирование отделки в санузел отбрасывает неподходящее', () => {
    const copied = copyRoomFinishes(fullRoom({ walls: 'wallpaper', floor: 'laminate', furniture: ['sofa'] }), bath, ctx);
    expect(copied.walls).toBeUndefined();
    expect(copied.floor).toBe('tile');
    expect(copied.furniture).toEqual([]);
    expect(copied.ceiling).toBe('stretch');
  });

  it('шаг заполнен, когда все комнаты и розетки выбраны', () => {
    const d = createEmptyDraft(TEST_PLAN);
    expect(stepMissing('finishes', d)).toEqual(['отделка: Кухня, Гостиная, Спальня', 'цвет розеток']);
    d.finishes.rooms.kitchen = fullRoom({ door: undefined });
    d.finishes.rooms.living = fullRoom({ curtainColor: undefined });
    d.finishes.rooms.bedroom = fullRoom({ curtainColor: undefined });
    d.finishes.socketColor = 'white';
    expect(stepMissing('finishes', d)).toEqual([]);
    expect(finishesComplete(d.finishes, { geometry: d.geometry, styles: [] })).toBe(true);
  });

  it('пустая комната не считается источником для копирования (пол санузла по умолчанию не в счёт)', () => {
    expect(hasAnyFinish(undefined)).toBe(false);
    expect(hasAnyFinish(createRoomFinishes('bathroom'))).toBe(false);
    expect(hasAnyFinish({ ...createRoomFinishes('living'), ceiling: 'stretch' })).toBe(true);
  });
});
