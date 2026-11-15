import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { isWetRoom, itemFootprint, pointInPolygon, type DesignItem, type RoomBrief, type RoomDesign } from '@air/domain';
import { FurnitureModel } from './Furniture3D';
import { floorTexture, sized, wallTexture, type Tex } from './textures';

/**
 * 3D-визуализация дизайна зоны (three.js / React Three Fiber).
 * Стены — плоскости, видимые только изнутри («кукольный домик»): ближние к камере стены
 * не загораживают комнату даже в полную высоту. Мебель — параметрические модели в реальных размерах.
 * Миллиметры плана → метры сцены; ось Y плана → ось Z сцены, высота — ось Y.
 */

const M = 0.001;
const DOOR_H = 2.1;
const SILL_H = 0.9;
const WINDOW_TOP = 2.1;
const COUNTER_H = 0.88;

interface Props {
  brief: RoomBrief;
  design: RoomDesign;
  /** Высота стен на сцене, мм. */
  wallHeightMm: number;
  /** Увеличивается — камера возвращается в исходный вид. */
  resetSignal: number;
  height?: number;
}

interface WallPiece {
  cx: number;
  cz: number;
  len: number;
  /** Поворот плоскости, чтобы её лицевая сторона смотрела внутрь комнаты. */
  rotY: number;
  nx: number;
  nz: number;
  y0: number;
  y1: number;
  kind: 'wall' | 'glass' | 'door';
}

/** Делит стены контура на куски вокруг окон и дверей; всё в метрах. */
function buildWalls(brief: RoomBrief, wallH: number): WallPiece[] {
  const poly = brief.room.polygon;
  const pieces: WallPiece[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (!p || !q) continue;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const lenMm = Math.hypot(dx, dy);
    if (lenMm === 0) continue;
    const ux = dx / lenMm;
    const uy = dy / lenMm;
    // Нормаль внутрь комнаты: проверяем точку чуть в стороне от середины стены
    let nx = -uy;
    let nz = ux;
    const mid = { x: (p.x + q.x) / 2 + nx * 50, y: (p.y + q.y) / 2 + nz * 50 };
    if (!pointInPolygon(mid, poly)) {
      nx = -nx;
      nz = -nz;
    }
    const along = (pt: { x: number; y: number }) => (pt.x - p.x) * ux + (pt.y - p.y) * uy;
    const off = (pt: { x: number; y: number }) => Math.abs((pt.x - p.x) * uy - (pt.y - p.y) * ux);
    const ops = brief.openings
      .filter((o) => off(o.a) < 60 && off(o.b) < 60)
      .map((o) => ({ kind: o.kind, s: Math.max(0, Math.min(along(o.a), along(o.b))) * M, e: Math.min(lenMm, Math.max(along(o.a), along(o.b))) * M }))
      .filter((o) => o.e > o.s)
      .sort((a, b) => a.s - b.s);

    const len = lenMm * M;
    const rotY = Math.atan2(nx, nz);
    const push = (s: number, e: number, y0: number, y1: number, kind: WallPiece['kind'] = 'wall') => {
      const top = Math.min(y1, wallH);
      if (e - s < 0.001 || top - y0 < 0.001) return;
      const m = (s + e) / 2;
      pieces.push({ cx: p.x * M + ux * m, cz: p.y * M + uy * m, len: e - s, rotY, nx, nz, y0, y1: top, kind });
    };
    let cursor = 0;
    for (const o of ops) {
      push(cursor, o.s, 0, wallH);
      if (o.kind === 'door') {
        push(o.s, o.e, 0, DOOR_H, 'door');
        push(o.s, o.e, DOOR_H, wallH);
      } else {
        push(o.s, o.e, 0, SILL_H);
        push(o.s, o.e, SILL_H, WINDOW_TOP, 'glass');
        push(o.s, o.e, WINDOW_TOP, wallH);
      }
      cursor = Math.max(cursor, o.e);
    }
    push(cursor, len, 0, wallH);
  }
  return pieces;
}

