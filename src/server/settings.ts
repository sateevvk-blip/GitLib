import fs from 'node:fs';
import path from 'node:path';
import type { PublicSettings, SecretInfo, Settings, SettingsPatch } from '../shared/types.js';
import { ValidationError } from './errors.js';

const DEFAULTS: Settings = {
  githubToken: '',
  llmBaseUrl: '',
  llmModel: '',
  llmApiKey: '',
  llmTimeoutSec: 120,
};

function hintOf(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

/**
 * Настройки хранятся в data/settings.json. Переменные окружения задают значения по умолчанию;
 * непустое значение в файле имеет приоритет.
 */
export class SettingsStore {
  private stored: Partial<Settings> = {};

  constructor(
    private readonly filePath: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly dataDir: string = path.dirname(filePath),
    private readonly dbPath: string = path.join(path.dirname(filePath), 'gitlib.sqlite'),
  ) {
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      this.stored = typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      this.stored = {};
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.stored, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  private sourceOf(key: keyof Settings): 'settings' | 'env' | null {
    const v = this.stored[key];
    if (typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null) return 'settings';
    const envName = ENV_NAMES[key];
    if (envName && this.env[envName]?.trim()) return 'env';
    return null;
  }

  get(): Settings {
    const pick = <K extends keyof Settings>(key: K): Settings[K] => {
      const v = this.stored[key];
      if (typeof v === 'string' && v.trim() !== '') return v.trim() as Settings[K];
      if (typeof v === 'number' && Number.isFinite(v)) return v as Settings[K];
      const envName = ENV_NAMES[key];
      const envVal = envName ? this.env[envName]?.trim() : undefined;
      if (envVal) {
        if (typeof DEFAULTS[key] === 'number') {
          const n = Number(envVal);
          return (Number.isFinite(n) ? n : DEFAULTS[key]) as Settings[K];
        }
        return envVal as Settings[K];
      }
      return DEFAULTS[key];
    };
    return {
      githubToken: pick('githubToken'),
      llmBaseUrl: pick('llmBaseUrl').replace(/\/+$/, ''),
      llmModel: pick('llmModel'),
      llmApiKey: pick('llmApiKey'),
      llmTimeoutSec: pick('llmTimeoutSec'),
    };
  }

  isLlmConfigured(): boolean {
    const s = this.get();
    return Boolean(s.llmBaseUrl && s.llmModel);
  }

  toPublic(): PublicSettings {
    const s = this.get();
    const secret = (key: 'githubToken' | 'llmApiKey'): SecretInfo => ({
      configured: Boolean(s[key]),
      source: this.sourceOf(key),
      hint: hintOf(s[key]),
    });
    return {
      githubToken: secret('githubToken'),
      llmBaseUrl: s.llmBaseUrl,
      llmModel: s.llmModel,
      llmApiKey: secret('llmApiKey'),
      llmTimeoutSec: s.llmTimeoutSec,
      llmConfigured: this.isLlmConfigured(),
      dataDir: this.dataDir,
      dbPath: this.dbPath,
    };
  }

  update(patch: SettingsPatch): PublicSettings {
    const next: Partial<Settings> = { ...this.stored };
    if (patch.githubToken !== undefined) next.githubToken = patch.githubToken === null ? '' : String(patch.githubToken).trim();
    if (patch.llmApiKey !== undefined) next.llmApiKey = patch.llmApiKey === null ? '' : String(patch.llmApiKey).trim();
    if (patch.llmBaseUrl !== undefined) {
      const url = String(patch.llmBaseUrl).trim();
      if (url && !/^https?:\/\//i.test(url)) throw new ValidationError('Base URL должен начинаться с http:// или https://');
      next.llmBaseUrl = url.replace(/\/+$/, '');
    }
    if (patch.llmModel !== undefined) next.llmModel = String(patch.llmModel).trim();
    if (patch.llmTimeoutSec !== undefined) {
      const n = Number(patch.llmTimeoutSec);
      if (!Number.isFinite(n) || n < 5 || n > 900) throw new ValidationError('Таймаут LLM должен быть от 5 до 900 секунд');
      next.llmTimeoutSec = Math.round(n);
    }
    this.stored = next;
    this.save();
    return this.toPublic();
  }
}

const ENV_NAMES: Record<keyof Settings, string> = {
  githubToken: 'GITHUB_TOKEN',
  llmBaseUrl: 'LLM_BASE_URL',
  llmModel: 'LLM_MODEL',
  llmApiKey: 'LLM_API_KEY',
  llmTimeoutSec: 'LLM_TIMEOUT_SEC',
};
