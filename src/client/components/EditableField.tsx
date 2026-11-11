import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, Eye, EyeOff, Pencil, RotateCcw, X } from 'lucide-react';
import { FIELD_LIMITS, decideSave, parseListInput, sameValue, toDraft, type FieldValue } from '../lib/editable';
import { Confirm } from './Confirm';

interface Props {
  label: string;
  kind: 'text' | 'list';
  /** Показываемое значение — уже с учётом правки пользователя (toolField и др. из shared/tools). */
  value: FieldValue | null;
  /** Версия AI; null — анализа нет. */
  aiValue: FieldValue | null;
  overridden: boolean;
  disabled?: boolean;
  /** Кто автор «исходной» версии: «AI» (по умолчанию) или «страницы». */
  aiName?: string;
  /** Нумерованный список (сценарии), иначе маркированный. */
  ordered?: boolean;
  /** Сколько пунктов списка показывать до «Ещё N». */
  collapse?: number;
  onSave: (next: FieldValue) => void;
  onReset: () => void;
  /** Пункт списка с пояснением (ограничения с цитатой); для правки пользователя не вызывается. */
  renderItem?: (item: string, index: number) => ReactNode;
}

/**
 * Одно поле сводки: просмотр → правка → сравнение с версией AI. Каждое поле сохраняется само.
 * Черновик создаётся в момент входа в правку, а не из пропсов: фоновый анализ обновляет запись,
 * и текст под курсором не должен перезаписаться.
 */
export function EditableField({ label, kind, value, aiValue, overridden, disabled, aiName = 'AI', ordered, collapse, onSave, onReset, renderItem }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('');
  // Текст на момент входа в правку: «без изменений» считаем от него, а не от значения, которое мог обновить фоновый анализ.
  const [base, setBase] = useState('');
  const [expanded, setExpanded] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [compare, setCompare] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  // После закрытия правки фокус возвращается на «Править» — работа с клавиатуры не теряет место.
  useEffect(() => {
    if (mode === 'view' && restoreFocus.current) {
      restoreFocus.current = false;
      editBtn.current?.focus();
    }
  }, [mode]);

  // Узкий экран: клавиатура и поле ввода не должны оказаться за краем.
  useEffect(() => {
    if (mode === 'edit') area.current?.scrollIntoView({ block: 'center' });
  }, [mode]);

  const startEdit = () => {
    setDraft(toDraft(value));
    setBase(toDraft(value));
    setMode('edit');
  };
  const closeEdit = () => {
    restoreFocus.current = true;
    setMode('view');
  };

  const decision = decideSave(kind, draft, aiValue);
  const unchanged = kind === 'list' ? sameValue(parseListInput(draft), parseListInput(base)) : sameValue(draft, base);

  const commit = () => {
    if (!unchanged) {
      if (decision.type === 'blocked') return;
      if (decision.type === 'reset') {
        onReset();
        setCompare(false);
      } else onSave(decision.value);
    }
    closeEdit();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    }
  };

  const showValue = (v: FieldValue | null, withItems: boolean, limit?: number) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return <p className="field-empty">{overridden && v === value ? 'пунктов нет' : 'не заполнено'}</p>;
      const Tag = ordered ? 'ol' : 'ul';
      const shown = limit && !expanded && v.length > limit + 1 ? v.slice(0, limit) : v;
      return (
        <>
          <Tag className={ordered ? 'usecases' : 'field-list'}>
            {shown.map((item, i) => (
              <li key={i}>{withItems && renderItem ? renderItem(item, i) : item}</li>
            ))}
          </Tag>
          {limit && v.length > limit + 1 && (
            <button type="button" className="btn btn-ghost btn-sm field-more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
              {expanded ? 'Свернуть' : `Ещё ${v.length - limit}`}
            </button>
          )}
        </>
      );
    }
    const paragraphs = (v ?? '').split(/\n{2,}/).filter((p) => p.trim());
    if (paragraphs.length === 0) return <p className="field-empty">не заполнено</p>;
    return (
      <div className="field-text">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  };

  const hasAi = aiValue !== null;

  return (
    <div className={`field-edit${overridden ? ' is-overridden' : ''}`}>
      <div className="field-edit-head">
        <span className="label">{label}</span>
        {overridden && <span className="tag tag-user">изменено вами</span>}
        {mode === 'view' && (
          <span className="field-edit-actions">
            <button ref={editBtn} type="button" className="btn btn-ghost btn-sm" onClick={startEdit} disabled={disabled} aria-label={`Править: ${label}`}>
              <Pencil size={13} /> Править
            </button>
            {overridden && hasAi && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompare((c) => !c)} aria-expanded={compare}>
                {compare ? <EyeOff size={13} /> : <Eye size={13} />} {compare ? `Скрыть версию ${aiName}` : `Показать версию ${aiName}`}
              </button>
            )}
            {overridden && !hasAi && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)} disabled={disabled}>
                <RotateCcw size={13} /> Убрать правку
              </button>
            )}
          </span>
        )}
      </div>

      {mode === 'view' ? (
        <>
          {showValue(value, !overridden, collapse)}
          {overridden && hasAi && compare && (
            <div className="field-ai">
              <div className="field-ai-head">
                <span className="label">Версия {aiName}</span>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmReset(true)} disabled={disabled}>
                  <RotateCcw size={13} /> Вернуть версию {aiName}
                </button>
              </div>
              {showValue(aiValue, true)}
            </div>
          )}
        </>
      ) : (
        <div className="field-edit-form">
          <textarea
            ref={area}
            className="textarea field-edit-area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={kind === 'list' ? Math.min(14, Math.max(4, draft.split('\n').length + 1)) : 5}
            placeholder={kind === 'list' ? 'По одному пункту на строку' : undefined}
            aria-label={label}
            autoFocus
          />
          <div className="field-edit-foot">
            <span className="field-hint">
              {decision.type === 'blocked'
                ? decision.reason === 'long'
                  ? kind === 'list'
                    ? `Слишком длинно: не больше ${FIELD_LIMITS.items} пунктов по ${FIELD_LIMITS.item} символов.`
                    : `Слишком длинно: не больше ${FIELD_LIMITS.text} символов.`
                  : overridden
                    ? `Пустое поле не сохраняется: чтобы вернуть версию ${aiName}, отмените правку и нажмите «Вернуть версию ${aiName}».`
                    : 'Пустое поле не сохраняется — отмените правку.'
                : kind === 'list' ? 'Один пункт — одна строка. ' : null}
              {decision.type !== 'blocked' && <span className="field-keys">Ctrl+Enter — сохранить, Esc — отмена.</span>}
            </span>
            <span className="field-edit-buttons">
              <button type="button" className="btn btn-sm" onClick={closeEdit}>
                <X size={14} /> Отмена
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={commit} disabled={decision.type === 'blocked' && !unchanged}>
                <Check size={14} /> Сохранить
              </button>
            </span>
          </div>
        </div>
      )}

      {confirmReset && (
        <Confirm
          title={hasAi ? `Вернуть версию ${aiName}?` : 'Убрать правку?'}
          text={hasAi ? `Ваша правка поля «${label}» будет удалена, останется версия ${aiName}. Вернуть её не получится.` : `Ваша правка поля «${label}» будет удалена, поле останется пустым.`}
          confirmLabel={hasAi ? 'Вернуть' : 'Убрать'}
          danger
          onConfirm={() => {
            setConfirmReset(false);
            setCompare(false);
            onReset();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