function Wall({ w, tex, color, doorColor }: { w: WallPiece; tex: Tex; color: string; doorColor: string }) {
  const map = useMemo(() => (w.kind === 'wall' ? sized(tex, w.len, w.y1 - w.y0) : undefined), [w, tex]);
  const pos: [number, number, number] = [w.cx, (w.y0 + w.y1) / 2, w.cz];
  if (w.kind === 'glass') {
    return (
      // Стекло видно только изнутри, как и стены: на ближней к камере стене оно не висит в воздухе
      <mesh position={pos} rotation={[0, w.rotY, 0]}>
        <planeGeometry args={[w.len, w.y1 - w.y0]} />
        <meshStandardMaterial color="#bfe3ff" transparent opacity={0.4} roughness={0.05} />
      </mesh>
    );
  }
  if (w.kind === 'door') {
    return (
      <group>
        <mesh position={[w.cx + w.nx * 0.01, w.y1 / 2, w.cz + w.nz * 0.01]} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[w.len * 0.96, w.y1 - 0.02]} />
          <meshStandardMaterial color={doorColor} roughness={0.5} />
        </mesh>
        {/* Ручка — плоская накладка, видна только изнутри */}
        <mesh position={[w.cx + w.nx * 0.015 + (w.nz * w.len) / 3, 1.0, w.cz + w.nz * 0.015 - (w.nx * w.len) / 3]} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[0.12, 0.025]} />
          <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={pos} rotation={[0, w.rotY, 0]} receiveShadow>
        <planeGeometry args={[w.len, w.y1 - w.y0]} />
        <meshStandardMaterial color={map ? '#ffffff' : color} map={map} roughness={tex.roughness} />
      </mesh>
      {w.y0 === 0 && (
        <mesh position={[w.cx + w.nx * 0.008, 0.035, w.cz + w.nz * 0.008]} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[w.len, 0.07]} />
          <meshStandardMaterial color="#f2f0ec" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

/** Высота основания предмета: мойка и варочная панель в гарнитуре — на столешнице; настенные — на стене. */
function baseY(it: DesignItem, all: DesignItem[], wallTop: number): number {
  if (it.mount === 'wall') {
    const center = it.kind === 'artwork' || it.kind === 'mirror' ? 1.5 : 1.4 + (it.heightMm * M) / 2;
    return Math.max(0, Math.min(center, wallTop - (it.heightMm * M) / 2 - 0.05)) - (it.heightMm * M) / 2;
  }
  if (it.kind === 'sink' || it.kind === 'stove') {
    const r = itemFootprint(it);
    const set = all.find((o) => {
      if (o.kind !== 'kitchen_set') return false;
      const s = itemFootprint(o);
      return r.x1 < s.x2 && r.x2 > s.x1 && r.y1 < s.y2 && r.y2 > s.y1;
    });
    if (set) return Math.min(COUNTER_H, set.heightMm * M);
  }
  return 0;
}

function Item({ it, y }: { it: DesignItem; y: number }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={[it.x * M, y, it.y * M]}
      rotation={[0, (-it.rotationDeg * Math.PI) / 180, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
    >
      <FurnitureModel it={it} />
      {hover && (
        <Html position={[0, (it.heightMm * M) + 0.15, 0]} center style={{ pointerEvents: 'none' }}>
          <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
            {it.label} · {Math.round(it.widthMm)}×{Math.round(it.depthMm)} мм
          </div>
        </Html>
      )}
    </group>
  );
}

/** Ближайший к точке участок стены — к нему крепятся LED-лента и бра. */
function nearestWall(walls: WallPiece[], x: number, z: number): WallPiece | undefined {
  let best: WallPiece | undefined;
  let bestD = Infinity;
  for (const w of walls) {
    if (w.kind !== 'wall') continue;
    // Расстояние до линии стены, если проекция попадает на участок
    const ux = w.nz;
    const uz = -w.nx;
    const t = (x - w.cx) * ux + (z - w.cz) * uz;
    if (Math.abs(t) > w.len / 2 + 0.3) continue;
    const dist = Math.abs((x - w.cx) * w.nx + (z - w.cz) * w.nz);
    if (dist < bestD) {
      bestD = dist;
      best = w;
    }
  }
  return best;
}

function Light({ kind, x, z, ceiling, wallTop, walls }: { kind: string; x: number; z: number; ceiling: number; wallTop: number; walls: WallPiece[] }) {
  const top = Math.min(ceiling, wallTop + 0.3);
  if (kind === 'chandelier' || kind === 'pendant') {
    const drop = Math.min(0.6, top * 0.25);
    return (
      <group position={[x, top, z]}>
        <mesh position={[0, -drop / 2, 0]}>
          <cylinderGeometry args={[0.006, 0.006, drop, 6]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position={[0, -drop - 0.1, 0]}>
          <cylinderGeometry args={[0.08, kind === 'chandelier' ? 0.28 : 0.18, 0.2, 24, 1, true]} />
          <meshStandardMaterial color="#f5efe2" emissive="#ffe2a0" emissiveIntensity={0.7} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, -drop - 0.2, 0]} intensity={2.2} distance={6} decay={2} color="#ffe9c4" />
      </group>
    );
  }
  if (kind === 'spot') {
    return (
      <group position={[x, top - 0.01, z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.045, 20]} />
          <meshStandardMaterial color="#fffbe8" emissive="#fff1c4" emissiveIntensity={1.4} side={THREE.DoubleSide} />
        </mesh>
        <pointLight position={[0, -0.1, 0]} intensity={0.6} distance={3} decay={2} color="#fff3d6" />
      </group>
    );
  }
  if (kind === 'led_strip' || kind === 'wall_light') {
    const w = nearestWall(walls, x, z);
    if (!w) return null;
    // Проекция точки на стену, чуть внутрь комнаты
    const ux = w.nz;
    const uz = -w.nx;
    const t = Math.max(-w.len / 2, Math.min(w.len / 2, (x - w.cx) * ux + (z - w.cz) * uz));
    const px = w.cx + ux * t + w.nx * 0.012;
    const pz = w.cz + uz * t + w.nz * 0.012;
    if (kind === 'led_strip') {
      // Лента вдоль верха стены, светится вниз
      return (
        <mesh position={[w.cx + w.nx * 0.012, Math.min(wallTop, ceiling) - 0.06, w.cz + w.nz * 0.012]} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[w.len * 0.9, 0.025]} />
          <meshStandardMaterial color="#fff6dc" emissive="#ffe6a8" emissiveIntensity={2} />
        </mesh>
      );
    }
    return (
      <group position={[px, Math.min(1.8, wallTop - 0.15), pz]} rotation={[0, w.rotY, 0]}>
        <mesh>
          <circleGeometry args={[0.09, 20]} />
          <meshStandardMaterial color="#fff6dc" emissive="#ffe6a8" emissiveIntensity={1.5} />
        </mesh>
        <pointLight position={[0, 0, 0.2]} intensity={0.5} distance={2.5} decay={2} color="#fff3d6" />
      </group>
    );
  }
  return null;
}

export default function RoomScene3D({ brief, design, wallHeightMm, resetSignal, height = 440 }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  const ceiling = brief.ceilingHeightMm * M;
  const wallH = Math.min(wallHeightMm * M, ceiling);
  const walls = useMemo(() => buildWalls(brief, wallH), [brief, wallH]);
  const floorShape = useMemo(() => {
    const s = new THREE.Shape();
    brief.room.polygon.forEach((p, i) => (i === 0 ? s.moveTo(p.x * M, -p.y * M) : s.lineTo(p.x * M, -p.y * M)));
    return s;
  }, [brief]);

  const wFloor = brief.room.widthMm * M;
  const dFloor = brief.room.depthMm * M;
  const fTex = useMemo(() => floorTexture(brief.finishes.floor, design.palette.floor, isWetRoom(brief.room.kind)), [brief, design.palette.floor]);
  const floorMap = useMemo(() => {
    const t = sized(fTex, 1, 1);
    // ShapeGeometry даёт UV в метрах — повтор по размеру плитки/доски
    if (t) t.repeat.set(1 / fTex.tileM, 1 / fTex.tileM);
    return t;
  }, [fTex]);
  const wTex = useMemo(() => wallTexture(brief.finishes.walls, design.palette.walls), [brief, design.palette.walls]);
  const doorColor = brief.finishes.door === 'classic' ? '#a0764f' : design.palette.walls;

  // Камера охватывает всю зону: расстояние по радиусу описанной сферы и углу обзора
  const fov = 45;
  const radius = 0.5 * Math.hypot(wFloor, dFloor, ceiling);
  const dist = (radius / Math.sin(((fov / 2) * Math.PI) / 180)) * 0.95;
  const dir = new THREE.Vector3(0.75, 1.05, 1.1).normalize();
  const cx = wFloor / 2;
  const cz = dFloor / 2;
  const camPos: [number, number, number] = [cx + dir.x * dist, dir.y * dist, cz + dir.z * dist];

  useEffect(() => {
    if (resetSignal > 0) controls.current?.reset();
  }, [resetSignal]);

  return (
    <div style={{ width: '100%', height, borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(#eef2f6, #dfe5eb)' }}>
      <Canvas shadows frameloop="demand" camera={{ position: camPos, fov, near: 0.05, far: 100 }} dpr={[1, 2]}>
        <hemisphereLight args={['#ffffff', '#d8cbb8', 0.75]} />
        <directionalLight
          position={[cx + 3, 6, cz + 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-radius * 1.5}
          shadow-camera-right={radius * 1.5}
          shadow-camera-top={radius * 1.5}
          shadow-camera-bottom={-radius * 1.5}
          shadow-bias={-0.0005}
        />
        <OrbitControls ref={controls} makeDefault target={[cx, ceiling * 0.3, cz]} maxPolarAngle={Math.PI / 2.05} minDistance={0.4} maxDistance={dist * 2.5} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <shapeGeometry args={[floorShape]} />
          <meshStandardMaterial color={floorMap ? '#ffffff' : design.palette.floor} map={floorMap} roughness={fTex.roughness} side={THREE.DoubleSide} />
        </mesh>

        {walls.map((w, i) => (
          <Wall key={i} w={w} tex={wTex} color={design.palette.walls} doorColor={doorColor} />
        ))}

        {design.items.map((it, i) => (
          <Item key={i} it={it} y={baseY(it, design.items, wallH)} />
        ))}

        {design.lights.map((l, i) => (
          <Light key={`l${i}`} kind={l.kind} x={l.x * M} z={l.y * M} ceiling={ceiling} wallTop={wallH} walls={walls} />
        ))}

        {/* Инженерные точки: стояк — синяя труба, к которой оставлен доступ */}
        {brief.engineering.map((e, i) => (
          <mesh key={`e${i}`} position={[e.at.x * M, (e.type === 'riser' ? wallH : 0.8) / 2, e.at.y * M]}>
            <cylinderGeometry args={[0.055, 0.055, e.type === 'riser' ? wallH : 0.8, 16]} />
            <meshStandardMaterial color={{ riser: '#1677ff', vent: '#8c8c8c', gas: '#fa8c16', radiator: '#f5222d', electrical_panel: '#722ed1' }[e.type] ?? '#999'} />
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}
