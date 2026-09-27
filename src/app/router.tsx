import {
  Link,
  createHashRouter,
  createMemoryRouter,
  useParams,
  type RouteObject,
} from 'react-router-dom';

import { CatalogPage } from '../features/catalog/CatalogPage';

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
    element: <CatalogPage />,
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
    path: '/admin/login',
    element: <PlaceholderRoute heading="Admin login placeholder" owner="Admin thread" />,
  },
  {
    path: '/admin/products',
    element: <PlaceholderRoute heading="Admin products placeholder" owner="Admin thread" />,
  },
  {
    path: '/admin/categories',
    element: <PlaceholderRoute heading="Admin categories placeholder" owner="Admin thread" />,
  },
  {
    path: '/admin/welcome',
    element: <PlaceholderRoute heading="Admin welcome placeholder" owner="Admin thread" />,
  },
  {
    path: '/admin/payment',
    element: <PlaceholderRoute heading="Admin payment placeholder" owner="Admin thread" />,
  },
  {
    path: '/admin/system',
    element: <PlaceholderRoute heading="Admin system placeholder" owner="Admin thread" />,
  },
  { path: '*', element: <NotFoundPlaceholder /> },
];

export function createAppMemoryRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(appRoutes, { initialEntries });
}

export function createAppRouter() {
  return createHashRouter(appRoutes);
}
