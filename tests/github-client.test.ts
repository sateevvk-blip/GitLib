import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRepository } from '../src/server/github/client.js';

const repoJson = {
  name: 'r', full_name: 'o/r', owner: { login: 'o', type: 'User', avatar_url: null }, description: null,
  html_url: 'https://github.com/o/r', homepage: null, language: null, stargazers_count: 0, forks_count: 0,
  open_issues_count: 0, license: null, default_branch: 'main', archived: false, fork: false,
  pushed_at: null, created_at: null, updated_at: null,
};

const rateLimited = () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' } });

function stubFetch(readme: () => Response, languages: () => Response) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/readme')) return readme();
    if (url.endsWith('/languages')) return languages();
    return new Response(JSON.stringify(repoJson), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchRepository: лимит GitHub посреди загрузки', () => {
  it('не выдаёт «README нет», а падает с rate_limit', async () => {
    stubFetch(rateLimited, () => new Response('{}', { status: 200 }));
    await expect(fetchRepository('o', 'r', '')).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('не выдаёт пустые языки, а падает с rate_limit', async () => {
    stubFetch(() => new Response('# hi', { status: 200 }), rateLimited);
    await expect(fetchRepository('o', 'r', '')).rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('README отсутствует (404) — это null, а не ошибка', async () => {
    stubFetch(() => new Response('{}', { status: 404 }), () => new Response('{"Go":1}', { status: 200 }));
    const r = await fetchRepository('o', 'r', '');
    expect(r.github.readme).toBeNull();
    expect(r.github.languages).toEqual({ Go: 1 });
  });
});
