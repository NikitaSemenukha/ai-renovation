import type { ReactNode } from 'react';
import type { DesignItem } from '@air/domain';
import { shade } from './textures';

/**
 * Параметрические 3D-модели мебели и сантехники: собраны из простых форм точно в размерах
 * предмета (ширина × глубина × высота), без внешних файлов. Локальные оси модели:
 * X — ширина, Z — глубина (спинка у −Z, лицевая сторона у +Z), Y — вверх от пола.
 */

type V3 = [number, number, number];

interface BoxProps {
  p: V3;
  s: V3;
  c: string;
  rough?: number;
  metal?: number;
  opacity?: number;
}

function Box({ p, s, c, rough = 0.7, metal = 0, opacity }: BoxProps) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </mesh>
  );
}

function Cyl({ p, r, h, c, rTop, rough = 0.6, metal = 0, rot }: { p: V3; r: number; h: number; c: string; rTop?: number; rough?: number; metal?: number; rot?: V3 }) {
  return (
    <mesh position={p} rotation={rot} castShadow receiveShadow>
      <cylinderGeometry args={[rTop ?? r, r, h, 24]} />
      <meshStandardMaterial color={c} roughness={rough} metalness={metal} />
    </mesh>
  );
}

const DARK = '#2b2b2b';
const METAL = '#c9ccd1';
const WHITE = '#f7f7f5';
const GLASS = '#cfe8f7';

/** Фасады шкафа: вертикальные швы дверей и ручки. */
function Fronts({ W, H, D, y0 = 0, doors, drawers = 0, c }: { W: number; H: number; D: number; y0?: number; doors: number; drawers?: number; c: string }) {
  const out: ReactNode[] = [];
  const z = D / 2 + 0.002;
  const line = shade(c, -0.25);
  if (drawers > 0) {
    for (let i = 1; i < drawers; i++) out.push(<Box key={`d${i}`} p={[0, y0 + (H * i) / drawers, z]} s={[W * 0.98, 0.006, 0.004]} c={line} />);
    for (let i = 0; i < drawers; i++) out.push(<Box key={`hd${i}`} p={[0, y0 + (H * (i + 0.5)) / drawers, z + 0.01]} s={[Math.min(0.2, W * 0.3), 0.015, 0.015]} c={METAL} metal={0.8} rough={0.3} />);
  } else {
    for (let i = 1; i < doors; i++) out.push(<Box key={`v${i}`} p={[-W / 2 + (W * i) / doors, y0 + H / 2, z]} s={[0.006, H * 0.97, 0.004]} c={line} />);
    for (let i = 0; i < doors; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (W / doors) * 0.35;
      out.push(<Box key={`h${i}`} p={[x, y0 + Math.min(H * 0.5, 1.05), z + 0.01]} s={[0.015, Math.min(0.25, H * 0.3), 0.015]} c={METAL} metal={0.8} rough={0.3} />);
    }
  }
  return <>{out}</>;
}

function Sofa({ W, D, H, c }: Dims) {
  const arm = Math.min(0.16, W * 0.1);
  const back = Math.min(0.24, D * 0.28);
  const seatTop = 0.44;
  const inner = W - arm * 2;
  const n = Math.max(1, Math.round(inner / 0.7));
  return (
    <>
      <Box p={[0, 0.05, 0]} s={[W * 0.96, 0.1, D * 0.94]} c={DARK} />
      <Box p={[0, 0.1 + (seatTop - 0.1) / 2, back / 2]} s={[inner, seatTop - 0.1, D - back]} c={c} rough={0.95} />
      <Box p={[0, (H + 0.1) / 2, -D / 2 + back / 2]} s={[W, H - 0.1, back]} c={shade(c, -0.05)} rough={0.95} />
      {[-1, 1].map((sgn) => (
        <Box key={sgn} p={[sgn * (W / 2 - arm / 2), 0.1 + (Math.min(H * 0.72, 0.65) - 0.1) / 2, 0]} s={[arm, Math.min(H * 0.72, 0.65) - 0.1, D]} c={shade(c, -0.04)} rough={0.95} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} p={[-inner / 2 + (inner * (i + 0.5)) / n, seatTop + 0.18, -D / 2 + back + 0.08]} s={[(inner / n) * 0.94, 0.36, 0.16]} c={shade(c, 0.06)} rough={1} />
      ))}
    </>
  );
}

