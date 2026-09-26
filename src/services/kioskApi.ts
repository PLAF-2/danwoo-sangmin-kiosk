import type {
  AppSettings,
  CatalogData,
  CreateOrderInput,
  Order,
  PaymentSettings,
} from '../domain';

export function toKioskMediaUrl(storedPath: string): string {
  if (storedPath.length === 0) return '';
  if (storedPath.includes('\\')) throw new Error(`Unsafe kiosk media path: ${storedPath}`);

  const segments = storedPath.split('/');
  if (
    segments[0] !== 'images' ||
    segments.length < 2 ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe kiosk media path: ${storedPath}`);
  }

  return `kiosk-media://images/${segments.slice(1).map(encodeURIComponent).join('/')}`;
}

export interface KioskApi {
  catalog: {
    read(): Promise<CatalogData>;
    save(input: CatalogData): Promise<void>;
  };
  settings: {
    read(): Promise<AppSettings>;
    save(input: AppSettings): Promise<void>;
    readPayment(): Promise<PaymentSettings>;
    savePayment(input: PaymentSettings): Promise<void>;
  };
  media: {
    importSquareImage(): Promise<string | null>;
    importWelcomeImage(): Promise<string | null>;
  };
  orders: {
    /** Deduplicates concurrent and immediate identical duplicate-tap requests. */
    create(input: CreateOrderInput): Promise<Order>;
    read(orderNumber: string): Promise<Order | null>;
  };
  admin: {
    authenticate(password: string): Promise<boolean>;
    changePassword(currentPassword: string, nextPassword: string): Promise<void>;
    exportBackup(): Promise<string | null>;
    importBackup(): Promise<void>;
  };
}
