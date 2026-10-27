// Сгенерировано scripts/mascot-sprites.mjs из референсов `маскот/`. Не править вручную.
import type { CharacterId } from '../characters';

export type Pose = 'wave' | 'thumbs' | 'run' | 'sit' | 'think' | 'cheer';
export interface Sprite { src: string; w: number; h: number }
export interface SpriteSet {
  /** Единиц viewBox на пиксель спрайта. */
  scale: number;
  poses: Partial<Record<Pose | 'idle', Sprite>>;
}

import lemon_wave from './lemon/wave.webp';
import lemon_thumbs from './lemon/thumbs.webp';
import lemon_run from './lemon/run.webp';
import lemon_sit from './lemon/sit.webp';
import lemon_think from './lemon/think.webp';
import lemon_cheer from './lemon/cheer.webp';
import cat_wave from './cat/wave.webp';
import cat_thumbs from './cat/thumbs.webp';
import cat_run from './cat/run.webp';
import cat_sit from './cat/sit.webp';
import cat_think from './cat/think.webp';
import cat_cheer from './cat/cheer.webp';
import banana_wave from './banana/wave.webp';
import banana_thumbs from './banana/thumbs.webp';
import banana_run from './banana/run.webp';
import banana_sit from './banana/sit.webp';
import banana_think from './banana/think.webp';
import banana_cheer from './banana/cheer.webp';
import baller_wave from './baller/wave.webp';
import baller_thumbs from './baller/thumbs.webp';
import baller_run from './baller/run.webp';
import baller_sit from './baller/sit.webp';
import baller_think from './baller/think.webp';
import baller_cheer from './baller/cheer.webp';
import globe_idle from './globe/idle.webp';
import fish_idle from './fish/idle.webp';

export const SPRITES: Record<CharacterId, SpriteSet> = {
  lemon: {
    scale: 0.54,
    poses: {
    wave: { src: lemon_wave, w: 279, h: 298 },
    thumbs: { src: lemon_thumbs, w: 264, h: 297 },
    run: { src: lemon_run, w: 274, h: 293 },
    sit: { src: lemon_sit, w: 275, h: 292 },
    think: { src: lemon_think, w: 216, h: 308 },
    cheer: { src: lemon_cheer, w: 302, h: 284 },
    },
  },
  cat: {
    scale: 0.54,
    poses: {
    wave: { src: cat_wave, w: 255, h: 324 },
    thumbs: { src: cat_thumbs, w: 235, h: 323 },
    run: { src: cat_run, w: 267, h: 328 },
    sit: { src: cat_sit, w: 252, h: 322 },
    think: { src: cat_think, w: 212, h: 328 },
    cheer: { src: cat_cheer, w: 245, h: 304 },
    },
  },
  banana: {
    scale: 0.54,
    poses: {
    wave: { src: banana_wave, w: 239, h: 306 },
    thumbs: { src: banana_thumbs, w: 250, h: 306 },
    run: { src: banana_run, w: 274, h: 305 },
    sit: { src: banana_sit, w: 288, h: 284 },
    think: { src: banana_think, w: 195, h: 314 },
    cheer: { src: banana_cheer, w: 260, h: 306 },
    },
  },
  baller: {
    scale: 0.54,
    poses: {
    wave: { src: baller_wave, w: 251, h: 312 },
    thumbs: { src: baller_thumbs, w: 239, h: 309 },
    run: { src: baller_run, w: 289, h: 329 },
    sit: { src: baller_sit, w: 309, h: 265 },
    think: { src: baller_think, w: 204, h: 311 },
    cheer: { src: baller_cheer, w: 167, h: 336 },
    },
  },
  globe: {
    scale: 0.72,
    poses: {
    idle: { src: globe_idle, w: 205, h: 221 },
    },
  },
  fish: {
    scale: 0.8,
    poses: {
    idle: { src: fish_idle, w: 168, h: 169 },
    },
  },
};
