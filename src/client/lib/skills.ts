import type { SkillAudit } from '../../shared/skills';
import { plural } from './format';

export type SkillVerdict = 'fail' | 'warn' | 'pass' | 'unavailable';

/** Вердикт — худший из известных статусов (fail > warn > pass); «недоступен» — навык без данных вообще. */
export function skillVerdict(skill: SkillAudit): SkillVerdict {
  if (skill.unavailable) return 'unavailable';
  if (skill.checks.some((c) => c.status === 'fail')) return 'fail';
  if (skill.checks.some((c) => c.status === 'warn')) return 'warn';
  if (skill.checks.some((c) => c.status === 'pass')) return 'pass';
  return 'unavailable';
}

/** Неполный навык: недоступен целиком или хотя бы у одной проверки нет результата. */
export function isIncomplete(skill: SkillAudit): boolean {
  return skill.unavailable || skill.checks.some((c) => c.status === 'unknown');
}

/** Группы по вердикту; порядок внутри групп — как пришёл с сервера. */
export function groupSkills(skills: SkillAudit[]): Record<SkillVerdict, SkillAudit[]> {
  const groups: Record<SkillVerdict, SkillAudit[]> = { fail: [], warn: [], unavailable: [], pass: [] };
  for (const s of skills) groups[skillVerdict(s)].push(s);
  return groups;
}

/** «16 навыков: 1 не пройден, 4 с предупреждением, 2 недоступны, остальные пройдены» */
export function summarizeSkills(skills: SkillAudit[]): string {
  const g = groupSkills(skills);
  const parts: string[] = [];
  if (g.fail.length) parts.push(plural(g.fail.length, ['не пройден', 'не пройдено', 'не пройдено']));
  if (g.warn.length) parts.push(plural(g.warn.length, ['с предупреждением', 'с предупреждениями', 'с предупреждениями']));
  if (g.unavailable.length) parts.push(plural(g.unavailable.length, ['недоступен', 'недоступны', 'недоступны']));
  if (g.pass.length) parts.push(parts.length ? 'остальные пройдены' : skills.length === 1 ? 'пройден' : 'все пройдены');
  return `${plural(skills.length, ['навык', 'навыка', 'навыков'])}: ${parts.join(', ')}`;
}
