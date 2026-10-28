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
  LANES,
  NEAR_BLOCKS,
  NEAR_CARS,
  GATE_TREE,
  STREET_TREES,
  type ParkedCar,
  PLAZA_PEOPLE,
  project,
  projectRel,
  pts,
  RIGHT_BLOCKS,
  SIDE_DOOR,
  STREET_LABELS,
  STREET_PEOPLE,
  TERRACE,
  TERRACE_Z,
  type TreeSpot,
  VIEW,
  WALL_H,
  WALL_T,
} from './iso';

/* Палитра сцены — постер в светлых тонах референса, одинаковый в обеих темах. */
const INK = '#2b49b8';
const WHITE = { top: '#f7f6f3', left: '#e8e6e1', right: '#d9d6d0', line: '#c4c1ba' };
const PLAZA = { top: '#f1f0ec', left: '#e3e1dc', right: '#d4d1cb' };
const BLUE = { top: '#2d57d9', left: '#2449c8', right: '#1b3aa9', line: '#17339a' };
const SHADOW = 'rgba(44, 48, 64, 0.13)';
const FIGURE = '#3453b6';

function Shadow({ box }: { box: Box }) {
  const h = box.z1 - box.z0;
  const dx = -0.15 * h;
  const dy = 0.55 * h;
  const z = box.z0;
  return (
    <polygon
      points={pts([
        [box.x0 + dx, box.y0 + dy, z],
        [box.x1 + dx, box.y0 + dy, z],
        [box.x1 + dx, box.y1 + dy, z],
        [box.x0 + dx, box.y1 + dy, z],
      ])}
      fill={SHADOW}
    />
  );
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
      {b.box.z1 - b.box.z0 > TERRACE_Z && <Shadow box={b.box} />}
      <WhiteBox box={b.box} roof={b.roof} palette={b.roof === 'dots' ? { ...WHITE, top: PLAZA.top } : WHITE} />
      {b.court && <Court box={b.box} court={b.court} />}
    </g>
  );
}

function Tree({ spot }: { spot: TreeSpot }) {
  const [px, py] = project(spot[0], spot[1], spot[2] ?? 0);
  return (
    <g transform={`translate(${px} ${py})`} fill="#5570bc">
      <path d="M0 0V-14" stroke="#4a63b0" strokeWidth={1.6} />
      <circle cy={-19} r={8} opacity={0.85} />
      <circle cx={-6} cy={-14} r={5.5} opacity={0.8} />
      <circle cx={6} cy={-15} r={6} opacity={0.8} />
      <circle cx={1} cy={-25} r={4.5} opacity={0.9} />
      <circle cx={-2} cy={-20} r={2.2} fill="#8ea0d6" opacity={0.8} />
      <circle cx={5} cy={-22} r={1.6} fill="#8ea0d6" opacity={0.8} />
    </g>
  );
}

/** Силуэт прохожего; у идущего ноги переключаются CSS-анимацией `.is-walking`. */
function Person({ child = false, className }: { child?: boolean; className?: string }) {
  return (
    <g className={className} fill={FIGURE} color={FIGURE} transform={child ? 'scale(0.62)' : undefined}>
      <g className="intro-walker-body">
        <circle cy={-18} r={2.6} />
        <path d="M-3-15.5H3L2.3-7.5H-2.3Z" />
        <path className="intro-leg intro-leg-s" d="M-1.2-7.5V0M1.2-7.5V0" />
        <path className="intro-leg intro-leg-a" d="M-1-7.5L-2.8 0M1-7.5L2.8 0" />
        <path className="intro-leg intro-leg-b" d="M-1-7.5L0.5 0M1-7.5L-0.5 0" />
      </g>
    </g>
  );
}

function StaticPerson({ f }: { f: Figure }) {
  const [px, py] = project(f.x, f.y, f.z ?? 0);
  return (
    <g transform={`translate(${px} ${py})`}>
      <Person child={f.child} />
    </g>
  );
}

const along = (dir: 'x' | 'y', c0: number, c1: number, w0: number, w1: number, z0: number, z1: number): Box =>
  dir === 'x' ? { x0: c0, x1: c1, y0: w0, y1: w1, z0, z1 } : { y0: c0, y1: c1, x0: w0, x1: w1, z0, z1 };

