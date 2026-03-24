import type { SQLiteDatabase } from "expo-sqlite";

export const DATABASE_NAME = "tindahan-ai.db";
export const DATABASE_VERSION = 2;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    // This migration uses static SQL only. User-provided values are always written through
    // bound parameters elsewhere in the app to avoid injection risks.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
        cost_price_cents INTEGER NOT NULL DEFAULT 0 CHECK(cost_price_cents >= 0),
        stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
        category TEXT,
        barcode TEXT UNIQUE,
        min_stock INTEGER NOT NULL DEFAULT 5 CHECK(min_stock >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY NOT NULL,
        total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
        cash_paid_cents INTEGER NOT NULL CHECK(cash_paid_cents >= 0),
        change_given_cents INTEGER NOT NULL CHECK(change_given_cents >= 0),
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'gcash', 'maya', 'utang')),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY NOT NULL,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0)
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        phone TEXT,
        trust_score TEXT NOT NULL DEFAULT 'Bago',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS utang (
        id INTEGER PRIMARY KEY NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
        amount_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_paid_cents >= 0),
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock, min_stock);
      CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_utang_customer ON utang(customer_id, created_at DESC);
    `);

    currentVersion = 2;
  }

  if (currentVersion === 1) {
    await db.execAsync(`
      ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
    `);

    currentVersion = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion};`);
}
