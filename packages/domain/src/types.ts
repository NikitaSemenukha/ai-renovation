/**
 * Доменная модель проекта. Чистый TypeScript без зависимостей от UI —
 * переиспользуется в веб- и будущем мобильном приложении.
 * Все размеры в миллиметрах, координаты плана в миллиметрах.
 */

export type ProjectGoal = 'live' | 'rent_long' | 'rent_daily' | 'sale';
export type PropertyType = 'apartment' | 'house';
export type BuildingType = 'panel' | 'brick' | 'monolith' | 'unknown';
export type ProjectStage = 'buying' | 'living' | 'renovating';

export interface PropertyInfo {
  propertyType?: PropertyType;
  buildingType?: BuildingType;
  seriesOrYear?: string;
  floor?: number;
  totalFloors?: number;
  country?: string;
  city?: string;
  /** Если не указано — используется значение по умолчанию с пометкой «примерно». */
  ceilingHeightMm?: number;
  stage?: ProjectStage;
}

export type PlanSource = 'tech_passport' | 'developer_plan' | 'photo' | 'manual' | 'none';

export interface PlanInfo {
  source?: PlanSource;
  fileName?: string;
  /** MIME-тип файла; сам файл хранится отдельно (IndexedDB, далее — сервер). */
  fileType?: string;
  /**
   * Клиент подтвердил геометрию. Для демо-плана это означает только
   * «понимаю, что это демо», поэтому в метрику не засчитывается.
   */
  dimensionsConfirmed: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export type WallStatus = 'load_bearing' | 'partition' | 'unknown';
/** Откуда известен статус стены — попадает в итоговый PDF. */
export type WallStatusSource = 'auto' | 'document' | 'owner_knowledge' | 'guess' | 'engineer';

export interface Wall {
  id: string;
  a: Point;
  b: Point;
  thicknessMm: number;
  isExterior: boolean;
  status: WallStatus;
  statusSource?: WallStatusSource;
}

export type EngineeringPointType = 'riser' | 'vent' | 'gas' | 'radiator' | 'electrical_panel';

export interface EngineeringPoint {
  id: string;
  type: EngineeringPointType;
  position: Point;
}

export type RoomKind = 'kitchen' | 'living' | 'bedroom' | 'bathroom' | 'hall' | 'other';

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  /** Точка для подписи. */
  position: Point;
  /** Контур помещения по осям стен. */
  polygon: Point[];
}

/** Откуда взялась геометрия: демо-план не считается данными клиента. */
export type GeometrySource = 'demo' | 'recognized' | 'manual';

/** Структурированная геометрия плана — источник истины для 2D, 3D и сметы. */
export interface PlanGeometry {
  source: GeometrySource;
  walls: Wall[];
  rooms: Room[];
  /** Габариты плана для отображения. */
  bounds: { width: number; height: number };
}

// ---------- Профиль жильцов: отдельная ветка на каждую цель ----------

export type Frequency = 'rarely' | 'sometimes' | 'often';
export type Amount = 'small' | 'medium' | 'large';
export type TriState = 'yes' | 'no' | 'unknown';

export interface LiveProfile {
  adults?: number;
  childrenAges: number[];
  planningChildren?: TriState;
  limitedMobility?: boolean;
  remoteWorkers?: number;
  needsQuietForCalls?: boolean;
  pets: string[];
  cooking?: Frequency;
  overnightGuests?: Frequency;
  storageNeed?: Amount;
  separateSleep?: boolean;
}

export type TenantType = 'students' | 'couple' | 'family' | 'remote_worker' | 'expats';

export interface RentLongProfile {
  targetTenant?: TenantType;
  layoutPreference?: 'max_rooms' | 'spacious_living';
  expectedMonthlyRent?: number;
  furnished?: boolean;
}

export interface RentDailyProfile {
  sleepingPlaces: number;
  guestType?: 'couples' | 'families' | 'business';
  ownerStorage?: boolean;
  fastTurnover?: boolean;
}

export interface SaleProfile {
  targetBuyer?: 'young_family' | 'investor' | 'senior';
  prepBudget?: number;
  needsListingVisuals?: boolean;
}

export interface OccupantsDraft {
  live: LiveProfile;
  rentLong: RentLongProfile;
  rentDaily: RentDailyProfile;
  sale: SaleProfile;
}

// ---------- Пожелания ----------

export type WishGoal =
  | 'merge_kitchen'
  | 'extra_bedroom'
  | 'workspace'
  | 'visually_bigger'
  | 'more_storage'
  | 'second_bathroom';

export type InterventionLevel = 'design_only' | 'partitions' | 'full_replan';

export interface BudgetRange {
  min: number;
  max: number;
  currency: string;
}

export type StyleCode = 'modern' | 'scandinavian' | 'minimalism' | 'loft' | 'classic' | 'japandi';
export type Timeframe = 'within_month' | 'one_to_three_months' | 'half_year_plus' | 'exploring';

export interface Wishes {
  text: string;
  goals: WishGoal[];
  styles: StyleCode[];
  budget?: BudgetRange;
  interventionLevel?: InterventionLevel;
  startTimeframe?: Timeframe;
}

// ---------- Черновик и проект ----------

export interface ProjectDraft {
  goal?: ProjectGoal;
  property: PropertyInfo;
  plan: PlanInfo;
  geometry: PlanGeometry;
  /** Клиент просмотрел разметку стен (в т.ч. нажал «не знаю ни одной»). */
  wallsReviewed: boolean;
  engineering: EngineeringPoint[];
  /** Клиент просмотрел шаг инженерки, даже если не отметил точки. */
  engineeringReviewed: boolean;
  occupants: OccupantsDraft;
  wishes: Wishes;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  data: ProjectDraft;
}
