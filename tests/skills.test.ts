import { describe, expect, it, vi } from 'vitest';
import { FetchError } from '../src/server/errors.js';
import { fetchSkillsReport, parseChecks } from '../src/server/skills.js';

const page = (html: string, finalUrl = 'https://www.skills.sh/x') => ({ finalUrl, status: 200, contentType: 'text/html', html });
const notFound = () => new FetchError('Сайт ответил кодом 404', 'fetch_http', { status: 404 });
const loader = (...steps: unknown[]) => {
  const fn = vi.fn();
  for (const step of steps) step instanceof Error ? fn.mockRejectedValueOnce(step) : fn.mockResolvedValueOnce(step);
  return fn;
};

describe('skills.sh reports', () => {
  it('does not interpret an unrecognised or negated status as a pass', () => {
    expect(parseChecks('<a href="/a/b/demo/security/socket">SocketNotPass</a>', '/a/b/demo')[1]?.status).toBe('unknown');
  });

  it('marks the report partial when only one provider has results', async () => {
    const report = await fetchSkillsReport('a', 'b', loader(page('<a href="/a/b/demo">Demo</a>'),
      page('<a href="/a/b/demo/security/socket">SocketPass</a>')));
    expect(report.partial).toBe(true);
    expect(report.truncated).toBe(false);
  });

  it('matches canonical lowercase catalog links for mixed-case GitHub names', async () => {
    const report = await fetchSkillsReport('A', 'B', loader(page('<a href="/a/b/demo">Demo</a>'),
      page('<a href="/a/b/demo/security/socket">SocketPass</a>')));
    expect(report.skills).toHaveLength(1);
  });

  it('bounds the number of fetched skills and marks truncation', async () => {
    const load = vi.fn().mockImplementation(async (url: string) => url.endsWith('/a/b')
      ? page(Array.from({ length: 35 }, (_, i) => `<a href="/a/b/skill-${i}">skill</a>`).join(''))
      : page(`<a href="${new URL(url).pathname}/security/socket">SocketPass</a>`));
    const report = await fetchSkillsReport('a', 'b', load);
    expect(report.skills).toHaveLength(30);
    expect(report.partial).toBe(true);
    expect(report.truncated).toBe(true);
    expect(load).toHaveBeenCalledTimes(31);
  });

  it('rejects oversized responses', async () => {
    const load = vi.fn().mockRejectedValue(new FetchError('Ответ слишком большой', 'fetch_too_large'));
    await expect(fetchSkillsReport('a', 'b', load)).rejects.toMatchObject({ code: 'skills_unavailable' });
  });

  it('reads provider statuses without treating missing or pending checks as passed', () => {
    const checks = parseChecks('<a href="/a/b/demo/security/socket"><span>Socket</span><span>Pass</span></a><a href="/a/b/demo/security/snyk">Snyk Warn</a><script>Pass</script>', '/a/b/demo');
    expect(checks.map((c) => c.status)).toEqual(['unknown', 'pass', 'warn']);
    expect(parseChecks('<a href="/a/b/demo/security/socket">Socket Pending</a>', '/a/b/demo')[1]?.status).toBe('unknown');
    expect(parseChecks('<a href="/a/b/demo/security/socket">Socket Fail</a>', '/a/b/demo')[1]?.status).toBe('fail');
  });

  it('only fetches skills belonging to this repository and deduplicates links', async () => {
    const load = loader(page('<a href="/a/b/demo">Demo</a><a href="/a/b/demo">Duplicate</a><a href="https://evil.test/a/b/evil">External</a><a href="/a/other/skill">Other repo</a>'),
      page('<a href="/a/b/demo/security/socket">SocketPass</a>'));
    const report = await fetchSkillsReport('a', 'b', load);
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]?.checks[1]?.status).toBe('pass');
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.[0]).toBe('https://www.skills.sh/a/b/demo');
  });

  it('distinguishes absent repositories from service errors and changed markup', async () => {
    expect((await fetchSkillsReport('a', 'b', loader(notFound()))).skills).toEqual([]);
    await expect(fetchSkillsReport('a', 'b', loader(new FetchError('Сайт ответил кодом 429', 'fetch_http', { status: 429 }))))
      .rejects.toMatchObject({ code: 'skills_unavailable' });
    await expect(fetchSkillsReport('a', 'b', loader(page('<h1>Unexpected page</h1>')))).rejects.toThrow();
  });

  it('preserves partial results when one skill fails', async () => {
    const report = await fetchSkillsReport('a', 'b', loader(page('<a href="/a/b/one">one</a><a href="/a/b/two">two</a>'),
      page('<a href="/a/b/one/security/snyk">SnykWarn</a>'), new Error('timeout')));
    expect(report.partial).toBe(true);
    expect(report.skills[0]?.checks[2]?.status).toBe('warn');
    expect(report.skills[1]?.unavailable).toBe(true);
  });

  it('rejects unsafe imported repository paths before making a request', async () => {
    const load = vi.fn();
    await expect(fetchSkillsReport('..', 'b', load)).rejects.toThrow();
    await expect(fetchSkillsReport('a/b', 'c', load)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  it('marks remaining skills unavailable without requesting them after the deadline', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const links = Array.from({ length: 8 }, (_, i) => `<a href="/a/b/s${i}">s</a>`).join('');
      const load = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/a/b')) return page(links);
        vi.setSystemTime(30_000);
        return page(`<a href="${new URL(url).pathname}/security/socket">SocketPass</a>`);
      });
      const report = await fetchSkillsReport('a', 'b', load);
      expect(load).toHaveBeenCalledTimes(2); // главная + первый навык; время вышло, остальные не запрашивались
      expect(report.skills[0]?.unavailable).toBe(false);
      expect(report.skills.slice(1).every((s) => s.unavailable)).toBe(true);
      expect(report.partial).toBe(true);
      expect(Math.max(...load.mock.calls.map(([, o]) => o.timeoutMs))).toBeLessThanOrEqual(25_000);
    } finally { vi.useRealTimers(); }
  });

  it('ignores a duplicate link with unrecognised text', () => {
    const html = '<a href="/a/b/demo/security/socket">Details</a><a href="/a/b/demo/security/socket">SocketPass</a>';
    expect(parseChecks(html, '/a/b/demo')[1]?.status).toBe('pass');
  });

  it('marks a skill unavailable when its page is nested too deeply', async () => {
    const report = await fetchSkillsReport('a', 'b', loader(page('<a href="/a/b/demo">Demo</a>'), page('<div>'.repeat(5000))));
    expect(report.skills[0]?.unavailable).toBe(true);
    await expect(fetchSkillsReport('a', 'b', loader(page('<div>'.repeat(5000))))).rejects.toMatchObject({ code: 'skills_unavailable' });
  });

  it('rejects a redirect to another host', async () => {
    const load = loader(page('<a href="/a/b/demo">Demo</a>', 'https://evil.test/a/b'));
    await expect(fetchSkillsReport('a', 'b', load)).rejects.toMatchObject({ code: 'skills_unavailable' });
  });

  it('marks a skill unavailable when its page redirects to another host', async () => {
    const report = await fetchSkillsReport('a', 'b', loader(page('<a href="/a/b/demo">Demo</a>'),
      page('<a href="/a/b/demo/security/socket">SocketPass</a>', 'https://evil.test/a/b/demo')));
    expect(report.skills[0]?.unavailable).toBe(true);
  });
});
