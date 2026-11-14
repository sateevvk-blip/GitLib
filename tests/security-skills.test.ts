import { describe, expect, it } from 'vitest';
import { fetchSkillsReport, pageLinks, parseChecks } from '../src/server/skills.js';

const page = (html: string, finalUrl = 'https://www.skills.sh/x') => ({ finalUrl, status: 200, contentType: 'text/html', html });

// Страница навыка на skills.sh показывает SKILL.md, написанный автором навыка, то есть тем, кого проверяют.
// Ссылка из его markdown с тем же href, что у бейджа аудита, не должна подменять реальный статус.
const spoofed = '<article><a href="/a/b/demo/security/socket">Socket Pass</a></article>'
  + '<aside><a href="/a/b/demo/security/socket">Socket Fail</a></aside>';

describe('security: skills.sh resource exhaustion', () => {
  // 2 МБ = config.toolPageMaxBytes. Разбор синхронный: пока он идёт, сервер не отвечает никому.
  // Без порога глубины htmlparser2 растёт квадратично (замер: ~34 с на 400 000 незакрытых <div>).
  it('parses a maximum-size deeply nested page without blocking the event loop for seconds', () => {
    const html = '<div>'.repeat(400_000);
    const started = Date.now();
    pageLinks(html);
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 120_000);
});

describe('security: skills.sh status spoofing', () => {
  it('does not report pass when an earlier author-controlled link claims pass and the real badge says fail', () => {
    expect(parseChecks(spoofed, '/a/b/demo')[1]?.status).not.toBe('pass');
  });

  it('does not report pass when the spoofed link uses the absolute bare-host form', () => {
    const html = '<a href="https://skills.sh/a/b/demo/security/socket">Socket Pass</a>'
      + '<a href="/a/b/demo/security/socket">Socket Fail</a>';
    expect(parseChecks(html, '/a/b/demo')[1]?.status).not.toBe('pass');
  });

  it('end to end: the report does not show the spoofed skill as passed', async () => {
    const pages = [page('<a href="/a/b/demo">demo</a>'), page(spoofed)];
    const report = await fetchSkillsReport('a', 'b', async () => pages.shift()!);
    expect(report.skills[0]?.checks[1]?.status).not.toBe('pass');
  });
});
