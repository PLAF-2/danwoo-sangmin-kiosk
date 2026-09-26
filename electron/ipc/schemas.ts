import { z } from 'zod';

import {
  appSettingsSchema,
  cartItemSchema,
  categorySchema,
  paymentSettingsSchema,
  productSchema,
} from '../../src/domain';

export const catalogDataSchema = z
  .object({
    categories: z.array(categorySchema),
    products: z.array(productSchema),
  })
  .strict()
  .superRefine(({ categories, products }, context) => {
    const categoryIds = new Set<string>();
    for (const [index, category] of categories.entries()) {
      if (categoryIds.has(category.id)) {
        context.addIssue({ code: 'custom', path: ['categories', index, 'id'], message: 'duplicate id' });
      }
      categoryIds.add(category.id);
    }

    const productIds = new Set<string>();
    for (const [index, product] of products.entries()) {
      if (productIds.has(product.id)) {
        context.addIssue({ code: 'custom', path: ['products', index, 'id'], message: 'duplicate id' });
      }
      if (!categoryIds.has(product.categoryId)) {
        context.addIssue({
          code: 'custom',
          path: ['products', index, 'categoryId'],
          message: 'unknown category',
        });
      }
      productIds.add(product.id);
    }
  });

export const createOrderInputSchema = z
  .object({
    requestId: z.uuid(),
    items: z.array(cartItemSchema).min(1),
  })
  .strict()
  .refine(({ items }) => new Set(items.map(({ productId }) => productId)).size === items.length, {
    path: ['items'],
    message: 'duplicate product ids are not allowed',
  });

export const ipcSchemas = {
  appSettings: appSettingsSchema,
  catalog: catalogDataSchema,
  paymentSettings: paymentSettingsSchema,
};
