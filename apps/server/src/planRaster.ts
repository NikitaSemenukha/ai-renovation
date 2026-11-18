import { deflateSync } from 'node:zlib';
import type { PlanGeometry, Point } from '@air/domain';

/**
 * Рисует распознанную геометрию в PNG без внешних зависимостей — чтобы показать модели
 * «что мы поняли» рядом с оригиналом. Комнаты — цветные заливки с номером, стены — чёрные,
 * двери — красные, окна — синие. Текста нет (шрифтов на сервере может не быть): номера рисуются
 * встроенным пиксельным шрифтом, расшифровка — в легенде запроса.
 */

const MAX_SIDE = 900;
const MARGIN = 50;

export const ROOM_COLORS: { rgb: [number, number, number]; name: string }[] = [
  { rgb: [255, 196, 196], name: 'розовая' },
  { rgb: [190, 230, 190], name: 'зелёная' },
  { rgb: [190, 210, 255], name: 'голубая' },
  { rgb: [255, 230, 160], name: 'жёлтая' },
  { rgb: [225, 195, 255], name: 'сиреневая' },
  { rgb: [170, 235, 235], name: 'бирюзовая' },
  { rgb: [255, 210, 170], name: 'оранжевая' },
  { rgb: [215, 215, 215], name: 'серая' },
  { rgb: [235, 245, 170], name: 'салатовая' },
  { rgb: [245, 190, 230], name: 'малиновая' },
];

// Пиксельные цифры 3×5
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

class Canvas {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8Array(w * h * 3).fill(255);
  }
  set(x: number, y: number, [r, g, b]: [number, number, number]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }
  /** Отрезок толщиной t пикселей. */
  segment(a: Point, b: Point, t: number, rgb: [number, number, number]) {
    const half = Math.max(t, 1) / 2;
    const x0 = Math.floor(Math.min(a.x, b.x) - half), x1 = Math.ceil(Math.max(a.x, b.x) + half);
    const y0 = Math.floor(Math.min(a.y, b.y) - half), y1 = Math.ceil(Math.max(a.y, b.y) + half);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const k = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
        const ex = a.x + k * dx - px, ey = a.y + k * dy - py;
        if (ex * ex + ey * ey <= half * half) this.set(x, y, rgb);
      }
    }
  }
  polygon(poly: Point[], rgb: [number, number, number]) {
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (inside(poly, x + 0.5, y + 0.5)) this.set(x, y, rgb);
      }
    }
  }
  /** Число по центру в точке c, с белой подложкой. */
  number(text: string, c: Point, scale: number) {
    const cw = 4 * scale, w = text.length * cw - scale, h = 5 * scale;
    const left = Math.round(c.x - w / 2), top = Math.round(c.y - h / 2);
    for (let y = top - scale; y < top + h + scale; y++) for (let x = left - scale; x < left + w + scale; x++) this.set(x, y, [255, 255, 255]);
    [...text].forEach((ch, i) => {
      DIGITS[ch]?.forEach((row, ry) => {
        [...row].forEach((bit, rx) => {
          if (bit !== '1') return;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) this.set(left + i * cw + rx * scale + sx, top + ry * scale + sy, [0, 0, 0]);
        });
      });
    });
  }
  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      raw.set(this.data.subarray(y * this.w * 3, (y + 1) * this.w * 3), y * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8 бит, RGB
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

function inside(poly: Point[], x: number, y: number): boolean {
  let res = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) res = !res;
  }
  return res;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** PNG распознанного плана. Номер на комнате = её индекс в geometry.rooms + 1. */
export function renderPlanPng(g: PlanGeometry): Buffer {
  const pts = [...g.walls.flatMap((w) => [w.a, w.b]), ...g.rooms.flatMap((r) => r.polygon)];
  const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
  const spanX = Math.max(...pts.map((p) => p.x)) - minX || 1, spanY = Math.max(...pts.map((p) => p.y)) - minY || 1;
  const s = (MAX_SIDE - 2 * MARGIN) / Math.max(spanX, spanY);
  const tr = (p: Point): Point => ({ x: MARGIN + (p.x - minX) * s, y: MARGIN + (p.y - minY) * s });
  const c = new Canvas(Math.round(spanX * s + 2 * MARGIN), Math.round(spanY * s + 2 * MARGIN));

  g.rooms.forEach((r, i) => c.polygon(r.polygon.map(tr), ROOM_COLORS[i % ROOM_COLORS.length]!.rgb));
  for (const w of g.walls) c.segment(tr(w.a), tr(w.b), w.thicknessMm * s, [20, 20, 20]);
  for (const o of g.openings) {
    const w = g.walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const at = (d: number): Point => tr({ x: w.a.x + ((w.b.x - w.a.x) * d) / len, y: w.a.y + ((w.b.y - w.a.y) * d) / len });
    const color: [number, number, number] = o.kind === 'door' ? [230, 30, 30] : [30, 90, 240];
    c.segment(at(o.offsetMm), at(o.offsetMm + o.widthMm), w.thicknessMm * s + 6, color);
  }
  g.rooms.forEach((r, i) => c.number(String(i + 1), tr(r.position), 4));
  // Метровая линейка в левом нижнем углу
  const y = c.h - MARGIN / 2;
  c.segment({ x: MARGIN, y }, { x: MARGIN + 1000 * s, y }, 4, [0, 0, 0]);
  return c.png();
}
