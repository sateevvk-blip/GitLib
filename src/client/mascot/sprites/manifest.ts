// Сгенерировано scripts/mascot-sprites.mjs из референсов `маскот/`. Не править вручную.
import type { CharacterId } from '../characters';

export type Pose = 'wave' | 'thumbs' | 'run' | 'sit' | 'think' | 'cheer' | 'walk' | 'hop' | 'kick' | 'stand' | 'laptop' | 'yawn' | 'coffee' | 'facepalm' | 'shrug' | 'crossed';
export interface Sprite { src: string; w: number; h: number }
export interface SpriteSet {
  /** Единиц viewBox на пиксель спрайта. */
  scale: number;
  poses: Partial<Record<Pose, Sprite>>;
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
import fish_walk from './fish/walk.webp';
import fish_run from './fish/run.webp';
import fish_hop from './fish/hop.webp';
import fish_sit from './fish/sit.webp';
import fish_kick from './fish/kick.webp';
import fish_stand from './fish/stand.webp';
import globe_laptop from './globe/laptop.webp';
import globe_yawn from './globe/yawn.webp';
import globe_coffee from './globe/coffee.webp';
import globe_facepalm from './globe/facepalm.webp';
import globe_shrug from './globe/shrug.webp';
import globe_run from './globe/run.webp';
import globe_thumbs from './globe/thumbs.webp';
import globe_crossed from './globe/crossed.webp';

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
  fish: {
    scale: 0.52,
    poses: {
    walk: { src: fish_walk, w: 276, h: 281 },
    run: { src: fish_run, w: 281, h: 294 },
    hop: { src: fish_hop, w: 244, h: 314 },
    sit: { src: fish_sit, w: 308, h: 239 },
    kick: { src: fish_kick, w: 290, h: 298 },
    stand: { src: fish_stand, w: 208, h: 306 },
    },
  },
  globe: {
    scale: 0.52,
    poses: {
    laptop: { src: globe_laptop, w: 301, h: 235 },
    yawn: { src: globe_yawn, w: 228, h: 295 },
    coffee: { src: globe_coffee, w: 256, h: 275 },
    facepalm: { src: globe_facepalm, w: 176, h: 318 },
    shrug: { src: globe_shrug, w: 266, h: 302 },
    run: { src: globe_run, w: 256, h: 298 },
    thumbs: { src: globe_thumbs, w: 214, h: 313 },
    crossed: { src: globe_crossed, w: 182, h: 321 },
    },
  },
};
