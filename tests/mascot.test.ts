import { describe, expect, it } from 'vitest';
import { EXPR, MOODS, MOOD_LABELS } from '../src/client/mascot/moods';
import { CHARACTERS, CHARACTER_IDS, DEFAULT_CHARACTER, isCharacterId } from '../src/client/mascot/characters';
import { isMilestone, timeGreeting } from '../src/client/mascot/store';

describe('маскот: настроения', () => {
  it('у каждого настроения есть выражение лица и русская подпись', () => {
    for (const m of MOODS) {
      expect(EXPR[m]).toBeDefined();
      expect(EXPR[m].lidL).toBeGreaterThanOrEqual(0);
      expect(EXPR[m].lidL).toBeLessThanOrEqual(1);
      expect(EXPR[m].lidR).toBeGreaterThanOrEqual(0);
      expect(EXPR[m].lidR).toBeLessThanOrEqual(1);
      expect(MOOD_LABELS[m]).toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('во сне, при смехе и в очках персонаж не моргает', () => {
    expect(EXPR.sleep.blink).toBe(false);
    expect(EXPR.laugh.blink).toBe(false);
    expect(EXPR.cool.blink).toBe(false);
    expect(EXPR.wink.blink).toBe(false);
  });
});

describe('маскот: персонажи', () => {
  it('ровно шесть персонажей из референса, у каждого — имя и свои реплики', () => {
    expect(CHARACTER_IDS).toHaveLength(6);
    for (const id of CHARACTER_IDS) {
      const ch = CHARACTERS[id];
      expect(ch.id).toBe(id);
      expect(ch.name).toMatch(/[А-Яа-яЁё]/);
      expect(ch.tagline.length).toBeGreaterThan(5);
      for (const key of ['greeting', 'tap', 'tickled', 'wake', 'cheer'] as const) {
        expect(ch.voice[key].length, `${id}.voice.${key}`).toBeGreaterThan(0);
      }
      expect(typeof ch.Component).toBe('function');
    }
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
