/**
 * Ручная проверка дизайна от ИИ на демо-квартире:
 *   npx tsx scripts/try-design.ts [roomId] [--merge] [--dump файл.json]
 * --merge — пожелание «объединить кухню с гостиной», стояк на кухне, без газа (зона merge:kitchen+living);
 * --dump — только сохранить проект в файл (например, для проверки в браузере), без запроса к ИИ.
 * Требует запущенного сервера (npm run dev:server) с ключом. Каждый запуск — платный запрос.
 */
import { buildZoneBrief, createEmptyDraft, createRoomFinishes, designZones, validateRoomDesign, type RoomDesign } from '@air/domain';
import { DEMO_PLAN } from '../../web/src/demo/demoPlan';

const args = process.argv.slice(2);
const roomId = args[0] && !args[0].startsWith('--') ? args[0] : 'living';
const d = createEmptyDraft(DEMO_PLAN);
d.goal = 'live';
d.property = { propertyType: 'apartment', buildingType: 'panel', country: 'Украина', city: 'Киев', ceilingHeightMm: 2700 };
d.occupants.live = { adults: 2, childrenAges: [5], pets: [], remoteWorkers: 1, cooking: 'often' };
d.wishes = { text: 'Светлая уютная квартира, место для работы из дома', goals: ['workspace', 'more_storage'], styles: ['scandinavian'], interventionLevel: 'design_only', budget: { min: 300000, max: 500000, currency: 'UAH' } };
d.engineering = [
  { id: 'riser-bath', type: 'riser', position: { x: 3700, y: 200 } },
  { id: 'vent-kitchen', type: 'vent', position: { x: 3300, y: 200 } },
  { id: 'gas', type: 'gas', position: { x: 300, y: 300 } },
];
const base = { ceiling: 'stretch', stretchFinish: 'matte', stretchJoint: 'shadow', walls: 'paint', floor: 'laminate', door: 'hidden', curtainColor: 'beige', tulle: true } as const;
d.finishes.rooms = {
  kitchen: { ...createRoomFinishes('kitchen'), ...base, floor: 'tile', mainLight: 'spots', furniture: ['kitchen_set', 'stove', 'fridge', 'dining_table', 'chairs'] },
  living: { ...createRoomFinishes('living'), ...base, mainLight: 'chandelier_spots', wallLighting: true, furniture: ['sofa', 'coffee_table', 'tv_zone', 'shelving'] },
  bath: { ...createRoomFinishes('bathroom'), ceiling: 'stretch', stretchFinish: 'gloss', stretchJoint: 'straight', walls: 'tile', door: 'hidden', mainLight: 'spots', plumbing: ['sink', 'shower', 'toilet'], furniture: ['washer', 'mirror'] },
  hall: { ...createRoomFinishes('hall'), ...base, mainLight: 'spots', furniture: ['wardrobe', 'shoe_rack', 'mirror'] },
  bedroom: { ...createRoomFinishes('bedroom'), ...base, mainLight: 'chandelier', furniture: ['bed', 'wardrobe', 'nightstands', 'desk'] },
};
d.finishes.socketColor = 'white';

if (args.includes('--merge')) {
  d.wishes.goals = [...d.wishes.goals, 'merge_kitchen'];
  d.engineering = [
    { id: 'riser-bath', type: 'riser', position: { x: 3700, y: 200 } },
    { id: 'riser-kitchen', type: 'riser', position: { x: 3300, y: 2700 } },
    { id: 'vent-kitchen', type: 'vent', position: { x: 3300, y: 200 } },
  ];
}
const dumpIdx = args.indexOf('--dump');
if (dumpIdx >= 0) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(args[dumpIdx + 1] ?? 'draft.json', JSON.stringify(d));
  console.log('Проект сохранён');
  process.exit(0);
}

const started = Date.now();
const res = await fetch('http://localhost:8787/api/design/room', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ draft: d, roomId }),
});
const body = (await res.json()) as RoomDesign & { error?: string };
console.log(`HTTP ${res.status} за ${Math.round((Date.now() - started) / 1000)} с`);
if (!res.ok) {
  console.log(body.error);
  process.exit(1);
}
const zone = designZones(d).find((z) => z.id === roomId)!;
console.log('Модель:', body.model);
console.log('Идея:', body.concept);
console.log('Палитра:', body.palette);
for (const it of body.items) console.log(` - ${it.kind}: ${it.label} @(${it.x},${it.y}) ${it.widthMm}×${it.depthMm}×${it.heightMm} rot${it.rotationDeg} ${it.mount}${it.productId ? ` [${it.productId}]` : ''}`);
console.log('Свет:', body.lights.map((l) => `${l.kind}@(${l.x},${l.y})`).join(', '));
console.log('Советы:', body.notes);
console.log('Неисправленные замечания:', body.unresolved);
console.log('Повторная проверка на клиенте:', validateRoomDesign(body, buildZoneBrief(d, zone)));
