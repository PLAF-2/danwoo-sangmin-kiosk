import { AppProviders } from './providers';
import type { AppRouter } from './router';

interface AppProps {
  router: AppRouter;
  api?: KioskApi;
}

export function App({ router, api = window.kiosk }: AppProps) {
  return <AppProviders api={api} router={router} />;
}
import type { KioskApi } from '../services/kioskApi';
