import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GithubData, Repo } from '../src/shared/types.js';
import { emptyAnalysis, newUserData } from '../src/shared/merge.js';
import { openDatabase } from '../src/server/db/database.js';
import { LibraryStore } from '../src/server/library/store.js';
import { SettingsStore } from '../src/server/settings.js';

export function makeGithub(overrides: Partial<GithubData> = {}): GithubData {
  return {
    description: 'A test repository',
    htmlUrl: 'https://github.com/octo/test',
    homepage: null,
    language: 'TypeScript',
    languages: { TypeScript: 1000 },
    topics: ['cli', 'tooling'],
    stars: 10,
    forks: 1,
    watchers: 2,
    openIssues: 0,
    license: 'MIT',
    defaultBranch: 'main',
    archived: false,
    isFork: false,
    pushedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ownerLogin: 'octo',
    ownerType: 'User',
    ownerAvatarUrl: null,
    readme: '# Test\n\nHello',
    fetchedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

let counter = 0;

export function makeRepo(fullName = 'octo/test', overrides: Partial<Repo> = {}): Repo {
  const [owner, name] = fullName.split('/') as [string, string];
  counter += 1;
  const now = new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString();
  return {
    id: `id-${counter}`,
    owner,
    name,
    fullName,
    key: fullName.toLowerCase(),
    avatarPath: null,
    github: makeGithub({ htmlUrl: `https://github.com/${fullName}`, ownerLogin: owner }),
    analysis: emptyAnalysis(),
    user: newUserData(now),
    ...overrides,
  };
}

export function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gitlib-test-'));
}

export function makeStore(): { store: LibraryStore; dataDir: string } {
  const dataDir = tempDataDir();
  const store = new LibraryStore(openDatabase(path.join(dataDir, 'gitlib.sqlite')));
  return { store, dataDir };
}

export function makeSettings(dataDir: string, env: NodeJS.ProcessEnv = {}): SettingsStore {
  return new SettingsStore(path.join(dataDir, 'settings.json'), env, dataDir);
}
