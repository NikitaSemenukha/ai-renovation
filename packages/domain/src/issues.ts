import { finishViolations } from './finishes';
import { roomAt, wallsBetween } from './geometry';
import type { WizardStepId } from './steps';
import type { ProjectDraft } from './types';

// ---------- Ошибки полей: блокируют шаг ----------

export type FieldKey =
  | 'property.floor'
  | 'property.ceilingHeightMm'
  | 'occupants.live.remoteWorkers'
  | 'wishes.budget';

export const FIELD_STEP: Record<FieldKey, WizardStepId> = {
  'property.floor': 'property',
  'property.ceilingHeightMm': 'property',
  'occupants.live.remoteWorkers': 'occupants',
  'wishes.budget': 'wishes',
};

/** Допустимая высота потолков, мм. Типичная — 2500–3200. */
export const CEILING_MIN_MM = 2200;
export const CEILING_MAX_MM = 5000;

export function fieldErrors(d: ProjectDraft): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  const p = d.property;

  if (p.floor !== undefined && p.totalFloors !== undefined && p.floor > p.totalFloors) {
    e['property.floor'] = `Этаж ${p.floor} больше этажности дома (${p.totalFloors})`;
  } else if (p.floor !== undefined && p.floor < 1) {
    e['property.floor'] = 'Этаж должен быть не меньше 1';
  }

  if (p.ceilingHeightMm !== undefined && (p.ceilingHeightMm < CEILING_MIN_MM || p.ceilingHeightMm > CEILING_MAX_MM)) {
    e['property.ceilingHeightMm'] =
      `Проверьте высоту: допустимо ${CEILING_MIN_MM / 1000}–${CEILING_MAX_MM / 1000} м, обычно 2.5–3.2 м`;
  }

  if (d.goal === 'live') {
    const l = d.occupants.live;
    const people = (l.adults ?? 0) + l.childrenAges.length;
    if (l.remoteWorkers !== undefined && l.adults !== undefined && l.remoteWorkers > people) {
      e['occupants.live.remoteWorkers'] = `Работающих из дома (${l.remoteWorkers}) больше, чем жильцов (${people})`;
    }
  }

  const b = d.wishes.budget;
  if (b) {
    if (b.max <= 0) e['wishes.budget'] = 'Укажите верхнюю границу бюджета или выберите «Не знаю»';
    else if (b.min > b.max) e['wishes.budget'] = 'Сумма «от» больше суммы «до»';
  }

  return e;
}

export function stepFieldErrors(step: WizardStepId, d: ProjectDraft): string[] {
  const all = fieldErrors(d);
  return (Object.keys(all) as FieldKey[]).filter((k) => FIELD_STEP[k] === step).map((k) => all[k] as string);
}

/** Цели, которые невозможны без изменения стен, — для понятного текста предупреждения. */
const WALL_GOAL_NAMES = {
  merge_kitchen: 'Объединить кухню с гостиной',
  extra_bedroom: '+1 спальня',
  second_bathroom: 'Второй санузел',
} as const;

// ---------- Конфликты планирования: не блокируют, но предупреждают ----------

export type ConflictSeverity = 'critical' | 'warning';

export interface Conflict {
  id: string;
  severity: ConflictSeverity;
  /** Шаг, на котором проблему можно исправить. */
  step: WizardStepId;
  message: string;
}

/**
 * Правила конфликтов между инженерией, стенами и пожеланиями.
 * Формулировки осторожные: точные нормы зависят от страны и проверяются специалистом.
 */
export function findConflicts(d: ProjectDraft): Conflict[] {
  const out: Conflict[] = [];
  const g = d.geometry;
  const wantsMerge = d.wishes.goals.includes('merge_kitchen');

  const gasPoints = d.engineering.filter((p) => p.type === 'gas');
  const gasInKitchen = gasPoints.some((p) => roomAt(g, p.position)?.kind === 'kitchen');

  for (const p of gasPoints) {
    const room = roomAt(g, p.position);
    if (room && room.kind !== 'kitchen') {
      out.push({
        id: `gas-outside-kitchen-${p.id}`,
        severity: 'warning',
        step: 'engineering',
        message: `Точка газа отмечена в помещении «${room.name}». Газовое оборудование обычно бывает только на кухне — проверьте отметку.`,
      });
    }
  }

  if (wantsMerge && gasInKitchen) {
    out.push({
      id: 'gas-kitchen-merge',
      severity: 'critical',
      step: 'wishes',
      message:
        'На кухне газ, а вы хотите объединить её с гостиной. Открытое объединение газифицированной кухни с жилой комнатой обычно запрещено. Возможные решения: раздвижная перегородка или дверь, либо замена газовой плиты на электрическую с согласованием.',
    });
  }

  if (wantsMerge) {
    const between = wallsBetween(g, 'kitchen', 'living');
    if (between.some((w) => w.status === 'load_bearing')) {
      out.push({
        id: 'merge-load-bearing',
        severity: 'critical',
        step: 'walls',
        message:
          'Стена между кухней и гостиной отмечена как несущая. Снести её нельзя; возможен только проём с усилением по проекту инженера.',
      });
    } else if (between.some((w) => w.status === 'unknown')) {
      out.push({
        id: 'merge-unknown-wall',
        severity: 'warning',
        step: 'walls',
        message:
          'Статус стены между кухней и гостиной неизвестен. Вариант с объединением будет помечен «возможно после проверки инженером».',
      });
    }
  }

  if (wantsMerge && gasPoints.length === 0 && d.engineering.length === 0) {
    out.push({
      id: 'merge-gas-unknown',
      severity: 'warning',
      step: 'engineering',
      message:
        'Инженерные точки не отмечены. Если на кухне газ, открытое объединение кухни с гостиной обычно запрещено — отметьте газ на шаге «Инженерка» или уточните у управляющей компании.',
    });
  }

  const wallGoals = d.wishes.goals.filter((x) => x in WALL_GOAL_NAMES);
  if (d.wishes.interventionLevel === 'design_only' && wallGoals.length > 0) {
    const names = wallGoals.map((x) => `«${WALL_GOAL_NAMES[x as keyof typeof WALL_GOAL_NAMES]}»`).join(', ');
    out.push({
      id: 'level-too-shallow',
      severity: 'warning',
      step: 'wishes',
      message: `Выбрано «Только дизайн», но ${wallGoals.length > 1 ? 'цели' : 'цель'} ${names} ${wallGoals.length > 1 ? 'требуют' : 'требует'} изменения стен. Выберите «Перегородки» или уберите ${wallGoals.length > 1 ? 'эти цели' : 'эту цель'}.`,
    });
  }

  if (d.wishes.goals.includes('second_bathroom') && !d.engineering.some((p) => p.type === 'riser')) {
    out.push({
      id: 'bathroom-no-riser',
      severity: 'warning',
      step: 'engineering',
      message: 'Для второго санузла важно расположение стояков — отметьте их, иначе вариант нельзя проверить.',
    });
  }

  for (const v of finishViolations(d.finishes, { geometry: g, styles: d.wishes.styles })) {
    out.push({
      id: `finish-${v.roomId}-${v.message}`,
      severity: 'warning',
      step: 'finishes',
      message: `Отделка, «${v.roomName}»: ${v.message}.`,
    });
  }

  return out;
}
