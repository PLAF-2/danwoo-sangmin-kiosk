import {
  Link,
  createHashRouter,
  createMemoryRouter,
  useParams,
  Outlet,
  type RouteObject,
} from 'react-router-dom';
import {
  AdminGuard,
  AdminLogin,
  AdminSessionProvider,
  AdminShell,
} from '../features/admin/AdminApp';
import { ProductAdmin } from '../features/admin/ProductAdmin';
import { CategoriesAdmin, PaymentAdmin, SystemAdmin, WelcomeAdmin } from '../features/admin/SettingsAdmin';

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

function CompletePlaceholder() {
  const { orderNumber } = useParams();

  return (
    <PlaceholderRoute
      heading={`Order complete placeholder: ${orderNumber ?? 'unknown'}`}
      owner="Completion & Session thread"
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
    element: <PlaceholderRoute heading="HIGHEST Kiosk" owner="Welcome & Shell thread" />,
  },
  {
    path: '/shop',
    element: <PlaceholderRoute heading="Shop placeholder" owner="Catalog & Cart thread" />,
  },
  { path: '/products/:productId', element: <ProductPlaceholder /> },
  {
    path: '/checkout',
    element: <PlaceholderRoute heading="Checkout placeholder" owner="Checkout & Payment thread" />,
  },
  {
    path: '/processing',
    element: <PlaceholderRoute heading="Processing placeholder" owner="Checkout & Payment thread" />,
  },
  { path: '/complete/:orderNumber', element: <CompletePlaceholder /> },
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