function Bed({ W, D, H, c }: Dims) {
  const frameC = shade(c, -0.15);
  return (
    <>
      <Box p={[0, 0.15, 0]} s={[W, 0.3, D]} c={frameC} />
      <Box p={[0, 0.4, 0.03]} s={[W - 0.06, 0.2, D - 0.12]} c={WHITE} rough={1} />
      <Box p={[0, H / 2, -D / 2 + 0.04]} s={[W, H, 0.08]} c={c} rough={0.9} />
      {[-1, 1].map((sgn) => (
        <Box key={sgn} p={[(sgn * W) / 4, 0.56, -D / 2 + 0.32]} s={[W * 0.4, 0.12, 0.34]} c="#ffffff" rough={1} />
      ))}
      <Box p={[0, 0.515, D * 0.14]} s={[W - 0.02, 0.04, D * 0.62]} c={shade(c, 0.12)} rough={1} />
    </>
  );
}

function Table({ W, D, H, c }: Dims) {
  const t = 0.035;
  const legs: V3[] = [
    [W / 2 - 0.05, (H - t) / 2, D / 2 - 0.05],
    [-W / 2 + 0.05, (H - t) / 2, D / 2 - 0.05],
    [W / 2 - 0.05, (H - t) / 2, -D / 2 + 0.05],
    [-W / 2 + 0.05, (H - t) / 2, -D / 2 + 0.05],
  ];
  return (
    <>
      <Box p={[0, H - t / 2, 0]} s={[W, t, D]} c={c} rough={0.5} />
      {legs.map((p, i) => (
        <Box key={i} p={p} s={[0.045, H - t, 0.045]} c={shade(c, -0.3)} />
      ))}
    </>
  );
}

function Chair({ x, z, c }: { x: number; z: number; c: string }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.45, 0]} s={[0.44, 0.04, 0.44]} c={c} />
      <Box p={[0, 0.68, -0.2]} s={[0.44, 0.42, 0.04]} c={c} />
      {[[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]].map(([lx, lz], i) => (
        <Box key={i} p={[lx!, 0.215, lz!]} s={[0.03, 0.43, 0.03]} c={DARK} />
      ))}
    </group>
  );
}

function Chairs({ W, D, c }: Dims) {
  const alongX = W >= D;
  const n = Math.max(1, Math.round((alongX ? W : D) / 0.55));
  const len = alongX ? W : D;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const t = -len / 2 + (len * (i + 0.5)) / n;
        return <Chair key={i} x={alongX ? t : 0} z={alongX ? 0 : t} c={c} />;
      })}
    </>
  );
}

function Cabinet({ W, D, H, c, drawers = 0 }: Dims & { drawers?: number }) {
  return (
    <>
      <Box p={[0, 0.03, 0]} s={[W * 0.98, 0.06, D * 0.95]} c={DARK} />
      <Box p={[0, 0.06 + (H - 0.06) / 2, 0]} s={[W, H - 0.06, D]} c={c} rough={0.55} />
      <Fronts W={W} H={H - 0.06} D={D} y0={0.06} doors={Math.max(1, Math.round(W / 0.5))} drawers={drawers} c={c} />
    </>
  );
}

function TvZone({ W, D, H, c }: Dims) {
  const tvW = Math.min(1.45, W * 0.85);
  const tvH = tvW * 0.58;
  return (
    <>
      <Cabinet W={W} D={D} H={H} c={c} drawers={0} />
      {W >= 1 && (
        <>
          <Box p={[0, H + 0.04, -D / 2 + 0.1]} s={[0.3, 0.02, 0.15]} c={DARK} />
          <Box p={[0, H + 0.06 + tvH / 2, -D / 2 + 0.06]} s={[tvW, tvH, 0.035]} c="#111111" rough={0.2} metal={0.3} />
        </>
      )}
    </>
  );
}

function Shelving({ W, D, H, c }: Dims) {
  const n = Math.max(2, Math.round(H / 0.38));
  const books = ['#9b2d30', '#3d5a80', '#d4a72c', '#5f7a55', '#e0d6c8'];
  return (
    <>
      {[-1, 1].map((sgn) => (
        <Box key={sgn} p={[(sgn * (W - 0.02)) / 2, H / 2, 0]} s={[0.02, H, D]} c={c} />
      ))}
      <Box p={[0, H / 2, -D / 2 + 0.005]} s={[W, H, 0.01]} c={shade(c, -0.08)} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <Box key={i} p={[0, (H * i) / n + 0.01, 0]} s={[W, 0.02, D]} c={c} />
      ))}
      {Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? (
          <Box key={`b${i}`} p={[-W * 0.15, (H * i) / n + 0.13, 0]} s={[W * 0.45, 0.22, D * 0.7]} c={books[i % books.length]!} rough={0.9} />
        ) : null,
      )}
    </>
  );
}

