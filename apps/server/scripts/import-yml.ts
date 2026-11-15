/**
 * Импорт каталога поставщика из YML/XML-фида (формат Prom / Rozetka / Hotline) в data/catalog.json.
 *
 *   npx tsx scripts/import-yml.ts <фид.xml> <карта-категорий.json> "<Название поставщика>" [выходной.json]
 *
 * Карта категорий — какие категории фида соответствуют каким предметам дизайна:
 *   { "12": "sofa", "Ліжка": "bed" }   (ключ — id или название категории в фиде)
 *
 * Берутся только товары с размерами (параметры «Ширина», «Глибина/Глубина», «Висота/Высота»
 * в мм или см). Используйте фиды, на которые у вас есть разрешение поставщика.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { DESIGN_ITEM_KINDS, type Catalog, type DesignItemKind, type Product } from '@air/domain';

const [feedPath, mapPath, supplier, outPath] = process.argv.slice(2);
if (!feedPath || !mapPath || !supplier) {
  console.error('Использование: npx tsx scripts/import-yml.ts <фид.xml> <карта-категорий.json> "<Поставщик>"');
  process.exit(1);
}

const categoryMap = JSON.parse(readFileSync(mapPath, 'utf-8')) as Record<string, string>;
for (const [k, v] of Object.entries(categoryMap)) {
  if (!(DESIGN_ITEM_KINDS as readonly string[]).includes(v)) throw new Error(`Карта: «${k}» → неизвестный вид «${v}»`);
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => ['offer', 'param', 'category', 'picture'].includes(name) });
const xml = parser.parse(readFileSync(feedPath, 'utf-8'));
const shop = xml?.yml_catalog?.shop;
if (!shop) throw new Error('Это не YML-фид: нет yml_catalog/shop');

type Param = { '@_name': string; '@_unit'?: string; '#text'?: string | number };
type Offer = {
  '@_id': string | number;
  name?: string;
  price?: string | number;
  currencyId?: string;
  categoryId?: string | number;
  url?: string;
  picture?: string[];
  param?: Param[];
};

const categoryNames = new Map<string, string>();
for (const c of shop.categories?.category ?? []) categoryNames.set(String(c['@_id']), String(c['#text'] ?? ''));

/** Размер в мм из параметра: «200 см», «2000», unit="см". */
function toMm(p: Param | undefined): number | undefined {
  if (!p) return undefined;
  const raw = String(p['#text'] ?? '').replace(',', '.');
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = `${p['@_unit'] ?? ''} ${raw}`.toLowerCase();
  if (unit.includes('мм') || unit.includes('mm')) return Math.round(n);
  if (unit.includes('см') || unit.includes('cm')) return Math.round(n * 10);
  if (unit.includes('м') || unit.includes(' m')) return Math.round(n * 1000);
  return Math.round(n < 400 ? n * 10 : n); // без единиц: малые числа — сантиметры
}

const COLORS: [RegExp, string][] = [
  [/біл|бел|white/i, '#f2f0ec'], [/чорн|черн|black/i, '#1f1f1f'], [/сір|сер|grey|gray|графіт|графит/i, '#8a8f99'],
  [/беж|beige|пісоч|песоч/i, '#d8c3a5'], [/корич|brown|горіх|орех|венге/i, '#6b4f3a'], [/дуб|oak|дерев|wood/i, '#c8a27a'],
  [/син|blue|navy/i, '#3d5a80'], [/зелен|green|олив/i, '#5f7a55'], [/червон|красн|red|бордо/i, '#9b2d30'],
  [/жовт|желт|yellow|гірчич|горчич/i, '#d4a72c'], [/рожев|розов|pink/i, '#d9a5a8'],
];
const colorHex = (name?: string) => COLORS.find(([re]) => name && re.test(name))?.[1] ?? '#b0b0b0';
const param = (o: Offer, ...names: RegExp[]) => o.param?.find((p) => names.some((re) => re.test(p['@_name'])));

const products: Product[] = [];
let skipped = 0;
for (const o of (shop.offers?.offer ?? []) as Offer[]) {
  const catId = String(o.categoryId ?? '');
  const kind = (categoryMap[catId] ?? categoryMap[categoryNames.get(catId) ?? '']) as DesignItemKind | undefined;
  if (!kind) continue;
  const w = toMm(param(o, /ширин/i, /width/i));
  const d = toMm(param(o, /глибин|глубин/i, /depth/i));
  const h = toMm(param(o, /висот|высот/i, /height/i));
  if (!w || !d || !h || !o.name) {
    skipped++;
    continue;
  }
  const colorName = param(o, /колір|цвет|color/i)?.['#text'];
  const price = Number(o.price);
  products.push({
    id: `${supplier}-${o['@_id']}`.replace(/\s+/g, '-').toLowerCase(),
    kind,
    name: String(o.name),
    supplier,
    widthMm: w,
    depthMm: d,
    heightMm: h,
    color: colorHex(colorName === undefined ? undefined : String(colorName)),
    material: param(o, /матеріал|материал|material/i)?.['#text']?.toString(),
    priceUah: Number.isFinite(price) && (o.currencyId ?? 'UAH').toUpperCase() === 'UAH' ? price : undefined,
    url: o.url,
    imageUrl: o.picture?.[0],
  });
}

const catalog: Catalog = { source: `Фид поставщика «${supplier}»`, updatedAt: new Date().toISOString().slice(0, 10), products };
writeFileSync(outPath ?? new URL('../data/catalog.json', import.meta.url), JSON.stringify(catalog, null, 1) + '\n');
console.log(`Импортировано ${products.length} товаров, пропущено без размеров: ${skipped}. Перезапустите сервер.`);
