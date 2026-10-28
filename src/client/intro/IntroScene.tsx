import { memo, type RefObject } from 'react';
import {
  AMBIENT_CAR,
  ARCH_D,
  type Block,
  type Box,
  boxFaces,
  buildingCells,
  CAMERA_ORIGIN,
  ENTRANCE_ARCH_D,
  faceMatrix,
  FAR_BLOCKS,
  FAR_CARS,
  FAR_TREES,
  type Figure,
  GARDEN_PEOPLE,
  GARDEN_TREES,
  GATE,
  GATE_TREE,
  ISO,
  LANES,
  NEAR_BLOCKS,
  NEAR_CARS,
  type P3,
  type ParkedCar,
  PLAZA_PEOPLE,
  type Pose,
  project,
  projectRel,
  pts,
  relPts,
  RIGHT_BLOCKS,
  shadowHull,
  SIDE_DOOR,
  STREET_LABELS,
  STREET_PEOPLE,
  STREET_TREES,
  TERRACE,
  TERRACE_Z,
  type TreeSpot,
  U,
  VIEW,
  WALL_H,
  WALL_T,
} from './iso';

/* Палитра сцены — постер в светлых тонах референса, одинаковый в обеих темах. */
const INK = '#2b49b8';
const WHITE = { top: '#f7f6f3', left: '#e8e6e1', right: '#d9d6d0', line: '#c4c1ba' };
const PLAZA = { top: '#f1f0ec', left: '#e3e1dc', right: '#d4d1cb' };
const BLUE = { top: '#2d57d9', left: '#2449c8', right: '#1b3aa9', line: '#17339a' };
const SHADOW = 'rgba(44, 48, 64, 0.14)';
const FIGURE = '#3453b6';
const TREE = { dark: '#4a63b0', mid: '#5570bc', light: '#8ea0d6' };
const CAR = { top: '#4a68cf', left: '#3453b8', right: '#2a449e', line: '#1b2f7a', glass: '#b9c6ee', glassDark: '#6f84c9', wheel: '#0f1d4d', rim: '#8a95ad', lamp: '#fff3c4' };

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/**
 * Матрица для рисования в плоскости вертикальной грани относительно точки фигуры (единицы мира, v вверх).
 * 'left' — плоскость y = const, u вдоль +x; 'right' — плоскость x = const, u вдоль −y.
 */
function planeMatrix(side: 'left' | 'right', origin: P3): string {
  const [e, f] = projectRel(...origin);
  return `matrix(${f1(ISO.c * U)} ${f1((side === 'left' ? ISO.s : -ISO.s) * U)} 0 ${-U} ${f1(e)} ${f1(f)})`;
}

/** Тень на плоскости основания: от источника света, только вперёд от объекта. */
function Shadow({ box, h }: { box: Box; h?: number }) {
  return <polygon points={pts(shadowHull(box, h))} fill={SHADOW} />;
}

function Court({ box, court }: { box: Box; court: NonNullable<Block['court']> }) {
  const zt = box.z1;
  const zf = box.z1 - 0.5;
  const { x0, y0, x1, y1 } = court;
  const floor = pts([
    [x0, y0, zf],
    [x1, y0, zf],
    [x1, y1, zf],
    [x0, y1, zf],
  ]);
  return (
    <g>
      <polygon points={floor} fill="#ebe9e4" />
      <polygon points={floor} fill="url(#intro-hatch)" />
      <polygon
        points={pts([
          [x0, y0, zf],
          [x0, y1, zf],
          [x0, y1, zt],
          [x0, y0, zt],
        ])}
        fill="#d2cfc8"
      />
      <polygon
        points={pts([
          [x0, y0, zf],
          [x1, y0, zf],
          [x1, y0, zt],
          [x0, y0, zt],
        ])}
        fill="#e1dfd9"
      />
      <polygon
        points={pts([
          [x0, y0, zt],
          [x1, y0, zt],
          [x1, y1, zt],
          [x0, y1, zt],
        ])}
        fill="none"
        stroke={WHITE.line}
        strokeWidth={0.7}
      />
    </g>
  );
}

