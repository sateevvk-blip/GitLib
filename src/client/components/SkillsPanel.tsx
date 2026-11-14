import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useOnline } from '../lib/online';
import { formatDateTime, plural } from '../lib/format';
import { groupSkills, isIncomplete, skillVerdict, summarizeSkills } from '../lib/skills';
import { hold, phrases, react, release } from '../mascot/store';
import type { SkillAudit } from '../../shared/skills';

const labels = { pass: 'Пройдена', warn: 'Предупреждение', fail: 'Не пройдена', unknown: 'Нет результата' };
const KEY = 'skills';

function SkillRow({ skill, open }: { skill: SkillAudit; open?: boolean }) {
  const v = skillVerdict(skill);
  const label = v === 'unavailable' ? (skill.unavailable ? 'Недоступен' : labels.unknown) : labels[v];
  return (
    <details className="skills-result" open={open}>
      <summary>
        <span className="skills-name">{skill.name}</span>
        <span className={`skills-status skills-status-${v === 'unavailable' ? 'unknown' : v}`}>{label}</span>
      </summary>
      {skill.unavailable ? <p className="muted">Результаты этого навыка недоступны.</p> : <ul>
        {skill.checks.map((check) => <li key={check.provider}>
          <span>{check.provider}</span>
          {check.status === 'unknown'
            ? <span className="skills-status skills-status-unknown">{labels.unknown}</span>
            : <a className={`skills-status skills-status-${check.status}`} href={check.url} target="_blank" rel="noopener noreferrer">{labels[check.status]}</a>}
        </li>)}
      </ul>}
      <a className="skills-skill-link" href={skill.url} target="_blank" rel="noopener noreferrer">Страница навыка <ExternalLink size={12} /></a>
    </details>
  );
}

export function SkillsPanel({ repoId }: { repoId: string }) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ['repo-skills', repoId],
    queryFn: () => api.getRepoSkills(repoId),
    enabled: false,
    retry: false,
  });
  useEffect(() => () => release(KEY), []);
  const check = () => {
    hold('thinking', phrases.skillsChecking, KEY);
    void query.refetch().then((r) => {
      if (r.isError) react('sad', phrases.skillsFailed, 3000);
      else react('happy', phrases.skillsChecked, 3000);
    }).finally(() => release(KEY));
  };
  const report = query.data;
  const groups = report ? groupSkills(report.skills) : null;
  const incomplete = report ? report.skills.filter(isIncomplete).length : 0;
  const notes: string[] = [];
  if (report?.truncated) notes.push('Показаны первые 30 навыков из каталога.');
  if (incomplete) notes.push(`У ${plural(incomplete, ['навыка', 'навыков', 'навыков'])} нет результата части или всех проверок.`);
  return (
    <section className="panel skills-panel" aria-busy={query.isFetching}>
      <div className="panel-head">
        <h2><ShieldCheck /> Проверка skills.sh</h2>
        <button type="button" className="btn btn-sm" disabled={!online || query.isFetching} onClick={check}>
          {query.isFetching && <span className="spinner" />}
          {query.isFetching ? 'Получаю…' : report ? 'Обновить результаты' : 'Проверить'}
        </button>
      </div>
      <p className="muted">Опубликованные результаты аудита навыков из репозитория. Проверка всего кода репозитория не выполняется.</p>
      {!online && <p className="muted">Для получения результатов нужно подключение к интернету.</p>}
      {query.isFetching && <div className="skeleton" style={{ height: 96 }} role="status" aria-label="Загружаю навыки и результаты проверок" />}
      {query.isError && (
        <div className="error-box tool-notice" role="alert">
          <span>{query.error.message}{report && ' Ниже показаны ранее загруженные результаты.'}</span>
          <button type="button" className="btn btn-sm" disabled={!online || query.isFetching} onClick={check}>Повторить</button>
        </div>
      )}
      {report && groups && <>
        <p className="muted">Получено: {formatDateTime(report.checkedAt)}</p>
        {report.skills.length === 0 && <p>Репозиторий не найден в каталоге skills.sh. Результатов проверки нет.</p>}
        {notes.length > 0 && <p className="notice">Результаты неполные. {notes.join(' ')}</p>}
        {report.skills.length > 0 && <p className="skills-summary">{summarizeSkills(report.skills)}</p>}
        <div className="skills-results">
          {groups.fail.map((s) => <SkillRow key={s.url} skill={s} open />)}
          {groups.warn.map((s) => <SkillRow key={s.url} skill={s} open />)}
          {groups.unavailable.map((s) => <SkillRow key={s.url} skill={s} />)}
          {groups.pass.length > 0 && <details className="skills-result skills-passed">
            <summary>Пройдены: {plural(groups.pass.length, ['навык', 'навыка', 'навыков'])}</summary>
            <div className="skills-results">{groups.pass.map((s) => <SkillRow key={s.url} skill={s} />)}</div>
          </details>}
        </div>
      </>}
    </section>
  );
}
