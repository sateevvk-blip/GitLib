import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Pencil,
  Quote,
  SquareCode,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react';
import { Markdown } from './Markdown';
import { applyMarkdown, continueList, toggleTask, type MarkdownAction, type TextSelection } from '../lib/markdown-edit';

interface Props {
  value: string;
  onSave: (notes: string) => Promise<unknown>;
  disabled?: boolean;
  /** Репозиторий — для относительных ссылок в заметке. */
  repoUrl: string;
  branch: string;
}

type Tool = { action: MarkdownAction; title: string; Icon: LucideIcon } | 'sep';

const TOOLS: Tool[] = [
  { action: 'bold', title: 'Жирный (Ctrl+B)', Icon: Bold },
  { action: 'italic', title: 'Курсив (Ctrl+I)', Icon: Italic },
  { action: 'strike', title: 'Зачёркнутый', Icon: Strikethrough },
  { action: 'code', title: 'Код (Ctrl+E)', Icon: Code },
  'sep',
  { action: 'heading', title: 'Заголовок', Icon: Heading2 },
  { action: 'ul', title: 'Список', Icon: List },
  { action: 'ol', title: 'Нумерованный список', Icon: ListOrdered },
  { action: 'task', title: 'Чек-лист', Icon: ListChecks },
  { action: 'quote', title: 'Цитата', Icon: Quote },
  'sep',
  { action: 'link', title: 'Ссылка (Ctrl+K)', Icon: Link2 },
  { action: 'codeblock', title: 'Блок кода', Icon: SquareCode },
];

const HOTKEYS: Record<string, MarkdownAction> = { b: 'bold', i: 'italic', e: 'code', k: 'link' };

const MIN_HEIGHT = 160;

/**
 * Заметки в Markdown: просмотр отформатированного текста, редактор с панелью
 * форматирования и автосохранение через 800 мс после последней правки.
 */
export function NotesEditor({ value, onSave, disabled, repoUrl, branch }: Props) {
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<'edit' | 'preview'>(value.trim() ? 'preview' : 'edit');
  const [state, setState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(value);
  const area = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (value !== lastSaved.current && state !== 'dirty' && state !== 'saving') {
      setDraft(value);
      lastSaved.current = value;
    }
  }, [value, state]);

  // Поле растёт по содержимому; после программной правки — ставим курсор.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(MIN_HEIGHT, el.scrollHeight + 2)}px`;
    const sel = pendingSelection.current;
    if (sel) {
      pendingSelection.current = null;
      el.focus();
      el.setSelectionRange(sel.start, sel.end);
    }
  }, [draft, mode]);

  const flush = async (text: string) => {
    if (text === lastSaved.current) {
      setState('idle');
      return;
    }
    setState('saving');
    try {
      await onSave(text);
      lastSaved.current = text;
      setState('saved');
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch {
      setState('error');
    }
  };

  const flushNow = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    void flush(text);
  };

  const change = (text: string) => {
    setDraft(text);
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(text), 800);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const edit = (next: TextSelection) => {
    change(next.text);
    pendingSelection.current = { start: next.start, end: next.end };
  };

  const run = (action: MarkdownAction) => {
    const el = area.current;
    if (!el) return;
    edit(applyMarkdown({ text: draft, start: el.selectionStart, end: el.selectionEnd }, action));
  };

  const toPreview = () => {
    flushNow(draft);
    setMode('preview');
  };

  const toEdit = () => {
    pendingSelection.current = { start: draft.length, end: draft.length };
    setMode('edit');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if ((mod && e.key === 'Enter') || e.key === 'Escape') {
      e.preventDefault();
      toPreview();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey) {
      const action = HOTKEYS[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        run(action);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const el = e.currentTarget;
      if (el.selectionStart !== el.selectionEnd) return;
      const next = continueList(draft, el.selectionStart);
      if (next) {
        e.preventDefault();
        edit(next);
      }
    }
  };

  const onPreviewClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, summary, button')) return;
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      const boxes = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
      const next = toggleTask(draft, boxes.indexOf(target));
      if (next !== draft) {
        setDraft(next);
        flushNow(next);
      }
      return;
    }
    if (window.getSelection()?.toString()) return;
    toEdit();
  };

  const label = {
    idle: '',
    dirty: 'есть несохранённые изменения…',
    saving: 'сохраняю…',
    saved: 'сохранено',
    error: 'не удалось сохранить — проверьте сервер',
  }[state];

  return (
    <div className={`notes is-${mode}`}>
      {mode === 'edit' ? (
        <>
          <div className="notes-toolbar">
            <div className="notes-tools" role="toolbar" aria-label="Форматирование">
              {TOOLS.map((tool, i) =>
                tool === 'sep' ? (
                  <span key={`sep-${i}`} className="notes-sep" aria-hidden />
                ) : (
                  <button
                    key={tool.action}
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm notes-tool"
                    title={tool.title}
                    aria-label={tool.title}
                    disabled={disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(tool.action)}
                  >
                    <tool.Icon />
                  </button>
                ),
              )}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toPreview} title="Показать отформатированный текст (Ctrl+Enter)">
              <Eye /> Просмотр
            </button>
          </div>
          <textarea
            ref={area}
            className="textarea notes-area"
            placeholder="Зачем мне этот проект, что проверить, куда применить, подводные камни… Поддерживается Markdown."
            value={draft}
            onChange={(e) => change(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => flushNow(draft)}
            disabled={disabled}
            spellCheck
          />
        </>
      ) : (
        <>
          <div className="notes-toolbar">
            <span className="notes-hint">нажмите на текст, чтобы править</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toEdit} disabled={disabled}>
              <Pencil /> Править
            </button>
          </div>
          <div
            className="notes-preview"
            tabIndex={0}
            aria-label="Заметки. Enter — править"
            onClick={onPreviewClick}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && e.key === 'Enter') toEdit();
            }}
          >
            {draft.trim() ? (
              <Markdown markdown={draft} repoUrl={repoUrl} branch={branch} breaks interactiveTasks />
            ) : (
              <p className="notes-empty">Заметок пока нет — нажмите, чтобы написать.</p>
            )}
          </div>
        </>
      )}
      <div className="notes-foot">
        <span className="notes-hint">{mode === 'edit' ? 'Markdown: **жирный**, _курсив_, `код`, - список, - [ ] задача, [ссылка](url)' : ' '}</span>
        <span className="notes-status" aria-live="polite">
          {label || ' '}
        </span>
      </div>
    </div>
  );
}
