import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import { AuthProvider } from './hooks/useAuth';
import './theme/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une session expirée renvoie 401 : réessayer ne ferait que retarder
      // la redirection vers l'écran de connexion.
      retry: (failureCount, error) =>
        failureCount < 1 && (error as { status?: number })?.status !== 401,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* AuthProvider dépend du client React Query (purge du cache à la
        déconnexion) : il doit donc être monté à l'intérieur. */}
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
