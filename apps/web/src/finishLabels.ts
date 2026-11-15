import type {
  CeilingType,
  CurtainColor,
  DoorType,
  DrywallShape,
  FixtureColor,
  FloorFinish,
  FurnitureItem,
  MainLight,
  PanelMaterial,
  PlumbingItem,
  SocketColor,
  StretchFinish,
  StretchJoint,
  WallFinish,
} from '@air/domain';

type Labeled = { title: string; hint?: string };

export const CEILING_LABELS: Record<CeilingType, Labeled> = {
  stretch: { title: 'Натяжной', hint: 'ровный, быстрый монтаж' },
  combined: { title: 'Комбинированный', hint: 'гипсокартон + натяжной, короб с подсветкой' },
  drywall: { title: 'Гипсокартон', hint: 'прямой или сложные конструкции' },
};

export const STRETCH_FINISH_LABELS: Record<StretchFinish, Labeled> = {
  gloss: { title: 'Глянец', hint: 'отражает свет, визуально выше' },
  satin: { title: 'Сатин', hint: 'средняя матовость, мягкий блеск' },
  matte: { title: 'Мат', hint: 'как окрашенный потолок' },
};

export const STRETCH_JOINT_LABELS: Record<StretchJoint, Labeled> = {
  straight: { title: 'Прямое примыкание', hint: 'с плинтусом-вставкой' },
  shadow: { title: 'Теневое примыкание', hint: 'зазор у стены, «парящий» потолок' },
};

export const DRYWALL_SHAPE_LABELS: Record<DrywallShape, Labeled> = {
  flat: { title: 'Прямой', hint: 'ровная плоскость' },
  complex: { title: 'Сложная конструкция', hint: 'уровни, ниши, фигуры' },
};

export const MAIN_LIGHT_LABELS: Record<MainLight, Labeled> = {
  chandelier: { title: 'Люстра' },
  chandelier_spots: { title: 'Люстра + точечные' },
  spots: { title: 'Только точечные' },
};

export const WALL_FINISH_LABELS: Record<WallFinish, Labeled> = {
  wallpaper: { title: 'Обои' },
  paint: { title: 'Краска' },
  panels: { title: 'Панели', hint: 'бамбук, ДСП, МДФ' },
  tile: { title: 'Плитка' },
};

export const PANEL_LABELS: Record<PanelMaterial, Labeled> = {
  bamboo: { title: 'Бамбук' },
  chipboard: { title: 'ДСП' },
  mdf_painted: { title: 'МДФ крашеный' },
};

export const FLOOR_LABELS: Record<FloorFinish, Labeled> = {
  tile: { title: 'Плитка' },
  laminate: { title: 'Ламинат' },
  vinyl: { title: 'Винил', hint: 'влагостойкий, тёплый' },
  self_leveling: { title: 'Наливной пол' },
};

export const DOOR_LABELS: Record<DoorType, Labeled> = {
  hidden: { title: 'Скрытого монтажа', hint: 'в плоскости стены, без наличников' },
  classic: { title: 'Классические', hint: 'с наличниками' },
};

export const PLUMBING_LABELS: Record<PlumbingItem, string> = {
  sink: 'Раковина',
  shower: 'Душ',
  bathtub: 'Ванна',
  toilet: 'Унитаз',
};

export const FURNITURE_LABELS: Record<FurnitureItem, string> = {
  sofa: 'Диван',
  armchairs: 'Кресла',
  coffee_table: 'Журнальный столик',
  tv_zone: 'ТВ-зона',
  shelving: 'Стеллаж',
  dining_table: 'Обеденный стол',
  chairs: 'Стулья',
  kitchen_set: 'Кухонный гарнитур',
  stove: 'Плита',
  fridge: 'Холодильник',
  bed: 'Кровать',
  wardrobe: 'Шкаф',
  nightstands: 'Тумбы',
  dresser: 'Комод',
  desk: 'Рабочий стол',
  shoe_rack: 'Обувница',
  mirror: 'Зеркало',
  vanity: 'Тумба с раковиной',
  washer: 'Стиральная машина',
};

export const CURTAIN_COLORS: Record<CurtainColor, { title: string; hex: string }> = {
  white: { title: 'Белый', hex: '#f7f5f0' },
  beige: { title: 'Бежевый', hex: '#d8c3a5' },
  grey: { title: 'Серый', hex: '#a8a8a8' },
  graphite: { title: 'Графит', hex: '#4a4a4f' },
  olive: { title: 'Оливковый', hex: '#7b7d4f' },
  terracotta: { title: 'Терракота', hex: '#b8643e' },
  blue: { title: 'Синий', hex: '#3d5a80' },
  blackout_dark: { title: 'Тёмный блэкаут', hex: '#23232a' },
};

export const SOCKET_COLORS: Record<SocketColor, { title: string; hex: string }> = {
  white: { title: 'Белые', hex: '#ffffff' },
  black: { title: 'Чёрные', hex: '#1f1f1f' },
  beige: { title: 'Бежевые', hex: '#e6d8bf' },
};

export const FIXTURE_COLORS: Record<FixtureColor, { title: string; hex: string }> = {
  white: { title: 'Белые', hex: '#ffffff' },
  black: { title: 'Чёрные', hex: '#1f1f1f' },
  gold: { title: 'Золото', hex: '#c9a54a' },
};

/** Подсказки для поля бренда; клиент может вписать любой. */
export const SOCKET_BRANDS = ['Schneider Electric', 'Legrand', 'ABB', 'Gira', 'Hager', 'Viko'];
