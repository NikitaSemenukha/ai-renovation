import { useRef, type MouseEvent } from 'react';
import type { EngineeringPoint, PlanGeometry, Point, Wall } from '@air/domain';
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

      {geometry.rooms.map((r) => (
        <text key={r.id} x={r.position.x} y={r.position.y} textAnchor="middle" fontSize={260} fill="#595959">
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