function WhiteBox({ box, roof, palette = WHITE }: { box: Box; roof?: Block['roof']; palette?: typeof WHITE }) {
  const f = boxFaces(box);
  return (
    <g>
      <polygon points={f.left} fill={palette.left} />
      <polygon points={f.right} fill={palette.right} />
      <polygon points={f.top} fill={palette.top} />
      {roof === 'hatch' && <polygon points={f.top} fill="url(#intro-hatch)" />}
      {roof === 'dots' && <polygon points={f.top} fill="url(#intro-dots)" />}
      <polygon points={f.top} fill="none" stroke={WHITE.line} strokeWidth={0.7} strokeLinejoin="round" />
      <polygon points={f.left} fill="none" stroke={WHITE.line} strokeWidth={0.7} strokeLinejoin="round" />
      <polygon points={f.right} fill="none" stroke={WHITE.line} strokeWidth={0.7} strokeLinejoin="round" />
    </g>
  );
}

function BlockShape({ b }: { b: Block }) {
  return (
    <g>
      <Shadow box={b.box} />
      <WhiteBox box={b.box} roof={b.roof} palette={b.roof === 'dots' ? { ...WHITE, top: PLAZA.top } : WHITE} />
      {b.court && <Court box={b.box} court={b.court} />}
    </g>
  );
}

/** Крона из пятен разной плотности, ствол с ветками — как штриховой силуэт на схеме. */
const CANOPY: readonly (readonly [number, number, number, number])[] = [
  [0, -21, 7, 0.82],
  [-6.5, -17, 4.8, 0.78],
  [6.8, -18, 5.2, 0.78],
  [-3.2, -26.5, 4.6, 0.84],
  [4.2, -26, 4.2, 0.84],
  [0.4, -30.5, 3.3, 0.9],
  [-8.6, -22, 3, 0.68],
  [8.8, -23, 2.8, 0.68],
  [-2.4, -13.5, 3.1, 0.72],
  [3.4, -13, 2.7, 0.72],
  [-5.5, -28, 2.2, 0.6],
  [7.2, -28.5, 2, 0.6],
];
const CANOPY_LIGHTS: readonly (readonly [number, number, number])[] = [
  [-2, -23, 1.5],
  [4.4, -20, 1.2],
  [-5.4, -19, 1],
  [1.2, -28, 1.1],
  [6.4, -25, 0.9],
  [-1, -16, 0.9],
  [7.5, -15.5, 0.8],
];

function Tree({ spot, scale = 1 }: { spot: TreeSpot; scale?: number }) {
  const [px, py] = project(spot[0], spot[1], spot[2] ?? 0);
  return (
    <g transform={`translate(${f1(px)} ${f1(py)}) scale(${scale})`}>
      <ellipse cx={3} cy={1.5} rx={9} ry={3} fill={SHADOW} />
      <path d="M0 0.5V-14M0-9.5L-4.6-15.5M0-11L4-17M0-12.5L-1.6-19M0-13L2-18.5" stroke={TREE.dark} strokeWidth={1.5} strokeLinecap="round" fill="none" />
      {CANOPY.map(([x, y, r, o], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={TREE.mid} opacity={o} />
      ))}
      {CANOPY_LIGHTS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={TREE.light} opacity={0.85} />
      ))}
    </g>
  );
}

/**
 * Силуэт человека ростом ≈24 px: голова, шея, торс с плечами, руки и ноги штрихами.
 * У идущего (`walker`) кадры шага переключает CSS (`.is-walking`), у статичного рисуется одна поза.
 */
