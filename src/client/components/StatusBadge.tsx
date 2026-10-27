import { REPO_STATUSES, STATUS_LABELS, type RepoStatus } from '../../shared/types.js';

export function StatusBadge({ status }: { status: RepoStatus }) {
  return (
    <span className={`status status-${status}`}>
      <i />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface SelectProps {
  value: RepoStatus;
  onChange: (s: RepoStatus) => void;
  disabled?: boolean;
}

export function StatusSelect({ value, onChange, disabled }: SelectProps) {
  return (
    <div className="status-select" role="radiogroup" aria-label="Статус изучения">
      {REPO_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          data-status={s}
          className={value === s ? 'is-active' : ''}
          disabled={disabled}
          onClick={() => onChange(s)}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
