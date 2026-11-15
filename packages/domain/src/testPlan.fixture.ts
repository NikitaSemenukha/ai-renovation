import type { PlanGeometry, Point } from './types';

const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/** Тестовая квартира 9.0 × 6.5 м (та же раскладка, что демо-план в вебе). */
export const TEST_PLAN: PlanGeometry = {
  source: 'demo',
  bounds: { width: 9000, height: 6500 },
  walls: [
    { id: 'ext-n', a: { x: 0, y: 0 }, b: { x: 9000, y: 0 }, thicknessMm: 400, isExterior: true, status: 'unknown' },
    { id: 'kitchen-living', a: { x: 0, y: 3000 }, b: { x: 3500, y: 3000 }, thicknessMm: 100, isExterior: false, status: 'unknown' },
    { id: 'core', a: { x: 3500, y: 0 }, b: { x: 3500, y: 6500 }, thicknessMm: 380, isExterior: false, status: 'unknown' },
  ],
  rooms: [
    { id: 'kitchen', name: 'Кухня', kind: 'kitchen', position: { x: 1750, y: 1500 }, polygon: rect(0, 0, 3500, 3000) },
    { id: 'living', name: 'Гостиная', kind: 'living', position: { x: 1750, y: 4750 }, polygon: rect(0, 3000, 3500, 6500) },
    { id: 'bedroom', name: 'Спальня', kind: 'bedroom', position: { x: 6000, y: 3250 }, polygon: rect(3500, 0, 9000, 6500) },
  ],
  openings: [
    { id: 'win-kitchen', kind: 'window', wallId: 'ext-n', offsetMm: 1000, widthMm: 1400 },
    { id: 'door-bedroom', kind: 'door', wallId: 'core', offsetMm: 4000, widthMm: 800 },
  ],
};