function Person({ child = false, pose = 's', walker = false, className }: { child?: boolean; pose?: Pose; walker?: boolean; className?: string }) {
  const show = (p: Pose) => walker || p === pose;
  return (
    <g className={className} fill={FIGURE} color={FIGURE} transform={child ? 'scale(0.6)' : undefined}>
      <ellipse cx={1.5} cy={0.8} rx={4.5} ry={1.5} fill={SHADOW} />
      <g className="intro-walker-body">
        <circle cy={-21.2} r={2.5} />
        <path d="M-1.1-19.3H1.1V-17.5H-1.1Z" />
        <path d="M-3.4-17.6H3.4L2.5-8.6H-2.5Z" />
        {show('s') && <path className="intro-arm intro-arm-s" d="M-3-16.4L-4.1-9.6M3-16.4L4.1-9.6" />}
        {show('a') && <path className="intro-arm intro-arm-a" d="M-3-16.4L-5.8-11.4M3-16.4L4.8-10" />}
        {show('b') && <path className="intro-arm intro-arm-b" d="M-3-16.4L-2.2-9.8M3-16.4L6-12.2" />}
        {show('s') && <path className="intro-leg intro-leg-s" d="M-1.4-8.8V-0.3M1.4-8.8V-0.3" />}
        {show('a') && <path className="intro-leg intro-leg-a" d="M-1.2-8.8L-3.9-0.3M1.2-8.8L3.5-0.3" />}
        {show('b') && <path className="intro-leg intro-leg-b" d="M-1.2-8.8L0.9-0.3M1.2-8.8L-0.5-0.3" />}
      </g>
    </g>
  );
}

function StaticPerson({ f }: { f: Figure }) {
  const [px, py] = project(f.x, f.y, f.z ?? 0);
  return (
    <g transform={`translate(${f1(px)} ${f1(py)})`}>
      <Person child={f.child} pose={f.pose} />
    </g>
  );
}

const along = (dir: 'x' | 'y', c0: number, c1: number, w0: number, w1: number, z0: number, z1: number): Box =>
  dir === 'x' ? { x0: c0, x1: c1, y0: w0, y1: w1, z0, z1 } : { y0: c0, y1: c1, x0: w0, x1: w1, z0, z1 };

/**
 * Машина относительно своей точки на дороге: кузов, кабина со стёклами и стойками, колёса с дисками
 * в плоскости борта, фары на торце, тень по свету. `dir` — ось улицы.
 */
