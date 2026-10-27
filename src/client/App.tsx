import { Route, Routes } from 'react-router-dom';
import { TopBar } from './components/TopBar';
import { Toasts } from './components/Toasts';
import { MascotDock } from './mascot/MascotDock';
import { LibraryPage } from './pages/LibraryPage';
import { RepoPage } from './pages/RepoPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { EmptyState } from './components/EmptyState';
import { Link } from 'react-router-dom';

export function App() {
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/repo/:id" element={<RepoPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <main className="page">
              <EmptyState mood="search" title="Такой страницы нет">
                <Link to="/" className="btn">
                  В библиотеку
                </Link>
              </EmptyState>
            </main>
          }
        />
      </Routes>
      <MascotDock />
      <Toasts />
    </>
  );
}
