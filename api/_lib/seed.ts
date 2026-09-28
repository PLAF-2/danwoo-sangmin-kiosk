import { randomBytes, scryptSync } from 'node:crypto';
import type { NeonQueryPromise } from '@neondatabase/serverless';

import catalog from '../../data/defaults/catalog.json';
import payment from '../../data/defaults/payment.json';
import settings from '../../data/defaults/settings.json';
import type { Database } from './db';

const insertCategory = `INSERT INTO categories (id, name, is_active, display_order) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`;
const insertProduct = `INSERT INTO products (id, category_id, name, price, thumbnail_image, description, specifications, sale_status, is_visible, display_order, max_quantity, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`;
const insertDetailImage = `INSERT INTO product_detail_images (product_id, display_order, image_url) VALUES ($1, $2, $3) ON CONFLICT (product_id, display_order) DO NOTHING`;
const insertSettings = `INSERT INTO app_settings (data) VALUES ($1::jsonb) ON CONFLICT (id) DO NOTHING`;
const insertPayment = `INSERT INTO payment_settings (data) VALUES ($1::jsonb) ON CONFLICT (id) DO NOTHING`;
const insertCredential = `INSERT INTO admin_credentials (salt, hash) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`;

export async function seedDatabase(db: Database): Promise<void> {
  const [state] = (await db.query(
    `SELECT (
      EXISTS (SELECT 1 FROM categories) OR EXISTS (SELECT 1 FROM products) OR
      EXISTS (SELECT 1 FROM app_settings) OR EXISTS (SELECT 1 FROM payment_settings) OR
      EXISTS (SELECT 1 FROM orders)
    ) AS has_data, EXISTS (SELECT 1 FROM admin_credentials) AS has_credential`,
  )) as Array<{ has_data: boolean; has_credential: boolean }>;
  if (!state) throw new Error('Unable to read database seed state');

  const queries: NeonQueryPromise<false, false>[] = [];
  if (!state.has_data) {
    for (const category of catalog.categories) {
      queries.push(db.query(insertCategory, [category.id, category.name, category.isActive, category.displayOrder]));
    }
    for (const product of catalog.products) {
      queries.push(db.query(insertProduct, [product.id, product.categoryId, product.name, product.price, product.thumbnailImage, product.description, JSON.stringify(product.specifications), product.saleStatus, product.isVisible, product.displayOrder, product.maxQuantity, product.createdAt, product.updatedAt]));
      for (const [displayOrder, imageUrl] of product.detailImages.entries()) {
        queries.push(db.query(insertDetailImage, [product.id, displayOrder, imageUrl]));
      }
    }
    queries.push(db.query(insertSettings, [JSON.stringify(settings)]));
    queries.push(db.query(insertPayment, [JSON.stringify(payment)]));
  }
  if (!state.has_credential) {
    const salt = randomBytes(16).toString('hex');
    // The user explicitly selected this first-deployment password; only its scrypt hash is stored.
    const hash = scryptSync('admin0000', Buffer.from(salt, 'hex'), 64).toString('hex');
    queries.push(db.query(insertCredential, [salt, hash]));
  }
  if (queries.length > 0) await db.transaction(queries);
}
