import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import type { DuplicateStrategy, ImportPreview } from '../../shared/types.js';
import { api, ApiError } from '../api/client';
import { useImport, useSettings, useUpdateSettings } from '../api/hooks';
import { useTheme, type ThemePreference } from '../lib/theme';
import { toast, errorMessage } from '../lib/toast';
import { plural } from '../lib/format';
import { phrases, react, setAmbient } from '../mascot/store';
import { MascotPicker } from '../mascot/MascotPicker';

type Probe = { ok: boolean; message: string } | null;

export function SettingsPage() {
  const settings = useSettings();
  const save = useUpdateSettings();
  const { preference, setTheme } = useTheme();

  const [githubToken, setGithubToken] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmTimeoutSec, setLlmTimeoutSec] = useState('120');
  const [githubProbe, setGithubProbe] = useState<Probe>(null);
  const [llmProbe, setLlmProbe] = useState<Probe>(null);
  const [probing, setProbing] = useState<'github' | 'llm' | null>(null);

  useEffect(() => {
    setAmbient('idle', null);
  }, []);

  useEffect(() => {
    if (settings.data) {
      setLlmBaseUrl(settings.data.llmBaseUrl);
      setLlmModel(settings.data.llmModel);
      setLlmTimeoutSec(String(settings.data.llmTimeoutSec));
    }
  }, [settings.data]);

  const saveGithub = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { githubToken },
      {
        onSuccess: () => {
          setGithubToken('');
          toast('success', 'Токен GitHub сохранён');
          react('wink', phrases.settingsSaved, 2500);
        },
        onError: (err) => toast('error', errorMessage(err)),
      },
    );
  };

  const saveLlm = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { llmBaseUrl, llmModel, llmTimeoutSec: Number(llmTimeoutSec), ...(llmApiKey ? { llmApiKey } : {}) },
      {
        onSuccess: () => {
          setLlmApiKey('');
          toast('success', 'Настройки LLM сохранены');
          react('wink', phrases.settingsSaved, 2500);
        },
        onError: (err) => toast('error', errorMessage(err)),
      },
    );
  };

  const probe = async (kind: 'github' | 'llm') => {
    setProbing(kind);
    try {
      const r = kind === 'github' ? await api.testGithub() : await api.testLlm();
      if (kind === 'github') setGithubProbe(r);
      else setLlmProbe(r);
      react(r.ok ? 'happy' : 'sad', r.ok ? phrases.probeOk : phrases.probeFailed, 3000);
    } catch (err) {
      const p = { ok: false, message: errorMessage(err) };
      react('sad', phrases.probeFailed, 3000);
      if (kind === 'github') setGithubProbe(p);
      else setLlmProbe(p);
    } finally {
      setProbing(null);
    }
  };

  const s = settings.data;

  return (
    <main className="page page-narrow">
      <div className="lib-head">
        <div>
          <div className="sheet-label">
            <b>Лист 03</b>
            <span>·</span>
            <span>интеграции и внешний вид</span>
          </div>
          <h1 className="display lib-title">Настройки</h1>
          <div className="lib-sub">Интеграции, данные и внешний вид. Всё хранится локально.</div>
        </div>
      </div>

      {settings.isError && <div className="error-box">{errorMessage(settings.error)}</div>}

      <div className="settings-grid">
        <section className="panel settings-section">
          <h2>GitHub</h2>
          <p className="lead">
            Без токена GitHub даёт 60 запросов в час, с токеном — 5000. Нужен токен с правами только на чтение публичных репозиториев (fine-grained, «Public repositories»).
          </p>
          <form onSubmit={saveGithub}>
            <div className="field">
              <span className="label">Personal access token</span>
              <div className="secret-row">
                <input
                  className="input"
                  type="password"
                  autoComplete="off"
                  placeholder={s?.githubToken.configured ? `сохранён: ${s.githubToken.hint} (${s.githubToken.source === 'env' ? 'из переменной окружения' : 'в настройках'})` : 'ghp_… или github_pat_…'}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={!githubToken.trim() || save.isPending}>
                  Сохранить
                </button>
                {s?.githubToken.configured && s.githubToken.source === 'settings' && (
                  <button type="button" className="btn btn-ghost" onClick={() => save.mutate({ githubToken: null }, { onSuccess: () => toast('info', 'Токен удалён') })}>
                    Очистить
                  </button>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-sm" onClick={() => void probe('github')} disabled={probing !== null}>
                {probing === 'github' && <span className="spinner" />}
                Проверить подключение
              </button>
              {githubProbe && <span className={`probe ${githubProbe.ok ? 'ok' : 'bad'}`}>{githubProbe.message}</span>}
            </div>
          </form>
        </section>

        <section className="panel settings-section">
          <h2>AI-анализ</h2>
          <p className="lead">
            Любой OpenAI-совместимый эндпоинт: OpenAI, OpenRouter, Ollama (<span className="mono">http://localhost:11434/v1</span>), LM Studio, vLLM. Для локальных серверов ключ не обязателен.
            Без настроенной LLM приложение работает как библиотека данных GitHub.
          </p>
          <form onSubmit={saveLlm}>
            <div className="form-grid">
              <div className="field field-wide">
                <span className="label">Base URL</span>
                <input className="input mono" placeholder="https://api.openai.com/v1" value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} />
                <span className="field-hint">Запросы идут на {'{Base URL}'}/chat/completions</span>
              </div>
              <div className="field">
                <span className="label">Модель</span>
                <input className="input mono" placeholder="gpt-4o-mini, qwen2.5:7b…" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
              </div>
              <div className="field">
                <span className="label">Таймаут, секунд</span>
                <input className="input mono" type="number" min={5} max={900} value={llmTimeoutSec} onChange={(e) => setLlmTimeoutSec(e.target.value)} />
              </div>
              <div className="field field-wide">
                <span className="label">API-ключ (необязательно)</span>
                <div className="secret-row">
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    placeholder={s?.llmApiKey.configured ? `сохранён: ${s.llmApiKey.hint} (${s.llmApiKey.source === 'env' ? 'из переменной окружения' : 'в настройках'})` : 'sk-…'}
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                  />
                  {s?.llmApiKey.configured && s.llmApiKey.source === 'settings' && (
                    <button type="button" className="btn btn-ghost" onClick={() => save.mutate({ llmApiKey: null }, { onSuccess: () => toast('info', 'Ключ удалён') })}>
                      Очистить
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                Сохранить
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void probe('llm')} disabled={probing !== null}>
                {probing === 'llm' && <span className="spinner" />}
                Проверить подключение
              </button>
              {llmProbe && <span className={`probe ${llmProbe.ok ? 'ok' : 'bad'}`}>{llmProbe.message}</span>}
              {s && <span className="muted" style={{ fontSize: 13 }}>{s.llmConfigured ? 'LLM настроена' : 'LLM не настроена'}</span>}
            </div>
          </form>
        </section>

        <DataSection dataDir={s?.dataDir} dbPath={s?.dbPath} />

        <section className="panel settings-section" id="mascot">
          <h2>Маскот</h2>
          <p className="lead">Напарник живёт в правом нижнем углу и комментирует происходящее. Выбор запоминается в этом браузере.</p>
          <MascotPicker />
        </section>

        <section className="panel settings-section">
          <h2>Внешний вид</h2>
          <p className="lead">Тема применяется сразу и запоминается в этом браузере.</p>
          <div className="theme-switch" role="radiogroup" aria-label="Тема">
            {(['light', 'dark', 'system'] as ThemePreference[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={preference === t} className={preference === t ? 'is-active' : ''} onClick={() => setTheme(t)}>
                {t === 'light' ? 'Светлая' : t === 'dark' ? 'Тёмная' : 'Как в системе'}
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function DataSection({ dataDir, dbPath }: { dataDir?: string; dbPath?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<DuplicateStrategy>('merge');
  const [reading, setReading] = useState(false);
  const importMutation = useImport();

  const reset = () => {
    setFileName(null);
    setPayload(null);
    setPreview(null);
    setPreviewError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setFileName(file.name);
    setReading(true);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Файл не является корректным JSON');
      }
      const p = await api.importPreview(data);
      setPayload(data);
      setPreview(p);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    if (!payload) return;
    importMutation.mutate(
      { data: payload, strategy },
      {
        onSuccess: (r) => {
          toast(
            'success',
            `Импорт завершён: добавлено ${r.added}, объединено ${r.merged}, заменено ${r.replaced}, пропущено ${r.skipped}; коллекций создано ${r.collectionsCreated}, обновлено ${r.collectionsUpdated}`,
            undefined,
            9000,
          );
          react('party', phrases.imported, 4000);
          reset();
        },
        onError: (err) => toast('error', errorMessage(err)),
      },
    );
  };

  return (
    <section className="panel settings-section">
      <h2>Данные</h2>
      <p className="lead">Вся библиотека лежит в одной папке. Резервная копия — это копия папки или экспорт в JSON.</p>
      <div className="form-grid">
        <div className="field field-wide">
          <span className="label">Папка данных</span>
          <span className="code-path">{dataDir ?? '…'}</span>
          <span className="field-hint">База: <span className="mono">{dbPath ?? '…'}</span> · аватары: <span className="mono">avatars/</span> · настройки: <span className="mono">settings.json</span></span>
        </div>
      </div>
      <hr className="divider" />
      <div className="row">
        <a className="btn" href="/api/export" download onClick={() => react('cool', phrases.exported, 3500)}>
          <Download size={16} /> Экспорт библиотеки в JSON
        </a>
        <label className="btn" style={{ cursor: 'pointer' }}>
          <Upload size={16} /> Импорт из JSON
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {reading && <span className="spinner" />}
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        Экспорт включает все записи с README, аватары, заметки, темы, статусы, избранное и коллекции. Токены и ключи в экспорт не попадают.
      </p>

      {previewError && (
        <div className="error-box" style={{ marginTop: 14 }}>
          <span>{fileName}: {previewError}</span>
          <button type="button" className="btn btn-sm" onClick={reset}>
            Закрыть
          </button>
        </div>
      )}

      {preview && (
        <div className="import-preview">
          <div className="row">
            <strong>{fileName}</strong>
            <span className="muted" style={{ fontSize: 13 }}>формат v{preview.version}{preview.exportedAt ? ` · экспорт от ${new Date(preview.exportedAt).toLocaleString('ru-RU')}` : ''}</span>
          </div>
          <div className="row">
            <span>
              <b>{preview.repos.new}</b> новых
            </span>
            <span>
              <b>{preview.repos.duplicates}</b> уже есть
            </span>
            <span>
              <b>{preview.collections.total}</b> {plural(preview.collections.total, ['коллекция', 'коллекции', 'коллекций'], false)}
              {preview.collections.existing > 0 && ` (${preview.collections.existing} совпад. по названию)`}
            </span>
          </div>
          {preview.repos.duplicates > 0 && (
            <>
              <div className="muted" style={{ fontSize: 13 }}>
                Совпадения: {preview.repos.duplicateNames.slice(0, 8).join(', ')}
                {preview.repos.duplicateNames.length > 8 && ` и ещё ${preview.repos.duplicateNames.length - 8}`}
              </div>
              <div className="radio-list" role="radiogroup" aria-label="Что делать с дубликатами">
                <label>
                  <input type="radio" name="strategy" checked={strategy === 'merge'} onChange={() => setStrategy('merge')} />
                  <span>
                    Объединить
                    <small>Заметки склеиваются, темы объединяются, избранное и статус не понижаются. Данные GitHub и AI — более свежие из двух.</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="strategy" checked={strategy === 'skip'} onChange={() => setStrategy('skip')} />
                  <span>
                    Пропустить
                    <small>Существующие записи остаются как есть, добавляются только новые.</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="strategy" checked={strategy === 'replace'} onChange={() => setStrategy('replace')} />
                  <span>
                    Заменить
                    <small>Версия из файла полностью перезапишет локальную, включая заметки. Необратимо.</small>
                  </span>
                </label>
              </div>
            </>
          )}
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={apply} disabled={importMutation.isPending}>
              {importMutation.isPending && <span className="spinner" />}
              Импортировать
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={importMutation.isPending}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
