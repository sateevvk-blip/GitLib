/**
 * Временная шкала заставки: чистая функция «время → положение актёров и камеры».
 * Единицы мира — как в `iso.ts`; время в миллисекундах от начала.
 */
import { TERRACE_Z } from './iso';

export const INTRO_DURATION = 7800;

/** Полоса, по которой подъезжает машина (улица перед террасой). */
export const CAR_LANE_Y = 8.75;
/** Машина останавливается напротив ворот. */
export const GATE_X = 0.55;
export const CAR_START_X = 17;
export const CAR_END_X = -16;
/** Точка перед входной аркой и точка внутри неё. */
export const ENTRANCE = { x: 4.75, y: 3.5 } as const;
export const ENTRANCE_INSIDE_X = 4.05;
/** Маршрут по террасе: от ворот, в обход угла здания, к входу. */
export const INSIDE_PATH: readonly (readonly [number, number])[] = [
  [GATE_X, 6.75],
  [1.3, 6.05],
  [ENTRANCE.x, 5.0],
  [ENTRANCE.x, ENTRANCE.y],
];
/** Выход из машины и подход к воротам. */
export const OUTSIDE_FROM = { x: 0.85, y: 8.45 } as const;
export const OUTSIDE_CURB = { x: GATE_X, y: 8.2 } as const;
export const OUTSIDE_TO = { x: GATE_X, y: 7.1 } as const;

export const ZOOM_MAX = 1.3;

/** Фазы, мс [от, до]. */
export const PHASES = {
  carIn: [300, 3000],
  exit: [3050, 3450],
  walkOut: [3450, 4000],
  walkIn: [4000, 6900],
  carOut: [4300, 6400],
  enter: [6900, 7350],
  light: [6300, 7100],
  fade: [7250, INTRO_DURATION],
  zoom: [0, 7400],
} as const;

export interface Actor {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export interface Frame {
  t: number;
  car: Actor;
  walkerOut: Actor & { walking: boolean };
  walkerIn: Actor & { walking: boolean; opacity: number };
  /** Свет в проёме входа, 0..1. */
  doorLight: number;
  zoom: number;
  opacity: number;
  done: boolean;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
/** Доля пройденной фазы, 0 до начала и 1 после конца. */
export const seg = (t: number, [a, b]: readonly [number, number]): number => clamp01((t - a) / (b - a));
const inside = (t: number, [a, b]: readonly [number, number]): boolean => t >= a && t < b;

export const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;
export const easeInQuad = (p: number): number => p * p;
export const easeInOutSine = (p: number): number => -(Math.cos(Math.PI * p) - 1) / 2;

interface Segment {
  a: readonly [number, number];
  b: readonly [number, number];
  /** Длина пути до начала отрезка и его собственная длина. */
  start: number;
  len: number;
}

const SEGMENTS: readonly Segment[] = (() => {
  const out: Segment[] = [];
  let start = 0;
  for (let i = 1; i < INSIDE_PATH.length; i++) {
    const a = INSIDE_PATH[i - 1]!;
    const b = INSIDE_PATH[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ a, b, start, len });
    start += len;
  }
  return out;
})();
const PATH_LENGTH = SEGMENTS.reduce((sum, s) => sum + s.len, 0);

/** Точка на маршруте по террасе при равномерной скорости, p ∈ [0,1]. */
export function alongInsidePath(p: number): readonly [number, number] {
  const d = clamp01(p) * PATH_LENGTH;
  for (const s of SEGMENTS) {
    if (d <= s.start + s.len) {
      const q = (d - s.start) / s.len;
      return [lerp(s.a[0], s.b[0], q), lerp(s.a[1], s.b[1], q)];
    }
  }
  return INSIDE_PATH[INSIDE_PATH.length - 1] ?? ENTRANCE_POINT;
}
const ENTRANCE_POINT: readonly [number, number] = [ENTRANCE.x, ENTRANCE.y];

export function sceneAt(t: number): Frame {
  // Машина: подъезжает с замедлением, стоит, пока пассажир выходит, потом уезжает налево.
  let carX = CAR_START_X;
  if (t >= PHASES.carOut[0]) carX = lerp(GATE_X, CAR_END_X, easeInQuad(seg(t, PHASES.carOut)));
  else if (t >= PHASES.carIn[0]) carX = lerp(CAR_START_X, GATE_X, easeOutCubic(seg(t, PHASES.carIn)));
  const car: Actor = { x: carX, y: CAR_LANE_Y, z: 0, visible: t < PHASES.carOut[1] };

  // Пассажир снаружи: выходит у обочины и идёт к воротам.
  let walkerOut: Frame['walkerOut'] = { x: OUTSIDE_TO.x, y: OUTSIDE_TO.y, z: 0, visible: false, walking: false };
  if (inside(t, PHASES.exit)) {
    const p = easeOutCubic(seg(t, PHASES.exit));
    walkerOut = { x: lerp(OUTSIDE_FROM.x, OUTSIDE_CURB.x, p), y: lerp(OUTSIDE_FROM.y, OUTSIDE_CURB.y, p), z: 0, visible: true, walking: true };
  } else if (inside(t, PHASES.walkOut)) {
    const p = seg(t, PHASES.walkOut);
    walkerOut = { x: OUTSIDE_CURB.x, y: lerp(OUTSIDE_CURB.y, OUTSIDE_TO.y, p), z: 0, visible: true, walking: true };
  }

  // Пассажир на террасе: от ворот к входу, в арке растворяется.
  let walkerIn: Frame['walkerIn'] = { x: ENTRANCE.x, y: ENTRANCE.y, z: TERRACE_Z, visible: false, walking: false, opacity: 1 };
  if (inside(t, PHASES.walkIn)) {
    const [x, y] = alongInsidePath(seg(t, PHASES.walkIn));
    walkerIn = { x, y, z: TERRACE_Z, visible: true, walking: true, opacity: 1 };
  } else if (inside(t, PHASES.enter)) {
    const p = seg(t, PHASES.enter);
    walkerIn = { x: lerp(ENTRANCE.x, ENTRANCE_INSIDE_X, p), y: ENTRANCE.y, z: TERRACE_Z, visible: true, walking: true, opacity: 1 - easeInQuad(p) };
  }

  return {
    t,
    car,
    walkerOut,
    walkerIn,
    doorLight: seg(t, PHASES.light),
    zoom: lerp(1, ZOOM_MAX, easeInOutSine(seg(t, PHASES.zoom))),
    opacity: 1 - easeInQuad(seg(t, PHASES.fade)),
    done: t >= INTRO_DURATION,
  };
}
