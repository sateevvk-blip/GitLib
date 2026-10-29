import { describe, expect, it } from 'vitest';
import { MOODS, MOOD_LABELS } from '../src/client/mascot/moods';
import { CHARACTERS, CHARACTER_IDS, CHARACTER_POSES, DEFAULT_CHARACTER, LEGACY_CHARACTER_IDS, POSE_FOR_MOOD, isCharacterId, spriteFor } from '../src/client/mascot/characters';
import { SPRITES } from '../src/client/mascot/sprites/manifest';
import { hold, isMilestone, peek, release, timeGreeting } from '../src/client/mascot/store';

describe('маскот: удержания по ключам', () => {
  it('снятие удержания чата не сбрасывает удержание анализа', () => {
    hold('thinking', 'Думаю над сводкой…');
    hold('thinking', 'Листаю README…', 'chat');
    expect(peek()).toMatchObject({ mood: 'thinking', message: 'Листаю README…', sticky: true });
    release('chat');
    expect(peek()).toMatchObject({ mood: 'thinking', message: 'Думаю над сводкой…', sticky: true });
    release();
    expect(peek()).toMatchObject({ mood: 'idle', sticky: false });
  });
});

describe('маскот: настроения', () => {
  it('у каждого настроения есть русская подпись и поза', () => {
    for (const m of MOODS) {
      expect(MOOD_LABELS[m]).toMatch(/[А-Яа-яЁё]/);
      expect(POSE_FOR_MOOD[m]).toBeTruthy();
    }
  });
});

describe('маскот: персонажи', () => {
  it('ровно шесть персонажей из референса, у каждого — имя, реплики и спрайт', () => {
    expect(CHARACTER_IDS).toHaveLength(6);
    for (const id of CHARACTER_IDS) {
      const ch = CHARACTERS[id];
      expect(ch.id).toBe(id);
      expect(ch.name).toMatch(/[А-Яа-яЁё]/);
      expect(ch.tagline.length).toBeGreaterThan(5);
      for (const key of ['greeting', 'tap', 'tickled', 'wake', 'cheer'] as const) {
        expect(ch.voice[key].length, `${id}.voice.${key}`).toBeGreaterThan(0);
      }
      expect(Object.keys(SPRITES[id].poses).length, `${id}: спрайты`).toBeGreaterThan(0);
      expect(SPRITES[id].scale).toBeGreaterThan(0);
    }
  });

  it('у персонажей с общим листом есть все шесть поз', () => {
    for (const id of ['lemon', 'cat', 'banana', 'baller'] as const) {
      for (const pose of ['wave', 'thumbs', 'run', 'sit', 'think', 'cheer'] as const) {
        expect(SPRITES[id].poses[pose], `${id}.${pose}`).toBeDefined();
      }
    }
    expect(spriteFor('lemon', 'wave').pose).toBe('wave');
  });

  it('каждое настроение у каждого персонажа ведёт к позе из его собственного листа', () => {
    for (const id of CHARACTER_IDS) {
      const own = CHARACTER_POSES[id];
      for (const m of MOODS) {
        if (own) {
          const cue = own[m];
          for (const pose of typeof cue === 'string' ? [cue] : cue) expect(SPRITES[id].poses[pose], `${id}.${m} → ${pose}`).toBeDefined();
        }
        const s = spriteFor(id, m);
        expect(s.frames.length).toBeGreaterThan(0);
        for (const f of s.frames) {
          expect(f.sprite.w).toBeGreaterThan(0);
          expect(f.sprite.h).toBeGreaterThan(0);
        }
      }
    }
  });

  it('у Глобуса и Карася свои позы и раскадровки', () => {
    expect(Object.keys(SPRITES.globe.poses)).toHaveLength(8);
    expect(Object.keys(SPRITES.fish.poses)).toHaveLength(6);
    expect(spriteFor('globe', 'thinking').pose).toBe('laptop');
    expect(spriteFor('globe', 'sleep').pose).toBe('yawn');
    expect(spriteFor('fish', 'search').frames.map((f) => f.pose)).toEqual(['walk', 'run']);
    expect(spriteFor('fish', 'idle').frames).toHaveLength(1);
  });

  it('реплики персонажей не повторяются между персонажами', () => {
    const seen = new Map<string, string>();
    for (const id of CHARACTER_IDS) {
      for (const line of [...CHARACTERS[id].voice.greeting, ...CHARACTERS[id].voice.tap]) {
        expect(seen.get(line), `«${line}» уже есть у ${seen.get(line)}`).toBeUndefined();
        seen.set(line, id);
      }
    }
  });

  it('персонаж по умолчанию существует, чужие идентификаторы отбрасываются', () => {
    expect(isCharacterId(DEFAULT_CHARACTER)).toBe(true);
    expect(isCharacterId('tom')).toBe(false);
    expect(isCharacterId(null)).toBe(false);
    expect(isCharacterId(42)).toBe(false);
  });

  it('старые идентификаторы «Мишки» и «Кролика» ведут к Лимону и Коту', () => {
    expect(LEGACY_CHARACTER_IDS.bear).toBe('lemon');
    expect(LEGACY_CHARACTER_IDS.rabbit).toBe('cat');
    expect(isCharacterId('bear')).toBe(false);
    for (const id of Object.values(LEGACY_CHARACTER_IDS)) expect(isCharacterId(id)).toBe(true);
  });
});

describe('маскот: события', () => {
  it('праздник только на круглых числах', () => {
    expect(isMilestone(1)).toBe(true);
    expect(isMilestone(10)).toBe(true);
    expect(isMilestone(100)).toBe(true);
    expect(isMilestone(2)).toBe(false);
    expect(isMilestone(99)).toBe(false);
  });

  it('приветствие зависит от времени суток', () => {
    expect(timeGreeting(8)).toBe('Доброе утро!');
    expect(timeGreeting(14)).toBe('Добрый день!');
    expect(timeGreeting(20)).toBe('Добрый вечер!');
    expect(timeGreeting(23)).not.toBe('Добрый вечер!');
    expect(timeGreeting(3)).not.toBe('Доброе утро!');
  });
});
