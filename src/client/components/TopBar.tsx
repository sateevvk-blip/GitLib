import { useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Moon, Search, Sun, X } from 'lucide-react';
import { useLibraryQuery } from '../lib/libraryQuery';
import { useTheme } from '../lib/theme';
import { useOnline } from '../lib/online';
import { phrases, react } from '../mascot/store';

function WordmarkCube() {
  return (
    <svg className="wordmark-cube" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 2 7v10l10 5 10-5V7L12 2z" fill="var(--cobalt)" />
      <path d="M12 2v20M2 7l10 5 10-5" stroke="var(--paper)" strokeWidth="1.4" fill="none" />
      <path d="M7 4.5v10l5 2.5" stroke="var(--paper)" strokeWidth="1" strokeDasharray="1.5 1.5" fill="none" />
    </svg>
  );
}

export function TopBar() {
  const { query, update } = useLibraryQuery();
  const { resolved, setTheme } = useTheme();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const onLibrary = location.pathname === '/';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (!onLibrary) navigate('/');
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLibrary, navigate]);

  const setQ = (q: string) => {
    if (!onLibrary) {
      navigate(`/?q=${encodeURIComponent(q)}`);
      return;
    }
    update({ q });
    if (q.trim()) react('search', phrases.searching, 1500);
  };

  const toggleTheme = () => {
    const next = resolved === 'dark' ? 'light' : 'dark';
    setTheme(next);
    react(next === 'dark' ? 'cool' : 'surprised', next === 'dark' ? phrases.darkTheme : phrases.lightTheme, 2500);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="wordmark" aria-label="GitLib — на главную">
          <WordmarkCube />
          GitLib
          <span className="wordmark-sub" aria-hidden="true">
            <span>личная библиотека</span>
            <span>репозиториев</span>
          </span>
        </Link>
        <nav className="topnav" aria-label="Разделы">
          <NavLink to="/" end>
            Библиотека
          </NavLink>
          <NavLink to="/collections">Коллекции</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
        </nav>
      </div>

      <div className="topbar-search">
        <label className="search">
          <span className="visually-hidden">Поиск по библиотеке</span>
          <Search size={17} />
          <input
            ref={inputRef}
            type="search"
            placeholder="Найти проект: название, тема, слово из сводки или заметки…"
            value={onLibrary ? query.q ?? '' : ''}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQ('');
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {onLibrary && query.q ? (
            <button type="button" className="search-clear" aria-label="Очистить поиск" onClick={() => setQ('')}>
              <X size={15} />
            </button>
          ) : (
            <kbd aria-hidden="true">/</kbd>
          )}
        </label>
      </div>

      <div className="topbar-right">
        <span className={`net-dot ${online ? '' : 'offline'}`} title={online ? 'Есть сеть' : 'Нет сети: GitHub и AI недоступны'}>
          <i />
          <span>{online ? 'онлайн' : 'офлайн'}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-icon" onClick={toggleTheme} title={resolved === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  );
}
