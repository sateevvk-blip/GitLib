import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import type { Tool, ToolAnalysis, ToolOverrides } from '../../shared/types.js';
import { isAnalysisStale, isOverridden, toolAiField, toolDescription, toolField } from '../../shared/tools.js';
import type { FieldValue } from '../lib/editable';
import { formatDate, fullNumber } from '../lib/format';
import { EditableField } from './EditableField';

interface Props {
  tool: Tool;
  llmConfigured: boolean;
  online: boolean;
  /** Идёт запрос «Проанализировать» (до ответа сервера). */
  pending: boolean;
  onAnalyze: () => void;
  onSaveField: (field: keyof ToolOverrides, value: FieldValue) => void;
  onResetField: (field: keyof ToolOverrides) => void;
}

const FIELDS: Array<{ key: keyof ToolOverrides; label: string; kind: 'text' | 'list'; ordered?: boolean }> = [
  { key: 'summary', label: 'Сводка', kind: 'text' },
  { key: 'purpose', label: 'Назначение', kind: 'text' },
  { key: 'audience', label: 'Для кого', kind: 'text' },
  { key: 'features', label: 'Возможности', kind: 'list' },
  { key: 'useCases', label: 'Сценарии', kind: 'list', ordered: true },
  { key: 'limitations', label: 'Ограничения', kind: 'list' },
];

function basedOnText(a: ToolAnalysis): string | null {
  const b = a.basedOn;
  if (!b) return null;
  if (b.sourceStatus === 'ok') return `по тексту страницы от ${formatDate(b.sourceFetchedAt)}, ${fullNumber(b.chars)} символов`;
  if (b.sourceStatus === 'partial') return 'только по метаданным страницы — данных мало';
  if (b.sourceStatus === 'manual') return 'по вашему описанию';
  return 'без текста страницы';
}

export function ToolAnalysisPanel({ tool, llmConfigured, online, pending, onAnalyze, onSaveField, onResetField }: Props) {
  const a = tool.analysis;
  const stale = isAnalysisStale(tool);
  const running = pending || a.status === 'pending';
  const canRun = llmConfigured && online && !running;
  const runButton = (label: string) => (
    <button type="button" className="btn btn-sm" onClick={onAnalyze} disabled={!canRun} title={!llmConfigured ? 'LLM не настроена' : !online ? 'Нет сети' : undefined}>
      {running ? <span className="spinner" /> : label === 'Проанализировать' ? <Sparkles size={14} /> : <RefreshCw size={14} />}
      {label}
    </button>
  );
  const basis = a.generatedAt ? basedOnText(a) : null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          <Sparkles /> AI-сводка
        </h2>
        {a.status === 'done' && !stale && runButton('Повторить анализ')}
      </div>

      {a.status === 'done' && stale && (
        <div className="notice tool-notice">
          <span>Страница обновлена, анализ устарел. Ваши правки останутся на месте.</span>
          {runButton('Повторить анализ')}
        </div>
      )}

      {a.status === 'pending' && (
        <div className="notice tool-notice" role="status">
          <span className="spinner" />
          <span>Модель читает страницу и составляет сводку. Карточка обновится сама{a.generatedAt ? '; пока ниже прошлая версия' : ''}.</span>
        </div>
      )}

      {a.status === 'failed' && (
        <div className="error-box tool-notice" role="alert">
          <AlertTriangle size={18} />
          <span>Анализ не удался: {a.error ?? 'неизвестная ошибка'}</span>
          {runButton('Повторить')}
        </div>
      )}

      {a.status === 'none' && (
        <div className="notice tool-notice">
          <span>
            {llmConfigured ? (
              <>
                AI-анализ для этого инструмента ещё не выполнялся.
                {tool.source.status === 'manual' && !toolDescription(tool) && ' Добавьте описание, чтобы было что анализировать.'}
              </>
            ) : (
              <>
                AI-анализ отсутствует: LLM не настроена. Поля ниже можно заполнить самому. <Link to="/settings">Настроить →</Link>
              </>
            )}
          </span>
          {llmConfigured && runButton('Проанализировать')}
        </div>
      )}

      <div className="field-stack">
        {FIELDS.map((f) => (
          <EditableField
            key={f.key}
            label={f.label}
            kind={f.kind}
            ordered={f.ordered}
            value={toolField(tool, f.key) as FieldValue | null}
            aiValue={toolAiField(tool, f.key)}
            collapse={f.key === 'features' ? 5 : undefined}
            overridden={isOverridden(tool, f.key)}
            onSave={(v) => onSaveField(f.key, v)}
            onReset={() => onResetField(f.key)}
            renderItem={
              f.key === 'limitations'
                ? (item, i) => (
                    <>
                      <span>{item}</span>
                      {a.limitations[i]?.evidence && <q className="field-cite">{a.limitations[i].evidence}</q>}
                    </>
                  )
                : undefined
            }
          />
        ))}
      </div>

      {a.generatedAt && (
        <div className="ai-meta">
          модель {a.model ?? '?'} · {formatDate(a.generatedAt)}
          {basis && ` · ${basis}`}
        </div>
      )}
    </section>
  );
}
