import * as THREE from 'three';
import type { FloorFinish, WallFinish } from '@air/domain';

/**
 * Процедурные текстуры отделки (рисуются на canvas, без внешних файлов):
 * ламинат, винил, плитка, наливной пол; краска, обои, панели, плитка на стенах.
 * Цвет берётся из палитры дизайна, рисунок — из выбранной клиентом отделки.
 */

const SIZE = 512;

/** Псевдослучайность с зерном — текстура одинаковая при каждой отрисовке. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

function canvas(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const el = document.createElement('canvas');
  el.width = SIZE;
  el.height = SIZE;
  const ctx = el.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(el);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Доски со смещёнными стыками. */
function planks(ctx: CanvasRenderingContext2D, color: string, rows: number, perRow: number, contrast: number) {
  const r = rng(7);
  const h = SIZE / rows;
  const w = SIZE / perRow;
  for (let y = 0; y < rows; y++) {
    const offset = (y % 2) * w * 0.5 + (y % 3) * w * 0.17;
    for (let x = -1; x <= perRow; x++) {
      ctx.fillStyle = shade(color, (r() - 0.5) * contrast);
      ctx.fillRect(x * w + offset, y * h, w, h);
      // Волокна древесины
      ctx.strokeStyle = shade(color, -contrast * 0.6);
      ctx.globalAlpha = 0.18;
      for (let k = 0; k < 4; k++) {
        const yy = y * h + h * (0.2 + 0.6 * r());
        ctx.beginPath();
        ctx.moveTo(x * w + offset, yy);
        ctx.bezierCurveTo(x * w + offset + w * 0.3, yy + 2, x * w + offset + w * 0.7, yy - 2, x * w + offset + w, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(color, -0.25);
      ctx.fillRect(x * w + offset, y * h, 2, h);
    }
    ctx.fillStyle = shade(color, -0.22);
    ctx.fillRect(0, y * h, SIZE, 2);
  }
}

function tiles(ctx: CanvasRenderingContext2D, color: string, cols: number, rows: number, grout: string) {
  const r = rng(11);
  const w = SIZE / cols;
  const h = SIZE / rows;
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = shade(color, (r() - 0.5) * 0.04);
      ctx.fillRect(x * w + 2, y * h + 2, w - 4, h - 4);
    }
  }
}

export interface Tex {
  map?: THREE.CanvasTexture;
  /** Сколько метров покрывает один повтор текстуры. */
  tileM: number;
  roughness: number;
}

export function floorTexture(kind: FloorFinish | undefined, color: string, wet: boolean): Tex {
  switch (kind) {
    case 'laminate':
      return { map: canvas((c) => planks(c, color, 8, 2, 0.12)), tileM: 2.4, roughness: 0.7 };
    case 'vinyl':
      return { map: canvas((c) => planks(c, color, 10, 3, 0.07)), tileM: 2, roughness: 0.6 };
    case 'tile':
      return { map: canvas((c) => tiles(c, color, wet ? 4 : 2, wet ? 4 : 2, shade(color, -0.12))), tileM: 1.2, roughness: 0.35 };
    case 'self_leveling':
      return {
        map: canvas((c) => {
          const r = rng(3);
          c.fillStyle = color;
          c.fillRect(0, 0, SIZE, SIZE);
          for (let i = 0; i < 400; i++) {
            c.fillStyle = shade(color, (r() - 0.5) * 0.05);
            c.globalAlpha = 0.4;
            c.beginPath();
            c.arc(r() * SIZE, r() * SIZE, 10 + r() * 30, 0, Math.PI * 2);
            c.fill();
          }
          c.globalAlpha = 1;
        }),
        tileM: 3,
        roughness: 0.25,
      };
    default:
      return { tileM: 1, roughness: 0.8 };
  }
}

export function wallTexture(kind: WallFinish | undefined, color: string): Tex {
  switch (kind) {
    case 'wallpaper':
      return {
        map: canvas((c) => {
          c.fillStyle = color;
          c.fillRect(0, 0, SIZE, SIZE);
          // Контраст заметный даже на светлом фоне и при освещении сцены: полосы + ромбы
          const n = 8;
          for (let i = 0; i < n; i += 2) {
            c.fillStyle = shade(color, -0.07);
            c.fillRect((i * SIZE) / n, 0, SIZE / n, SIZE);
          }
          c.fillStyle = shade(color, -0.2);
          const step = SIZE / 8;
          for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
              const cx = x * step + ((y % 2) * step) / 2 + step / 2;
              const cy = y * step + step / 2;
              c.beginPath();
              c.moveTo(cx, cy - step * 0.22);
              c.lineTo(cx + step * 0.14, cy);
              c.lineTo(cx, cy + step * 0.22);
              c.lineTo(cx - step * 0.14, cy);
              c.fill();
            }
          }
        }),
        tileM: 0.8,
        roughness: 0.9,
      };
    case 'panels':
      return {
        map: canvas((c) => {
          const r = rng(5);
          const n = 8;
          for (let i = 0; i < n; i++) {
            c.fillStyle = shade(color, (r() - 0.5) * 0.08);
            c.fillRect((i * SIZE) / n, 0, SIZE / n, SIZE);
            c.fillStyle = shade(color, -0.3);
            c.fillRect((i * SIZE) / n, 0, 3, SIZE);
          }
        }),
        tileM: 1,
        roughness: 0.6,
      };
    case 'tile':
      return { map: canvas((c) => tiles(c, color, 4, 8, shade(color, -0.1))), tileM: 1.2, roughness: 0.3 };
    default:
      return { tileM: 1, roughness: 0.92 };
  }
}

/** Копия текстуры с повтором под размер поверхности (метры). */
export function sized(tex: Tex, widthM: number, heightM: number): THREE.Texture | undefined {
  if (!tex.map) return undefined;
  const t = tex.map.clone();
  t.repeat.set(widthM / tex.tileM, heightM / tex.tileM);
  t.needsUpdate = true;
  return t;
}

export { shade };
