import { readFileSync } from 'node:fs';
import type { Catalog } from '@air/domain';

/**
 * Каталог товаров для дизайна. Сейчас — файл data/catalog.json (демо или импорт фида
 * скриптом scripts/import-yml.ts); дальше — база данных с регулярным обновлением фидов.
 */
const CATALOG_PATH = new URL('../data/catalog.json', import.meta.url);

let cached: Catalog | undefined;

export function loadCatalog(): Catalog | undefined {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf-8')) as Catalog;
    if (!Array.isArray(parsed.products)) throw new Error('products is not an array');
    cached = parsed;
    console.info(`[catalog] ${parsed.products.length} товаров · ${parsed.source}`);
    return cached;
  } catch (err) {
    console.warn('[catalog] каталог не загружен, дизайн без товаров:', err instanceof Error ? err.message : err);
    return undefined;
  }
}
