import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDING_N, buildingCells, faceMatrix, FLOORS, GATE, LIGHT, ORIGIN, project, projectRel, shadowHull, SIDE_DOOR, TERRACE, TERRACE_Z, U, VIEW } from '../src/client/intro/iso';
import {
  alongInsidePath,
  CAR_LANE_Y,
  ENTRANCE,
  ENTRANCE_INSIDE,
  GATE_X,
  INSIDE_PATH,
  INTRO_DURATION,
  OUTSIDE_TO,
  PHASES,
  sceneAt,
  ZOOM_MAX,
} from '../src/client/intro/timeline';
import { AFTER_INTRO_FALLBACK_MS, afterIntro, beginIntro, finishIntro, frozenIntroTime, introActive, markIntroSeen, shouldPlayIntro } from '../src/client/intro/gate';

describe('заставка: изометрия', () => {
  it('начало координат на экране, оси x и y расходятся вниз, z — вверх', () => {
    expect(project(0, 0, 0)).toEqual([ORIGIN.x, ORIGIN.y]);
    const [xr, yr] = project(1, 0, 0);
    expect(xr).toBeGreaterThan(ORIGIN.x);
    expect(yr).toBeGreaterThan(ORIGIN.y);
    const [xl, yl] = project(0, 1, 0);
    expect(xl).toBeLessThan(ORIGIN.x);
    expect(yl).toBeCloseTo(yr);
    expect(project(0, 0, 1)[1]).toBeCloseTo(ORIGIN.y - U);
    expect(projectRel(1, 1, 0)[0]).toBeCloseTo(0);
  });

  it('матрица грани переводит углы единичного квадрата в углы грани', () => {
    const box = { x0: 1, y0: 2, x1: 2, y1: 3, z0: 0, z1: 1 };
    const m = faceMatrix(box, 'left').match(/-?[\d.]+/g)!.map(Number);
    const [a, b, c, d, e, f] = m;
    const apply = (u: number, v: number) => [a * u + c * v + e, b * u + d * v + f];
    expect(apply(0, 0)[0]).toBeCloseTo(project(1, 3, 0)[0], 0);
    expect(apply(1, 0)[0]).toBeCloseTo(project(2, 3, 0)[0], 0);
    expect(apply(1, 1)[1]).toBeCloseTo(project(2, 3, 1)[1], 0);
    const r = faceMatrix(box, 'right').match(/-?[\d.]+/g)!.map(Number);
    expect(r[0] * 1 + r[4]).toBeCloseTo(project(2, 2, 0)[0], 0);
  });

  it('видимая оболочка здания: все кубы с внешних граней, дальние первыми, один вход', () => {
    const cells = buildingCells();
    expect(cells).toHaveLength(BUILDING_N ** 2 * FLOORS - (BUILDING_N - 1) ** 2 * (FLOORS - 1));
    for (let i = 1; i < cells.length; i++) expect(cells[i].depth).toBeGreaterThanOrEqual(cells[i - 1].depth);
    const entrances = cells.filter((c) => c.entrance);
    expect(entrances).toHaveLength(1);
    // Вход — в левом фасаде, в ячейке напротив ворот (x ∈ [0,1]), маршрут пассажира упирается в неё.
    expect(entrances[0]).toMatchObject({ i: 0, j: BUILDING_N - 1, k: 0, archLeft: true });
    expect(ENTRANCE.x).toBeGreaterThan(entrances[0]!.box.x0);
    expect(ENTRANCE.x).toBeLessThan(entrances[0]!.box.x1);
    expect(ENTRANCE.y).toBeGreaterThan(entrances[0]!.box.y1);
    for (const c of cells) {
      expect(c.box.z0).toBeCloseTo(TERRACE_Z + c.k);
      expect(c.box.x1).toBeGreaterThan(c.box.x0);
      expect(c.box.y1).toBeGreaterThan(c.box.y0);
      if (c.archLeft) expect(c.j).toBe(BUILDING_N - 1);
      if (c.archRight) expect(c.i).toBe(BUILDING_N - 1);
    }
    expect(cells.filter((c) => c.archLeft || c.archRight).length).toBeGreaterThan(10);
  });

  it('тень ложится только вперёд от объекта (по свету), не за него', () => {
    const box = { x0: 1, y0: 2, x1: 3, y1: 5, z0: 0, z1: 1.5 };
    const hull = shadowHull(box);
    expect(hull).toHaveLength(6);
    for (const [x, y, z] of hull) {
      expect(x).toBeGreaterThanOrEqual(box.x0);
      expect(y).toBeGreaterThanOrEqual(box.y0);
      expect(z).toBe(box.z0);
    }
    expect(Math.max(...hull.map((p) => p[1]))).toBeCloseTo(box.y1 + LIGHT.y * 1.5);
    expect(Math.max(...hull.map((p) => p[0]))).toBeCloseTo(box.x1 + LIGHT.x * 1.5);
    expect(Math.max(...shadowHull(box, 3).map((p) => p[1]))).toBeCloseTo(box.y1 + LIGHT.y * 3);
  });

  it('ворота и калитка — в пределах парапета, здание — на террасе', () => {
    expect(GATE.x0).toBeGreaterThan(TERRACE.x0);
    expect(GATE.x1).toBeLessThan(TERRACE.x1);
    expect(SIDE_DOOR.y0).toBeGreaterThan(TERRACE.y0);
    expect(SIDE_DOOR.y1).toBeLessThan(TERRACE.y1);
    expect(TERRACE.x0).toBeLessThan(0);
    expect(TERRACE.x1).toBeGreaterThan(BUILDING_N);
    expect(TERRACE.y1).toBeGreaterThan(BUILDING_N);
  });
});

