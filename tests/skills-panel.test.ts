import { describe, expect, it } from 'vitest';
import { groupSkills, isIncomplete, skillVerdict, summarizeSkills } from '../src/client/lib/skills';
import type { SkillAudit } from '../src/shared/skills';

type Status = 'pass' | 'warn' | 'fail' | 'unknown';
const skill = (statuses: Status[], unavailable = false, name = 's'): SkillAudit => ({
  name,
  url: `https://skills.sh/o/r/${name}`,
  unavailable,
  checks: statuses.map((status, i) => ({ provider: `p${i}`, status, url: `https://skills.sh/r/${i}` })),
});

describe('skillVerdict', () => {
  it('худший известный статус: fail > warn > pass', () => {
    expect(skillVerdict(skill(['pass', 'warn', 'fail']))).toBe('fail');
    expect(skillVerdict(skill(['pass', 'warn', 'pass']))).toBe('warn');
    expect(skillVerdict(skill(['pass', 'pass', 'pass']))).toBe('pass');
  });
  it('pass + pass + unknown: вердикт pass, навык неполный', () => {
    const s = skill(['pass', 'pass', 'unknown']);
    expect(skillVerdict(s)).toBe('pass');
    expect(isIncomplete(s)).toBe(true);
  });
  it('fail + unknown: вердикт fail, навык неполный', () => {
    const s = skill(['fail', 'unknown', 'pass']);
    expect(skillVerdict(s)).toBe('fail');
    expect(isIncomplete(s)).toBe(true);
  });
  it('unavailable и навык без известных статусов недоступны', () => {
    expect(skillVerdict(skill([], true))).toBe('unavailable');
    expect(isIncomplete(skill([], true))).toBe(true);
    expect(skillVerdict(skill(['unknown', 'unknown']))).toBe('unavailable');
  });
  it('полный навык не неполный', () => {
    expect(isIncomplete(skill(['pass', 'warn', 'fail']))).toBe(false);
  });
});

describe('groupSkills', () => {
  it('раскладывает по вердиктам, сохраняя порядок', () => {
    const g = groupSkills([skill(['pass'], false, 'a'), skill(['fail'], false, 'b'), skill(['pass'], false, 'c'), skill([], true, 'd'), skill(['warn'], false, 'e')]);
    expect(g.pass.map((s) => s.name)).toEqual(['a', 'c']);
    expect(g.fail.map((s) => s.name)).toEqual(['b']);
    expect(g.unavailable.map((s) => s.name)).toEqual(['d']);
    expect(g.warn.map((s) => s.name)).toEqual(['e']);
  });
});

describe('summarizeSkills', () => {
  const many = (n: number) => Array.from({ length: n }, () => skill(['pass']));
  it('склонения навыков для 1, 2, 5, 21', () => {
    expect(summarizeSkills(many(2))).toBe('2 навыка: все пройдены');
    expect(summarizeSkills(many(5))).toBe('5 навыков: все пройдены');
    expect(summarizeSkills(many(21))).toBe('21 навык: все пройдены');
  });
  it('один навык: пройден', () => {
    expect(summarizeSkills(many(1))).toBe('1 навык: пройден');
  });
  it('смешанная сводка', () => {
    const skills = [skill(['fail']), skill(['warn']), skill(['warn']), skill([], true), skill(['pass'])];
    expect(summarizeSkills(skills)).toBe('5 навыков: 1 не пройден, 2 с предупреждениями, 1 недоступен, остальные пройдены');
  });
});
