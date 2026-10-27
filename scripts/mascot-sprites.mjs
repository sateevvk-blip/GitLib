/**
 * Вырезает персонажей-стикеров из референсов `маскот/` и кладёт их в `src/client/mascot/sprites/`
 * вместе с типизированным манифестом. Запуск (sharp не входит в зависимости проекта):
 *
 *   npm i --no-save sharp@0.33.5 && node scripts/mascot-sprites.mjs
 *
 * Листы `Лимон.png`, `Кот.png`, `Банан.png`, `Баскет.png` — 3×2 позы по 512px на сером фоне;
 * Глобус и Карась берутся из исходного `aaccbfbeec00f7be2cac9b0693ab91ae.jpg` (одна поза на чёрном).
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'маскот');
const OUT = path.join(ROOT, 'src', 'client', 'mascot', 'sprites');
const POSES = ['wave', 'thumbs', 'run', 'sit', 'think', 'cheer'];
const OUT_SCALE = 0.7; // доля от исходного разрешения ячейки 512px
const PAD = 6;

const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

/** Маска фона: заливка от краёв по «серым» пикселям + замкнутые серые дыры толще 4px. */
function backgroundMask(data, w, h, { maxLum, maxSat, holeCoreRadius, holeMinLum }) {
  const isGray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (lum(r, g, b) < maxLum && sat(r, g, b) < maxSat) isGray[i] = 1;
  }
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => { if (isGray[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  const flood = () => {
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i / w) | 0;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
  };
  flood();
  // Замкнутые дыры (между рукой и телом): ядро — квадрат (2r+1)² целиком из «дырочных» пикселей,
  // заливаются только пиксели в радиусе r от ядра — так заливка не уходит по туши,
  // которая по цвету неотличима от тёмного фона.
  const r = holeCoreRadius;
  const isHole = (i) => {
    if (bg[i] || !isGray[i]) return false;
    return lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > holeMinLum;
  };
  const core = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      const i = y * w + x;
      if (!isHole(i)) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) if (!isHole(i + dy * w + dx)) { ok = false; break; }
      if (ok) core[i] = 1;
    }
  }
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      const i = y * w + x;
      if (!core[i]) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const j = i + dy * w + dx; if (isHole(j)) bg[j] = 1; }
    }
  }
  return bg;
}

/** Применяет маску: фон прозрачный, кромка со сглаживанием; возвращает bbox содержимого. */
function cutout(data, w, h, bg) {
  const out = Buffer.from(data);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) { out[i * 4 + 3] = 0; continue; }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || bg[yy * w + xx]) { edge = true; break; }
      }
      if (edge) {
        const l = lum(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        const a = Math.max(0.2, Math.min(1, (l - 110) / 110));
        out[i * 4 + 3] = Math.round(255 * a);
        // кромка — к цвету стикерной обводки, чтобы не было серого ореола
        out[i * 4] = Math.max(out[i * 4], 235); out[i * 4 + 1] = Math.max(out[i * 4 + 1], 233); out[i * 4 + 2] = Math.max(out[i * 4 + 2], 228);
      }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { out, bbox: { x0, y0, x1, y1 } };
}

async function cell(img, left, top, size) {
  const { data, info } = await img.clone().extract({ left, top, width: size, height: size }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

async function save(buf, w, h, bbox, file) {
  const cw = bbox.x1 - bbox.x0 + 1 + PAD * 2, chh = bbox.y1 - bbox.y0 + 1 + PAD * 2;
  const left = Math.max(0, bbox.x0 - PAD), top = Math.max(0, bbox.y0 - PAD);
  const width = Math.min(w - left, cw), height = Math.min(h - top, chh);
  const ow = Math.round(width * OUT_SCALE), oh = Math.round(height * OUT_SCALE);
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width, height })
    .resize(ow, oh, { kernel: 'lanczos3' })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(file);
  return { w: ow, h: oh, cellW: width, cellH: height, left, top };
}

const manifest = {};

// Четыре персонажа с листами 3×2 по 512px
for (const [id, name] of [['lemon', 'Лимон'], ['cat', 'Кот'], ['banana', 'Банан'], ['baller', 'Баскет']]) {
  const img = sharp(path.join(REF, `${name}.png`));
  await mkdir(path.join(OUT, id), { recursive: true });
  manifest[id] = { poses: {} };
  for (let k = 0; k < 6; k++) {
    const { data, w, h } = await cell(img, (k % 3) * 512, Math.floor(k / 3) * 512, 512);
    const bg = backgroundMask(data, w, h, { maxLum: 200, maxSat: 40, holeCoreRadius: 2, holeMinLum: 20 });
    const { out, bbox } = cutout(data, w, h, bg);
    const file = path.join(OUT, id, `${POSES[k]}.webp`);
    const info = await save(out, w, h, bbox, file);
    manifest[id].poses[POSES[k]] = info;
    console.log(id, POSES[k], bbox, info.w + 'x' + info.h);
  }
}

// Глобус и Карась — из исходного референса на чёрном фоне (по одной позе)
const refJpg = sharp(path.join(REF, 'aaccbfbeec00f7be2cac9b0693ab91ae.jpg'));
for (const [id, box] of [['globe', { left: 20, top: 480, width: 320, height: 360 }], ['fish', { left: 40, top: 920, width: 290, height: 310 }]]) {
  const { data, info } = await refJpg.clone().extract(box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = backgroundMask(data, info.width, info.height, { maxLum: 90, maxSat: 50, holeCoreRadius: 4, holeMinLum: -1 });
  const { out, bbox } = cutout(data, info.width, info.height, bg);
  await mkdir(path.join(OUT, id), { recursive: true });
  const file = path.join(OUT, id, 'idle.webp');
  const saved = await save(out, info.width, info.height, bbox, file);
  manifest[id] = { poses: { idle: saved } };
  console.log(id, bbox, saved.w + 'x' + saved.h);
}

const SCALE = { lemon: 0.54, cat: 0.54, banana: 0.54, baller: 0.54, globe: 0.72, fish: 0.8 };
const L = [];
L.push('// Сгенерировано scripts/mascot-sprites.mjs из референсов `маскот/`. Не править вручную.');
L.push("import type { CharacterId } from '../characters';");
L.push('');
L.push('export type Pose = ' + POSES.map((p) => `'${p}'`).join(' | ') + ';');
L.push('export interface Sprite { src: string; w: number; h: number }');
L.push('export interface SpriteSet {');
L.push('  /** Единиц viewBox на пиксель спрайта. */');
L.push('  scale: number;');
L.push("  poses: Partial<Record<Pose | 'idle', Sprite>>;");
L.push('}');
L.push('');
const entries = [];
for (const [id, set] of Object.entries(manifest)) {
  const poses = [];
  for (const [pose, info] of Object.entries(set.poses)) {
    const v = `${id}_${pose}`;
    L.push(`import ${v} from './${id}/${pose}.webp';`);
    poses.push(`    ${pose}: { src: ${v}, w: ${info.w}, h: ${info.h} },`);
  }
  entries.push(`  ${id}: {`, `    scale: ${SCALE[id]},`, '    poses: {', ...poses, '    },', '  },');
}
L.push('', 'export const SPRITES: Record<CharacterId, SpriteSet> = {', ...entries, '};', '');
await writeFile(path.join(OUT, 'manifest.ts'), L.join('\n'));
console.log('done');