describe('заставка: временная шкала', () => {
  it('в начале машина за кадром справа, пассажиров нет, камера на 1', () => {
    const f = sceneAt(0);
    const [cx, cy] = project(f.car.x, f.car.y);
    expect(cx > VIEW.w + U || cy > VIEW.h + U, `машина в кадре: ${cx}, ${cy}`).toBe(true);
    expect(f.car.visible).toBe(true);
    expect(f.walkerOut.visible).toBe(false);
    expect(f.walkerIn.visible).toBe(false);
    expect(f.zoom).toBe(1);
    expect(f.opacity).toBe(1);
    expect(f.done).toBe(false);
  });

  it('машина подъезжает к воротам по своей полосе и стоит, пока пассажир выходит', () => {
    const arrived = sceneAt(PHASES.carIn[1]);
    expect(arrived.car.x).toBeCloseTo(GATE_X);
    expect(arrived.car.y).toBe(CAR_LANE_Y);
    const waiting = sceneAt(PHASES.exit[1]);
    expect(waiting.car.x).toBeCloseTo(GATE_X);
    expect(waiting.walkerOut.visible).toBe(true);
    const away = sceneAt(PHASES.carOut[1] + 1);
    expect(away.car.visible).toBe(false);
  });

  it('пассажир доходит до ворот снаружи, потом от ворот до входа по террасе и растворяется в арке', () => {
    const atGate = sceneAt(PHASES.walkOut[1] - 1);
    expect(atGate.walkerOut.x).toBeCloseTo(GATE_X);
    expect(atGate.walkerOut.y).toBeCloseTo(OUTSIDE_TO.y, 1);
    expect(atGate.walkerOut.walking).toBe(true);
    expect(GATE_X).toBeGreaterThan(GATE.x0);
    expect(GATE_X).toBeLessThan(GATE.x1);

    const start = sceneAt(PHASES.walkIn[0]);
    expect(start.walkerIn.visible).toBe(true);
    expect(start.walkerIn.x).toBeCloseTo(INSIDE_PATH[0][0]);
    expect(start.walkerIn.z).toBe(TERRACE_Z);
    const arrived = sceneAt(PHASES.walkIn[1] - 1);
    expect(arrived.walkerIn.x).toBeCloseTo(ENTRANCE.x, 1);
    expect(arrived.walkerIn.y).toBeCloseTo(ENTRANCE.y, 1);
    const inside = sceneAt(PHASES.enter[1] - 1);
    expect(inside.walkerIn.x).toBeCloseTo(ENTRANCE_INSIDE.x, 1);
    expect(inside.walkerIn.y).toBeCloseTo(ENTRANCE_INSIDE.y, 1);
    expect(inside.walkerIn.opacity).toBeLessThan(0.05);
    expect(inside.doorLight).toBe(1);
    expect(sceneAt(PHASES.enter[1]).walkerIn.visible).toBe(false);
  });

  it('маршрут по террасе — прямой, от ворот к входу, не заходит в здание и проходится равномерно', () => {
    for (const [x, y] of INSIDE_PATH) expect(x < 0 || x > BUILDING_N + 0.3 || y > BUILDING_N + 0.3).toBe(true);
    expect(INSIDE_PATH[0]![0]).toBeCloseTo(GATE_X);
    expect(INSIDE_PATH[INSIDE_PATH.length - 1]![0]).toBeCloseTo(GATE_X);
    expect(alongInsidePath(0)).toEqual(INSIDE_PATH[0]);
    expect(alongInsidePath(1)).toEqual(INSIDE_PATH[INSIDE_PATH.length - 1]);
    // Доля пути — это доля длины ломаной: вершины достигаются ровно на своей доле, середина отрезка — на половине.
    const lens: number[] = [];
    for (let i = 1; i < INSIDE_PATH.length; i++) {
      const [ax, ay] = INSIDE_PATH[i - 1]!;
      const [bx, by] = INSIDE_PATH[i]!;
      lens.push(Math.hypot(bx - ax, by - ay));
    }
    const total = lens.reduce((s, l) => s + l, 0);
    let acc = 0;
    for (let i = 0; i < lens.length; i++) {
      const [ax, ay] = INSIDE_PATH[i]!;
      const [bx, by] = INSIDE_PATH[i + 1]!;
      const mid = alongInsidePath((acc + lens[i]! / 2) / total);
      expect(mid[0]).toBeCloseTo((ax + bx) / 2);
      expect(mid[1]).toBeCloseTo((ay + by) / 2);
      acc += lens[i]!;
      const vertex = alongInsidePath(acc / total);
      expect(vertex[0]).toBeCloseTo(bx);
      expect(vertex[1]).toBeCloseTo(by);
    }
  });

  it('камера наезжает монотонно до ZOOM_MAX, кадр гаснет только в конце', () => {
    let last = 1;
    for (let t = 0; t <= INTRO_DURATION; t += 50) {
      const f = sceneAt(t);
      expect(f.zoom).toBeGreaterThanOrEqual(last);
      last = f.zoom;
      if (t < PHASES.fade[0]) expect(f.opacity).toBe(1);
    }
    expect(last).toBeCloseTo(ZOOM_MAX);
    const end = sceneAt(INTRO_DURATION);
    expect(end.opacity).toBe(0);
    expect(end.done).toBe(true);
    expect(sceneAt(INTRO_DURATION - 1).done).toBe(false);
  });
});

