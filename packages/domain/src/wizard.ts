import { createFinishes, finishesComplete, isRoomFinished } from './finishes';
import { findConflicts, fieldErrors, stepFieldErrors } from './issues';
import { WIZARD_STEPS, type WizardStepId } from './steps';
import type { OccupantsDraft, PlanGeometry, ProjectDraft, ProjectGoal } from './types';
import { autoMarkWalls } from './walls';

export { WIZARD_STEPS, type WizardStepId };

export const DEFAULT_CEILING_HEIGHT_MM = 2700;

export function createEmptyDraft(geometry: PlanGeometry): ProjectDraft {
  return {
    property: {},
    plan: { dimensionsConfirmed: false },
    geometry: { ...geometry, walls: autoMarkWalls(geometry.walls) },
    wallsReviewed: false,
    engineering: [],
    engineeringReviewed: false,
    occupants: {
      live: { childrenAges: [], pets: [] },
      rentLong: {},
      rentDaily: { sleepingPlaces: 2 },
      sale: {},
    },
    wishes: { text: '', goals: [], styles: [] },
    finishes: createFinishes(geometry),
  };
}

/** Черновик ещё не начат — можно не спрашивать «продолжить или начать заново». */
export function isDraftPristine(d: ProjectDraft): boolean {
  return d.goal === undefined && Object.keys(d.property).length === 0 && d.plan.source === undefined;
}

/** Минимум по жильцам, без которого нельзя строить варианты. */
export function hasOccupantsMinimum(goal: ProjectGoal | undefined, o: OccupantsDraft): boolean {
  switch (goal) {
    case 'live':
      return (o.live.adults ?? 0) >= 1;
    case 'rent_long':
      return o.rentLong.targetTenant !== undefined;
    case 'rent_daily':
      return o.rentDaily.sleepingPlaces >= 1;
    case 'sale':
      return o.sale.targetBuyer !== undefined;
    default:
      return false;
  }
}

/** Подробный профиль: заполнено большинство необязательных полей ветки. */
export function hasDetailedProfile(goal: ProjectGoal | undefined, o: OccupantsDraft): boolean {
  switch (goal) {
    case 'live': {
      const l = o.live;
      const filled = [
        l.planningChildren,
        l.limitedMobility,
        l.remoteWorkers,
        l.cooking,
        l.overnightGuests,
        l.storageNeed,
      ].filter((v) => v !== undefined).length;
      return filled >= 4;
    }
    case 'rent_long':
      return o.rentLong.layoutPreference !== undefined && o.rentLong.furnished !== undefined;
    case 'rent_daily':
      return o.rentDaily.guestType !== undefined && o.rentDaily.fastTurnover !== undefined;
    case 'sale':
      return o.sale.needsListingVisuals !== undefined;
    default:
      return false;
  }
}

/**
 * Чего не хватает, чтобы пройти шаг: понятные клиенту формулировки.
 * Пустой массив — шаг заполнен.
 */
