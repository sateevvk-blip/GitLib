import { describe, expect, it } from 'vitest';
import { normalizeRepoInput, NormalizeError } from '../src/shared/normalize.js';

describe('normalizeRepoInput', () => {
  const cases: Array<[string, string]> = [
    ['owner/repo', 'owner/repo'],
    ['  owner/repo  ', 'owner/repo'],
    ['owner/repo/', 'owner/repo'],
    ['owner/repo.git', 'owner/repo'],
    ['https://github.com/owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo/', 'owner/repo'],
    ['https://github.com/owner/repo.git', 'owner/repo'],
    ['http://github.com/owner/repo', 'owner/repo'],
    ['https://www.github.com/owner/repo', 'owner/repo'],
    ['github.com/owner/repo', 'owner/repo'],
    ['www.github.com/owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo/tree/main/src/foo', 'owner/repo'],
    ['https://github.com/owner/repo/issues/42', 'owner/repo'],
    ['https://github.com/owner/repo?tab=readme-ov-file#install', 'owner/repo'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['ssh://git@github.com/owner/repo.git', 'owner/repo'],
    ['https://github.com/Owner-Name/Repo.Name_x', 'Owner-Name/Repo.Name_x'],
  ];

  it.each(cases)('%s → %s', (input, expected) => {
    const ref = normalizeRepoInput(input);
    expect(ref.fullName).toBe(expected);
    expect(ref.key).toBe(expected.toLowerCase());
  });

  it('ключ дедупликации не зависит от регистра', () => {
    const a = normalizeRepoInput('https://github.com/Microsoft/TypeScript');
    const b = normalizeRepoInput('microsoft/typescript');
    expect(a.key).toBe(b.key);
    expect(a.fullName).toBe('Microsoft/TypeScript');
  });

  it.each([
    '',
    '   ',
    'justaword',
    'https://gitlab.com/owner/repo',
    'https://github.com/owner',
    'https://github.com/',
    'owner/re po',
    '-owner/repo',
    'owner/..',
  ])('отклоняет «%s»', (input) => {
    expect(() => normalizeRepoInput(input)).toThrow(NormalizeError);
  });
});