describe('заставка: ожидание для маскота', () => {
  it('без заставки колбэк вызывается сразу, с заставкой — после её конца, отмена работает', () => {
    const calls: string[] = [];
    expect(introActive()).toBe(false);
    afterIntro(() => calls.push('сразу'));
    expect(calls).toEqual(['сразу']);

    beginIntro();
    expect(introActive()).toBe(true);
    afterIntro(() => calls.push('после'));
    const off = afterIntro(() => calls.push('отменён'));
    off();
    expect(calls).toEqual(['сразу']);
    finishIntro();
    expect(introActive()).toBe(false);
    expect(calls).toEqual(['сразу', 'после']);
    finishIntro();
    expect(calls).toEqual(['сразу', 'после']);
  });

  it('если оверлей не отчитался о конце, колбэк всё равно вызывается по таймауту', () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      beginIntro();
      afterIntro(() => calls.push('таймаут'));
      vi.advanceTimersByTime(AFTER_INTRO_FALLBACK_MS - 1);
      expect(calls).toEqual([]);
      vi.advanceTimersByTime(2);
      expect(calls).toEqual(['таймаут']);
      finishIntro();
      expect(calls).toEqual(['таймаут']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('заставка: условия показа', () => {
  const storage = new Map<string, string>();
  const fakeWindow = (opts: { reduced?: boolean; search?: string } = {}) => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: !!opts.reduced }),
      location: { search: opts.search ?? '' },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    });
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    storage.clear();
  });

  it('вне браузера заставки нет', () => {
    expect(shouldPlayIntro()).toBe(false);
    expect(frozenIntroTime()).toBeNull();
  });

  it('один раз за сессию вкладки: после markIntroSeen больше не показывается', () => {
    fakeWindow();
    expect(shouldPlayIntro()).toBe(true);
    markIntroSeen();
    expect(shouldPlayIntro()).toBe(false);
  });

  it('prefers-reduced-motion отключает заставку', () => {
    fakeWindow({ reduced: true });
    expect(shouldPlayIntro()).toBe(false);
  });

  it('?intro=<мс> — стоп-кадр: показывается всегда, невалидные значения игнорируются', () => {
    fakeWindow({ search: '?intro=3400', reduced: true });
    markIntroSeen();
    expect(frozenIntroTime()).toBe(3400);
    expect(shouldPlayIntro()).toBe(true);
    for (const bad of ['?intro=abc', '?intro=-5', '?intro=', '?other=1']) {
      fakeWindow({ search: bad });
      expect(frozenIntroTime(), bad).toBeNull();
    }
  });

  it('недоступный sessionStorage не ломает показ', () => {
    fakeWindow();
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('нет доступа');
      },
      setItem: () => {
        throw new Error('нет доступа');
      },
    });
    expect(shouldPlayIntro()).toBe(true);
    expect(() => markIntroSeen()).not.toThrow();
  });
});
