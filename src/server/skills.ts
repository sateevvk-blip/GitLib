import { Parser } from 'htmlparser2';
import { AppError } from './errors.js';
import type { SkillAudit, SkillsReport } from '../shared/skills.js';

const ORIGIN = 'https://www.skills.sh';
const PROVIDERS = { 'agent-trust-hub': 'Gen Agent Trust Hub', socket: 'Socket', snyk: 'Snyk' };
const failure = () => new AppError('Не удалось получить результаты skills.sh. Попробуйте позже.', 502, 'skills_unavailable');

export function pageLinks(html: string): { href: string; text: string }[] {
  const links: { href: string; text: string }[] = [];
  let current: { href: string; text: string } | null = null;
  const parser = new Parser({
    onopentag(name, attrs) { if (name === 'a') current = { href: attrs.href ?? '', text: '' }; },
    ontext(text) { if (current) current.text += text; },
    onclosetag(name) { if (name === 'a' && current) { links.push(current); current = null; } },
  });
  parser.end(html);
  return links;
}

export function parseChecks(html: string, skillPath: string): SkillAudit['checks'] {
  const links = pageLinks(html);
  return Object.entries(PROVIDERS).map(([slug, provider]) => {
    const path = `${skillPath}/security/${slug}`;
    const link = links.find((l) => l.href === path || l.href === `${ORIGIN}${path}` || l.href === `https://skills.sh${path}`);
    const text = (link?.text ?? '').replace(/\s+/g, '').toLowerCase();
    const label = provider.replace(/\s+/g, '').toLowerCase();
    const status = text === `${label}pass` ? 'pass' : text === `${label}warn` ? 'warn' : text === `${label}fail` ? 'fail' : 'unknown';
    return { provider, status, url: `${ORIGIN}${path}` };
  });
}

async function readPage(path: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch(`${ORIGIN}${path}`, { signal, redirect: 'error', headers: { Accept: 'text/html' } });
  if (res.status === 404) { await res.body?.cancel(); return null; }
  if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) { await res.body?.cancel(); throw failure(); }
  const reader = res.body?.getReader();
  if (!reader) throw failure();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); throw failure(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchSkillsReport(owner: string, name: string): Promise<SkillsReport> {
  // Imported repository data must not be able to change the host or request path.
  if (![owner, name].every((part) => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')) throw failure();
  const path = `/${encodeURIComponent(owner.toLowerCase())}/${encodeURIComponent(name.toLowerCase())}`;
  const signal = AbortSignal.timeout(25_000);
  try {
    const html = await readPage(path, signal);
    const report: SkillsReport = { checkedAt: new Date().toISOString(), skills: [], partial: false };
    if (html === null) return report;
    const paths = [...new Set(pageLinks(html).map((link) => {
      try {
        const url = new URL(link.href, ORIGIN);
        if (url.origin !== ORIGIN && url.origin !== 'https://skills.sh') return '';
        const suffix = url.pathname.slice(path.length + 1);
        return url.pathname.startsWith(`${path}/`) && /^[\w.-]+$/.test(suffix) && suffix !== '.' && suffix !== '..' ? url.pathname : '';
      } catch { return ''; }
    }).filter(Boolean))];
    // A successful but unrecognised page must not be reported as a clean audit.
    if (!paths.length) throw failure();
    report.partial = paths.length > 30;
    const selected = paths.slice(0, 30);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
      while (next < selected.length) {
        const index = next++;
        const skillPath = selected[index]!;
        const skill: SkillAudit = { name: skillPath.split('/').at(-1)!, url: `${ORIGIN}${skillPath}`, checks: [], unavailable: false };
        try {
          const page = await readPage(skillPath, signal);
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
