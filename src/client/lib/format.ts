const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('ru-RU');
const rtf = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function compactNumber(n: number): string {
  return n < 1000 ? full.format(n) : compact.format(n);
}

export function fullNumber(n: number): string {
  return full.format(n);
}

export function relativeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d);
}

/** plural(3, ['проект', 'проекта', 'проектов']) → «3 проекта» */
export function plural(n: number, forms: [string, string, string], withNumber = true): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  let form: string;
  if (abs > 10 && abs < 20) form = forms[2];
  else if (last > 1 && last < 5) form = forms[1];
  else if (last === 1) form = forms[0];
  else form = forms[2];
  return withNumber ? `${full.format(n)} ${form}` : form;
}

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#E8C547',
  TypeScript: '#3178C6',
  Python: '#3572A5',
  Rust: '#DEA584',
  Go: '#00ADD8',
  Java: '#B07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'C#': '#178600',
  'C++': '#F34B7D',
  C: '#555555',
  Ruby: '#CC342D',
  PHP: '#4F5D95',
  Shell: '#89E051',
  HTML: '#E34C26',
  CSS: '#563D7C',
  Dart: '#00B4AB',
  Scala: '#C22D40',
  Elixir: '#6E4A7E',
  Haskell: '#5E5086',
  Lua: '#000080',
  Zig: '#EC915C',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  'Jupyter Notebook': '#DA5B0B',
  Dockerfile: '#384D54',
  'Objective-C': '#438EFF',
  R: '#198CE7',
  Nix: '#7E7EFF',
};

export function languageColor(lang: string | null): string {
  if (!lang) return 'var(--line-strong)';
  const known = LANGUAGE_COLORS[lang];
  if (known) return known;
  let h = 0;
  for (const ch of lang) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 55%)`;
}