function CarBody({ dir, truck = false }: { dir: 'x' | 'y'; truck?: boolean }) {
  const L = truck ? 1.3 : 0.98;
  const W = 0.46;
  const body = along(dir, -L / 2, L / 2, -W / 2, W / 2, 0.07, 0.34);
  const cab = truck ? along(dir, -L / 2 + 0.04, -L / 2 + 0.44, -W / 2 + 0.03, W / 2 - 0.03, 0.34, 0.66) : along(dir, -0.24, 0.26, -W / 2 + 0.035, W / 2 - 0.035, 0.34, 0.56);
  const cargo = truck ? along(dir, -L / 2 + 0.5, L / 2 - 0.02, -W / 2 + 0.01, W / 2 - 0.01, 0.34, 0.8) : null;
  const bf = boxFaces(body, true);
  const cf = boxFaces(cab, true);
  const gf = cargo ? boxFaces(cargo, true) : null;
  const cabL = dir === 'x' ? cab.x1 - cab.x0 : cab.y1 - cab.y0;
  const cabW = dir === 'x' ? cab.y1 - cab.y0 : cab.x1 - cab.x0;
  const cabH = cab.z1 - cab.z0;
  // Борт (длинная грань) и торец (короткая) — какие плоскости видны, зависит от оси улицы.
  const sideM = dir === 'x' ? planeMatrix('left', [body.x0, body.y1 + 0.004, 0]) : planeMatrix('right', [body.x1 + 0.004, body.y1, 0]);
  const cabSideM = dir === 'x' ? planeMatrix('left', [cab.x0, cab.y1 + 0.004, cab.z0]) : planeMatrix('right', [cab.x1 + 0.004, cab.y1, cab.z0]);
  const cabEndM = dir === 'x' ? planeMatrix('right', [cab.x1 + 0.004, cab.y1, cab.z0]) : planeMatrix('left', [cab.x0, cab.y1 + 0.004, cab.z0]);
  const endM = dir === 'x' ? planeMatrix('right', [body.x1 + 0.004, body.y1, body.z0]) : planeMatrix('left', [body.x0, body.y1 + 0.004, body.z0]);
  const wheels = [0.23, L - 0.23];
  const outline = { fill: 'none', stroke: CAR.line, strokeWidth: 0.5, strokeOpacity: 0.55, strokeLinejoin: 'round' as const };
  return (
    <g>
      <polygon points={relPts(shadowHull(body, 0.5))} fill={SHADOW} />
      <polygon points={bf.left} fill={CAR.left} />
      <polygon points={bf.right} fill={CAR.right} />
      <polygon points={bf.top} fill={CAR.top} />
      <polygon points={bf.left} {...outline} />
      <polygon points={bf.right} {...outline} />
      <polygon points={bf.top} {...outline} />
      <polygon points={cf.left} fill={CAR.left} />
      <polygon points={cf.right} fill={CAR.right} />
      <polygon points={cf.top} fill={CAR.top} />
      <polygon points={cf.top} {...outline} />
      {/* стёкла: боковое с центральной стойкой и лобовое на торце кабины */}
      <g transform={cabSideM}>
        <rect x={0.035} y={0.04} width={cabL - 0.07} height={cabH - 0.08} fill={CAR.glass} />
        <rect x={0.035} y={0.04} width={cabL - 0.07} height={(cabH - 0.08) * 0.45} fill={CAR.glassDark} opacity={0.55} />
        <path d={`M${f1(cabL / 2)} 0.04V${f1(cabH - 0.04)}`} stroke={CAR.left} strokeWidth={0.025} />
      </g>
      <g transform={cabEndM}>
        <rect x={0.035} y={0.05} width={cabW - 0.07} height={cabH - 0.09} fill={CAR.glass} />
        <rect x={0.035} y={0.05} width={cabW - 0.07} height={(cabH - 0.09) * 0.4} fill={CAR.glassDark} opacity={0.5} />
      </g>
      {gf && (
        <>
          <polygon points={gf.left} fill="#2f4cae" />
          <polygon points={gf.right} fill="#243f96" />
          <polygon points={gf.top} fill={CAR.top} />
          <polygon points={gf.left} {...outline} />
          <polygon points={gf.right} {...outline} />
          <polygon points={gf.top} {...outline} />
        </>
      )}
      {/* фары и бампер на видимом торце */}
      <g transform={endM}>
        <rect x={0.05} y={0.12} width={0.08} height={0.05} fill={CAR.lamp} />
        <rect x={W - 0.13} y={0.12} width={0.08} height={0.05} fill={CAR.lamp} />
        <rect x={0.02} y={0.01} width={W - 0.04} height={0.035} fill={CAR.line} opacity={0.5} />
      </g>
      {/* колёса в плоскости борта: эллипсы правильной формы для изометрии */}
      <g transform={sideM}>
        {wheels.map((u) => (
          <g key={u}>
            <circle cx={u} cy={0.115} r={0.105} fill={CAR.wheel} />
            <circle cx={u} cy={0.115} r={0.05} fill={CAR.rim} />
          </g>
        ))}
      </g>
    </g>
  );
}

function ParkedCarShape({ c }: { c: ParkedCar }) {
  const [px, py] = project(c.x, c.y, 0);
  return (
    <g transform={`translate(${f1(px)} ${f1(py)})`}>
      <CarBody dir={c.dir} truck={c.truck} />
    </g>
  );
}

/** Арочный проём на грани куба: тёмная ниша, плита балкона, у входа — свет. */
function Arch({ box, side, id, entrance, lightRef }: { box: Box; side: 'left' | 'right'; id: string; entrance?: boolean; lightRef?: RefObject<SVGRectElement | null> }) {
  const d = entrance ? ENTRANCE_ARCH_D : ARCH_D;
  return (
    <g transform={faceMatrix(box, side)}>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect width={1} height={1} fill="#0b1a55" />
        <rect width={0.5} height={1} fill="#132b7e" opacity={0.6} />
        {entrance ? (
          <>
            <rect x={0.28} width={0.44} height={0.72} fill="#1d3a9c" opacity={0.55} />
            <rect ref={lightRef} x={0.1} width={0.8} height={0.85} fill="#f6d98a" opacity={0} className="intro-door-light" />
          </>
        ) : (
          <>
            <rect x={0.14} y={0.08} width={0.72} height={0.17} fill="#cfd4de" />
            <rect x={0.14} y={0.23} width={0.72} height={0.03} fill="#f2f4f8" />
          </>
        )}
      </g>
      <path d={d} fill="none" stroke="#10247a" strokeWidth={0.02} />
    </g>
  );
}

