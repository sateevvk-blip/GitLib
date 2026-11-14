import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useOnline } from '../lib/online';
import { formatDateTime } from '../lib/format';

const labels = { pass: 'Пройдена', warn: 'Предупреждение', fail: 'Не пройдена', unknown: 'Нет результата' };

export function SkillsPanel({ repoId }: { repoId: string }) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ['repo-skills', repoId],
    queryFn: () => api.getRepoSkills(repoId),
    enabled: false,
    retry: false,
  });
  return (
    <section className="panel" id="skills-check" aria-busy={query.isFetching}>
      <div className="panel-head">
        <h2><ShieldCheck /> Проверка skills.sh</h2>
        <button type="button" className="btn btn-sm" disabled={!online || query.isFetching} onClick={() => void query.refetch()}>
          {query.isFetching && <span className="spinner" />}
          {query.isFetching ? 'Получаю…' : query.data ? 'Обновить результаты' : 'Проверить'}
        </button>
      </div>
      <p className="muted">Опубликованные результаты аудита навыков из репозитория. Проверка всего кода репозитория не выполняется.</p>
      {!online && <p className="muted">Для получения результатов нужно подключение к интернету.</p>}
      {query.isFetching && <p role="status">Загружаю навыки и результаты проверок…</p>}
      {query.isError && <p className="error-box" role="alert">{query.error.message}{query.data && ' Ниже показаны ранее загруженные результаты.'}</p>}
      {query.data && <>
        <p className="muted">Получено: {formatDateTime(query.data.checkedAt)}</p>
        {query.data.skills.length === 0 && <p>Репозиторий не найден в каталоге skills.sh. Результатов проверки нет.</p>}
        {query.data.partial && <p className="notice">Результаты неполные: часть данных недоступна или достигнут лимит в 30 навыков.</p>}
        <div className="skills-results">
          {query.data.skills.map((skill) => <div className="skills-result" key={skill.url}>
            <a href={skill.url} target="_blank" rel="noopener noreferrer">{skill.name} <ExternalLink size={12} /></a>
            {skill.unavailable ? <p className="muted">Результаты этого навыка недоступны.</p> : <ul>
              {skill.checks.map((check) => <li key={check.provider}>
                <span>{check.provider}</span>
                <span className={`skills-status skills-status-${check.status}`}>{labels[check.status]}</span>
              </li>)}
            </ul>}
          </div>)}
        </div>
      </>}
    </section>
  );
}
