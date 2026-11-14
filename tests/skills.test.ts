import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSkillsReport, parseChecks } from '../src/server/skills.js';

afterEach(() => vi.unstubAllGlobals());
const page = (html: string) => new Response(html, { headers: { 'content-type': 'text/html' } });

describe('skills.sh reports', () => {
  it('does not interpret an unrecognised or negated status as a pass', () => {
    expect(parseChecks('<a href="/a/b/demo/security/socket">SocketNotPass</a>', '/a/b/demo')[1]?.status).toBe('unknown');
  });

  it('marks the report partial when only one provider has results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(page('<a href="/a/b/demo">Demo</a>'))
      .mockResolvedValueOnce(page('<a href="/a/b/demo/security/socket">SocketPass</a>')));
    expect((await fetchSkillsReport('a', 'b')).partial).toBe(true);
  });

  it('matches canonical lowercase catalog links for mixed-case GitHub names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(page('<a href="/a/b/demo">Demo</a>'))
      .mockResolvedValueOnce(page('<a href="/a/b/demo/security/socket">SocketPass</a>')));
    expect((await fetchSkillsReport('A', 'B')).skills).toHaveLength(1);
  });

  it('bounds the number of fetched skills and marks truncation', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => url.endsWith('/a/b')
      ? page(Array.from({length: 35}, (_, i) => `<a href="/a/b/skill-${i}">skill</a>`).join(''))
      : page(`<a href="${new URL(url).pathname}/security/socket">SocketPass</a>`));
    vi.stubGlobal('fetch', fetcher);
    const report = await fetchSkillsReport('a', 'b');
    expect(report.skills).toHaveLength(30);
    expect(report.partial).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(31);
  });

  it('rejects oversized responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page('x'.repeat(2_000_001))));
    await expect(fetchSkillsReport('a', 'b')).rejects.toMatchObject({code: 'skills_unavailable'});
  });
  it('reads provider statuses without treating missing or pending checks as passed', () => {
    const checks = parseChecks('<a href="/a/b/demo/security/socket"><span>Socket</span><span>Pass</span></a><a href="/a/b/demo/security/snyk">Snyk Warn</a><script>Pass</script>', '/a/b/demo');
    expect(checks.map((c) => c.status)).toEqual(['unknown', 'pass', 'warn']);
    expect(parseChecks('<a href="/a/b/demo/security/socket">Socket Pending</a>', '/a/b/demo')[1]?.status).toBe('unknown');
    expect(parseChecks('<a href="/a/b/demo/security/socket">Socket Fail</a>', '/a/b/demo')[1]?.status).toBe('fail');
  });

  it('only fetches skills belonging to this repository and deduplicates links', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(page('<a href="/a/b/demo">Demo</a><a href="/a/b/demo">Duplicate</a><a href="https://evil.test/a/b/evil">External</a><a href="/a/other/skill">Other repo</a>'))
      .mockResolvedValueOnce(page('<a href="/a/b/demo/security/socket">SocketPass</a>'));
    vi.stubGlobal('fetch', fetcher);
    const report = await fetchSkillsReport('a', 'b');
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]?.checks[1]?.status).toBe('pass');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe('https://www.skills.sh/a/b/demo');
  });

  it('distinguishes absent repositories from service errors and changed markup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect((await fetchSkillsReport('a', 'b')).skills).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(fetchSkillsReport('a', 'b')).rejects.toMatchObject({ code: 'skills_unavailable' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page('<h1>Unexpected page</h1>')));
    await expect(fetchSkillsReport('a', 'b')).rejects.toThrow();
  });

  it('preserves partial results when one skill fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(page('<a href="/a/b/one">one</a><a href="/a/b/two">two</a>'))
      .mockResolvedValueOnce(page('<a href="/a/b/one/security/snyk">SnykWarn</a>'))
      .mockRejectedValueOnce(new Error('timeout')));
    const report = await fetchSkillsReport('a', 'b');
    expect(report.partial).toBe(true);
    expect(report.skills[0]?.checks[2]?.status).toBe('warn');
    expect(report.skills[1]?.unavailable).toBe(true);
  });

  it('rejects unsafe imported repository paths before making a request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchSkillsReport('..', 'b')).rejects.toThrow();
    await expect(fetchSkillsReport('a/b', 'c')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
