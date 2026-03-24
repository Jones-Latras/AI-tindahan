-- Run this in the Supabase SQL Editor to create the backup tables.
-- These mirror the local SQLite schema for cloud sync.

CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  cost_price_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  barcode TEXT,
  image_uri TEXT,
  min_stock NUMERIC(10,4) NOT NULL DEFAULT 5,
  is_weight_based BOOLEAN NOT NULL DEFAULT false,
  pricing_mode TEXT NOT NULL DEFAULT 'direct',
  pricing_strategy TEXT NOT NULL DEFAULT 'manual',
  total_kg_available NUMERIC(10,4),
  cost_price_total_cents INTEGER,
  selling_price_total_cents INTEGER,
  cost_price_per_kg_cents INTEGER,
  selling_price_per_kg_cents INTEGER,
  target_margin_percent NUMERIC(10,4),
  computed_price_per_kg_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_uri TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10,4) NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_strategy TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_kg_available NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_total_cents INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price_total_cents INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_per_kg_cents INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price_per_kg_cents INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_margin_percent NUMERIC(10,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS computed_price_per_kg_cents INTEGER;
ALTER TABLE products ALTER COLUMN min_stock TYPE NUMERIC(10,4);

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  trust_score TEXT NOT NULL DEFAULT 'Bago',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id BIGINT PRIMARY KEY,
  total_cents INTEGER NOT NULL,
  cash_paid_cents INTEGER NOT NULL DEFAULT 0,
  change_given_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGINT PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  product_name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_weight_based BOOLEAN NOT NULL DEFAULT false,
  weight_kg NUMERIC(10,4),
  line_total_cents INTEGER NOT NULL DEFAULT 0,
  line_cost_total_cents INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_weight_based BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,4);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_cost_total_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS utang (
  id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- Enable Row Level Security (allow all for anon key -- single-user app)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE utang ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON products;
DROP POLICY IF EXISTS "Allow all" ON customers;
DROP POLICY IF EXISTS "Allow all" ON sales;
DROP POLICY IF EXISTS "Allow all" ON sale_items;
DROP POLICY IF EXISTS "Allow all" ON utang;

CREATE POLICY "Allow all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON utang FOR ALL USING (true) WITH CHECK (true);

-- Public bucket for compressed product photos stored during cloud backup.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Product images are public" ON storage.objects;
DROP POLICY IF EXISTS "Product images can be uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Product images can be updated" ON storage.objects;

CREATE POLICY "Product images are public"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Product images can be uploaded"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Product images can be updated"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images')
WITH CHECK (bucket_id = 'product-images');
