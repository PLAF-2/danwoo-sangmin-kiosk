import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const money = nonNegativeInteger;
const timestamp = z.iso.datetime({ offset: true });

const ownedImageExtensions = /\.(?:gif|jpe?g|png|svg|webp)$/iu;
export const ownedImagePathSchema = z.string().refine((value) => {
  if (!value.startsWith('images/') || value.includes('\\') || value.includes('\0')) return false;
  const segments = value.split('/');
  return (
    segments.length >= 2 &&
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== '.' &&
        segment !== '..' &&
        ![...segment].some((character) => character.charCodeAt(0) <= 0x1f) &&
        !/[<>:"|?*]/u.test(segment) &&
        !/[. ]$/u.test(segment),
    ) &&
    ownedImageExtensions.test(value)
  );
}, 'Unsafe image path');
const optionalOwnedImagePathSchema = z.union([z.literal(''), ownedImagePathSchema]);

export const paymentModeSchema = z.enum(['instant', 'bankQr', 'simulation']);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const saleStatusSchema = z.enum(['onSale', 'soldOut']);
export type SaleStatus = z.infer<typeof saleStatusSchema>;

export const categorySchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    isActive: z.boolean(),
    displayOrder: nonNegativeInteger,
  })
  .strict();
export type Category = z.infer<typeof categorySchema>;

export const productSpecificationSchema = z
  .object({
    label: nonEmptyString,
    value: nonEmptyString,
  })
  .strict();
export type ProductSpecification = z.infer<typeof productSpecificationSchema>;

export const productSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    price: money,
    categoryId: nonEmptyString,
    thumbnailImage: ownedImagePathSchema,
    detailImages: z.array(ownedImagePathSchema),
    description: z.string(),
    specifications: z.array(productSpecificationSchema),
    saleStatus: saleStatusSchema,
    isVisible: z.boolean(),
    displayOrder: nonNegativeInteger,
    maxQuantity: z.number().int().min(1),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export type Product = z.infer<typeof productSchema>;

export interface CatalogData {
  categories: Category[];
  products: Product[];
}

export const cartItemSchema = z
  .object({
    productId: nonEmptyString,
    quantity: z.number().int().min(1),
    capturedUnitPrice: money,
  })
  .strict();
export type CartItem = z.infer<typeof cartItemSchema>;

export const orderItemSchema = cartItemSchema
  .extend({
    name: nonEmptyString,
    thumbnailImage: ownedImagePathSchema,
  })
  .strict();
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderStatusSchema = z.enum(['processing', 'paid', 'received', 'failed']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderSchema = z
  .object({
    orderNumber: nonEmptyString,
    items: z.array(orderItemSchema).min(1),
    subtotal: money,
    discount: money,
    total: money,
    paymentMode: paymentModeSchema,
    status: orderStatusSchema,
    createdAt: timestamp,
  })
  .strict()
  .refine(
    ({ items, subtotal }) =>
      subtotal ===
      items.reduce(
        (itemTotal, { quantity, capturedUnitPrice }) =>
          itemTotal + quantity * capturedUnitPrice,
        0,
      ),
    {
      message: 'subtotal must equal the sum of item quantities and captured prices',
      path: ['subtotal'],
    },
  )
  .refine(({ subtotal, discount }) => discount <= subtotal, {
    message: 'discount must not exceed subtotal',
    path: ['discount'],
  })
  .refine(({ subtotal, discount, total }) => total === subtotal - discount, {
    message: 'total must equal subtotal minus discount',
    path: ['total'],
  });
export type Order = z.infer<typeof orderSchema>;

export const imagePositionSchema = z
  .object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  })
  .strict();
export type ImagePosition = z.infer<typeof imagePositionSchema>;

export const appSettingsSchema = z
  .object({
    welcomeBackgroundImage: optionalOwnedImagePathSchema,
    welcomeImagePosition: imagePositionSchema,
    welcomeImageScale: z.number().positive().max(5),
    welcomeLogoVisible: z.boolean(),
    welcomeMessage: nonEmptyString,
    idleTimeoutSeconds: z.number().int().min(1),
    idleWarningSeconds: z.number().int().min(1),
    completionResetSeconds: z.number().int().min(1),
  })
  .strict()
  .refine(({ idleTimeoutSeconds, idleWarningSeconds }) => idleWarningSeconds < idleTimeoutSeconds, {
    message: 'idleWarningSeconds must be less than idleTimeoutSeconds',
    path: ['idleWarningSeconds'],
  });
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const paymentSettingsSchema = z
  .object({
    mode: paymentModeSchema,
    bankName: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
    qrImage: optionalOwnedImagePathSchema,
    instructionText: nonEmptyString,
    processingSeconds: z.number().int().min(1).max(5),
    simulationResult: z.enum(['success', 'failure']),
    pickupMessage: nonEmptyString,
  })
  .strict()
  .superRefine((settings, context) => {
    if (settings.mode !== 'bankQr') return;

    for (const field of ['bankName', 'accountNumber', 'accountHolder', 'qrImage'] as const) {
      if (settings[field].trim().length === 0) {
        context.addIssue({
          code: 'custom',
          message: `${field} is required in bankQr mode`,
          path: [field],
        });
      }
    }
  });
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export interface CreateOrderInput {
  requestId: string;
  items: CartItem[];
}
