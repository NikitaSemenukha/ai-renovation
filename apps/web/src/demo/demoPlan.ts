import type { PlanGeometry, Point } from '@air/domain';

const rect = (x1: number, y1: number, x2: number, y2: number): Point[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

/**
 * ДЕМО-ПЛАН для прототипа. Используется, пока не реализовано распознавание
 * загруженного плана (следующий этап). source: 'demo' — в метрику не засчитывается,
 * в интерфейсе всегда помечен как демо.
 * Двухкомнатная квартира 9.0 × 6.5 м, координаты в мм (совпадает с test-data/test-tech-passport.png).
 */
export const DEMO_PLAN: PlanGeometry = {
  source: 'demo',
  bounds: { width: 9000, height: 6500 },
  walls: [
    { id: 'ext-n', a: { x: 0, y: 0 }, b: { x: 9000, y: 0 }, thicknessMm: 400, isExterior: true, status: 'unknown' },
    { id: 'ext-e', a: { x: 9000, y: 0 }, b: { x: 9000, y: 6500 }, thicknessMm: 400, isExterior: true, status: 'unknown' },
    { id: 'ext-s', a: { x: 9000, y: 6500 }, b: { x: 0, y: 6500 }, thicknessMm: 400, isExterior: true, status: 'unknown' },
    { id: 'ext-w', a: { x: 0, y: 6500 }, b: { x: 0, y: 0 }, thicknessMm: 400, isExterior: true, status: 'unknown' },
    { id: 'kitchen-living', a: { x: 0, y: 3000 }, b: { x: 3500, y: 3000 }, thicknessMm: 100, isExterior: false, status: 'unknown' },
    { id: 'core', a: { x: 3500, y: 0 }, b: { x: 3500, y: 6500 }, thicknessMm: 380, isExterior: false, status: 'unknown' },
    { id: 'bath-hall', a: { x: 3500, y: 2200 }, b: { x: 5300, y: 2200 }, thicknessMm: 80, isExterior: false, status: 'unknown' },
    { id: 'hall-bedroom', a: { x: 5300, y: 0 }, b: { x: 5300, y: 6500 }, thicknessMm: 120, isExterior: false, status: 'unknown' },
  ],
  rooms: [
    { id: 'kitchen', name: 'Кухня', kind: 'kitchen', position: { x: 1750, y: 1500 }, polygon: rect(0, 0, 3500, 3000) },
    { id: 'living', name: 'Гостиная', kind: 'living', position: { x: 1750, y: 4750 }, polygon: rect(0, 3000, 3500, 6500) },
    { id: 'bath', name: 'Санузел', kind: 'bathroom', position: { x: 4400, y: 1100 }, polygon: rect(3500, 0, 5300, 2200) },
    { id: 'hall', name: 'Коридор', kind: 'hall', position: { x: 4400, y: 4350 }, polygon: rect(3500, 2200, 5300, 6500) },
    { id: 'bedroom', name: 'Спальня', kind: 'bedroom', position: { x: 7150, y: 3250 }, polygon: rect(5300, 0, 9000, 6500) },
  ],
  // offsetMm — от точки a стены. Окна и двери нужны для штор и выбора дверей в шаге «Отделка».
  openings: [
    { id: 'win-kitchen', kind: 'window', wallId: 'ext-n', offsetMm: 1000, widthMm: 1400 },
    { id: 'win-bedroom-n', kind: 'window', wallId: 'ext-n', offsetMm: 6400, widthMm: 1500 },
    { id: 'win-bedroom-e', kind: 'window', wallId: 'ext-e', offsetMm: 2500, widthMm: 1500 },
    { id: 'win-living', kind: 'window', wallId: 'ext-s', offsetMm: 6500, widthMm: 1500 },
    { id: 'door-entrance', kind: 'door', wallId: 'ext-s', offsetMm: 4200, widthMm: 900 },
    { id: 'door-kitchen', kind: 'door', wallId: 'core', offsetMm: 2300, widthMm: 700 },
    { id: 'door-living', kind: 'door', wallId: 'core', offsetMm: 4000, widthMm: 800 },
    { id: 'door-bath', kind: 'door', wallId: 'bath-hall', offsetMm: 500, widthMm: 700 },
    { id: 'door-bedroom', kind: 'door', wallId: 'hall-bedroom', offsetMm: 4000, widthMm: 800 },
  ],
};
