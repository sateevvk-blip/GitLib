/**
 * Заставка «въезд в библиотеку»: изометрическая сцена по референсу `дизайн/0cf0fbf7106f91be89882c480e2978d3.jpg`.
 * Мир измеряется в «кубах» здания (одна ячейка = 1). Ось x уходит на экране вправо-вниз, y — влево-вниз,
 * z — вверх. Экран — viewBox 1600×1000. Здесь только геометрия и данные сцены, без DOM — покрыто тестами.
 */

export const VIEW = { w: 1600, h: 1000 } as const;
/** Пикселей viewBox на единицу мира. */
export const U = 46;
/** Экранная точка мира (0,0,0) — подобрана так, чтобы здание 4×4 стояло в центре кадра. */
export const ORIGIN = { x: 800, y: 484 } as const;
/** Точка, на которую «наезжает» камера (центр здания), в долях viewBox. */
export const CAMERA_ORIGIN = { x: 0.5, y: 0.47 } as const;

const C = Math.cos(Math.PI / 6);
const S = 0.5;

export type P3 = readonly [number, number, number];
export type P2 = readonly [number, number];

export function project(x: number, y: number, z = 0): P2 {
  return [ORIGIN.x + (x - y) * C * U, ORIGIN.y + (x + y) * S * U - z * U];
}

