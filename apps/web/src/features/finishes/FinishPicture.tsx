import type { ReactNode } from 'react';

/**
 * Схематичные иллюстрации вариантов отделки (SVG, 120×80).
 * Это не фото материалов: реальные фото появятся вместе с каталогом поставщиков.
 * Ключ — `${раздел}:${значение}`, например `ceiling:stretch`.
 */
const LINE = '#595959';
const WALL = '#f0ece4';
const LIGHT = '#fadb14';

const Room = ({ children, ceiling = true }: { children?: ReactNode; ceiling?: boolean }) => (
  <>
    <rect x={0} y={0} width={120} height={80} fill="#fafafa" />
    <rect x={14} y={10} width={92} height={62} fill={WALL} />
    <path d="M14 72 V10 M106 72 V10 M14 72 H106" stroke={LINE} strokeWidth={2} fill="none" />
    {ceiling && <line x1={14} y1={10} x2={106} y2={10} stroke={LINE} strokeWidth={2} />}
    {children}
  </>
);

const planks = (w: number, h: number, color: string, seam: string) => {
  const rows: ReactNode[] = [];
  for (let y = 0, r = 0; y < 80; y += h, r++) {
    for (let x = r % 2 ? -w / 2 : 0; x < 120; x += w) {
      rows.push(<rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={color} stroke={seam} strokeWidth={1} />);
    }
  }
  return rows;
};

const grid = (step: number, fill: string, seam: string) => {
  const cells: ReactNode[] = [];
  for (let y = 0; y < 80; y += step) {
    for (let x = 0; x < 120; x += step) {
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={step} height={step} fill={fill} stroke={seam} strokeWidth={1.5} />);
    }
  }
  return cells;
};

const spots = (cols: number[], rows: number[]) =>
  cols.flatMap((x) => rows.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={3.5} fill={LIGHT} stroke={LINE} strokeWidth={1} />));

const Chandelier = ({ x = 60, y = 40, r = 13 }: { x?: number; y?: number; r?: number }) => (
  <g stroke={LINE} strokeWidth={1.5}>
    {[0, 60, 120, 180, 240, 300].map((a) => {
      const rad = (a * Math.PI) / 180;
      return <line key={a} x1={x} y1={y} x2={x + Math.cos(rad) * r} y2={y + Math.sin(rad) * r} />;
    })}
    {[0, 60, 120, 180, 240, 300].map((a) => {
      const rad = (a * Math.PI) / 180;
      return <circle key={`b${a}`} cx={x + Math.cos(rad) * r} cy={y + Math.sin(rad) * r} r={3.5} fill={LIGHT} />;
    })}
    <circle cx={x} cy={y} r={4} fill="#fff" />
  </g>
);

/** Вид сверху на комнату — для схем освещения. */
const TopRoom = ({ children }: { children: ReactNode }) => (
  <>
    <rect x={0} y={0} width={120} height={80} fill="#fafafa" />
    <rect x={16} y={8} width={88} height={64} fill="#fff" stroke={LINE} strokeWidth={3} />
    {children}
  </>
);

const Door = ({ classic }: { classic: boolean }) => (
  <>
    <rect x={0} y={0} width={120} height={80} fill={WALL} />
    <line x1={0} y1={76} x2={120} y2={76} stroke={LINE} strokeWidth={2} />
    {classic ? (
      <>
        <rect x={38} y={8} width={44} height={68} fill="#e9dcc6" stroke={LINE} strokeWidth={1.5} />
        <rect x={44} y={14} width={32} height={62} fill="#c9a77c" stroke={LINE} strokeWidth={1.5} />
        <rect x={49} y={20} width={22} height={20} fill="none" stroke={LINE} strokeWidth={1.2} />
        <rect x={49} y={46} width={22} height={24} fill="none" stroke={LINE} strokeWidth={1.2} />
        <circle cx={72} cy={46} r={2} fill={LINE} />
      </>
    ) : (
      <>
        <rect x={44} y={12} width={32} height={64} fill={WALL} stroke="#8c8c8c" strokeWidth={1} />
        <line x1={72} y1={42} x2={72} y2={50} stroke={LINE} strokeWidth={2} />
      </>
    )}
  </>
);

const Window = ({ curtain }: { curtain: string }) => (
  <>
    <rect x={0} y={0} width={120} height={80} fill={WALL} />
    <rect x={34} y={14} width={52} height={54} fill="#cfe6f7" stroke={LINE} strokeWidth={2} />
    <line x1={60} y1={14} x2={60} y2={68} stroke={LINE} strokeWidth={1.5} />
    <line x1={20} y1={8} x2={100} y2={8} stroke={LINE} strokeWidth={2} />
    <path d="M42 9 Q48 40 44 76 L60 76 Q56 40 60 9 Z" fill="#fff" opacity={0.75} />
    <path d="M22 9 Q30 40 22 76 L42 76 Q36 40 40 9 Z" fill={curtain} stroke={LINE} strokeWidth={0.8} />
    <path d="M98 9 Q90 40 98 76 L78 76 Q84 40 80 9 Z" fill={curtain} stroke={LINE} strokeWidth={0.8} />
  </>
);

