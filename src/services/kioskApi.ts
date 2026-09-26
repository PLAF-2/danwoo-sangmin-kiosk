import type {
  AppSettings,
  CatalogData,
  CreateOrderInput,
  Order,
  PaymentSettings,
} from '../domain';
import { ownedImagePathSchema } from '../domain';

export function toKioskMediaUrl(storedPath: string): string {
  if (storedPath.length === 0) return '';
  const parsed = ownedImagePathSchema.safeParse(storedPath);
  if (!parsed.success) {
    throw new Error(`Unsafe kiosk media path: ${storedPath}`);
  }
  const segments = parsed.data.split('/');
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