const BUILDING_FOOTPRINT: Box = { x0: 0, y0: 0, x1: 4, y1: 4, z0: TERRACE_Z, z1: TERRACE_Z + 4.4 };

function Building({ lightRef }: { lightRef: RefObject<SVGRectElement | null> }) {
  const cells = buildingCells();
  return (
    <g>
      <Shadow box={BUILDING_FOOTPRINT} />
      {cells.map((c) => {
        const f = boxFaces(c.box);
        const key = `${c.i}-${c.j}-${c.k}`;
        return (
          <g key={key}>
            <polygon points={f.left} fill={BLUE.left} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            <polygon points={f.right} fill={BLUE.right} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            <polygon points={f.top} fill={BLUE.top} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            {c.archLeft && <Arch box={c.box} side="left" id={`intro-arch-l-${key}`} entrance={c.entrance} lightRef={c.entrance ? lightRef : undefined} />}
            {c.archRight && <Arch box={c.box} side="right" id={`intro-arch-r-${key}`} />}
          </g>
        );
      })}
    </g>
  );
}

function Lanes() {
  return (
    <g stroke={INK} strokeWidth={1.3} strokeDasharray="8 6" fill="none" opacity={0.9}>
      {LANES.map((l, i) => {
        const [ax, ay] = project(...l.a);
        const [bx, by] = project(...l.b);
        return <line key={i} x1={ax} y1={ay} x2={bx} y2={by} />;
      })}
    </g>
  );
}

