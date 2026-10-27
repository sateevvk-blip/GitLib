import { describe, expect, it } from 'vitest';
import { MOODS, MOOD_LABELS } from '../src/client/mascot/moods';
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, LEGACY_CHARACTER_IDS, POSE_FOR_MOOD, isCharacterId, spriteFor } from '../src/client/mascot/characters';
import { SPRITES } from '../src/client/mascot/sprites/manifest';
import { isMilestone, timeGreeting } from '../src/client/mascot/store';

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

  it('у персонажей с листом поз есть все шесть поз, у остальных — запасная на любое настроение', () => {
    for (const id of ['lemon', 'cat', 'banana', 'baller'] as const) {
      for (const pose of ['wave', 'thumbs', 'run', 'sit', 'think', 'cheer'] as const) {
        expect(SPRITES[id].poses[pose], `${id}.${pose}`).toBeDefined();
      }
    }
    for (const id of CHARACTER_IDS) {
      for (const m of MOODS) {
        const s = spriteFor(id, m);
        expect(s.sprite.w).toBeGreaterThan(0);
        expect(s.sprite.h).toBeGreaterThan(0);
      }
    }
    expect(spriteFor('globe', 'wave').pose).toBe('idle');
    expect(spriteFor('lemon', 'wave').pose).toBe('wave');
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