function KitchenSet({ W, D, H, c }: Dims) {
  const baseH = Math.min(H, 0.88);
  const hasUpper = H > 1.3;
  const upTop = Math.min(H, 2.25);
  return (
    <>
      <Box p={[0, 0.05, 0.02]} s={[W, 0.1, D - 0.06]} c={DARK} />
      <Box p={[0, 0.1 + (baseH - 0.14) / 2, 0]} s={[W, baseH - 0.14, D - 0.02]} c={c} rough={0.45} />
      <Fronts W={W} H={baseH - 0.14} D={D - 0.02} y0={0.1} doors={Math.max(1, Math.round(W / 0.6))} c={c} />
      <Box p={[0, baseH - 0.02, 0.01]} s={[W, 0.04, D]} c="#d9d4cc" rough={0.3} />
      {hasUpper && (
        <>
          <Box p={[0, (baseH + 1.45) / 2, -D / 2 + 0.01]} s={[W, 1.45 - baseH, 0.01]} c="#e8e4dc" rough={0.3} />
          <Box p={[0, (1.45 + upTop) / 2, -D / 2 + 0.175]} s={[W, upTop - 1.45, 0.35]} c={c} rough={0.45} />
          <Fronts W={W} H={upTop - 1.45} D={0.35} y0={1.45} doors={Math.max(1, Math.round(W / 0.6))} c={c} />
        </>
      )}
    </>
  );
}

function Cooktop({ W, D }: Dims) {
  return (
    <>
      <Box p={[0, 0.005, 0]} s={[W, 0.01, D]} c="#151515" rough={0.15} metal={0.2} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <Cyl key={i} p={[(sx! * W) / 4, 0.012, (sz! * D) / 4]} r={Math.min(W, D) * 0.16} rTop={Math.min(W, D) * 0.16} h={0.004} c="#3a3a3a" rough={0.4} />
      ))}
    </>
  );
}

function Stove(d: Dims) {
  if (d.H < 0.3) return <Cooktop {...d} />;
  return (
    <>
      <Box p={[0, d.H / 2, 0]} s={[d.W, d.H, d.D]} c={WHITE} rough={0.4} />
      <group position={[0, d.H, 0]}>
        <Cooktop {...d} />
      </group>
      <Box p={[0, d.H * 0.45, d.D / 2 + 0.003]} s={[d.W * 0.8, d.H * 0.45, 0.006]} c="#1d1d1d" rough={0.2} />
    </>
  );
}

function Fridge({ W, D, H, c }: Dims) {
  return (
    <>
      <Box p={[0, H / 2, 0]} s={[W, H, D]} c={c} rough={0.35} metal={0.2} />
      <Box p={[0, H * 0.62, D / 2 + 0.003]} s={[W * 0.98, 0.008, 0.004]} c={shade(c, -0.3)} />
      <Box p={[W * 0.38, H * 0.8, D / 2 + 0.02]} s={[0.02, 0.3, 0.03]} c={METAL} metal={0.8} rough={0.3} />
      <Box p={[W * 0.38, H * 0.45, D / 2 + 0.02]} s={[0.02, 0.3, 0.03]} c={METAL} metal={0.8} rough={0.3} />
    </>
  );
}

function Faucet({ x = 0, z, y }: { x?: number; z: number; y: number }) {
  return (
    <>
      <Cyl p={[x, y + 0.12, z]} r={0.015} h={0.24} c={METAL} metal={0.9} rough={0.2} />
      <Box p={[x, y + 0.23, z + 0.07]} s={[0.025, 0.025, 0.14]} c={METAL} metal={0.9} rough={0.2} />
    </>
  );
}

function Sink({ W, D, H, c }: Dims) {
  if (H < 0.4) {
    // Мойка в столешнице
    return (
      <>
        <Box p={[0, 0.01, 0]} s={[W, 0.02, D]} c={c} rough={0.25} metal={0.6} />
        <Box p={[0, 0.015, 0.02]} s={[W * 0.8, 0.02, D * 0.7]} c={shade(c, -0.2)} rough={0.3} metal={0.6} />
        <Faucet z={-D / 2 + 0.06} y={0.02} />
      </>
    );
  }
  return (
    <>
      <Cyl p={[0, (H - 0.15) / 2, -D * 0.15]} r={0.09} h={H - 0.15} c={WHITE} rough={0.3} />
      <Box p={[0, H - 0.075, 0]} s={[W, 0.15, D]} c={WHITE} rough={0.25} />
      <Box p={[0, H - 0.02, 0.02]} s={[W * 0.75, 0.02, D * 0.6]} c="#dfe6ea" rough={0.2} />
      <Faucet z={-D / 2 + 0.06} y={H} />
    </>
  );
}

