import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { itemFootprint, type DesignItem, type RoomBrief, type RoomDesign } from '@air/domain';

/**
 * 3D-визуализация дизайна комнаты (three.js / React Three Fiber).
 * Стены — из геометрии плана с проёмами, мебель и свет — из ответа ИИ.
 * Миллиметры плана → метры сцены; ось Y плана → ось Z сцены, высота — ось Y.
 */

const M = 0.001;
const WALL_T = 80;
const DOOR_H = 2100;
const SILL_H = 900;
const WINDOW_TOP = 2100;

interface Props {
  brief: RoomBrief;
  design: RoomDesign;
  /** Высота стен на сцене, мм: «срезанные» стены не закрывают комнату при взгляде сверху. */
  wallHeightMm: number;
  height?: number;
}

interface WallPiece {
  cx: number;
  cz: number;
  len: number;
  angle: number;
  y0: number;
  y1: number;
  glass?: boolean;
}

/** Делит каждую стену контура на куски вокруг окон и дверей. */
function buildWalls(brief: RoomBrief, wallH: number): WallPiece[] {
  const poly = brief.room.polygon;
  const pieces: WallPiece[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (!p || !q) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    const along = (pt: { x: number; y: number }) => (pt.x - p.x) * ux + (pt.y - p.y) * uy;
    const off = (pt: { x: number; y: number }) => Math.abs((pt.x - p.x) * uy - (pt.y - p.y) * ux);
    // Проёмы, лежащие на этой стене
    const ops = brief.openings
      .filter((o) => off(o.a) < 60 && off(o.b) < 60)
      .map((o) => ({ kind: o.kind, s: Math.max(0, Math.min(along(o.a), along(o.b))), e: Math.min(len, Math.max(along(o.a), along(o.b))) }))
      .filter((o) => o.e > o.s)
      .sort((a, b) => a.s - b.s);

    const angle = -Math.atan2(dy, dx);
    const push = (s: number, e: number, y0: number, y1: number, glass = false) => {
      const top = Math.min(y1, wallH);
      if (e - s < 1 || top - y0 < 1) return;
      const m = (s + e) / 2;
      pieces.push({ cx: p.x + ux * m, cz: p.y + uy * m, len: e - s, angle, y0, y1: top, glass });
    };

    let cursor = 0;
    for (const o of ops) {
      push(cursor, o.s, 0, wallH);
      if (o.kind === 'door') {
        push(o.s, o.e, DOOR_H, wallH);
      } else {
        push(o.s, o.e, 0, SILL_H);
        push(o.s, o.e, SILL_H, WINDOW_TOP, true);
        push(o.s, o.e, WINDOW_TOP, wallH);
      }
      cursor = Math.max(cursor, o.e);
    }
    push(cursor, len, 0, wallH);
  }
  return pieces;
}

/** Высота центра предмета; настенные при «срезанных» стенах опускаются к верху стены, чтобы не висеть в воздухе. */
function itemElevation(it: DesignItem, wallTop: number): number {
  if (it.mount === 'floor') return it.heightMm / 2;
  const center = it.kind === 'artwork' || it.kind === 'mirror' ? 1500 : 1400 + it.heightMm / 2;
  return Math.max(it.heightMm / 2, Math.min(center, wallTop - it.heightMm / 2 - 50));
}

function Item({ it, wallTop }: { it: DesignItem; wallTop: number }) {
  const [hover, setHover] = useState(false);
  const r = itemFootprint(it);
  const w = r.x2 - r.x1;
  const d = r.y2 - r.y1;
  const h = it.kind === 'rug' ? Math.min(it.heightMm, 15) : it.heightMm;
  return (
    <mesh
      position={[it.x * M, itemElevation({ ...it, heightMm: h }, wallTop) * M, it.y * M]}
      castShadow
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <boxGeometry args={[w * M, h * M, d * M]} />
      <meshStandardMaterial color={it.color} emissive={hover ? '#334' : '#000'} roughness={0.75} />
      {hover && (
        <Html center distanceFactor={6} style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.78)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            {it.label} · {Math.round(it.widthMm)}×{Math.round(it.depthMm)} мм
          </div>
        </Html>
      )}
    </mesh>
  );
}

