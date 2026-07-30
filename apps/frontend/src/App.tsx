import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { DiscoveryPage } from './pages/Discovery';
import { CalendarPage } from './pages/Calendar';
import { SettingsPage } from './pages/Settings';
import { SelectionProvider } from './hooks/useSelection';

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-3.5 shadow-md">
        <Spinner size={18} className="text-brand" />
        <span className="text-sm text-content-2">Chargement de Buzzy…</span>
      </div>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <>
      <div className="app-backdrop" aria-hidden />
      {/*
        Le routeur enveloppe TOUT, y compris l'écran de connexion : monté
        seulement après authentification, il perdait l'URL demandée à chaque
        session expirée et interdisait tout lien sur la page de connexion.
      */}
      <BrowserRouter>
        {loading ? (
          <BootScreen />
        ) : !user ? (
          <LoginPage />
        ) : (
          <SelectionProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<DiscoveryPage />} />
                <Route path="/calendrier" element={<CalendarPage />} />
                <Route path="/parametres" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </SelectionProvider>
        )}
      </BrowserRouter>
    </>
  );
}
