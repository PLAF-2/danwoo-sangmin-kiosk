CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  category_id text NOT NULL REFERENCES categories(id),
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  thumbnail_image text NOT NULL,
  description text NOT NULL,
  specifications jsonb NOT NULL CHECK (jsonb_typeof(specifications) = 'array'),
  sale_status text NOT NULL CHECK (sale_status IN ('onSale', 'soldOut')),
  is_visible boolean NOT NULL,
  display_order integer NOT NULL CHECK (display_order >= 0),
  max_quantity integer NOT NULL CHECK (max_quantity >= 1),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON products(category_id);

CREATE TABLE IF NOT EXISTS product_detail_images (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  display_order integer NOT NULL CHECK (display_order >= 0),
  image_url text NOT NULL,
  PRIMARY KEY (product_id, display_order)
);

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS orders (
  order_number text PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  subtotal integer NOT NULL CHECK (subtotal >= 0),
  discount integer NOT NULL CHECK (discount >= 0 AND discount <= subtotal),
  total integer NOT NULL CHECK (total = subtotal - discount),
  payment_mode text NOT NULL CHECK (payment_mode IN ('instant', 'bankQr', 'simulation')),
  status text NOT NULL CHECK (status IN ('processing', 'paid', 'received', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  order_number text NOT NULL REFERENCES orders(order_number) ON DELETE CASCADE,
  display_order integer NOT NULL CHECK (display_order >= 0),
  -- Product identity and values are snapshots, retained when a catalog product is deleted.
  product_id text NOT NULL,
  name text NOT NULL,
  thumbnail_image text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 1),
  captured_unit_price integer NOT NULL CHECK (captured_unit_price >= 0),
  PRIMARY KEY (order_number, display_order)
);

CREATE TABLE IF NOT EXISTS admin_credentials (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  algorithm text NOT NULL DEFAULT 'scrypt' CHECK (algorithm = 'scrypt'),
  salt text NOT NULL CHECK (salt ~ '^[0-9a-f]{32}$'),
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{128}$')
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  credential_id integer NOT NULL DEFAULT 1 REFERENCES admin_credentials(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions(expires_at);