const ENGINEERING_COLORS: Record<string, string> = { riser: '#1677ff', vent: '#8c8c8c', gas: '#fa8c16', radiator: '#f5222d', electrical_panel: '#722ed1' };

export default function RoomScene3D({ brief, design, wallHeightMm, height = 420 }: Props) {
  const ceiling = brief.ceilingHeightMm;
  const wallH = Math.min(wallHeightMm, ceiling);
  const walls = useMemo(() => buildWalls(brief, wallH), [brief, wallH]);
  const floorShape = useMemo(() => {
    const s = new THREE.Shape();
    brief.room.polygon.forEach((p, i) => (i === 0 ? s.moveTo(p.x * M, -p.y * M) : s.lineTo(p.x * M, -p.y * M)));
    return s;
  }, [brief]);

  const cx = (brief.room.widthMm / 2) * M;
  const cz = (brief.room.depthMm / 2) * M;
  const span = Math.max(brief.room.widthMm, brief.room.depthMm) * M;

  return (
    <div style={{ height, borderRadius: 8, overflow: 'hidden', background: '#eef1f5' }}>
      <Canvas shadows frameloop="demand" camera={{ position: [cx + span * 0.75, span * 1.05, cz + span * 1.1], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[cx + 3, 6, cz + 4]} intensity={1.1} castShadow />
        <OrbitControls target={[cx, 0.6, cz]} maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={span * 4} />

        {/* Пол */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial color={design.palette.floor} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>

        {/* Стены с проёмами */}
        {walls.map((w, i) => (
          <mesh key={i} position={[w.cx * M, ((w.y0 + w.y1) / 2) * M, w.cz * M]} rotation={[0, w.angle, 0]} castShadow receiveShadow>
            <boxGeometry args={[w.len * M, (w.y1 - w.y0) * M, (w.glass ? 20 : WALL_T) * M]} />
            {w.glass ? (
              <meshStandardMaterial color="#9fd3ff" transparent opacity={0.45} />
            ) : (
              <meshStandardMaterial color={design.palette.walls} roughness={0.95} />
            )}
          </mesh>
        ))}

        {design.items.map((it, i) => (
          <Item key={i} it={it} wallTop={wallH} />
        ))}

        {/* Свет: точки показаны на уровне потолка */}
        {design.lights.map((l, i) => {
          // При «срезанных» стенах потолочный свет показываем чуть выше стен — как отметки на потолке
          const ceilingY = wallH < ceiling ? wallH + 250 : ceiling - 150;
          const y = l.kind === 'floor_lamp' ? 1500 : l.kind === 'wall_light' ? Math.min(1800, wallH - 100) : ceilingY;
          const r = l.kind === 'chandelier' || l.kind === 'pendant' ? 180 : l.kind === 'spot' ? 50 : 70;
          return (
            <mesh key={`l${i}`} position={[l.x * M, y * M, l.y * M]}>
              <sphereGeometry args={[r * M, 16, 12]} />
              <meshStandardMaterial color="#fff4c2" emissive="#ffd666" emissiveIntensity={1.2} />
            </mesh>
          );
        })}

        {/* Инженерные точки — чтобы было видно, что к ним оставлен доступ */}
        {brief.engineering.map((e, i) => (
          <mesh key={`e${i}`} position={[e.at.x * M, (e.type === 'riser' ? wallH / 2 : 400) * M, e.at.y * M]}>
            <cylinderGeometry args={[0.05, 0.05, (e.type === 'riser' ? wallH : 800) * M, 12]} />
            <meshStandardMaterial color={ENGINEERING_COLORS[e.type] ?? '#999'} />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}