/** Машина относительно своей точки на дороге. */
function CarBody({ dir, truck = false }: { dir: 'x' | 'y'; truck?: boolean }) {
  const L = truck ? 1.25 : 0.95;
  const W = 0.46;
  const body = boxFaces(along(dir, -L / 2, L / 2, -W / 2, W / 2, 0.07, 0.36), true);
  const cab = boxFaces(
    truck ? along(dir, -L / 2 + 0.04, -L / 2 + 0.42, -W / 2 + 0.03, W / 2 - 0.03, 0.36, 0.64) : along(dir, -0.22, 0.24, -W / 2 + 0.04, W / 2 - 0.04, 0.36, 0.56),
    true,
  );
  const cargo = truck ? boxFaces(along(dir, -L / 2 + 0.48, L / 2 - 0.02, -W / 2 + 0.01, W / 2 - 0.01, 0.36, 0.78), true) : null;
  const wheelOffsets: [number, number][] = [L / 2 - 0.22, -(L / 2 - 0.22)].map((c) => (dir === 'x' ? [c, W / 2] : [W / 2, c]) as [number, number]);
  return (
    <g>
      <ellipse cx={-4} cy={6} rx={L * 24} ry={7} fill={SHADOW} />
      <polygon points={body.left} fill="#3453b8" />
      <polygon points={body.right} fill="#2a449e" />
      <polygon points={body.top} fill="#4a68cf" />
      <polygon points={cab.left} fill="#a7b7ea" />
      <polygon points={cab.right} fill="#93a5de" />
      <polygon points={cab.top} fill="#4a68cf" />
      {cargo && (
        <>
          <polygon points={cargo.left} fill="#2f4cae" />
          <polygon points={cargo.right} fill="#243f96" />
          <polygon points={cargo.top} fill="#4a68cf" />
        </>
      )}
      {wheelOffsets.map(([x, y], i) => {
        const [wx, wy] = projectRel(x, y, 0.1);
        return <circle key={i} cx={wx} cy={wy} r={3.2} fill="#0f1d4d" />;
      })}
    </g>
  );
}

function ParkedCarShape({ c }: { c: ParkedCar }) {
  const [px, py] = project(c.x, c.y, 0);
  return (
    <g transform={`translate(${px} ${py})`}>
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

function Building({ lightRef }: { lightRef: RefObject<SVGRectElement | null> }) {
  const cells = buildingCells();
  return (
    <g>
      <polygon
        points={pts([
          [-0.6, 2.2, TERRACE_Z],
          [3.4, 2.2, TERRACE_Z],
          [3.4, 6.2, TERRACE_Z],
          [-0.6, 6.2, TERRACE_Z],
        ])}
        fill={SHADOW}
      />
      {cells.map((c) => {
        const f = boxFaces(c.box);
        const key = `${c.i}-${c.j}-${c.k}`;
        return (
          <g key={key}>
            <polygon points={f.left} fill={BLUE.left} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            <polygon points={f.right} fill={BLUE.right} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            <polygon points={f.top} fill={BLUE.top} stroke={BLUE.line} strokeWidth={0.6} strokeOpacity={0.5} strokeLinejoin="round" />
            {c.archLeft && <Arch box={c.box} side="left" id={`intro-arch-l-${key}`} />}
            {c.archRight && <Arch box={c.box} side="right" id={`intro-arch-r-${key}`} entrance={c.entrance} lightRef={c.entrance ? lightRef : undefined} />}
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
          <text key={l.text} transform={`translate(${x} ${y}) rotate(${l.rot})`} textAnchor="middle">
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
    <path d={`M${sx} ${sy} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke={INK} strokeWidth={1.3} strokeDasharray="6 5" markerEnd="url(#intro-arrow)" opacity={0.9} />
  );
}

function Terrace() {
  const f = boxFaces(TERRACE);
  const z = TERRACE_Z;
  const yg = TERRACE.y1 - WALL_T + 0.02;
  const wallTop = z + WALL_H;
  return (
    <g>
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

function Walls() {
  const z = TERRACE_Z;
  const top = z + WALL_H;
  const rightX = TERRACE.x1 - WALL_T;
  const frontY = TERRACE.y1 - WALL_T;
  const doorX = TERRACE.x1 - 0.02;
  return (
    <g>
      <WhiteBox box={{ x0: rightX, y0: TERRACE.y0, x1: TERRACE.x1, y1: SIDE_DOOR.y0, z0: z, z1: top }} />
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

function BuildingLabel() {
  const [bx, by] = project(2, 2, TERRACE_Z + 4.2);
  const tx = bx;
  const ty = by - 150;
  return (
    <g style={{ fontFamily: 'var(--font-ui)' }}>
      <line x1={tx} y1={ty + 8} x2={bx} y2={by} stroke="#1d2130" strokeWidth={1} />
      <circle cx={bx} cy={by} r={3} fill="#1d2130" />
      <text x={tx} y={ty - 4} textAnchor="middle" fontSize={17} fontWeight={700} fill="#1d2130" letterSpacing={0.5}>
        GitLib
      </text>
      <text x={tx} y={ty - 24} textAnchor="middle" fontSize={11} fontWeight={500} fill="#5a607a" letterSpacing={1.5}>
        БИБЛИОТЕКА
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
      <g transform={`translate(${ax} ${ay})`}>
        <g className="intro-car-ambient" style={{ '--intro-dx': `${dx}px`, '--intro-dy': `${dy}px` } as React.CSSProperties}>
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
      <Building lightRef={refs.doorLight} />
      {PLAZA_PEOPLE.map((f, i) => (
        <StaticPerson key={i} f={f} />
      ))}
      <g ref={refs.walkerIn} className="intro-walker" style={{ display: 'none' }}>
        <Person />
      </g>
      <Walls />
      {RIGHT_BLOCKS.map((b, i) => (
        <BlockShape key={i} b={b} />
      ))}
      {GARDEN_TREES.map((t, i) => (
        <Tree key={i} spot={t} />
      ))}
      {GARDEN_PEOPLE.map((f, i) => (
        <StaticPerson key={i} f={f} />
      ))}
      <GateArrow />
      <Tree spot={GATE_TREE} />
      <g ref={refs.walkerOut} className="intro-walker" style={{ display: 'none' }}>
        <Person />
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
