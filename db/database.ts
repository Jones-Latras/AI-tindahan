import type { SQLiteDatabase } from "expo-sqlite";

export const DATABASE_NAME = "tindahan-ai.db";
export const DATABASE_VERSION = 11;

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
        image_uri TEXT,
        min_stock INTEGER NOT NULL DEFAULT 5 CHECK(min_stock >= 0),
        is_weight_based INTEGER NOT NULL DEFAULT 0 CHECK(is_weight_based IN (0, 1)),
        pricing_mode TEXT NOT NULL DEFAULT 'direct' CHECK(pricing_mode IN ('derived', 'direct')),
        pricing_strategy TEXT NOT NULL DEFAULT 'manual' CHECK(pricing_strategy IN ('manual', 'margin_based')),
        total_kg_available REAL,
        cost_price_total_cents INTEGER,
        selling_price_total_cents INTEGER,
        cost_price_per_kg_cents INTEGER,
        selling_price_per_kg_cents INTEGER,
        target_margin_percent REAL,
        computed_price_per_kg_cents INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY NOT NULL,
        total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
        cash_paid_cents INTEGER NOT NULL CHECK(cash_paid_cents >= 0),
        change_given_cents INTEGER NOT NULL CHECK(change_given_cents >= 0),
        discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK(payment_method IN ('cash', 'gcash', 'maya', 'utang')),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY NOT NULL,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        is_weight_based INTEGER NOT NULL DEFAULT 0 CHECK(is_weight_based IN (0, 1)),
        weight_kg REAL,
        line_total_cents INTEGER NOT NULL DEFAULT 0 CHECK(line_total_cents >= 0),
        line_cost_total_cents INTEGER NOT NULL DEFAULT 0 CHECK(line_cost_total_cents >= 0),
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL COLLATE NOCASE,
        phone TEXT,
        trust_score TEXT NOT NULL DEFAULT 'Bago',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS utang (
        id INTEGER PRIMARY KEY NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
        amount_paid_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_paid_cents >= 0),
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS utang_payments (
        id INTEGER PRIMARY KEY NOT NULL,
        utang_id INTEGER NOT NULL REFERENCES utang(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        note TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'migration', 'sale_adjustment')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        description TEXT,
        expense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS restock_lists (
        id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'archived')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS restock_list_items (
        id INTEGER PRIMARY KEY NOT NULL,
        restock_list_id INTEGER NOT NULL REFERENCES restock_lists(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name_snapshot TEXT NOT NULL,
        category_snapshot TEXT,
        current_stock_snapshot REAL NOT NULL DEFAULT 0 CHECK(current_stock_snapshot >= 0),
        min_stock_snapshot REAL NOT NULL DEFAULT 0 CHECK(min_stock_snapshot >= 0),
        suggested_quantity REAL NOT NULL DEFAULT 0 CHECK(suggested_quantity >= 0),
        is_weight_based_snapshot INTEGER NOT NULL DEFAULT 0 CHECK(is_weight_based_snapshot IN (0, 1)),
        is_checked INTEGER NOT NULL DEFAULT 0 CHECK(is_checked IN (0, 1)),
        checked_at TEXT,
        note TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock, min_stock);
      CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_utang_customer ON utang(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_utang_payments_utang ON utang_payments(utang_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_utang_payments_customer ON utang_payments(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category, expense_date DESC);
      CREATE INDEX IF NOT EXISTS idx_restock_lists_status ON restock_lists(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_restock_list_items_list ON restock_list_items(restock_list_id, is_checked ASC, id ASC);
      CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at DESC);
    `);

    currentVersion = 11;
  }

  if (currentVersion === 1) {
    await db.execAsync(`
      ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
    `);

    currentVersion = 2;
  }

  if (currentVersion === 2) {
    await db.execAsync(`
      ALTER TABLE sales ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
    `);

    currentVersion = 3;
  }

  if (currentVersion === 3) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE customers ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE utang ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
    `);

    currentVersion = 4;
  }

  if (currentVersion === 4) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN image_uri TEXT;
    `);

    currentVersion = 5;
  }

  if (currentVersion === 5) {
    await db.execAsync(`
      ALTER TABLE products ADD COLUMN is_weight_based INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'direct';
      ALTER TABLE products ADD COLUMN pricing_strategy TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE products ADD COLUMN total_kg_available REAL;
      ALTER TABLE products ADD COLUMN cost_price_total_cents INTEGER;
      ALTER TABLE products ADD COLUMN selling_price_total_cents INTEGER;
      ALTER TABLE products ADD COLUMN cost_price_per_kg_cents INTEGER;
      ALTER TABLE products ADD COLUMN selling_price_per_kg_cents INTEGER;
      ALTER TABLE products ADD COLUMN target_margin_percent REAL;
      ALTER TABLE products ADD COLUMN computed_price_per_kg_cents INTEGER;
      ALTER TABLE sale_items ADD COLUMN is_weight_based INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN weight_kg REAL;
      ALTER TABLE sale_items ADD COLUMN line_total_cents INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sale_items ADD COLUMN line_cost_total_cents INTEGER NOT NULL DEFAULT 0;

      UPDATE products
      SET
        cost_price_total_cents = NULL,
        selling_price_total_cents = NULL,
        cost_price_per_kg_cents = NULL,
        selling_price_per_kg_cents = NULL,
        target_margin_percent = NULL,
        computed_price_per_kg_cents = NULL
      WHERE is_weight_based = 0;

      UPDATE sale_items
      SET
        line_total_cents = unit_price_cents * quantity,
        line_cost_total_cents = unit_cost_cents * quantity
      WHERE line_total_cents = 0
        AND line_cost_total_cents = 0;
    `);

    currentVersion = 6;
  }

  if (currentVersion < 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at DESC);
    `);

    currentVersion = 7;
  }

  if (currentVersion < 8) {
    await db.execAsync(`
      DROP TABLE IF EXISTS sale_items_next;

      CREATE TABLE sale_items_next (
        id INTEGER PRIMARY KEY NOT NULL,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
        unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        is_weight_based INTEGER NOT NULL DEFAULT 0 CHECK(is_weight_based IN (0, 1)),
        weight_kg REAL,
        line_total_cents INTEGER NOT NULL DEFAULT 0 CHECK(line_total_cents >= 0),
        line_cost_total_cents INTEGER NOT NULL DEFAULT 0 CHECK(line_cost_total_cents >= 0),
        synced INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO sale_items_next (
        id,
        sale_id,
        product_id,
        product_name,
        unit_price_cents,
        unit_cost_cents,
        quantity,
        is_weight_based,
        weight_kg,
        line_total_cents,
        line_cost_total_cents,
        synced
      )
      SELECT
        id,
        sale_id,
        product_id,
        product_name,
        unit_price_cents,
        unit_cost_cents,
        quantity,
        is_weight_based,
        weight_kg,
        line_total_cents,
        line_cost_total_cents,
        synced
      FROM sale_items;

      DROP TABLE sale_items;
      ALTER TABLE sale_items_next RENAME TO sale_items;

      CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
    `);

    currentVersion = 8;
  }

  if (currentVersion < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS utang_payments (
        id INTEGER PRIMARY KEY NOT NULL,
        utang_id INTEGER NOT NULL REFERENCES utang(id) ON DELETE CASCADE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        note TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'migration', 'sale_adjustment')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_utang_payments_utang ON utang_payments(utang_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_utang_payments_customer ON utang_payments(customer_id, created_at DESC);

      INSERT INTO utang_payments (
        utang_id,
        customer_id,
        amount_cents,
        note,
        source,
        created_at,
        synced
      )
      SELECT
        u.id,
        u.customer_id,
        u.amount_paid_cents,
        'Migrated payment history',
        'migration',
        COALESCE(u.paid_at, u.created_at),
        0
      FROM utang u
      WHERE u.amount_paid_cents > 0
        AND NOT EXISTS (
          SELECT 1
          FROM utang_payments up
          WHERE up.utang_id = u.id
        );
    `);

    currentVersion = 9;
  }

  if (currentVersion < 10) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        description TEXT,
        expense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category, expense_date DESC);
    `);

    currentVersion = 10;
  }

  if (currentVersion < 11) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS restock_lists (
        id INTEGER PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'archived')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS restock_list_items (
        id INTEGER PRIMARY KEY NOT NULL,
        restock_list_id INTEGER NOT NULL REFERENCES restock_lists(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name_snapshot TEXT NOT NULL,
        category_snapshot TEXT,
        current_stock_snapshot REAL NOT NULL DEFAULT 0 CHECK(current_stock_snapshot >= 0),
        min_stock_snapshot REAL NOT NULL DEFAULT 0 CHECK(min_stock_snapshot >= 0),
        suggested_quantity REAL NOT NULL DEFAULT 0 CHECK(suggested_quantity >= 0),
        is_weight_based_snapshot INTEGER NOT NULL DEFAULT 0 CHECK(is_weight_based_snapshot IN (0, 1)),
        is_checked INTEGER NOT NULL DEFAULT 0 CHECK(is_checked IN (0, 1)),
        checked_at TEXT,
        note TEXT,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_restock_lists_status ON restock_lists(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_restock_list_items_list ON restock_list_items(restock_list_id, is_checked ASC, id ASC);
    `);

    currentVersion = 11;
  }

  await db.execAsync(`PRAGMA user_version = ${currentVersion};`);
}
