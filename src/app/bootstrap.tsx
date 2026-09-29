import { StrictMode, type ReactElement } from 'react';
import type { KioskApi } from '../services/kioskApi';

import { App } from './App';
import { createAppRouter, type AppRouter } from './router';

type AppRouterFactory = () => AppRouter;

export interface AppRuntime {
  router: AppRouter;
  element: ReactElement;
}

export function createAppRuntime(createRouter: AppRouterFactory = createAppRouter, api: KioskApi = window.kiosk): AppRuntime {
  const router = createRouter();

  return {
    router,
    element: (
      <StrictMode>
        <App api={api} router={router} />
      </StrictMode>
    ),
  };
}
