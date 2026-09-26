import { AppProviders } from './providers';
import type { AppRouter } from './router';

interface AppProps {
  router: AppRouter;
}

export function App({ router }: AppProps) {
  return <AppProviders router={router} />;
}
