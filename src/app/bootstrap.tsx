import { StrictMode, type ReactElement } from 'react';

import { App } from './App';
import { createAppRouter, type AppRouter } from './router';

type AppRouterFactory = () => AppRouter;

export interface AppRuntime {
  router: AppRouter;
  element: ReactElement;
}

export function createAppRuntime(createRouter: AppRouterFactory = createAppRouter): AppRuntime {
  const router = createRouter();

  return {
    router,
    element: (
      <StrictMode>
        <App router={router} />
      </StrictMode>
    ),
  };
}
