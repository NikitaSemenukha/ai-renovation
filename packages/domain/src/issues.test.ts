import { describe, expect, it } from 'vitest';
import { fieldErrors, findConflicts } from './issues';
import { roomAt, wallsBetween } from './geometry';
import { TEST_PLAN } from './testPlan.fixture';
import type { ProjectDraft } from './types';
import { createEmptyDraft } from './wizard';

function draft(): ProjectDraft {
  const d = createEmptyDraft(TEST_PLAN);
  d.goal = 'live';
  return d;
}

const ids = (d: ProjectDraft) => findConflicts(d).map((c) => c.id);

describe('geometry', () => {
  it('определяет комнату по точке', () => {
    expect(roomAt(TEST_PLAN, { x: 500, y: 500 })?.kind).toBe('kitchen');
    expect(roomAt(TEST_PLAN, { x: 6000, y: 500 })?.kind).toBe('bedroom');
  });
  it('находит стену между кухней и гостиной', () => {
    expect(wallsBetween(TEST_PLAN, 'kitchen', 'living').map((w) => w.id)).toEqual(['kitchen-living']);
  });
});

describe('fieldErrors', () => {
  it('этаж больше этажности', () => {
    const d = draft();
    d.property = { floor: 9, totalFloors: 5 };
    expect(fieldErrors(d)['property.floor']).toContain('больше этажности');
  });
  it('бюджет «от» больше «до»', () => {
    const d = draft();
    d.wishes.budget = { min: 500000, max: 300000, currency: 'UAH' };
    expect(fieldErrors(d)['wishes.budget']).toBeDefined();
  });
  it('работающих из дома больше, чем жильцов', () => {
    const d = draft();
    d.occupants.live = { adults: 2, childrenAges: [], pets: [], remoteWorkers: 5 };
    expect(fieldErrors(d)['occupants.live.remoteWorkers']).toBeDefined();
  });
  it('потолок вне допустимого диапазона', () => {
    const d = draft();
    d.property.ceilingHeightMm = -1000;
    expect(fieldErrors(d)['property.ceilingHeightMm']).toBeDefined();
    d.property.ceilingHeightMm = 2700;
    expect(fieldErrors(d)['property.ceilingHeightMm']).toBeUndefined();
  });
});

describe('findConflicts', () => {
  it('газ на кухне + объединение кухни — критично', () => {
    const d = draft();
    d.engineering = [{ id: 'g', type: 'gas', position: { x: 500, y: 500 } }];
    d.wishes.goals = ['merge_kitchen'];
    const c = findConflicts(d).find((x) => x.id === 'gas-kitchen-merge');
    expect(c?.severity).toBe('critical');
  });
  it('газ в спальне — предупреждение', () => {
    const d = draft();
    d.engineering = [{ id: 'g', type: 'gas', position: { x: 6000, y: 3000 } }];
    expect(ids(d)).toContain('gas-outside-kitchen-g');
  });
  it('объединение при несущей стене между кухней и гостиной — критично', () => {
    const d = draft();
    d.wishes.goals = ['merge_kitchen'];
    d.geometry.walls = d.geometry.walls.map((w) => (w.id === 'kitchen-living' ? { ...w, status: 'load_bearing' } : w));
    expect(ids(d)).toContain('merge-load-bearing');
  });
  it('объединение при перегородке — без конфликта по стене', () => {
    const d = draft();
    d.wishes.goals = ['merge_kitchen'];
    d.geometry.walls = d.geometry.walls.map((w) => (w.id === 'kitchen-living' ? { ...w, status: 'partition' } : w));
    expect(ids(d)).not.toContain('merge-load-bearing');
    expect(ids(d)).not.toContain('merge-unknown-wall');
  });
  it('«Только дизайн» с целями, требующими стен', () => {
    const d = draft();
    d.wishes = { ...d.wishes, goals: ['extra_bedroom'], interventionLevel: 'design_only' };
    expect(ids(d)).toContain('level-too-shallow');
  });

  it('«Только дизайн» называет конкретные цели, которым нужны стены', () => {
    const d = draft();
    d.wishes = { ...d.wishes, goals: ['extra_bedroom', 'second_bathroom', 'workspace'], interventionLevel: 'design_only' };
    const msg = findConflicts(d).find((c) => c.id === 'level-too-shallow')?.message ?? '';
    expect(msg).toContain('«+1 спальня», «Второй санузел»');
    expect(msg).not.toContain('Рабоч');
  });

  it('объединение кухни без отмеченной инженерки предупреждает о возможном газе', () => {
    const d = draft();
    d.wishes.goals = ['merge_kitchen'];
    expect(ids(d)).toContain('merge-gas-unknown');
    d.engineering = [{ id: 'r', type: 'riser', position: { x: 500, y: 500 } }];
    expect(ids(d)).not.toContain('merge-gas-unknown');
  });
});
