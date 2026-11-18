import type {
  BuildingType,
  EngineeringPointType,
  InterventionLevel,
  PlanSource,
  RoomKind,
  ProjectGoal,
  ProjectStage,
  PropertyType,
  RentDailyProfile,
  RentLongProfile,
  SaleProfile,
  StyleCode,
  TenantType,
  Timeframe,
  WallStatus,
  WallStatusSource,
  WishGoal,
} from '@air/domain';

export const GOAL_LABELS: Record<ProjectGoal, { title: string; hint: string }> = {
  live: { title: 'Буду жить сам', hint: 'Подробный профиль семьи, комфорт, хранение, планы на будущее' },
  rent_long: { title: 'Сдавать надолго', hint: 'Целевой арендатор, износостойкость, окупаемость' },
  rent_daily: { title: 'Посуточно', hint: 'Максимум спальных мест, быстрая уборка, фотогеничность' },
  sale: { title: 'Подготовка к продаже', hint: 'Нейтральный стиль, минимальный бюджет, «до/после»' },
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = { apartment: 'Квартира', house: 'Дом' };

export const BUILDING_TYPE_LABELS: Record<BuildingType, { title: string; hint: string }> = {
  monolith: { title: 'Монолит-каркас', hint: 'Несущие обычно колонны и пилоны — больше всего свободы' },
  brick: { title: 'Кирпич', hint: 'Несущими часто бывают толстые внутренние стены' },
  panel: { title: 'Панель', hint: 'Многие внутренние стены несущие — меньше всего свободы' },
  unknown: { title: 'Не знаю', hint: 'Нормально: стены останутся «неизвестными» до проверки' },
};

export const STAGE_LABELS: Record<ProjectStage, string> = {
  buying: 'Покупаю',
  living: 'Живу',
  renovating: 'Уже ремонт',
  selling: 'Продаю',
};

// ---------- Ответы веток «Жильцы» (одни подписи для формы и сводки проекта) ----------

export const TENANT_LABELS: Record<TenantType, string> = {
  students: 'Студенты',
  couple: 'Пара',
  family: 'Семья',
  remote_worker: 'Удалёнщик',
  expats: 'Экспаты',
};

export const LAYOUT_PREF_LABELS: Record<NonNullable<RentLongProfile['layoutPreference']>, string> = {
  max_rooms: 'Максимум комнат',
  spacious_living: 'Просторная гостиная',
};

export const GUEST_TYPE_LABELS: Record<NonNullable<RentDailyProfile['guestType']>, string> = {
  couples: 'Пары',
  families: 'Семьи',
  business: 'Командировочные',
};

export const BUYER_LABELS: Record<NonNullable<SaleProfile['targetBuyer']>, string> = {
  young_family: 'Молодая семья',
  investor: 'Инвестор',
  senior: 'Пенсионер',
};

export const CURRENCIES = ['UAH', 'USD', 'EUR'];

/** Валюта по умолчанию по стране объекта. */
export function defaultCurrency(country?: string) {
  const c = country?.trim().toLowerCase() ?? '';
  if (c.startsWith('укр') || c.startsWith('ukr')) return 'UAH';
  return 'USD';
}

export const PLAN_SOURCE_LABELS: Record<PlanSource, { title: string; hint: string }> = {
  tech_passport: { title: 'Техпаспорт (БТИ)', hint: 'Лучший вариант: размеры, площади, толщина стен' },
  developer_plan: { title: 'План от застройщика', hint: 'Размеры, иногда колонны и пилоны' },
  photo: { title: 'Фото плана / скрин объявления', hint: 'Форма помещений, масштаб уточним' },
  manual: { title: 'Описать словами', hint: 'Перечислите комнаты и размеры — план построим сами' },
  none: { title: 'Нет плана', hint: 'Подскажем, как сделать замер' },
};

export const FILE_PLAN_SOURCES: PlanSource[] = ['tech_passport', 'developer_plan', 'photo'];

export const WALL_STATUS_LABELS: Record<WallStatus, string> = {
  load_bearing: 'Несущая',
  partition: 'Перегородка',
  unknown: 'Неизвестно',
};

export const WALL_STATUS_COLORS: Record<WallStatus, string> = {
  load_bearing: '#cf1322',
  partition: '#389e0d',
  unknown: '#8c8c8c',
};

export const WALL_SOURCE_LABELS: Record<WallStatusSource, string> = {
  auto: 'Автоматически',
  document: 'По документу',
  owner_knowledge: 'Знаю сам',
  guess: 'Догадка',
  engineer: 'Проверено инженером',
};

export const ENGINEERING_LABELS: Record<EngineeringPointType, { title: string; short: string; color: string }> = {
  riser: { title: 'Стояк воды/канализации', short: 'С', color: '#1677ff' },
  vent: { title: 'Вентканал', short: 'В', color: '#13c2c2' },
  gas: { title: 'Газ', short: 'Г', color: '#fa8c16' },
  radiator: { title: 'Радиатор', short: 'Р', color: '#eb2f96' },
  electrical_panel: { title: 'Электрощиток', short: 'Щ', color: '#722ed1' },
};

export const WISH_GOAL_LABELS: Record<WishGoal, string> = {
  merge_kitchen: 'Объединить кухню с гостиной',
  extra_bedroom: '+1 спальня',
  workspace: 'Рабочая зона',
  visually_bigger: 'Визуально больше',
  more_storage: 'Больше хранения',
  second_bathroom: 'Второй санузел',
};

export const INTERVENTION_LABELS: Record<InterventionLevel, { title: string; hint: string }> = {
  design_only: { title: 'Только дизайн', hint: 'Отделка, мебель, свет — без изменения стен' },
  partitions: { title: 'Перегородки', hint: 'Перенос и снос перегородок, без несущих конструкций' },
  full_replan: {
    title: 'Полная перепланировка',
    hint: 'Включая перенос мокрых зон — потребуется проверка специалистом',
  },
};

export const STYLE_LABELS: Record<StyleCode, string> = {
  modern: 'Современный',
  scandinavian: 'Скандинавский',
  minimalism: 'Минимализм',
  loft: 'Лофт',
  classic: 'Классика',
  japandi: 'Джапанди',
};

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  within_month: 'В ближайший месяц',
  one_to_three_months: 'Через 1–3 месяца',
  half_year_plus: 'Через полгода и позже',
  exploring: 'Пока изучаю',
};

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  kitchen: 'Кухня',
  living: 'Гостиная',
  bedroom: 'Спальня',
  bathroom: 'Санузел',
  hall: 'Коридор',
  other: 'Другое',
};
