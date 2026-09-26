import { RouterProvider } from 'react-router-dom';

import type { AppRouter } from './router';

interface AppProvidersProps {
  router: AppRouter;
}

export function AppProviders({ router }: AppProvidersProps) {
  return <RouterProvider router={router} />;
}
