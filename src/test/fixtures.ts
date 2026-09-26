import type {
  AppSettings,
  CartItem,
  CatalogData,
  Category,
  CreateOrderInput,
  Order,
  PaymentSettings,
  Product,
} from '../domain';

const fixtureTimestamp = '2026-09-26T00:00:00.000Z';

export const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'albums',
  name: '앨범',
  isActive: true,
  displayOrder: 0,
  ...overrides,
});

export const createProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'horizon-album',
  name: 'HORIZON Album',
  price: 25000,
  categoryId: 'albums',
  thumbnailImage: 'images/horizon-album.png',
  detailImages: ['images/horizon-album-detail.png'],
  description: '새로운 수평선을 담은 앨범입니다.',
  specifications: [{ label: '구성', value: 'CD, 포토북' }],
  saleStatus: 'onSale',
  isVisible: true,
  displayOrder: 0,
  maxQuantity: 5,
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
  ...overrides,
});

export const createCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  productId: 'horizon-album',
  quantity: 1,
  capturedUnitPrice: 25000,
  ...overrides,
});

export const createOrderInput = (
  overrides: Partial<CreateOrderInput> = {},
): CreateOrderInput => ({
  requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  items: [createCartItem()],
  ...overrides,
});

export const createOrder = (overrides: Partial<Order> = {}): Order => ({
  orderNumber: '20260926-0001',
  items: [
    {
      ...createCartItem(),
      name: 'HORIZON Album',
      thumbnailImage: 'images/horizon-album.png',
    },
  ],
  subtotal: 25000,
  discount: 0,
  total: 25000,
  paymentMode: 'instant',
  status: 'paid',
  createdAt: fixtureTimestamp,
  ...overrides,
});

export const createAppSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  welcomeBackgroundImage: '',
  welcomeImagePosition: { x: 50, y: 50 },
  welcomeImageScale: 1,
  welcomeLogoVisible: true,
  welcomeMessage: '새로운 수평선을 만나보세요.',
  idleTimeoutSeconds: 90,
  idleWarningSeconds: 15,
  completionResetSeconds: 20,
  ...overrides,
});

export const createPaymentSettings = (
  overrides: Partial<PaymentSettings> = {},
): PaymentSettings => ({
  mode: 'instant',
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  qrImage: '',
  instructionText: '결제 안내에 따라 진행해 주세요.',
  processingSeconds: 3,
  simulationResult: 'success',
  pickupMessage: '카운터에서 주문 번호를 보여주세요.',
  ...overrides,
});

export const createCatalogData = (overrides: Partial<CatalogData> = {}): CatalogData => ({
  categories: [createCategory()],
  products: [createProduct()],
  ...overrides,
});
