/**
 * Ручная проверка распознавания плана:
 *   npx tsx scripts/try-plan.ts путь/к/плану.(jpg|png|webp|pdf) ["уточнения"]
 *   npx tsx scripts/try-plan.ts --text "Кухня 3×3,5 м, гостиная 4×5 м, ..."
 * Требует запущенного сервера (npm run dev:server) с ключом. Каждый запуск — платный запрос.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { PlanGeometry } from '@air/domain';
import { renderPlanPng } from '../src/planRaster';

const [arg, extra] = process.argv.slice(2);
if (!arg) {
  console.log('Укажите файл плана или --text "описание"');
  process.exit(1);
}
const TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
const body =
  arg === '--text'
    ? { description: extra }
    : { file: { mediaType: TYPES[extname(arg).toLowerCase()], base64: readFileSync(arg).toString('base64') }, ...(extra ? { notes: extra } : {}) };

const started = Date.now();
const res = await fetch('http://localhost:8787/api/plan/recognize', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const out = (await res.json()) as { geometry: PlanGeometry; uncertain: string[]; issues: string[]; checks?: string[][]; model: string; error?: string };
console.log(`HTTP ${res.status} за ${Math.round((Date.now() - started) / 1000)} с`);
if (!res.ok) {
  console.log(out.error);
  process.exit(1);
}
const g = out.geometry;
console.log(`Модель: ${out.model}; габарит ${g.bounds.width}×${g.bounds.height} мм`);
for (const r of g.rooms) {
  const xs = r.polygon.map((p) => p.x);
  const ys = r.polygon.map((p) => p.y);
  console.log(` - ${r.id} «${r.name}» (${r.kind}): x ${Math.min(...xs)}–${Math.max(...xs)}, y ${Math.min(...ys)}–${Math.max(...ys)}, углов ${r.polygon.length}`);
}
console.log(`Стены: ${g.walls.length} (наружных ${g.walls.filter((w) => w.isExterior).length}); толстые внутренние: ${g.walls.filter((w) => !w.isExterior && w.thicknessMm > 120).map((w) => `${w.id}=${w.thicknessMm}`).join(', ') || 'нет'}`);
console.log(`Проёмы: ${g.openings.map((o) => `${o.kind}@${o.wallId}+${o.offsetMm}/${o.widthMm}`).join(', ')}`);
console.log('Сомнения:', out.uncertain);
console.log('Замечания проверки:', out.issues);
console.log('Визуальная сверка (что исправлено по раундам):', out.checks);
// Картинка результата рядом с исходником: <файл>.result.png — сравнить глазами
if (arg !== '--text') {
  writeFileSync(`${arg}.result.png`, renderPlanPng(g));
  writeFileSync(`${arg}.result.json`, JSON.stringify(out, null, 2));
  console.log(`Сохранено: ${arg}.result.png`);
}