function Vanity({ W, D, H, c }: Dims) {
  return (
    <>
      <Box p={[0, 0.15 + (H - 0.3) / 2, 0]} s={[W, H - 0.3, D]} c={c} rough={0.5} />
      <Fronts W={W} H={H - 0.3} D={D} y0={0.15} doors={Math.max(1, Math.round(W / 0.4))} drawers={0} c={c} />
      <Box p={[0, H - 0.075, 0.01]} s={[W, 0.15, D + 0.02]} c={WHITE} rough={0.2} />
      <Box p={[0, H - 0.02, 0.03]} s={[W * 0.7, 0.02, D * 0.55]} c="#dfe6ea" rough={0.2} />
      <Faucet z={-D / 2 + 0.06} y={H} />
    </>
  );
}

function Toilet({ W, D, H }: Dims) {
  const wallHung = H < 0.6;
  const bowlY = wallHung ? 0.42 : 0.4;
  return (
    <>
      {!wallHung && <Box p={[0, 0.12, -0.02]} s={[W * 0.55, 0.24, D * 0.5]} c={WHITE} rough={0.25} />}
      <mesh position={[0, bowlY - 0.08, D * 0.08]} scale={[1, 1, (D * 0.75) / W]} castShadow>
        <cylinderGeometry args={[W / 2, W * 0.38, 0.2, 24]} />
        <meshStandardMaterial color={WHITE} roughness={0.25} />
      </mesh>
      <Box p={[0, bowlY + 0.03, D * 0.08]} s={[W * 0.95, 0.025, D * 0.72]} c={WHITE} rough={0.3} />
      <Box p={[0, wallHung ? 0.7 : bowlY + 0.2, -D / 2 + 0.09]} s={[W, wallHung ? 0.9 : 0.4, 0.18]} c={wallHung ? '#e9e6df' : WHITE} rough={0.3} />
    </>
  );
}

function Bathtub({ W, D, H }: Dims) {
  return (
    <>
      <Box p={[0, H / 2, 0]} s={[W, H, D]} c={WHITE} rough={0.25} />
      <Box p={[0, H - 0.005, 0]} s={[W - 0.12, 0.012, D - 0.12]} c="#d7e3ea" rough={0.15} />
      <Faucet x={-W / 2 + 0.1} z={0} y={H} />
    </>
  );
}

function Shower({ W, D, H }: Dims) {
  return (
    <>
      <Box p={[0, 0.03, 0]} s={[W, 0.06, D]} c={WHITE} rough={0.3} />
      <Box p={[0, H / 2, D / 2 - 0.003]} s={[W, H - 0.06, 0.006]} c={GLASS} opacity={0.3} rough={0.05} />
      <Box p={[W / 2 - 0.003, H / 2, 0]} s={[0.006, H - 0.06, D]} c={GLASS} opacity={0.3} rough={0.05} />
      <Cyl p={[-W / 2 + 0.08, H * 0.55, -D / 2 + 0.05]} r={0.012} h={H * 0.9} c={METAL} metal={0.9} rough={0.2} />
      <Cyl p={[-W / 2 + 0.18, H - 0.1, -D / 2 + 0.15]} r={0.1} rTop={0.1} h={0.015} c={METAL} metal={0.9} rough={0.2} />
    </>
  );
}

function Washer({ W, D, H }: Dims) {
  return (
    <>
      <Box p={[0, H / 2, 0]} s={[W, H, D]} c={WHITE} rough={0.35} />
      <mesh position={[0, H * 0.45, D / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[Math.min(W, H) * 0.28, 0.025, 12, 32]} />
        <meshStandardMaterial color="#9aa3ab" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, H * 0.45, D / 2 + 0.003]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[Math.min(W, H) * 0.26, Math.min(W, H) * 0.26, 0.004, 32]} />
        <meshStandardMaterial color="#3a4752" roughness={0.1} />
      </mesh>
    </>
  );
}

function Mirror({ W, H, c }: Dims) {
  return (
    <>
      <Box p={[0, H / 2, 0]} s={[W, H, 0.025]} c={c} />
      <Box p={[0, H / 2, 0.014]} s={[W - 0.05, H - 0.05, 0.004]} c="#dde6ec" metal={0.9} rough={0.05} />
    </>
  );
}

