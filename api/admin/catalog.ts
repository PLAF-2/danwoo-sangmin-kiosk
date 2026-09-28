import { catalogDataSchema } from '../../electron/ipc/schemas';
import { requireAdmin } from '../_lib/auth';
import { getDb } from '../_lib/db';
import { endpoint, parseBody } from '../_lib/http';

export default endpoint('POST', async (request) => {
  await requireAdmin(request);
  const catalog = parseBody(request, catalogDataSchema);
  const db = getDb();
  const queries = [
    db.query('LOCK TABLE categories, products, product_detail_images IN SHARE ROW EXCLUSIVE MODE'),
    db.query('DELETE FROM products'),
    db.query('DELETE FROM categories'),
  ];
  for (const category of catalog.categories) {
    queries.push(db.query('INSERT INTO categories (id, name, is_active, display_order) VALUES ($1, $2, $3, $4)', [category.id, category.name, category.isActive, category.displayOrder]));
  }
  for (const product of catalog.products) {
    queries.push(db.query(`INSERT INTO products (id, category_id, name, price, thumbnail_image, description, specifications, sale_status, is_visible, display_order, max_quantity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
    [product.id, product.categoryId, product.name, product.price, product.thumbnailImage, product.description, JSON.stringify(product.specifications), product.saleStatus, product.isVisible, product.displayOrder, product.maxQuantity, product.createdAt, product.updatedAt]));
    for (const [index, image] of product.detailImages.entries()) {
      queries.push(db.query('INSERT INTO product_detail_images (product_id, display_order, image_url) VALUES ($1, $2, $3)', [product.id, index, image]));
    }
  }
  await db.transaction(queries);
});
