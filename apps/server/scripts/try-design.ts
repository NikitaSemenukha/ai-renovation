/**
 * Ручная проверка дизайна от ИИ на демо-квартире: npx tsx scripts/try-design.ts [roomId]
 * Требует запущенного сервера (npm run dev:server) с ключом. Каждый запуск — платный запрос.
 */
import { createEmptyDraft, createRoomFinishes, validateRoomDesign, buildRoomBrief, type RoomDesign } from '@air/domain';
import { DEMO_PLAN } from '../../web/src/demo/demoPlan';

const roomId = process.argv[2] ?? 'living';
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
const room = d.geometry.rooms.find((r) => r.id === roomId)!;
console.log('Модель:', body.model);
console.log('Идея:', body.concept);
console.log('Палитра:', body.palette);
for (const it of body.items) console.log(` - ${it.kind}: ${it.label} @(${it.x},${it.y}) ${it.widthMm}×${it.depthMm}×${it.heightMm} rot${it.rotationDeg} ${it.mount}`);
console.log('Свет:', body.lights.map((l) => `${l.kind}@(${l.x},${l.y})`).join(', '));
console.log('Советы:', body.notes);
console.log('Неисправленные замечания:', body.unresolved);
console.log('Повторная проверка на клиенте:', validateRoomDesign(body, buildRoomBrief(d, room)));
