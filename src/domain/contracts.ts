import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);
const nonNegativeInteger = z.number().int().nonnegative();
const money = nonNegativeInteger;
const timestamp = z.iso.datetime({ offset: true });

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
    thumbnailImage: nonEmptyString,
    detailImages: z.array(nonEmptyString),
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
    thumbnailImage: nonEmptyString,
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
    welcomeBackgroundImage: z.string(),
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
    qrImage: z.string(),
    instructionText: nonEmptyString,
    processingSeconds: z.number().int().min(1).max(5),
    simulationResult: z.enum(['success', 'failure']),
    pickupMessage: nonEmptyString,
  })
  .strict();
export type PaymentSettings = z.infer<typeof paymentSettingsSchema>;

export interface CreateOrderInput {
  items: CartItem[];
  paymentMode: PaymentMode;
}
