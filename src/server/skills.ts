import { Parser } from 'htmlparser2';
import { config } from './config.js';
import { AppError, FetchError } from './errors.js';
import { fetchPage } from './tools/fetcher.js';
import type { SkillAudit, SkillsReport } from '../shared/skills.js';

const ORIGIN = 'https://www.skills.sh';
// Общий срок на весь отчёт; отдельной настройки в config нет.
const REPORT_BUDGET_MS = 25_000;
const MAX_DEPTH = 1000;
const PARSE_CHUNK = 16_384;
const PROVIDERS = { 'agent-trust-hub': 'Gen Agent Trust Hub', socket: 'Socket', snyk: 'Snyk' };
const failure = () => new AppError('Не удалось получить результаты skills.sh. Попробуйте позже.', 502, 'skills_unavailable');

function scan(html: string): { links: { href: string; text: string }[]; tooDeep: boolean } {
  const links: { href: string; text: string }[] = [];
  let current: { href: string; text: string } | null = null;
  let depth = 0;
  const parser = new Parser({
    onopentag(name, attrs) { depth++; if (name === 'a') current = { href: attrs.href ?? '', text: '' }; },
    ontext(text) { if (current) current.text += text; },
    onclosetag(name) { depth--; if (name === 'a' && current) { links.push(current); current = null; } },
  });
  // Как в tools/extract.ts: htmlparser2 разбирает глубокую вложенность за O(N²), поэтому порциями и с остановкой на пороге.
  let tooDeep = false;
  for (let i = 0; i < html.length && !tooDeep; i += PARSE_CHUNK) {
    parser.write(html.slice(i, i + PARSE_CHUNK));
    tooDeep = depth > MAX_DEPTH;
  }
  if (!tooDeep) parser.end();
  return { links, tooDeep };
}

export const pageLinks = (html: string) => scan(html).links;

export function parseChecks(html: string, skillPath: string): SkillAudit['checks'] {
  const { links: found, tooDeep } = scan(html);
  // Слишком глубокая страница не выдаётся за «чистую»: все статусы unknown.
  const links = tooDeep ? [] : found;
  return Object.entries(PROVIDERS).map(([slug, provider]) => {
    const path = `${skillPath}/security/${slug}`;
    const label = provider.replace(/\s+/g, '').toLowerCase();
    // SKILL.md автора может содержать ссылку с тем же href, поэтому смотрим все ссылки и берём худший распознанный статус.
    const found = links
      .filter((l) => l.href === path || l.href === `${ORIGIN}${path}` || l.href === `https://skills.sh${path}`)
      .map((l) => l.text.replace(/\s+/g, '').toLowerCase())
      .flatMap((text) => (['fail', 'warn', 'pass'] as const).filter((s) => text === `${label}${s}`));
    const status = (['fail', 'warn', 'pass'] as const).find((s) => found.includes(s)) ?? 'unknown';
    return { provider, status, url: `${ORIGIN}${path}` };
  });
}

export async function fetchSkillsReport(owner: string, name: string, load: typeof fetchPage = fetchPage): Promise<SkillsReport> {
  // Imported repository data must not be able to change the host or request path.
  if (![owner, name].every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')) throw failure();
  const path = `/${encodeURIComponent(owner.toLowerCase())}/${encodeURIComponent(name.toLowerCase())}`;
  const deadline = Date.now() + REPORT_BUDGET_MS;
  // null — страницы нет (404); любой другой сбой, в том числе редирект на чужой хост и исчерпанный бюджет, — исключение
  const readPage = async (pagePath: string): Promise<string | null> => {
    const left = deadline - Date.now();
    if (left <= 0) throw failure();
    try {
      const page = await load(`${ORIGIN}${pagePath}`, {
        maxBytes: config.toolPageMaxBytes,
        timeoutMs: Math.min(config.toolFetchTimeoutMs, left),
        headersTimeoutMs: config.toolFetchHeadersTimeoutMs,
      });
      if (!['https://www.skills.sh', 'https://skills.sh'].includes(new URL(page.finalUrl).origin)) throw failure();
      return page.html;
    } catch (e) {
      if (e instanceof FetchError && e.extra?.status === 404) return null;
      throw failure();
    }
  };
  try {
    const html = await readPage(path);
    const report: SkillsReport = { checkedAt: new Date().toISOString(), skills: [], partial: false, truncated: false };
    if (html === null) return report;
    const { links, tooDeep } = scan(html);
    if (tooDeep) throw failure();
    const paths = [...new Set(links.map((link) => {
      try {
        const url = new URL(link.href, ORIGIN);
        if (url.origin !== ORIGIN && url.origin !== 'https://skills.sh') return '';
        const suffix = url.pathname.slice(path.length + 1);
        return url.pathname.startsWith(`${path}/`) && /^[\w.-]+$/.test(suffix) && suffix !== '.' && suffix !== '..' ? url.pathname : '';
      } catch { return ''; }
    }).filter(Boolean))];
    // A successful but unrecognised page must not be reported as a clean audit.
    if (!paths.length) throw failure();
    report.truncated = paths.length > 30;
    report.partial = report.truncated;
    const selected = paths.slice(0, 30);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
      while (next < selected.length) {
        const index = next++;
        const skillPath = selected[index]!;
        const skill: SkillAudit = { name: skillPath.split('/').at(-1)!, url: `${ORIGIN}${skillPath}`, checks: [], unavailable: false };
        try {
          const page = await readPage(skillPath);
          if (!page) throw failure();
          skill.checks = parseChecks(page, skillPath);
          skill.unavailable = skill.checks.every((check) => check.status === 'unknown');
        } catch { skill.unavailable = true; }
        report.skills[index] = skill;
      }
    }));
    report.partial ||= report.skills.some((skill) => skill.unavailable || skill.checks.some((check) => check.status === 'unknown'));
    return report;
  } catch { throw failure(); }
}