const PICTURES: Record<string, () => ReactNode> = {
  // ---- потолок: разрез комнаты
  'ceiling:stretch': () => (
    <Room ceiling={false}>
      <line x1={14} y1={16} x2={106} y2={16} stroke="#1677ff" strokeWidth={3} />
      <line x1={14} y1={10} x2={106} y2={10} stroke={LINE} strokeWidth={1} strokeDasharray="3 3" />
    </Room>
  ),
  'ceiling:combined': () => (
    <Room ceiling={false}>
      <path d="M14 10 V24 H34 V16 H86 V24 H106 V10" fill="#fff" stroke={LINE} strokeWidth={2} />
      <line x1={34} y1={16} x2={86} y2={16} stroke="#1677ff" strokeWidth={3} />
      <line x1={34} y1={25} x2={14} y2={25} stroke={LIGHT} strokeWidth={3} />
      <line x1={86} y1={25} x2={106} y2={25} stroke={LIGHT} strokeWidth={3} />
    </Room>
  ),
  'ceiling:drywall': () => (
    <Room ceiling={false}>
      <path d="M14 10 V22 H40 V16 H80 V22 H106 V10 Z" fill="#fff" stroke={LINE} strokeWidth={2} />
    </Room>
  ),
  // ---- фактура натяжного
  'stretchFinish:gloss': () => (
    <>
      <rect width={120} height={80} fill="#dfe7ef" />
      <path d="M10 70 L50 0 H70 L30 80 H10 Z" fill="#fff" opacity={0.9} />
      <path d="M60 80 L100 0 H108 L68 80 Z" fill="#fff" opacity={0.7} />
    </>
  ),
  'stretchFinish:satin': () => (
    <>
      <rect width={120} height={80} fill="#e4e6ea" />
      <path d="M20 80 L60 0 H90 L50 80 Z" fill="#fff" opacity={0.35} />
    </>
  ),
  'stretchFinish:matte': () => <rect width={120} height={80} fill="#ebebeb" />,
  // ---- примыкание к стене (крупно угол)
  'stretchJoint:straight': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <rect x={70} y={0} width={50} height={80} fill={WALL} />
      <line x1={0} y1={30} x2={70} y2={30} stroke="#1677ff" strokeWidth={4} />
      <rect x={62} y={26} width={8} height={10} fill="#fff" stroke={LINE} strokeWidth={1.5} />
    </>
  ),
  'stretchJoint:shadow': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <rect x={70} y={0} width={50} height={80} fill={WALL} />
      <line x1={0} y1={30} x2={62} y2={30} stroke="#1677ff" strokeWidth={4} />
      <rect x={62} y={24} width={8} height={12} fill="#262626" />
    </>
  ),
  'drywallShape:flat': () => (
    <Room ceiling={false}>
      <rect x={14} y={10} width={92} height={8} fill="#fff" stroke={LINE} strokeWidth={2} />
    </Room>
  ),
  'drywallShape:complex': () => (
    <Room ceiling={false}>
      <path d="M14 10 V26 H30 V20 H44 Q60 12 76 20 H90 V26 H106 V10 Z" fill="#fff" stroke={LINE} strokeWidth={2} />
    </Room>
  ),
  // ---- освещение: вид сверху
  'mainLight:chandelier': () => (
    <TopRoom>
      <Chandelier />
    </TopRoom>
  ),
  'mainLight:chandelier_spots': () => (
    <TopRoom>
      <Chandelier r={10} />
      {spots([28, 92], [20, 40, 60])}
    </TopRoom>
  ),
  'mainLight:spots': () => <TopRoom>{spots([34, 60, 86], [22, 40, 58])}</TopRoom>,
  // ---- стены
  'walls:wallpaper': () => (
    <>
      <rect width={120} height={80} fill="#efe6d8" />
      {Array.from({ length: 6 }, (_, i) =>
        Array.from({ length: 4 }, (_, j) => (
          <path key={`${i}-${j}`} d={`M${i * 22 + (j % 2) * 11 + 6} ${j * 22 + 4} l6 8 l-6 8 l-6 -8 z`} fill="#c8b48f" />
        )),
      )}
    </>
  ),
  'walls:paint': () => (
    <>
      <rect width={120} height={80} fill="#cfd8d3" />
      <path d="M0 60 Q30 54 60 60 T120 60 V80 H0 Z" fill="#bccac2" />
    </>
  ),
  'walls:panels': () => (
    <>
      <rect width={120} height={80} fill="#d9c3a0" />
      {[15, 30, 45, 60, 75, 90, 105].map((x) => (
        <line key={x} x1={x} y1={0} x2={x} y2={80} stroke="#a88c62" strokeWidth={2} />
      ))}
    </>
  ),
  'walls:tile': () => <>{grid(20, '#e8eef2', '#b8c4cc')}</>,
  // ---- панели
  'panel:bamboo': () => (
    <>
      <rect width={120} height={80} fill="#d8c27a" />
      {[12, 28, 44, 60, 76, 92, 108].map((x, i) => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={80} stroke="#a8914a" strokeWidth={2} />
          <line x1={x - 8} y1={20 + (i % 3) * 12} x2={x + 8} y2={20 + (i % 3) * 12} stroke="#a8914a" strokeWidth={1.5} />
        </g>
      ))}
    </>
  ),
  'panel:chipboard': () => (
    <>
      <rect width={120} height={80} fill="#c9ab82" />
      {Array.from({ length: 70 }, (_, i) => (
        <circle key={i} cx={(i * 37) % 120} cy={(i * 53) % 80} r={1.4} fill="#9c7d55" />
      ))}
    </>
  ),
  'panel:mdf_painted': () => (
    <>
      <rect width={120} height={80} fill="#e2e6e9" />
      <rect x={10} y={10} width={44} height={60} fill="none" stroke="#b8bfc6" strokeWidth={2} />
      <rect x={66} y={10} width={44} height={60} fill="none" stroke="#b8bfc6" strokeWidth={2} />
    </>
  ),
  // ---- рамки на стенах (классика)
  'moldings:yes': () => (
    <>
      <rect width={120} height={80} fill="#efe9df" />
      <rect x={10} y={10} width={44} height={36} fill="none" stroke="#bfae8f" strokeWidth={3} />
      <rect x={66} y={10} width={44} height={36} fill="none" stroke="#bfae8f" strokeWidth={3} />
      <rect x={10} y={54} width={100} height={18} fill="none" stroke="#bfae8f" strokeWidth={3} />
    </>
  ),
  'moldings:no': () => <rect width={120} height={80} fill="#efe9df" />,
  // ---- пол: вид сверху
  'floor:tile': () => <>{grid(26, '#e3dfd8', '#b5ada0')}</>,
  'floor:laminate': () => <>{planks(60, 13, '#c89a64', '#9b7247')}</>,
  'floor:vinyl': () => <>{planks(44, 10, '#b9a993', '#8f806b')}</>,
  'floor:self_leveling': () => (
    <>
      <rect width={120} height={80} fill="#cfd2d4" />
      <path d="M0 80 L40 0 H60 L20 80 Z" fill="#fff" opacity={0.45} />
    </>
  ),
  // ---- двери
  'door:hidden': () => <Door classic={false} />,
  'door:classic': () => <Door classic />,
  // ---- сантехника
  'plumbing:sink': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <rect x={30} y={34} width={60} height={14} rx={6} fill="#fff" stroke={LINE} strokeWidth={2} />
      <path d="M58 34 V22 H70" fill="none" stroke={LINE} strokeWidth={3} />
      <rect x={52} y={48} width={16} height={22} fill="#e8e8e8" stroke={LINE} strokeWidth={1.5} />
    </>
  ),
  'plumbing:shower': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <path d="M40 74 V14 H70 V22" fill="none" stroke={LINE} strokeWidth={3} />
      <rect x={60} y={22} width={20} height={6} rx={3} fill={LINE} />
      {[62, 67, 72, 77].map((x) => (
        <line key={x} x1={x} y1={32} x2={x - 2} y2={60} stroke="#69b1ff" strokeWidth={1.5} strokeDasharray="4 4" />
      ))}
      <rect x={30} y={70} width={60} height={6} fill="#e8e8e8" stroke={LINE} strokeWidth={1.5} />
    </>
  ),
  'plumbing:bathtub': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <path d="M14 38 H106 V48 Q106 66 86 66 H34 Q14 66 14 48 Z" fill="#fff" stroke={LINE} strokeWidth={2} />
      <path d="M92 38 V22 H82" fill="none" stroke={LINE} strokeWidth={3} />
      <line x1={30} y1={66} x2={26} y2={74} stroke={LINE} strokeWidth={3} />
      <line x1={90} y1={66} x2={94} y2={74} stroke={LINE} strokeWidth={3} />
    </>
  ),
  'plumbing:toilet': () => (
    <>
      <rect width={120} height={80} fill="#fafafa" />
      <rect x={44} y={10} width={30} height={24} rx={3} fill="#fff" stroke={LINE} strokeWidth={2} />
      <path d="M38 36 H82 Q82 58 64 60 V72 H52 V60 Q38 58 38 36 Z" fill="#fff" stroke={LINE} strokeWidth={2} />
    </>
  ),
};

export function hasFinishPicture(key: string) {
  return key in PICTURES;
}

export function FinishPicture({ id, curtainHex }: { id: string; curtainHex?: string }) {
  const draw = curtainHex ? () => <Window curtain={curtainHex} /> : PICTURES[id];
  if (!draw) return null;
  return (
    <svg viewBox="0 0 120 80" width="100%" style={{ display: 'block', borderRadius: 6 }} aria-hidden>
      {draw()}
    </svg>
  );
}
