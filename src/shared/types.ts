/**
 * Общие типы GitLib. Используются и сервером, и клиентом.
 *
 * Запись о репозитории разделена на три независимых блока:
 *  - github   — данные, загруженные с GitHub (заменяются целиком при обновлении);
 *  - analysis — результат AI-анализа (заменяется целиком при повторном анализе);
 *  - user     — личные данные пользователя (никогда не трогаются автоматикой).
 */

export const REPO_STATUSES = ['inbox', 'try', 'using', 'parked'] as const;
export type RepoStatus = (typeof REPO_STATUSES)[number];

export const STATUS_LABELS: Record<RepoStatus, string> = {
  inbox: 'Входящие',
  try: 'Хочу попробовать',
  using: 'Использую',
  parked: 'Отложено',
};

export interface GithubData {
  description: string | null;
  htmlUrl: string;
  homepage: string | null;
  language: string | null;
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  license: string | null;
  defaultBranch: string;
  archived: boolean;
  isFork: boolean;
  pushedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  ownerLogin: string;
  ownerType: string;
  ownerAvatarUrl: string | null;
  /** README в исходном Markdown (обрезан до разумного размера). */
  readme: string | null;
  /** Когда данные получены с GitHub. */
  fetchedAt: string;
}

export type AnalysisStatus = 'none' | 'pending' | 'done' | 'failed';

export interface AnalysisData {
  status: AnalysisStatus;
  summary: string | null;
  useCases: string[];
  suggestedTopics: string[];
  model: string | null;
  generatedAt: string | null;
  error: string | null;
}

export interface UserData {
  notes: string;
  topics: string[];
  status: RepoStatus;
  favorite: boolean;
  addedAt: string;
  updatedAt: string;
}

export interface Repo {
  id: string;
  owner: string;
  name: string;
  /** owner/name в оригинальном регистре. */
  fullName: string;
  /** owner/name в нижнем регистре — ключ дедупликации. */
  key: string;
  /** Относительный путь к локально сохранённому аватару (например, "avatars/octocat.png"). */
  avatarPath: string | null;
  github: GithubData;
  analysis: AnalysisData;
  user: UserData;
}

/** Облегчённая запись для списка (без README). */
export type RepoSummary = Omit<Repo, 'github'> & {
  github: Omit<GithubData, 'readme'> & { hasReadme: boolean };
};

export interface Collection {
  id: string;
  name: string;
  description: string;
  repoIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Facets {
  topics: Array<{ value: string; count: number }>;
  languages: Array<{ value: string; count: number }>;
  statuses: Record<RepoStatus, number>;
  favorites: number;
  noAnalysis: number;
  total: number;
}

export type SortKey = 'added' | 'updated' | 'stars' | 'name' | 'pushed';

export interface LibraryQuery {
  q?: string;
  topics?: string[];
  languages?: string[];
  statuses?: RepoStatus[];
  favorite?: boolean;
  collectionId?: string;
  /** Только без AI-анализа. */
  noAnalysis?: boolean;
  sort?: SortKey;
}

export interface UserPatch {
  notes?: string;
  topics?: string[];
  status?: RepoStatus;
  favorite?: boolean;
}

/** Сообщение чата о репозитории. История живёт в браузере и целиком передаётся с каждым вопросом. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Файлы репозитория, которые модель прочитала перед ответом (только у ответов). */
  sources?: string[];
}

export interface ChatReply {
  reply: string;
  model: string;
  /** Пути файлов репозитория, попавших в контекст ответа. */
  sources: string[];
  /** Предупреждение о неполном контексте (GitHub недоступен, лимит запросов…). */
  notice: string | null;
}

/** Сколько последних сообщений истории уходит модели (вместе с новым вопросом). */
export const CHAT_HISTORY_LIMIT = 20;
/** Максимальная длина одного сообщения чата, символов. */
export const CHAT_MESSAGE_MAX_CHARS = 4000;
/** Сколько файлов репозитория модель может прочитать для одного ответа. */
export const CHAT_MAX_FILES = 8;

export interface Settings {
  githubToken: string;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  /** Таймаут запроса к LLM, секунды. */
  llmTimeoutSec: number;
}

export interface SecretInfo {
  configured: boolean;
  source: 'settings' | 'env' | null;
  hint: string;
}

/** Настройки, как их видит клиент: секреты замаскированы. */
export interface PublicSettings {
  githubToken: SecretInfo;
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: SecretInfo;
  llmTimeoutSec: number;
  llmConfigured: boolean;
  dataDir: string;
  dbPath: string;
}

export interface SettingsPatch {
  githubToken?: string | null;
  llmBaseUrl?: string;
  llmModel?: string;
  llmApiKey?: string | null;
  llmTimeoutSec?: number;
}

export const EXPORT_FORMAT = 'gitlib-library';
export const EXPORT_VERSION = 1;

export type ExportedRepo = Repo & { avatarDataUrl?: string | null };

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  app: string;
  repos: ExportedRepo[];
  collections: Collection[];
}

export type DuplicateStrategy = 'skip' | 'merge' | 'replace';

export interface ImportPreview {
  version: number;
  exportedAt: string;
  repos: { total: number; new: number; duplicates: number; duplicateNames: string[] };
  collections: { total: number; new: number; existing: number };
}

export interface ImportResult {
  added: number;
  merged: number;
  replaced: number;
  skipped: number;
  collectionsCreated: number;
  collectionsUpdated: number;
}

export interface ApiError {
  error: string;
  code?: string;
}

export interface ConnectivityStatus {
  github: { ok: boolean; message: string; remaining?: number | null; authenticated?: boolean };
  llm: { ok: boolean; message: string; configured: boolean; model?: string };
}
