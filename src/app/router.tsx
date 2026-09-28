import {
  Link,
  createHashRouter,
  createMemoryRouter,
  useParams,
  Outlet,
  type RouteObject,
} from 'react-router-dom';
import { CustomerSessionBoundary } from '../domain/session/CustomerSessionBoundary';
import { CompletionPage } from '../features/completion/CompletionPage';
import {
  AdminGuard,
  AdminLogin,
  AdminSessionProvider,
  AdminShell,
} from '../features/admin/AdminApp';
import { ProductAdmin } from '../features/admin/ProductAdmin';
import { CategoriesAdmin, PaymentAdmin, SystemAdmin, WelcomeAdmin } from '../features/admin/SettingsAdmin';

import { CatalogPage } from '../features/catalog/CatalogPage';
import { CheckoutPage } from '../features/checkout/CheckoutPage';
import { ProcessingPage } from '../features/checkout/ProcessingPage';
import { WelcomePage } from '../features/welcome/WelcomePage';

interface PlaceholderRouteProps {
  heading: string;
  owner: string;
}

export type AppRouter = ReturnType<typeof createMemoryRouter>;

function PlaceholderRoute({ heading, owner }: PlaceholderRouteProps) {
  return (
    <main aria-labelledby="route-heading">
      <h1 id="route-heading">{heading}</h1>
      <p>Future owner: {owner}</p>
    </main>
  );
}

function ProductPlaceholder() {
  const { productId } = useParams();

  return (
    <PlaceholderRoute
      heading={`Product placeholder: ${productId ?? 'unknown'}`}
      owner="Product Detail thread"
    />
  );
}

function NotFoundPlaceholder() {
  return (
    <main aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <p>This route is not part of the kiosk application.</p>
      <Link className="touch-target" to="/">
        Return to start
      </Link>
    </main>
  );
}

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <CustomerSessionBoundary />,
    children: [
      { index: true, element: <WelcomePage /> },
      { path: 'shop', element: <CatalogPage /> },
      { path: 'products/:productId', element: <ProductPlaceholder /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'processing', element: <ProcessingPage /> },
      { path: 'complete/:orderNumber', element: <CompletionPage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminSessionProvider><Outlet /></AdminSessionProvider>,
    children: [
      { path: 'login', element: <AdminLogin /> },
      {
        element: <AdminGuard />,
        children: [{
          element: <AdminShell />,
          children: [
            { path: 'products', element: <ProductAdmin /> },
            { path: 'categories', element: <CategoriesAdmin /> },
            { path: 'welcome', element: <WelcomeAdmin /> },
            { path: 'payment', element: <PaymentAdmin /> },
            { path: 'system', element: <SystemAdmin /> },
          ],
        }],
      },
    ],
  },
  { path: '*', element: <NotFoundPlaceholder /> },
];

export function createAppMemoryRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

export function createAppRouter() {
  return createHashRouter(appRoutes);
}