function Artwork({ W, H, c }: Dims) {
  return (
    <>
      <Box p={[0, H / 2, 0]} s={[W, H, 0.03]} c="#3b3026" />
      <Box p={[0, H / 2, 0.016]} s={[W - 0.06, H - 0.06, 0.004]} c={c} rough={0.9} />
      <Box p={[-(W - 0.06) / 6, H / 2 + (H - 0.06) / 6, 0.019]} s={[(W - 0.06) / 3, (H - 0.06) / 3, 0.002]} c={shade(c, 0.25)} rough={0.9} />
    </>
  );
}

function Plant({ W, D, H, c }: Dims) {
  const r = Math.min(W, D) * 0.32;
  const potH = Math.min(0.4, H * 0.3);
  return (
    <>
      <Cyl p={[0, potH / 2, 0]} r={r * 0.8} rTop={r} h={potH} c="#e8e2d8" rough={0.6} />
      {[[0, 0.75, 0, 1], [0.35, 0.55, 0.2, 0.75], [-0.3, 0.6, -0.15, 0.8], [0.1, 0.9, -0.25, 0.7]].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x! * r * 1.6, potH + (H - potH) * y!, z! * r * 1.6]} castShadow>
          <sphereGeometry args={[r * 1.25 * s!, 14, 10]} />
          <meshStandardMaterial color={i % 2 ? shade(c, 0.08) : c} roughness={0.9} />
        </mesh>
      ))}
    </>
  );
}

function FloorLamp({ H, c }: Dims) {
  return (
    <>
      <Cyl p={[0, 0.01, 0]} r={0.15} h={0.02} c={DARK} metal={0.5} />
      <Cyl p={[0, (H - 0.25) / 2, 0]} r={0.012} h={H - 0.25} c={DARK} metal={0.5} />
      <mesh position={[0, H - 0.125, 0]}>
        <cylinderGeometry args={[0.13, 0.19, 0.25, 24, 1, true]} />
        <meshStandardMaterial color={c} emissive="#ffe8a8" emissiveIntensity={0.5} side={2} />
      </mesh>
    </>
  );
}

function Rug({ W, D, c }: Dims) {
  return (
    <>
      <Box p={[0, 0.004, 0]} s={[W, 0.008, D]} c={c} rough={1} />
      <Box p={[0, 0.0085, 0]} s={[W * 0.86, 0.001, D * 0.86]} c={shade(c, -0.07)} rough={1} />
    </>
  );
}

interface Dims {
  W: number;
  D: number;
  H: number;
  c: string;
}

/** Модель предмета в метрах; позиционирование и поворот делает сцена. */
export function FurnitureModel({ it }: { it: DesignItem }) {
  const d: Dims = { W: it.widthMm / 1000, D: it.depthMm / 1000, H: it.heightMm / 1000, c: it.color };
  switch (it.kind) {
    case 'sofa':
    case 'armchairs':
      return <Sofa {...d} />;
    case 'bed':
      return <Bed {...d} />;
    case 'coffee_table':
    case 'dining_table':
    case 'desk':
      return <Table {...d} />;
    case 'chairs':
      return <Chairs {...d} />;
    case 'wardrobe':
    case 'shoe_rack':
      return <Cabinet {...d} />;
    case 'dresser':
    case 'nightstands':
      return <Cabinet {...d} drawers={Math.max(2, Math.round(d.H / 0.22))} />;
    case 'tv_zone':
      return <TvZone {...d} />;
    case 'shelving':
      return <Shelving {...d} />;
    case 'kitchen_set':
      return <KitchenSet {...d} />;
    case 'stove':
      return <Stove {...d} />;
    case 'fridge':
      return <Fridge {...d} />;
    case 'sink':
      return <Sink {...d} />;
    case 'vanity':
      return <Vanity {...d} />;
    case 'toilet':
      return <Toilet {...d} />;
    case 'bathtub':
      return <Bathtub {...d} />;
    case 'shower':
      return <Shower {...d} />;
    case 'washer':
      return <Washer {...d} />;
    case 'mirror':
      return <Mirror {...d} />;
    case 'artwork':
      return <Artwork {...d} />;
    case 'plant':
      return <Plant {...d} />;
    case 'floor_lamp':
      return <FloorLamp {...d} />;
    case 'rug':
      return <Rug {...d} />;
    default:
      return <Box p={[0, d.H / 2, 0]} s={[d.W, d.H, d.D]} c={d.c} />;
  }
}
