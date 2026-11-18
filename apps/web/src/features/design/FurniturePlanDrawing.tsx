import { forwardRef, type ReactNode } from 'react';
import { pointInPolygon, type DesignItem, type FurniturePlanSheet, type PlacedItem, type Point, type Rect } from '@air/domain';
import { OpeningMark } from '../plan/PlanCanvas';

/**
 * Лист «План размещения мебели» в стиле рабочих чертежей дизайнера: серые стены, мебель сверху,
 * синие размерные линии (привязки к чистовым стенам и габариты), номера по спецификации.
 */

const WALL = '#9a9a9a';
const INK = '#4a4a4a';
const FILL = '#f2f2f2';
const DIM = '#1d6fe0';

interface Props {
  sheet: FurniturePlanSheet;
  /** Показать только эту зону (лист комнаты). */
  focusZoneId?: string;
  showDimensions?: boolean;
  showNumbers?: boolean;
}

const fmt = (mm: number) => Math.round(mm).toLocaleString('ru-RU');

export const FurniturePlanDrawing = forwardRef<SVGSVGElement, Props>(function FurniturePlanDrawing(
  { sheet, focusZoneId, showDimensions = true, showNumbers = true },
  ref,
) {
  const g = sheet.geometry;
  const focusZone = focusZoneId ? sheet.zones.find((z) => z.id === focusZoneId) : undefined;
  const items = focusZoneId ? sheet.items.filter((p) => p.zoneId === focusZoneId) : sheet.items;

  // Область листа: вся квартира или одна комната с запасом под размеры
  let box: Rect = { x1: 0, y1: 0, x2: g.bounds.width, y2: g.bounds.height };
  if (focusZone) {
    const xs = focusZone.room.polygon.map((p) => p.x);
    const ys = focusZone.room.polygon.map((p) => p.y);
    box = { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }
  const span = Math.max(box.x2 - box.x1, box.y2 - box.y1);
  // Дуги открывания дверей — подписи комнат туда не ставим (сторона открывания неизвестна — обе стороны)
  const doorZones: Rect[] = (g.openings ?? []).flatMap((o) => {
    const w = g.walls.find((x) => x.id === o.wallId);
    if (o.kind !== 'door' || !w) return [];
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
    const ux = (w.b.x - w.a.x) / len;
    const uy = (w.b.y - w.a.y) / len;
    const s = { x: w.a.x + ux * o.offsetMm, y: w.a.y + uy * o.offsetMm };
    const e = { x: s.x + ux * o.widthMm, y: s.y + uy * o.widthMm };
    const xs = [s.x, e.x, s.x - uy * o.widthMm, s.x + uy * o.widthMm];
    const ys = [s.y, e.y, s.y + ux * o.widthMm, s.y - ux * o.widthMm];
    return [{ x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) }];
  });
  // Размер шрифта и толщина линий — от масштаба листа, чтобы на экране было читаемо
  const fs = Math.max(70, span / 65);
  const sw = fs / 9;
  const pad = fs * 4;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${box.x1 - pad} ${box.y1 - pad} ${box.x2 - box.x1 + pad * 2} ${box.y2 - box.y1 + pad * 2}`}
      style={{ width: '100%', height: 'auto', background: '#fff', display: 'block' }}
      role="img"
      aria-label="План размещения мебели"
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <rect x={box.x1 - pad} y={box.y1 - pad} width={box.x2 - box.x1 + pad * 2} height={box.y2 - box.y1 + pad * 2} fill="#fff" />

      {/* Мебель под стенами: край у стены уходит под её толщину */}
      {items.map((p) => (
        <ItemSymbol key={p.n} p={p} sw={sw} />
      ))}

      {g.walls.map((w) => (
        <line key={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke={WALL} strokeWidth={Math.max(w.thicknessMm, 80)} strokeLinecap="square" />
      ))}
      {(g.openings ?? []).map((o) => (
        <OpeningMark key={o.id} opening={o} geometry={g} />
      ))}

      {sheet.rooms.map((r, i) => {
        if (focusZoneId && r.id !== focusZone?.room.id) return null;
        const room = g.rooms.find((x) => x.id === r.id);
        const at = room ? freeSpot(room.polygon, [...items.map((p) => p.rect), ...doorZones], fs) : r.position;
        return <RoomTag key={r.id} x={at.x} y={at.y} n={i + 1} name={r.name} area={r.areaM2} fs={fs} sw={sw} />;
      })}

      {showDimensions && items.map((p) => <ItemDimensions key={`d${p.n}`} p={p} fs={fs} sw={sw} />)}

      {showNumbers &&
        items
          .filter((p) => p.item.kind !== 'rug')
          .map((p) => {
            const cx = (p.rect.x1 + p.rect.x2) / 2;
            const cy = (p.rect.y1 + p.rect.y2) / 2;
            return (
              <g key={`n${p.n}`}>
                <circle cx={cx} cy={cy} r={fs * 0.62} fill="#fff" stroke={INK} strokeWidth={sw} />
                <text x={cx} y={cy + fs * 0.33} textAnchor="middle" fontSize={fs * 0.85} fill={INK}>{p.n}</text>
              </g>
            );
          })}
    </svg>
  );
});

/** Место для подписи комнаты подальше от мебели: перебор точек сетки внутри контура. */
function freeSpot(poly: Point[], rects: Rect[], fs: number): Point {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const x1 = Math.min(...xs) + fs * 3.5;
  const x2 = Math.max(...xs) - fs * 3.5;
  const y1 = Math.min(...ys) + fs * 3;
  const y2 = Math.max(...ys) - fs * 2.5;
  if (x2 <= x1 || y2 <= y1) return center;
  let best = center;
  let bestScore = -Infinity;
  const N = 12;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: x1 + ((x2 - x1) * i) / N, y: y1 + ((y2 - y1) * j) / N };
      if (!pointInPolygon(p, poly)) continue;
      // Подпись занимает примерно 6×4.5 высоты шрифта вокруг точки
      let clear = fs * 6;
      for (const r of rects) {
        clear = Math.min(clear, Math.max(r.x1 - (p.x + fs * 3), p.x - fs * 3 - r.x2, r.y1 - (p.y + fs * 2), p.y - fs * 2.5 - r.y2));
      }
      const score = clear - Math.hypot(p.x - center.x, p.y - center.y) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

function RoomTag({ x, y, n, name, area, fs, sw }: { x: number; y: number; n: number; name: string; area: number; fs: number; sw: number }) {
  const r = fs * 0.9;
  return (
    <g opacity={0.92}>
      <circle cx={x} cy={y - fs * 1.4} r={r} fill="#fff" stroke={INK} strokeWidth={sw} />
      <text x={x} y={y - fs * 1.4 + fs * 0.4} textAnchor="middle" fontSize={fs * 1.1} fill={INK}>{String(n).padStart(2, '0')}</text>
      <text x={x} y={y + fs * 0.4} textAnchor="middle" fontSize={fs} fill={INK} stroke="#fff" strokeWidth={fs * 0.25} paintOrder="stroke">{name}</text>
      <text x={x} y={y + fs * 1.7} textAnchor="middle" fontSize={fs} fill={INK} stroke="#fff" strokeWidth={fs * 0.25} paintOrder="stroke">
        {area.toFixed(2).replace('.', ',')} м²
      </text>
    </g>
  );
}

// ---------- Размеры ----------

/** Размерная линия по оси с засечками и подписью над ней. */
function Dim({ x1, y1, x2, y2, fs, sw, label }: { x1: number; y1: number; x2: number; y2: number; fs: number; sw: number; label?: string }) {
  const horizontal = Math.abs(y1 - y2) < 1;
  const len = Math.abs(horizontal ? x2 - x1 : y2 - y1);
  const t = fs * 0.22;
  const text = label ?? fmt(len);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g stroke={DIM} strokeWidth={sw * 0.8}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {[[x1, y1], [x2, y2]].map(([x, y], i) => (
        <line key={i} x1={x! - t} y1={y! + t} x2={x! + t} y2={y! - t} strokeWidth={sw * 1.4} />
      ))}
      <text
        x={horizontal ? mx : mx - fs * 0.3}
        y={horizontal ? my - fs * 0.3 : my}
        textAnchor="middle"
        fontSize={fs * 0.8}
        fill={DIM}
        stroke="#fff"
        strokeWidth={fs * 0.2}
        paintOrder="stroke"
        transform={horizontal ? undefined : `rotate(-90 ${mx - fs * 0.3} ${my})`}
      >
        {text}
      </text>
    </g>
  );
}

const MIN_GAP_MM = 120;
const NO_SIZE: DesignItem['kind'][] = ['rug', 'plant', 'floor_lamp', 'artwork', 'mirror', 'sink', 'stove'];

/**
 * Привязки к стенам (от края предмета до чистовой стены по осям) и габарит предмета.
 * Габарит рисуется со стороны, где больше свободного места, чтобы не лезть в стену.
 */
function ItemDimensions({ p, fs, sw }: { p: PlacedItem; fs: number; sw: number }) {
  const { rect: r, gaps } = p;
  const cx = (r.x1 + r.x2) / 2;
  const cy = (r.y1 + r.y2) / 2;
  const out: ReactNode[] = [];
  // Одна привязка по каждой оси — до ближайшей стены. Предмет вплотную к стене по этой оси уже привязан.
  const near = (a?: number, b?: number): 'a' | 'b' | undefined => {
    if ((a !== undefined && a <= MIN_GAP_MM) || (b !== undefined && b <= MIN_GAP_MM)) return undefined;
    if (a === undefined) return b === undefined ? undefined : 'b';
    return b === undefined || a <= b ? 'a' : 'b';
  };
  const hx = near(gaps.left, gaps.right);
  const vy = near(gaps.top, gaps.bottom);
  if (hx === 'a') out.push(<Dim key="l" x1={r.x1 - gaps.left!} y1={cy} x2={r.x1} y2={cy} fs={fs} sw={sw} />);
  if (hx === 'b') out.push(<Dim key="r" x1={r.x2} y1={cy} x2={r.x2 + gaps.right!} y2={cy} fs={fs} sw={sw} />);
  if (vy === 'a') out.push(<Dim key="t" x1={cx} y1={r.y1 - gaps.top!} x2={cx} y2={r.y1} fs={fs} sw={sw} />);
  if (vy === 'b') out.push(<Dim key="b" x1={cx} y1={r.y2} x2={cx} y2={r.y2 + gaps.bottom!} fs={fs} sw={sw} />);

  if (!NO_SIZE.includes(p.item.kind) && p.item.mount === 'floor') {
    const off = fs * 0.9;
    const w = r.x2 - r.x1;
    const h = r.y2 - r.y1;
    // Ширина — снаружи по той стороне, где дальше до стены
    if (w >= 300) {
      const below = (gaps.bottom ?? 0) > (gaps.top ?? 0);
      const y = below ? r.y2 + off : r.y1 - off;
      out.push(<Dim key="w" x1={r.x1} y1={y} x2={r.x2} y2={y} fs={fs} sw={sw} />);
    }
    if (h >= 300) {
      const right = (gaps.right ?? 0) > (gaps.left ?? 0);
      const x = right ? r.x2 + off : r.x1 - off;
      out.push(<Dim key="h" x1={x} y1={r.y1} x2={x} y2={r.y2} fs={fs} sw={sw} />);
    }
  }
  return <g>{out}</g>;
}

// ---------- Условные обозначения мебели (вид сверху) ----------

function ItemSymbol({ p, sw }: { p: PlacedItem; sw: number }) {
  const it = p.item;
  const cx = (p.rect.x1 + p.rect.x2) / 2;
  const cy = (p.rect.y1 + p.rect.y2) / 2;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${it.rotationDeg})`} stroke={INK} strokeWidth={sw} fill={FILL} strokeLinejoin="round">
      <title>{`${p.n}. ${it.label} — ${fmt(it.widthMm)}×${fmt(it.depthMm)} мм`}</title>
      <Symbol it={it} sw={sw} />
    </g>
  );
}

