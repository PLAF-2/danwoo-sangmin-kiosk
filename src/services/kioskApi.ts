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

export interface MediaSelection {
  selectionId: string;
  kind: 'square' | 'welcome';
  previewDataUrl: string;
  width: number;
  height: number;
}

export interface SquareCropInput {
  selectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
    selectImage(kind: 'square' | 'welcome'): Promise<MediaSelection | null>;
    saveSquareCrop(input: SquareCropInput): Promise<string>;
    importSquareImage(): Promise<string | null>;
    importWelcomeImage(): Promise<string | null>;
  };
  orders: {
    /** Called after payment presentation/decision; persists a terminal result and deduplicates by requestId. */
    create(input: CreateOrderInput): Promise<Order>;
    read(orderNumber: string): Promise<Order | null>;
  };
  admin: {
    authenticate(password: string): Promise<boolean>;
    logout(): Promise<void>;
    changePassword(currentPassword: string, nextPassword: string): Promise<void>;
    exportBackup(): Promise<string | null>;
    importBackup(): Promise<void>;
  };
}
