import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { Background, Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { DiscoveryPage } from './pages/Discovery';
import { CalendarPage } from './pages/Calendar';
import { SettingsPage } from './pages/Settings';
import { SelectionProvider } from './hooks/useSelection';

export function App() {
  const { user, loading } = useAuth();

  return (
    <>
      <Background />
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="glass-strong rounded-2xl px-6 py-4 flex items-center gap-3">
            <Spinner className="h-6 w-6" />
            <span>Chargement de Buzzy…</span>
          </div>
        </div>
      ) : !user ? (
        <LoginPage />
      ) : (
        <SelectionProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<DiscoveryPage />} />
                <Route path="/calendrier" element={<CalendarPage />} />
                <Route path="/parametres" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </SelectionProvider>
      )}
    </>
  );
}
