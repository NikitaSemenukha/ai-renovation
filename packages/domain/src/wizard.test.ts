import { describe, expect, it } from 'vitest';
import { TEST_PLAN } from './testPlan.fixture';
import type { ProjectDraft } from './types';
import {
  completenessBreakdown,
  completenessPercent,
  createEmptyDraft,
  isDraftPristine,
  isStepComplete,
  missingRequiredSteps,
  stepMissing,
} from './wizard';

function minimalDraft(): ProjectDraft {
  const d = createEmptyDraft(TEST_PLAN);
  d.goal = 'live';
  d.property = { propertyType: 'apartment', buildingType: 'unknown', country: 'Украина', city: 'Киев' };
  d.plan = { source: 'photo', fileName: 'plan.jpg', dimensionsConfirmed: true };
  d.occupants.live.adults = 2;
  d.wishes = { ...d.wishes, goals: ['visually_bigger'], interventionLevel: 'partitions' };
  return d;
}

describe('wizard', () => {
  it('веса полноты дают 100%', () => {
    expect(completenessBreakdown(createEmptyDraft(TEST_PLAN)).reduce((s, i) => s + i.weight, 0)).toBe(100);
  });

  it('пустой черновик — 0% и все обязательные шаги не заполнены', () => {
    const d = createEmptyDraft(TEST_PLAN);
    expect(isDraftPristine(d)).toBe(true);
    expect(completenessPercent(d)).toBe(0);
    expect(missingRequiredSteps(d)).toEqual(['goal', 'property', 'plan', 'dimensions', 'occupants', 'wishes']);
  });

  it('минимум разрешает сохранение; демо-план не засчитывается как геометрия', () => {
    const d = minimalDraft();
    expect(missingRequiredSteps(d)).toEqual([]);
    expect(completenessPercent(d)).toBe(30);
    d.geometry = { ...d.geometry, source: 'recognized' };
    expect(completenessPercent(d)).toBe(45);
  });

  it('противоречия снижают полноту и блокируют шаг', () => {
    const d = minimalDraft();
    d.property.floor = 9;
    d.property.totalFloors = 5;
    expect(isStepComplete('property', d)).toBe(false);
    expect(stepMissing('property', d).join()).toContain('больше этажности');
    // Цель и объект больше не засчитываются (−10) и штраф за противоречие (−10)
    expect(completenessPercent(d)).toBe(10);
  });

  it('объясняет, чего не хватает на шаге', () => {
    const d = createEmptyDraft(TEST_PLAN);
    expect(stepMissing('property', d)).toEqual(['тип объекта', 'тип дома (можно «Не знаю»)', 'страна', 'город']);
    d.plan.source = 'tech_passport';
    expect(stepMissing('plan', d)).toEqual(['загрузите файл плана']);
  });

  it('пожелания: нужен уровень вмешательства и цель или текст', () => {
    const d = minimalDraft();
    d.wishes = { text: '  ', goals: [], styles: [], interventionLevel: 'design_only' };
    expect(isStepComplete('wishes', d)).toBe(false);
    d.wishes.text = 'хочу гардеробную';
    expect(isStepComplete('wishes', d)).toBe(true);
  });
});