function StreetLabels() {
  return (
    <g fill={INK} fontSize={13} fontStyle="italic" fontWeight={600} opacity={0.8} style={{ fontFamily: 'var(--font-ui)' }}>
      {STREET_LABELS.map((l) => {
        const [x, y] = project(...l.at);
        return (
          <text key={l.text} transform={`translate(${f1(x)} ${f1(y)}) rotate(${l.rot})`} textAnchor="middle">
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

/** Стрелка-подъезд к воротам, как на схеме. */
function GateArrow() {
  const [sx, sy] = project(-1.6, 9.1);
  const [cx, cy] = project(0.55, 8.95);
  const [ex, ey] = project(0.55, 7.35);
  return (
    <path d={`M${f1(sx)} ${f1(sy)} Q${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}`} fill="none" stroke={INK} strokeWidth={1.3} strokeDasharray="6 5" markerEnd="url(#intro-arrow)" opacity={0.9} />
  );
}

function Terrace() {
  const f = boxFaces(TERRACE);
  const z = TERRACE_Z;
  const yg = TERRACE.y1 - WALL_T + 0.02;
  const wallTop = z + WALL_H;
  return (
    <g>
      <Shadow box={TERRACE} h={TERRACE_Z + WALL_H} />
      <polygon points={f.left} fill={PLAZA.left} />
      <polygon points={f.right} fill={PLAZA.right} />
      <polygon points={f.top} fill={PLAZA.top} />
      <polygon points={f.top} fill="url(#intro-dots)" />
      <polygon points={f.top} fill="none" stroke={WHITE.line} strokeWidth={0.7} />
      {/* Порог ворот */}
      <polygon
        points={pts([
          [GATE.x0, TERRACE.y1 - WALL_T, z],
          [GATE.x1, TERRACE.y1 - WALL_T, z],
          [GATE.x1, TERRACE.y1, z],
          [GATE.x0, TERRACE.y1, z],
        ])}
        fill="#8d919c"
      />
      {/* Тёмная дверь в проёме — за ней пассажир «исчезает» и появляется на террасе */}
      <polygon
        points={pts([
          [GATE.x0, yg, z],
          [GATE.x1, yg, z],
          [GATE.x1, yg, wallTop - 0.04],
          [GATE.x0, yg, wallTop - 0.04],
        ])}
        fill="#474c59"
      />
    </g>
  );
}

/** Дальние стороны ограды (задняя и левая) — рисуются до здания. */
function BackWalls() {
  const z = TERRACE_Z;
  const top = z + WALL_H;
  return (
    <g>
      <WhiteBox box={{ x0: TERRACE.x0, y0: TERRACE.y0, x1: TERRACE.x1, y1: TERRACE.y0 + WALL_T, z0: z, z1: top }} />
      <WhiteBox box={{ x0: TERRACE.x0, y0: TERRACE.y0 + WALL_T, x1: TERRACE.x0 + WALL_T, y1: TERRACE.y1 - WALL_T, z0: z, z1: top }} />
    </g>
  );
}

/** Ближние стороны ограды (правая с калиткой и передняя с воротами) — поверх здания и прохожих. */
function FrontWalls() {
  const z = TERRACE_Z;
  const top = z + WALL_H;
  const rightX = TERRACE.x1 - WALL_T;
  const frontY = TERRACE.y1 - WALL_T;
  const doorX = TERRACE.x1 - 0.02;
  return (
    <g>
      <WhiteBox box={{ x0: rightX, y0: TERRACE.y0 + WALL_T, x1: TERRACE.x1, y1: SIDE_DOOR.y0, z0: z, z1: top }} />
      <polygon
        points={pts([
          [doorX, SIDE_DOOR.y0, z],
          [doorX, SIDE_DOOR.y1, z],
          [doorX, SIDE_DOOR.y1, top - 0.04],
          [doorX, SIDE_DOOR.y0, top - 0.04],
        ])}
        fill="#474c59"
      />
      <WhiteBox box={{ x0: rightX, y0: SIDE_DOOR.y1, x1: TERRACE.x1, y1: frontY, z0: z, z1: top }} />
      <WhiteBox box={{ x0: TERRACE.x0, y0: frontY, x1: GATE.x0, y1: TERRACE.y1, z0: z, z1: top }} />
      <WhiteBox box={{ x0: GATE.x1, y0: frontY, x1: TERRACE.x1, y1: TERRACE.y1, z0: z, z1: top }} />
    </g>
  );
}

/** Выноска над зданием, как подписи кварталов на схеме. */
function BuildingLabel() {
  const [bx, by] = project(2, 2, TERRACE_Z + 4.2);
  const ty = by - 140;
  return (
    <g style={{ fontFamily: 'var(--font-ui)' }}>
      <line x1={bx} y1={ty + 8} x2={bx} y2={by} stroke="#1d2130" strokeWidth={1} />
      <circle cx={bx} cy={by} r={3} fill="#1d2130" />
      <text x={bx} y={ty - 2} textAnchor="middle" fontSize={15} fontWeight={600} fill="#1d2130" letterSpacing={0.4}>
        Библиотека
      </text>
    </g>
  );
}

function Patterns() {
  return (
    <defs>
      <pattern id="intro-speckle" width={34} height={34} patternUnits="userSpaceOnUse">
        <circle cx={4} cy={6} r={0.8} fill="#c9c6bf" />
        <circle cx={17} cy={3} r={0.6} fill="#c9c6bf" />
        <circle cx={27} cy={14} r={0.9} fill="#c9c6bf" />
        <circle cx={9} cy={22} r={0.6} fill="#c9c6bf" />
        <circle cx={21} cy={27} r={0.8} fill="#c9c6bf" />
        <circle cx={31} cy={30} r={0.5} fill="#c9c6bf" />
      </pattern>
      <pattern id="intro-dots" width={26} height={26} patternUnits="userSpaceOnUse">
        <circle cx={3} cy={5} r={1.1} fill="#8a95ad" opacity={0.5} />
        <circle cx={13} cy={2} r={0.8} fill="#8a95ad" opacity={0.5} />
        <circle cx={21} cy={9} r={1.2} fill="#8a95ad" opacity={0.45} />
        <circle cx={8} cy={15} r={0.9} fill="#8a95ad" opacity={0.5} />
        <circle cx={17} cy={19} r={1} fill="#8a95ad" opacity={0.5} />
        <circle cx={24} cy={23} r={0.7} fill="#8a95ad" opacity={0.5} />
        <circle cx={2} cy={23} r={0.8} fill="#8a95ad" opacity={0.45} />
      </pattern>
      <pattern id="intro-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
        <line x1={0} y1={0} x2={6} y2={0} stroke="#c9c6bf" strokeWidth={0.8} />
      </pattern>
      <marker id="intro-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto">
        <path d="M1 1L8 5L1 9" fill="none" stroke={INK} strokeWidth={1.6} />
      </marker>
    </defs>
  );
}

export interface SceneRefs {
  svg: RefObject<SVGSVGElement | null>;
  car: RefObject<SVGGElement | null>;
  walkerOut: RefObject<SVGGElement | null>;
  walkerIn: RefObject<SVGGElement | null>;
  doorLight: RefObject<SVGRectElement | null>;
}

/** Статичная сцена; актёры (машина, пассажир, свет входа) двигаются через refs из `Intro`. */
export const IntroScene = memo(function IntroScene({ refs }: { refs: SceneRefs }) {
  const [ax, ay] = project(AMBIENT_CAR.x, AMBIENT_CAR.from, 0);
  const [dx, dy] = projectRel(0, AMBIENT_CAR.to - AMBIENT_CAR.from, 0);
  return (
    <svg
      ref={refs.svg}
      className="intro-scene"
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ transformOrigin: `${CAMERA_ORIGIN.x * 100}% ${CAMERA_ORIGIN.y * 100}%` }}
      aria-hidden="true"
    >
      <Patterns />
      <rect x={-1200} y={-800} width={4000} height={2600} fill="#e6e4df" />
      <rect x={-1200} y={-800} width={4000} height={2600} fill="url(#intro-speckle)" />
      <Lanes />
      <StreetLabels />
      {/* Внешняя группа ставит машину на улицу атрибутом, внутренняя едет CSS-анимацией: одно свойство не перебивает другое */}
      <g transform={`translate(${f1(ax)} ${f1(ay)})`}>
        <g className="intro-car-ambient" style={{ '--intro-dx': `${f1(dx)}px`, '--intro-dy': `${f1(dy)}px` } as React.CSSProperties}>
          <CarBody dir="y" />
        </g>
      </g>
      {FAR_BLOCKS.map((b, i) => (
        <BlockShape key={i} b={b} />
      ))}
      {FAR_CARS.map((c, i) => (
        <ParkedCarShape key={i} c={c} />
      ))}
      {FAR_TREES.map((t, i) => (
        <Tree key={i} spot={t} />
      ))}
      <Terrace />
      <BackWalls />
      <Building lightRef={refs.doorLight} />
      {PLAZA_PEOPLE.map((f, i) => (
        <StaticPerson key={i} f={f} />
      ))}
      <g ref={refs.walkerIn} className="intro-walker" style={{ display: 'none' }}>
        <Person walker />
      </g>
      <FrontWalls />
      {RIGHT_BLOCKS.map((b, i) => (
        <BlockShape key={i} b={b} />
      ))}
      {GARDEN_TREES.map((t, i) => (
        <Tree key={i} spot={t} scale={i === 0 ? 1.15 : 0.9} />
      ))}
      {GARDEN_PEOPLE.map((f, i) => (
        <StaticPerson key={i} f={f} />
      ))}
      <GateArrow />
      <Tree spot={GATE_TREE} scale={0.9} />
      <g ref={refs.walkerOut} className="intro-walker" style={{ display: 'none' }}>
        <Person walker />
      </g>
      <g ref={refs.car} className="intro-car" style={{ display: 'none' }}>
        <CarBody dir="x" />
      </g>
      {NEAR_CARS.map((c, i) => (
        <ParkedCarShape key={i} c={c} />
      ))}
      {STREET_PEOPLE.map((f, i) => (
        <StaticPerson key={i} f={f} />
      ))}
      {STREET_TREES.map((t, i) => (
        <Tree key={i} spot={t} />
      ))}
      {NEAR_BLOCKS.map((b, i) => (
        <BlockShape key={i} b={b} />
      ))}
      <BuildingLabel />
    </svg>
  );
});
