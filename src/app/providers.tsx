import { RouterProvider, type createMemoryRouter } from 'react-router-dom';

interface AppProvidersProps {
  router: ReturnType<typeof createMemoryRouter>;
}

export function AppProviders({ router }: AppProvidersProps) {
  return <RouterProvider router={router} />;
}
