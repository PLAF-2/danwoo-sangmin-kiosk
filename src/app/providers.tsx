import { createContext, useContext } from 'react';
import { RouterProvider } from 'react-router-dom';

import type { KioskApi } from '../services/kioskApi';
import type { AppRouter } from './router';

export const KioskApiContext = createContext<KioskApi | null>(null);

export function useKioskApi(): KioskApi {
  const api = useContext(KioskApiContext) ?? window.kiosk;
  if (!api) throw new Error('Kiosk API provider is missing');
  return api;
}

interface AppProvidersProps {
  router: AppRouter;
  api?: KioskApi;
}

export function AppProviders({ router, api = window.kiosk }: AppProvidersProps) {
  return <KioskApiContext.Provider value={api}><RouterProvider router={router} /></KioskApiContext.Provider>;
}
