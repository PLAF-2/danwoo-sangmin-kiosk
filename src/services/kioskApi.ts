import type {
  AppSettings,
  CatalogData,
  CreateOrderInput,
  Order,
  PaymentSettings,
} from '../domain';

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
