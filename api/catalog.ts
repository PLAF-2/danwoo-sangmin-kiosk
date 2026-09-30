import { z } from 'zod';

import { categorySchema, productOptionsSchema, productSchema } from '../src/domain/contracts';
import { getDb } from './_lib/db';
import { endpoint } from './_lib/http';

const databaseTimestamp = z.coerce.date().transform((date) => date.toISOString());
const storedProductSchema = productSchema.extend({
  createdAt: databaseTimestamp,
  updatedAt: databaseTimestamp,
  options: productOptionsSchema.nullish().transform((options) => options ?? undefined),
});

export default endpoint('GET', async () => {
  const db = getDb();
  const [categories, products] = await Promise.all([
    db.query('SELECT id, name, is_active AS "isActive", display_order AS "displayOrder" FROM categories ORDER BY display_order, id'),
    db.query(`SELECT p.id, p.name, p.price, p.category_id AS "categoryId", p.thumbnail_image AS "thumbnailImage",
      COALESCE((SELECT jsonb_agg(d.image_url ORDER BY d.display_order) FROM product_detail_images d WHERE d.product_id = p.id), '[]'::jsonb) AS "detailImages",
      p.description, p.specifications, p.options, p.sale_status AS "saleStatus", p.is_visible AS "isVisible",
      p.display_order AS "displayOrder", p.max_quantity AS "maxQuantity", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
      FROM products p ORDER BY p.display_order, p.id`),
  ]);
  return { categories: z.array(categorySchema).parse(categories), products: z.array(storedProductSchema).parse(products) };
});