export function stepMissing(step: WizardStepId, d: ProjectDraft): string[] {
  const m: string[] = [];
  switch (step) {
    case 'goal':
      if (!d.goal) m.push('выберите цель ремонта');
      break;
    case 'property': {
      const p = d.property;
      if (!p.propertyType) m.push('тип объекта');
      if (!p.buildingType) m.push('тип дома (можно «Не знаю»)');
      if (!p.country?.trim()) m.push('страна');
      if (!p.city?.trim()) m.push('город');
      break;
    }
    case 'plan': {
      const { source, fileName } = d.plan;
      if (!source) m.push('выберите, какой план у вас есть');
      else if (source !== 'manual' && source !== 'none' && !fileName) m.push('загрузите файл плана');
      break;
    }
    case 'dimensions':
      if (!d.plan.dimensionsConfirmed) m.push('подтвердите, что ознакомились с планом');
      break;
    case 'walls':
      if (!d.wallsReviewed) m.push('отметьте стены или нажмите «Не знаю ни одной»');
      break;
    case 'engineering':
      if (!d.engineeringReviewed) m.push('отметьте точки или нажмите «Не знаю, где точки»');
      break;
    case 'occupants':
      if (!d.goal) m.push('сначала выберите цель на шаге «Цель»');
      else if (!hasOccupantsMinimum(d.goal, d.occupants)) {
        m.push(
          {
            live: 'сколько взрослых будет жить',
            rent_long: 'целевой арендатор',
            rent_daily: 'количество спальных мест',
            sale: 'целевой покупатель',
          }[d.goal],
        );
      }
      break;
    case 'wishes':
      if (!d.wishes.interventionLevel) m.push('насколько глубоко меняем');
      if (d.wishes.goals.length === 0 && !d.wishes.text.trim()) m.push('хотя бы одна цель или описание');
      break;
    case 'finishes': {
      const ctx = { geometry: d.geometry, styles: d.wishes.styles };
      const left = d.geometry.rooms.filter((r) => !isRoomFinished(r, d.finishes, ctx)).map((r) => r.name);
      if (left.length) m.push(`отделка: ${left.join(', ')}`);
      if (!d.finishes.socketColor) m.push('цвет розеток');
      break;
    }
  }
  return [...m, ...stepFieldErrors(step, d)];
}

export function isStepComplete(step: WizardStepId, d: ProjectDraft): boolean {
  return stepMissing(step, d).length === 0;
}

/** Можно ли сохранить проект: все обязательные шаги заполнены без ошибок. */
export function missingRequiredSteps(d: ProjectDraft): WizardStepId[] {
  return WIZARD_STEPS.filter((s) => s.required && !isStepComplete(s.id, d)).map((s) => s.id);
}

export interface CompletenessItem {
  label: string;
  weight: number;
  done: boolean;
}

/** Штраф за каждое противоречие (ошибку поля или критичный конфликт). */
export const CONTRADICTION_PENALTY = 10;

/**
 * «Полнота данных» проекта. Это не точность результата: она показывает,
 * сколько надёжной информации собрано. Демо-план и противоречия не засчитываются.
 * Веса — стартовая ГИПОТЕЗА, настраиваются по тестам с пользователями.
 */
export function completenessBreakdown(d: ProjectDraft): CompletenessItem[] {
  const realGeometry = d.geometry.source !== 'demo';
  return [
    { label: 'Цель и объект', weight: 10, done: isStepComplete('goal', d) && isStepComplete('property', d) },
    { label: 'План загружен', weight: 10, done: isStepComplete('plan', d) && d.plan.source !== 'none' },
    {
      label: 'Геометрия распознана и подтверждена',
      weight: 15,
      done: realGeometry && d.plan.dimensionsConfirmed,
    },
    { label: 'Жильцы и цель изменений', weight: 10, done: isStepComplete('occupants', d) && isStepComplete('wishes', d) },
    { label: 'Известен тип дома', weight: 5, done: Boolean(d.property.buildingType && d.property.buildingType !== 'unknown') },
    { label: 'Разметка стен', weight: 10, done: d.wallsReviewed },
    { label: 'Инженерные точки', weight: 10, done: d.engineering.length > 0 },
    { label: 'Подробный профиль жильцов', weight: 10, done: hasDetailedProfile(d.goal, d.occupants) },
    { label: 'Бюджет', weight: 5, done: d.wishes.budget !== undefined && !fieldErrors(d)['wishes.budget'] },
    { label: 'Стиль', weight: 5, done: d.wishes.styles.length > 0 },
    {
      label: 'Отделка по комнатам',
      weight: 10,
      done: finishesComplete(d.finishes, { geometry: d.geometry, styles: d.wishes.styles }),
    },
  ];
}

export function contradictionCount(d: ProjectDraft): number {
  const errors = Object.keys(fieldErrors(d)).length;
  const critical = findConflicts(d).filter((c) => c.severity === 'critical').length;
  return errors + critical;
}

export function completenessPercent(d: ProjectDraft): number {
  const sum = completenessBreakdown(d).reduce((s, i) => s + (i.done ? i.weight : 0), 0);
  return Math.max(0, sum - contradictionCount(d) * CONTRADICTION_PENALTY);
}