/** Экранное смещение при сдвиге в мире — для фигур, которые рисуются относительно своей точки. */
export function projectRel(x: number, y: number, z = 0): P2 {
  return [(x - y) * C * U, (x + y) * S * U - z * U];
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

export function pts(points: readonly P3[]): string {
  return points.map(([x, y, z]) => project(x, y, z).map(f1).join(',')).join(' ');
}

export function relPts(points: readonly P3[]): string {
  return points.map(([x, y, z]) => projectRel(x, y, z).map(f1).join(',')).join(' ');
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface Faces {
  top: string;
  /** Грань y = y1 — смотрит на зрителя влево-вниз. */
  left: string;
  /** Грань x = x1 — смотрит на зрителя вправо-вниз. */
  right: string;
}

export function boxFaces(b: Box, rel = false): Faces {
  const p = rel ? relPts : pts;
  const { x0, y0, x1, y1, z0, z1 } = b;
  return {
    top: p([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    left: p([
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    right: p([
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ]),
  };
}

/**
 * Матрица SVG, переводящая координаты грани (u — вдоль грани слева направо на экране, v — вверх, обе в [0,1])
 * в экран. Круг в этих координатах становится правильным эллипсом в плоскости грани — так рисуются арки.
 */
export function faceMatrix(b: Box, side: 'left' | 'right'): string {
  const w = side === 'left' ? b.x1 - b.x0 : b.y1 - b.y0;
  const h = b.z1 - b.z0;
  const [e, f] = side === 'left' ? project(b.x0, b.y1, b.z0) : project(b.x1, b.y1, b.z0);
  const a = C * U * w;
  const bb = (side === 'left' ? S : -S) * U * w;
  return `matrix(${f1(a)} ${f1(bb)} 0 ${f1(-U * h)} ${f1(e)} ${f1(f)})`;
}

/* ---------- здание ---------- */

/** Здание стоит на террасе такой высоты. */
export const TERRACE_Z = 0.3;
export const BUILDING_N = 4;
export const FLOORS = 4;

interface FaceCell {
  /** Выступ куба наружу от плоскости фасада. */
  o: number;
  /** Арочный проём с балконом. */
  a: boolean;
}

/** Дополнительная высота верхних кубов, [i][j]. */
const UP: readonly (readonly number[])[] = [
  [0.35, 0, 0.35, 0],
  [0, 0.35, 0, 0.35],
  [0.35, 0, 0, 0.35],
  [0, 0.35, 0.35, 0],
];

/** Левый фасад (y = 4): [i][k], i — слева направо на экране, k — этаж снизу вверх. */
const LEFT: readonly (readonly FaceCell[])[] = [
  [{ o: 0, a: true }, { o: 0.3, a: false }, { o: 0.3, a: true }, { o: 0, a: false }],
  [{ o: 0.3, a: false }, { o: 0, a: true }, { o: 0, a: false }, { o: 0.3, a: true }],
  [{ o: 0, a: true }, { o: 0.3, a: false }, { o: 0, a: true }, { o: 0.3, a: false }],
  [{ o: 0.3, a: false }, { o: 0, a: true }, { o: 0.3, a: false }, { o: 0, a: false }],
];

/** Правый фасад (x = 4): [j][k], j = 3 — угловая колонна, j = 0 — правый край. */
const RIGHT: readonly (readonly FaceCell[])[] = [
  [{ o: 0, a: false }, { o: 0.3, a: true }, { o: 0, a: false }, { o: 0.3, a: true }],
  [{ o: 0.3, a: true }, { o: 0, a: false }, { o: 0.3, a: true }, { o: 0, a: false }],
  [{ o: 0, a: false }, { o: 0.3, a: true }, { o: 0, a: true }, { o: 0.3, a: false }],
  [{ o: 0.3, a: true }, { o: 0, a: false }, { o: 0.3, a: true }, { o: 0, a: false }],
];

export interface Cell {
  i: number;
  j: number;
  k: number;
  box: Box;
  archLeft: boolean;
  archRight: boolean;
  /** Вход в библиотеку — большая арка первого этажа в угловой колонне, правый фасад. */
  entrance: boolean;
  depth: number;
}

/** Видимая оболочка здания в порядке рисования (дальние кубы первыми). */
export function buildingCells(): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < BUILDING_N; i++) {
    for (let j = 0; j < BUILDING_N; j++) {
      for (let k = 0; k < FLOORS; k++) {
        const onLeft = j === BUILDING_N - 1;
        const onRight = i === BUILDING_N - 1;
        const onTop = k === FLOORS - 1;
        if (!onLeft && !onRight && !onTop) continue;
        const l = onLeft ? LEFT[i]?.[k] : undefined;
        const r = onRight ? RIGHT[j]?.[k] : undefined;
        const entrance = onLeft && onRight && k === 0;
        cells.push({
          i,
          j,
          k,
          box: {
            x0: i,
            y0: j,
            x1: i + 1 + (r?.o ?? 0),
            y1: j + 1 + (l?.o ?? 0),
            z0: TERRACE_Z + k,
            z1: TERRACE_Z + k + 1 + (onTop ? (UP[i]?.[j] ?? 0) : 0),
          },
          archLeft: !!l?.a,
          archRight: !!r?.a,
          entrance,
          depth: i + j + k,
        });
      }
    }
  }
  return cells.sort((a, b) => a.depth - b.depth);
}

/** Арка с балконом в координатах грани (v вверх). */
export const ARCH_D = 'M0.14 0.08 L0.14 0.5 A0.36 0.36 0 0 0 0.86 0.5 L0.86 0.08 Z';
/** Входная арка — от земли, почти во всю грань. */
export const ENTRANCE_ARCH_D = 'M0.1 0 L0.1 0.42 A0.4 0.4 0 0 0 0.9 0.42 L0.9 0 Z';

/* ---------- участок ---------- */

export const TERRACE: Box = { x0: -1.2, y0: -1.5, x1: 5.2, y1: 7, z0: 0, z1: TERRACE_Z };
export const WALL_H = 0.45;
export const WALL_T = 0.16;
/** Ворота в переднем парапете (y = 7). */
export const GATE = { x0: 0.2, x1: 0.9 } as const;
/** Калитка в правом парапете (x = 5.2). */
export const SIDE_DOOR = { y0: 3.1, y1: 3.8 } as const;

/* ---------- окружение ---------- */

export interface Block {
  box: Box;
  roof?: 'hatch' | 'dots';
  /** Внутренний дворик: проём в крыше. */
  court?: Pick<Box, 'x0' | 'y0' | 'x1' | 'y1'>;
}

const block = (x0: number, y0: number, x1: number, y1: number, h: number, extra: Omit<Block, 'box'> = {}): Block => ({
  box: { x0, y0, x1, y1, z0: 0, z1: h },
  ...extra,
});

/** Кварталы за террасой (дальше неё от зрителя), в порядке рисования. */
export const FAR_BLOCKS: readonly Block[] = [
  block(-20, -11, -13.5, -4.6, 1.3),
  block(-13, -11, -4.8, -4.6, 1.7),
  block(-1.9, -17, 5.3, -10.5, 1.8),
  block(-15, -1.9, -4.8, 7.3, 1.5),
  block(-1.9, -10, 5.3, -4.9, 1.1, { roof: 'hatch' }),
  block(8.3, -14, 17, -4.9, 1.3, { court: { x0: 11, y0: -10.5, x1: 12.8, y1: -8.6 } }),
];

/** Квартал справа от террасы с двориком и сад перед ним — ближе террасы, дальше машины на улице. */
export const RIGHT_BLOCKS: readonly Block[] = [
  block(8.3, -1.9, 16, 4.2, 0.9, { court: { x0: 9.9, y0: -0.2, x1: 11.6, y1: 1.4 } }),
  block(8.3, 4.5, 13.5, 7.3, TERRACE_Z, { roof: 'dots' }),
  block(13.8, 4.5, 17, 7.3, 1.2),
];

/** Кварталы перед улицей — ближе всего к зрителю. */
export const NEAR_BLOCKS: readonly Block[] = [
  block(-15, 11.2, -9.8, 18, 1.6),
  block(-9.5, 11.2, -4.8, 18, 1.1),
  block(-1.9, 11.2, 5.3, 17.5, 1.3, { roof: 'hatch' }),
  block(8.3, 11.2, 17, 18, 1.4),
];

/** Осевые пунктиры улиц. */
export const LANES: readonly { a: P3; b: P3 }[] = [
  { a: [-3.9, -16, 0], b: [-3.9, 20, 0] },
  { a: [-2.8, -16, 0], b: [-2.8, 20, 0] },
  { a: [6.0, -16, 0], b: [6.0, 7.6, 0] },
  { a: [6.9, -16, 0], b: [6.9, 7.6, 0] },
  { a: [-22, 8.3, 0], b: [22, 8.3, 0] },
  { a: [-22, 9.3, 0], b: [22, 9.3, 0] },
  { a: [-22, -3.0, 0], b: [22, -3.0, 0] },
  { a: [-22, -3.9, 0], b: [22, -3.9, 0] },
];

/** Подписи улиц — имена веток, вдоль дороги. `rot` — поворот текста в градусах. */
export const STREET_LABELS: readonly { text: string; at: P3; rot: number }[] = [
  { text: 'main', at: [-8.5, 8.9, 0], rot: 30 },
  { text: 'release', at: [-3.5, -7.5, 0], rot: -30 },
  { text: 'develop', at: [6.4, 2.6, 0], rot: -30 },
];

export type TreeSpot = readonly [number, number, number?];
/** Деревья дальше террасы. */
export const FAR_TREES: readonly TreeSpot[] = [
  [7.2, -9.4],
  [-3.2, -11.5],
  [-1.7, 5.0],
  [-1.7, -0.6],
];
/** Деревья в саду справа (на его террасе). */
export const GARDEN_TREES: readonly TreeSpot[] = [
  [10.4, 6.1, TERRACE_Z],
  [8.9, 5.4, TERRACE_Z],
];
/** Дерево у правого края переднего парапета, снаружи террасы. */
export const GATE_TREE: TreeSpot = [5.0, 7.3];
/** Деревья у улицы перед террасой — ближе машины, дальше передних кварталов. */
export const STREET_TREES: readonly TreeSpot[] = [
  [13.5, 8.8],
  [-2.9, 12.4],
];

export interface Figure {
  x: number;
  y: number;
  z?: number;
  child?: boolean;
}
/** Прохожие на террасе. */
export const PLAZA_PEOPLE: readonly Figure[] = [
  { x: 0.6, y: 3.4, z: TERRACE_Z },
  { x: 1.6, y: 5.3, z: TERRACE_Z },
  { x: 1.95, y: 5.5, z: TERRACE_Z, child: true },
  { x: 3.3, y: 6.1, z: TERRACE_Z },
  { x: 3.6, y: 6.0, z: TERRACE_Z, child: true },
];
export const GARDEN_PEOPLE: readonly Figure[] = [
  { x: 9.6, y: 6.6, z: TERRACE_Z },
  { x: 9.9, y: 6.7, z: TERRACE_Z, child: true },
];
export const STREET_PEOPLE: readonly Figure[] = [{ x: 12.2, y: 8.9 }];

export interface ParkedCar {
  x: number;
  y: number;
  dir: 'x' | 'y';
  truck?: boolean;
}
/** Машины на дальних улицах. */
export const FAR_CARS: readonly ParkedCar[] = [
  { x: 2.5, y: -3.0, dir: 'x' },
  { x: 6.9, y: -2.6, dir: 'y' },
  { x: -3.9, y: 3.0, dir: 'y' },
];
/** Машины на улице перед террасой. */
export const NEAR_CARS: readonly ParkedCar[] = [
  { x: 12.5, y: 9.3, dir: 'x', truck: true },
  { x: -12, y: 8.3, dir: 'x' },
];
/** Фоновая машина едет по улице слева за зданием. */
export const AMBIENT_CAR = { x: -2.8, from: 14, to: -12 } as const;