/** Локальные координаты: ширина по X, глубина по Y, спинка (сторона у стены) — сверху, при y = −D/2. */
function Symbol({ it, sw }: { it: DesignItem; sw: number }) {
  const W = it.widthMm;
  const D = it.depthMm;
  const x0 = -W / 2;
  const y0 = -D / 2;
  const box = (rx = 0) => <rect x={x0} y={y0} width={W} height={D} rx={rx} />;
  switch (it.kind) {
    case 'sofa':
    case 'armchairs': {
      const arm = Math.min(200, W * 0.14);
      const back = Math.min(250, D * 0.28);
      const seats = Math.max(1, Math.round((W - arm * 2) / 750));
      const sw2 = (W - arm * 2) / seats;
      return (
        <>
          {box(50)}
          <rect x={x0} y={y0} width={W} height={back} rx={40} />
          <rect x={x0} y={y0} width={arm} height={D} rx={40} />
          <rect x={-x0 - arm} y={y0} width={arm} height={D} rx={40} />
          {Array.from({ length: seats }, (_, i) => (
            <rect key={i} x={x0 + arm + i * sw2 + 15} y={y0 + back + 15} width={sw2 - 30} height={D - back - 40} rx={40} fill="#fafafa" />
          ))}
        </>
      );
    }
    case 'bed': {
      const head = 80;
      const pillows = W >= 1200 ? 2 : 1;
      const pw = (W - 80 * (pillows + 1)) / pillows;
      const fold = y0 + D * 0.33;
      return (
        <>
          {box(30)}
          <rect x={x0} y={y0} width={W} height={head} fill="#e2e2e2" />
          {Array.from({ length: pillows }, (_, i) => (
            <rect key={i} x={x0 + 80 + i * (pw + 80)} y={y0 + head + 60} width={pw} height={Math.min(380, D * 0.18)} rx={70} fill="#fff" />
          ))}
          <path d={`M ${x0} ${fold} L ${-x0} ${fold}`} fill="none" />
          <path d={`M ${-x0 - W * 0.35} ${fold} L ${-x0} ${fold + W * 0.2} L ${-x0} ${fold} Z`} fill="#e8e8e8" />
        </>
      );
    }
    case 'chairs': {
      const alongX = W >= D;
      const len = alongX ? W : D;
      const n = Math.max(1, Math.round(len / 550));
      return (
        <>
          {Array.from({ length: n }, (_, i) => {
            const t = -len / 2 + (len * (i + 0.5)) / n;
            const cx = alongX ? t : 0;
            const cy = alongX ? 0 : t;
            return (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                <rect x={-210} y={-210} width={420} height={420} rx={80} />
                <line x1={-190} y1={-170} x2={190} y2={-170} strokeWidth={sw * 2.5} />
              </g>
            );
          })}
        </>
      );
    }
    case 'dining_table':
    case 'coffee_table':
      return Math.abs(W - D) < 60 && W <= 1200 ? <circle r={W / 2} /> : box(40);
    case 'desk':
      return (
        <>
          {box(20)}
          <rect x={-W * 0.2} y={y0 + D * 0.15} width={W * 0.4} height={D * 0.12} fill="#e2e2e2" />
        </>
      );
    case 'wardrobe':
    case 'shoe_rack':
      // Как в легенде дизайнера: «шкаф до потолка» — прямоугольник с пунктирными диагоналями
      return (
        <>
          {box()}
          <path d={`M ${x0} ${y0} L ${-x0} ${-y0} M ${-x0} ${y0} L ${x0} ${-y0}`} fill="none" strokeDasharray={`${sw * 6} ${sw * 4}`} />
        </>
      );
    case 'dresser':
    case 'nightstands':
      return (
        <>
          {box(15)}
          <line x1={x0} y1={-y0 - 40} x2={-x0} y2={-y0 - 40} />
          {it.kind === 'nightstands' && W < 800 && <circle r={Math.min(W, D) * 0.22} fill="#fff" />}
        </>
      );
    case 'tv_zone':
      return (
        <>
          {box()}
          <rect x={-W * 0.38} y={y0 - 30} width={W * 0.76} height={50} fill={INK} />
        </>
      );
    case 'shelving': {
      const n = Math.max(1, Math.round(W / 400));
      return (
        <>
          {box()}
          {Array.from({ length: n - 1 }, (_, i) => (
            <line key={i} x1={x0 + ((i + 1) * W) / n} y1={y0} x2={x0 + ((i + 1) * W) / n} y2={-y0} />
          ))}
        </>
      );
    }
    case 'kitchen_set': {
      const n = Math.max(1, Math.round(W / 600));
      return (
        <>
          {box()}
          <line x1={x0} y1={-y0 - 40} x2={-x0} y2={-y0 - 40} />
          {Array.from({ length: n - 1 }, (_, i) => (
            <line key={i} x1={x0 + ((i + 1) * W) / n} y1={y0} x2={x0 + ((i + 1) * W) / n} y2={-y0} strokeDasharray={`${sw * 4} ${sw * 3}`} />
          ))}
        </>
      );
    }
    case 'stove': {
      const r = Math.min(W, D) * 0.17;
      return (
        <>
          {box()}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => (
            <g key={i}>
              <circle cx={(a! * W) / 4} cy={(b! * D) / 4} r={r} fill="#fff" />
              <circle cx={(a! * W) / 4} cy={(b! * D) / 4} r={r * 0.45} fill="none" />
            </g>
          ))}
        </>
      );
    }
    case 'fridge':
      return (
        <>
          {box()}
          <rect x={x0 + 40} y={y0 + 40} width={W - 80} height={D - 80} fill="none" />
          <text y={D * 0.12} textAnchor="middle" fontSize={Math.min(W, D) * 0.32} fill={INK} stroke="none">Х</text>
        </>
      );
    case 'sink':
    case 'vanity':
      return (
        <>
          {box(20)}
          <rect x={-W * 0.32} y={y0 + D * 0.22} width={W * 0.64} height={D * 0.6} rx={Math.min(W, D) * 0.18} fill="#fff" />
          <circle cx={0} cy={y0 + D * 0.12} r={Math.min(W, D) * 0.05} fill={INK} />
        </>
      );
    case 'toilet':
      return (
        <>
          <rect x={x0 + W * 0.05} y={y0} width={W * 0.9} height={D * 0.25} rx={30} />
          <ellipse cx={0} cy={y0 + D * 0.25 + D * 0.37} rx={W * 0.42} ry={D * 0.37} fill="#fff" />
        </>
      );
    case 'bathtub':
      return (
        <>
          {box(40)}
          <rect x={x0 + 70} y={y0 + 70} width={W - 140} height={D - 140} rx={Math.min(W, D) * 0.3} fill="#fff" />
          <circle cx={W > D ? x0 + 220 : 0} cy={W > D ? 0 : y0 + 220} r={35} fill="none" />
        </>
      );
    case 'shower':
      return (
        <>
          {box()}
          <path d={`M ${x0} ${y0} L ${-x0} ${-y0} M ${-x0} ${y0} L ${x0} ${-y0}`} fill="none" />
          <circle r={45} fill="#fff" />
        </>
      );
    case 'washer':
      return (
        <>
          {box(20)}
          <circle cy={D * 0.05} r={Math.min(W, D) * 0.32} fill="#fff" />
        </>
      );
    case 'mirror':
    case 'artwork':
      return <rect x={x0} y={y0} width={W} height={Math.max(D, 40)} fill={INK} stroke="none" />;
    case 'plant':
      return (
        <>
          <circle r={Math.min(W, D) / 2} fill="#eef3ec" />
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx={0} cy={-Math.min(W, D) * 0.22} rx={Math.min(W, D) * 0.1} ry={Math.min(W, D) * 0.2} transform={`rotate(${a})`} fill="none" />
          ))}
        </>
      );
    case 'floor_lamp':
      return (
        <>
          <circle r={Math.min(W, D) / 2} fill="#fff" />
          <path d={`M ${-W / 3} 0 L ${W / 3} 0 M 0 ${-D / 3} L 0 ${D / 3}`} fill="none" />
        </>
      );
    case 'rug':
      return <rect x={x0} y={y0} width={W} height={D} rx={30} fill="none" stroke="#b0b0b0" strokeDasharray={`${sw * 3} ${sw * 3}`} />;
    default:
      return box(15);
  }
}
