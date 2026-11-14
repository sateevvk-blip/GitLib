import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { makeSettings, tempDataDir } from './helpers.js';

it('испорченный settings.json не теряется: копия остаётся в .bad, приложение стартует с пустыми настройками', () => {
  const dataDir = tempDataDir();
  const file = path.join(dataDir, 'settings.json');
  const broken = '{"llmApiKey": "sk-keep-me",}';
  fs.writeFileSync(file, broken);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const settings = makeSettings(dataDir);
  expect(settings.get().llmApiKey).toBe('');
  settings.update({ llmModel: 'm' });
  expect(fs.readFileSync(`${file}.bad`, 'utf8')).toBe(broken);
  expect(warn.mock.calls.join(' ')).not.toContain('sk-keep-me');
  warn.mockRestore();
});

it('без файла настроек копия .bad не создаётся', () => {
  const dataDir = tempDataDir();
  makeSettings(dataDir);
  expect(fs.existsSync(path.join(dataDir, 'settings.json.bad'))).toBe(false);
});
