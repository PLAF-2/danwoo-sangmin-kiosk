import type {
  AppSettings,
  CatalogData,
  CreateOrderInput,
  Order,
  PaymentSettings,
} from '../domain';
import { imageReferenceSchema, ownedImagePathSchema } from '../domain';

export function toKioskMediaUrl(storedPath: string): string {
  if (storedPath.length === 0) return '';
  const parsed = ownedImagePathSchema.safeParse(storedPath);
  if (!parsed.success) {
    if (imageReferenceSchema.safeParse(storedPath).success) return storedPath;
    throw new Error(`Unsafe kiosk media path: ${storedPath}`);
  }
  const segments = parsed.data.split('/');
  return `/images/${segments.slice(1).map(encodeURIComponent).join('/')}`;
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
    upload(file: File): Promise<string>;
  };
  orders: {
    /** Called after payment presentation/decision; persists a terminal result and deduplicates by requestId. */
    create(input: CreateOrderInput): Promise<Order>;
    read(orderNumber: string): Promise<Order | null>;
  };
  admin: {
    authenticate(password: string): Promise<boolean>;
    keepAlive(): Promise<void>;
    logout(): Promise<void>;
    changePassword(currentPassword: string, nextPassword: string): Promise<void>;
  };
}
