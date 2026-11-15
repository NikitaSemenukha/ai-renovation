import { useRef, type MouseEvent } from 'react';
import type { EngineeringPoint, Opening, PlanGeometry, Point, Room, Wall } from '@air/domain';
import { ENGINEERING_LABELS, WALL_STATUS_COLORS } from '../../labels';

interface PlanCanvasProps {
  geometry: PlanGeometry;
  engineering?: EngineeringPoint[];
  selectedWallId?: string;
  onWallClick?: (wall: Wall) => void;
  onCanvasClick?: (point: Point) => void;
  onPointClick?: (point: EngineeringPoint) => void;
  /** Показывать размеры стен. */
  showDimensions?: boolean;
  /** Выбор комнаты кликом (шаг «Отделка»). */
  selectedRoomId?: string;
  onRoomClick?: (room: Room) => void;
  /** Заливка комнаты, например «отделка выбрана». */
  roomFill?: (room: Room) => string | undefined;
}

const PAD = 700;
const MIN_STROKE = 90;

/**
 * 2D-отрисовка плана из структурированной геометрии (мм → SVG viewBox).
 * Та же геометрия на следующих этапах пойдёт в 3D (React Three Fiber).
 */
export function PlanCanvas({
  geometry,
  engineering = [],
  selectedWallId,
  onWallClick,
  onCanvasClick,
  onPointClick,
  showDimensions = false,
  selectedRoomId,
  onRoomClick,
  roomFill,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { width, height } = geometry.bounds;

  const handleCanvasClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onCanvasClick || !svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
    onCanvasClick({ x: Math.round(clamp(p.x, width)), y: Math.round(clamp(p.y, height)) });
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${-PAD} ${-PAD} ${width + PAD * 2} ${height + PAD * 2}`}
      style={{ width: '100%', height: 'auto', background: '#fafafa', borderRadius: 8, cursor: onCanvasClick ? 'crosshair' : 'default' }}
      onClick={handleCanvasClick}
      role="img"
      aria-label="План квартиры"
    >
      <rect x={0} y={0} width={width} height={height} fill="#fff" />

      {geometry.rooms.map((r) => {
        const selected = r.id === selectedRoomId;
        const fill = selected ? '#bae0ff' : roomFill?.(r);
        if (!fill && !onRoomClick) return null;
        return (
          <polygon
            key={`fill-${r.id}`}
            points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={fill ?? 'transparent'}
            onClick={(e) => {
              if (!onRoomClick) return;
              e.stopPropagation();
              onRoomClick(r);
            }}
            style={{ cursor: onRoomClick ? 'pointer' : 'inherit' }}
          >
            <title>{r.name}</title>
          </polygon>
        );
      })}

      {geometry.rooms.map((r) => (
        <text key={r.id} x={r.position.x} y={r.position.y} textAnchor="middle" fontSize={260} fill="#595959"
          fontWeight={r.id === selectedRoomId ? 700 : 400} style={{ pointerEvents: 'none' }}>
          {r.name}
        </text>
      ))}

      {geometry.walls.map((w) => {
        const color = WALL_STATUS_COLORS[w.status];
        const selected = w.id === selectedWallId;
        return (
          <g
            key={w.id}
            onClick={(e) => {
              if (!onWallClick) return;
              e.stopPropagation();
              onWallClick(w);
            }}
            style={{ cursor: onWallClick ? 'pointer' : 'inherit' }}
          >
            {selected && (
              <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#1677ff" strokeOpacity={0.35}
                strokeWidth={Math.max(w.thicknessMm, MIN_STROKE) + 260} strokeLinecap="square" />
            )}
            <line
              x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y}
              stroke={color}
              strokeWidth={Math.max(w.thicknessMm, MIN_STROKE)}
              strokeLinecap="square"
              strokeDasharray={w.status === 'unknown' ? '220 140' : undefined}
            />
            {/* Широкая прозрачная зона, чтобы по тонкой стене было легко попасть пальцем */}
            {onWallClick && (
              <line x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="transparent" strokeWidth={500} />
            )}
          </g>
        );
      })}

      {(geometry.openings ?? []).map((o) => (
        <OpeningMark key={o.id} opening={o} geometry={geometry} />
      ))}

      {showDimensions && <Dimensions width={width} height={height} />}

      {engineering.map((p) => {
        const meta = ENGINEERING_LABELS[p.type];
        return (
          <g
            key={p.id}
            transform={`translate(${p.position.x} ${p.position.y})`}
            onClick={(e) => {
              if (!onPointClick) return;
              e.stopPropagation();
              onPointClick(p);
            }}
            style={{ cursor: onPointClick ? 'pointer' : 'inherit' }}
          >
            <circle r={230} fill={meta.color} stroke="#fff" strokeWidth={40} />
            <text y={85} textAnchor="middle" fontSize={240} fontWeight={700} fill="#fff">{meta.short}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Окно — двойная голубая линия в стене; дверь — проём с дугой открывания. */
function OpeningMark({ opening, geometry }: { opening: Opening; geometry: PlanGeometry }) {
  const wall = geometry.walls.find((w) => w.id === opening.wallId);
  if (!wall) return null;
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  const s = { x: wall.a.x + ux * opening.offsetMm, y: wall.a.y + uy * opening.offsetMm };
  const e = { x: s.x + ux * opening.widthMm, y: s.y + uy * opening.widthMm };
  const t = Math.max(wall.thicknessMm, MIN_STROKE) + 10;

  if (opening.kind === 'window') {
    const nx = -uy * (t / 4);
    const ny = ux * (t / 4);
    return (
      <g style={{ pointerEvents: 'none' }}>
        <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#fff" strokeWidth={t} />
        <line x1={s.x + nx} y1={s.y + ny} x2={e.x + nx} y2={e.y + ny} stroke="#1677ff" strokeWidth={30} />
        <line x1={s.x - nx} y1={s.y - ny} x2={e.x - nx} y2={e.y - ny} stroke="#1677ff" strokeWidth={30} />
      </g>
    );
  }
  // Дверь открывается внутрь помещения по нормали стены
  const w = opening.widthMm;
  const leaf = { x: s.x - uy * w, y: s.y + ux * w };
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#fff" strokeWidth={t} />
      <line x1={s.x} y1={s.y} x2={leaf.x} y2={leaf.y} stroke="#8c8c8c" strokeWidth={30} />
      <path d={`M ${leaf.x} ${leaf.y} A ${w} ${w} 0 0 ${0} ${e.x} ${e.y}`} fill="none" stroke="#bfbfbf" strokeWidth={20} strokeDasharray="60 40" />
    </g>
  );
}

function Dimensions({ width, height }: { width: number; height: number }) {
  const fmt = (mm: number) => `${(mm / 1000).toFixed(2)} м`;
  return (
    <g fill="#1677ff" fontSize={220}>
      <line x1={0} y1={-450} x2={width} y2={-450} stroke="#1677ff" strokeWidth={20} />
      <text x={width / 2} y={-520} textAnchor="middle">{fmt(width)}</text>
      <line x1={-450} y1={0} x2={-450} y2={height} stroke="#1677ff" strokeWidth={20} />
      <text x={-520} y={height / 2} textAnchor="middle" transform={`rotate(-90 ${-520} ${height / 2})`}>{fmt(height)}</text>
    </g>
  );
}
