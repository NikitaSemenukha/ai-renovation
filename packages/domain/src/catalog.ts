import type { DesignItem, DesignItemKind, RoomBrief, RoomDesignProposal } from './design';

/**
 * Каталог товаров поставщиков. ИИ выбирает конкретный товар (productId), а программа
 * подставляет его настоящие размеры и цвет — так в 3D и в смете оказывается реальный предмет.
 * Источник каталога — фид поставщика (YML/XML/CSV), импортируется скриптом на сервере.
 */

export interface Product {
  id: string;
  /** Категория — совпадает с видом предмета в дизайне. */
  kind: DesignItemKind;
  name: string;
  supplier: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** Основной цвет #rrggbb — для 3D. */
  color: string;
  material?: string;
  /** Цена в гривнах; нет — цена неизвестна. */
  priceUah?: number;
  url?: string;
  imageUrl?: string;
  /** Демо-товар: не реальное предложение поставщика, только для проверки механики. */
  demo?: boolean;
}

export interface Catalog {
  /** Откуда каталог и когда обновлён — показывается клиенту. */
  source: string;
  updatedAt: string;
  products: Product[];
}

/** Краткая карточка товара для брифа модели: только то, что нужно для выбора. */
export interface CatalogOption {
  id: string;
  kind: DesignItemKind;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  color: string;
  material?: string;
  priceUah?: number;
}

const MAX_PER_KIND = 8;

/**
 * Товары, подходящие комнате: нужных категорий и помещающиеся по габаритам.
 * Ограничиваем число вариантов на категорию — длинный список дорожает и мешает модели.
 */
export function catalogOptionsForBrief(catalog: Catalog | undefined, brief: RoomBrief, kinds: DesignItemKind[]): CatalogOption[] {
  if (!catalog) return [];
  const maxSide = Math.max(brief.room.widthMm, brief.room.depthMm);
  const minSide = Math.min(brief.room.widthMm, brief.room.depthMm);
  const wanted = new Set(kinds);
  const byKind = new Map<DesignItemKind, CatalogOption[]>();
  for (const p of catalog.products) {
    if (!wanted.has(p.kind)) continue;
    const long = Math.max(p.widthMm, p.depthMm);
    const short = Math.min(p.widthMm, p.depthMm);
    if (long > maxSide || short > minSide || p.heightMm > brief.ceilingHeightMm) continue;
    const list = byKind.get(p.kind) ?? [];
    if (list.length >= MAX_PER_KIND) continue;
    list.push({ id: p.id, kind: p.kind, name: p.name, widthMm: p.widthMm, depthMm: p.depthMm, heightMm: p.heightMm, color: p.color, material: p.material, priceUah: p.priceUah });
    byKind.set(p.kind, list);
  }
  return [...byKind.values()].flat();
}

/**
 * Подставляет данные выбранных товаров: размеры, цвет, материал и название берутся из каталога,
 * а не из ответа модели. Неизвестный товар или товар другой категории снимается с замечанием.
 */
export function applyCatalog(p: RoomDesignProposal, catalog: Catalog | undefined): { proposal: RoomDesignProposal; issues: string[] } {
  const issues: string[] = [];
  const byId = new Map((catalog?.products ?? []).map((x) => [x.id, x]));
  const items = p.items.map((it): DesignItem => {
    if (!it.productId) return it;
    const prod = byId.get(it.productId);
    if (!prod) {
      issues.push(`«${it.label}»: товара ${it.productId} нет в каталоге`);
      return { ...it, productId: undefined };
    }
    if (prod.kind !== it.kind) {
      issues.push(`«${it.label}»: товар «${prod.name}» из другой категории`);
      return { ...it, productId: undefined };
    }
    return {
      ...it,
      widthMm: prod.widthMm,
      depthMm: prod.depthMm,
      heightMm: prod.heightMm,
      color: prod.color,
      material: prod.material ?? it.material,
      label: prod.name,
    };
  });
  return { proposal: { ...p, items }, issues };
}

/** Сумма по товарам с известной ценой и число предметов без цены. */
export function designCost(items: DesignItem[], catalog: Pick<Catalog, 'products'> | undefined): { totalUah: number; priced: number; unpriced: number } {
  const byId = new Map((catalog?.products ?? []).map((x) => [x.id, x]));
  let totalUah = 0;
  let priced = 0;
  let unpriced = 0;
  for (const it of items) {
    const price = it.productId ? byId.get(it.productId)?.priceUah : undefined;
    if (price !== undefined) {
      totalUah += price;
      priced++;
    } else if (it.mount === 'floor' && it.kind !== 'rug') unpriced++;
  }
  return { totalUah, priced, unpriced };
}
