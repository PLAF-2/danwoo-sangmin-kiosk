import { createHash, randomUUID } from 'node:crypto';

import { createOrderInputSchema } from '../src/domain/schemas';
import { ORDER_REVIEW_REQUIRED, orderSchema } from '../src/domain/contracts';
import { getDb } from './_lib/db';
import { endpoint, HttpError, parseBody, type ApiRequest, type ApiResponse } from './_lib/http';

// Lines without options have NULL selected_options, which is stripped to match the order schema.
const orderJson = `jsonb_build_object(
  'orderNumber', o.order_number, 'subtotal', o.subtotal, 'discount', o.discount, 'total', o.total,
  'paymentMode', o.payment_mode, 'status', o.status, 'createdAt', o.created_at,
  'items', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'productId', i.product_id, 'name', i.name, 'thumbnailImage', i.thumbnail_image,
    'quantity', i.quantity, 'capturedUnitPrice', i.captured_unit_price, 'selectedOptions', i.selected_options
  )) ORDER BY i.display_order) FROM order_items i WHERE i.order_number = o.order_number)
)`;

const readOrder = endpoint('GET', async (request) => {
  const params = new URL(request.url ?? '/', 'http://localhost').searchParams;
  const orderNumber = params.get('orderNumber');
  if (!orderNumber?.trim() || orderNumber.length > 128 || params.getAll('orderNumber').length !== 1) {
    throw new HttpError(400, 'Invalid order number');
  }
  const [row] = await getDb().query(`SELECT ${orderJson} AS "order" FROM orders o WHERE o.order_number = $1`, [orderNumber]);
  return row ? orderSchema.parse(row.order) : null;
});

const createOrder = endpoint('POST', async (request) => {
  const input = parseBody(request, createOrderInputSchema);
  const fingerprint = createHash('sha256').update(JSON.stringify({ items: input.items, expectedPayment: input.expectedPayment })).digest('hex');
  const db = getDb();
  // Both snapshots and totals come from one SQL statement. The next statement sees a concurrent retry's committed winner.
  const [, rows] = await db.transaction([
    db.query(`WITH requested AS (
      SELECT value, ordinality - 1 AS display_order FROM jsonb_array_elements($3::jsonb) WITH ORDINALITY
    ), snapshots AS (
      SELECT p.id, p.name, p.thumbnail_image, p.price, p.max_quantity, i.quantity, i."selectedOptions" AS selected_options, r.display_order
      FROM requested r
      CROSS JOIN LATERAL jsonb_to_record(r.value) AS i("productId" text, quantity integer, "capturedUnitPrice" integer, "selectedOptions" jsonb)
      JOIN products p ON p.id = i."productId"
      WHERE p.price = i."capturedUnitPrice" AND p.max_quantity >= i.quantity
        AND p.is_visible AND p.sale_status = 'onSale'
        -- Every product option needs exactly one of its current values, in product order.
        AND COALESCE(jsonb_array_length(p.options), 0) = COALESCE(jsonb_array_length(i."selectedOptions"), 0)
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(p.options, '[]'::jsonb)) WITH ORDINALITY AS o(option, position)
          WHERE ((i."selectedOptions" -> (o.position::int - 1)) ->> 'name') IS DISTINCT FROM (o.option ->> 'name')
            OR NOT COALESCE((o.option -> 'values') ? ((i."selectedOptions" -> (o.position::int - 1)) ->> 'value'), false)
        )
    ), totals AS (
      SELECT sum(price::bigint * quantity) AS subtotal FROM snapshots
      HAVING count(*) = jsonb_array_length($3::jsonb) AND sum(price::bigint * quantity) <= 2147483647
        -- The maximum counts every option line of the same product together.
        AND NOT EXISTS (SELECT 1 FROM snapshots GROUP BY id, max_quantity HAVING sum(quantity) > max_quantity)
    ), inserted AS (
      INSERT INTO orders (order_number, request_id, request_fingerprint, subtotal, discount, total, payment_mode, status)
      SELECT $5, $1::uuid, $2, t.subtotal, 0, t.subtotal, s.data->>'mode',
        CASE WHEN s.data->>'mode' = 'bankQr' THEN 'received'
          WHEN s.data->>'mode' = 'simulation' AND s.data->>'simulationResult' = 'failure' THEN 'failed'
          ELSE 'paid' END
      FROM totals t CROSS JOIN payment_settings s WHERE s.id = 1 AND s.data = $4::jsonb
      ON CONFLICT (request_id) DO NOTHING RETURNING order_number
    ) INSERT INTO order_items (order_number, display_order, product_id, name, thumbnail_image, quantity, captured_unit_price, selected_options)
      SELECT o.order_number, s.display_order, s.id, s.name, s.thumbnail_image, s.quantity, s.price, s.selected_options
      FROM inserted o CROSS JOIN snapshots s`,
    [input.requestId, fingerprint, JSON.stringify(input.items), JSON.stringify(input.expectedPayment), randomUUID()]),
    db.query(`SELECT o.request_fingerprint, ${orderJson} AS "order" FROM orders o WHERE o.request_id = $1::uuid`, [input.requestId]),
  ]);
  const row = rows?.[0];
  if (!row) throw new HttpError(409, `${ORDER_REVIEW_REQUIRED}: Product or payment settings changed since confirmation`);
  if (row.request_fingerprint !== fingerprint) throw new HttpError(409, 'requestId was already used with different order data');
  return orderSchema.parse(row.order);
});

export default function orders(request: ApiRequest, response: ApiResponse): Promise<void> {
  return request.method === 'GET' ? readOrder(request, response) : createOrder(request, response);
}
