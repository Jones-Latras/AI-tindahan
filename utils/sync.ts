/**
 * Cloud sync utility — pushes unsynced local rows to Supabase and
 * supports restoring data from the cloud to a fresh device.
 *
 * The local SQLite database is always the source of truth.
 * Sync runs manually via the "I-backup ngayon" button.
 */

import type { SQLiteDatabase } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";

import { isSupabaseReady, supabaseSelectAll, supabaseUpsert } from "./supabase";

const LAST_SYNC_KEY = "tindahan.last-sync";

// ---------- sync to cloud ----------

export async function syncToCloud(db: SQLiteDatabase): Promise<string> {
  if (!isSupabaseReady()) {
    return "Supabase is not configured. Add your project URL and anon key to .env.";
  }

  let pushed = 0;

  // Sync products
  const products = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, name, price_cents, cost_price_cents, stock, category, barcode, min_stock, created_at FROM products WHERE synced = 0",
  );
  if (products.length > 0) {
    await supabaseUpsert("products", products);
    await db.runAsync("UPDATE products SET synced = 1 WHERE synced = 0");
    pushed += products.length;
  }

  // Sync customers
  const customers = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, name, COALESCE(phone, '') AS phone, trust_score, created_at FROM customers WHERE synced = 0",
  );
  if (customers.length > 0) {
    await supabaseUpsert("customers", customers);
    await db.runAsync("UPDATE customers SET synced = 1 WHERE synced = 0");
    pushed += customers.length;
  }

  // Sync sales
  const sales = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, total_cents, cash_paid_cents, change_given_cents, discount_cents, payment_method, customer_id, created_at FROM sales WHERE synced = 0",
  );
  if (sales.length > 0) {
    await supabaseUpsert("sales", sales);
    await db.runAsync("UPDATE sales SET synced = 1 WHERE synced = 0");
    pushed += sales.length;
  }

  // Sync sale_items
  const saleItems = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, sale_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity FROM sale_items WHERE synced = 0",
  );
  if (saleItems.length > 0) {
    await supabaseUpsert("sale_items", saleItems);
    await db.runAsync("UPDATE sale_items SET synced = 1 WHERE synced = 0");
    pushed += saleItems.length;
  }

  // Sync utang
  const utang = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, customer_id, amount_cents, amount_paid_cents, description, created_at, paid_at FROM utang WHERE synced = 0",
  );
  if (utang.length > 0) {
    await supabaseUpsert("utang", utang);
    await db.runAsync("UPDATE utang SET synced = 1 WHERE synced = 0");
    pushed += utang.length;
  }

  const timestamp = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  await Storage.setItem(LAST_SYNC_KEY, timestamp);

  return pushed > 0
    ? `Na-backup na! ${pushed} records pushed to cloud. (${timestamp})`
    : `Up to date na. Wala nang bagong data i-backup. (${timestamp})`;
}

// ---------- restore from cloud ----------

export async function restoreFromCloud(db: SQLiteDatabase): Promise<string> {
  if (!isSupabaseReady()) {
    return "Supabase is not configured.";
  }

  let restored = 0;

  // Disable FK checks during bulk restore — the cloud data is already FK-valid
  await db.execAsync("PRAGMA foreign_keys = OFF;");

  try {
    // Restore customers first (sales and utang reference them)
    const customers = await supabaseSelectAll("customers");
    for (const c of customers) {
      const row = c as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO customers (id, name, phone, trust_score, created_at, synced)
         VALUES (?, ?, ?, ?, ?, 1)`,
        row.id as number, row.name as string, row.phone as string, row.trust_score as string, row.created_at as string,
      );
      restored++;
    }

    // Restore products
    const products = await supabaseSelectAll("products");
    for (const p of products) {
      const row = p as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO products (id, name, price_cents, cost_price_cents, stock, category, barcode, min_stock, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number, row.name as string, row.price_cents as number, row.cost_price_cents as number,
        row.stock as number, row.category as string | null, row.barcode as string | null,
        row.min_stock as number, row.created_at as string,
      );
      restored++;
    }

    // Restore sales
    const sales = await supabaseSelectAll("sales");
    for (const s of sales) {
      const row = s as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO sales (id, total_cents, cash_paid_cents, change_given_cents, discount_cents, payment_method, customer_id, created_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number, row.total_cents as number, row.cash_paid_cents as number,
        row.change_given_cents as number, row.discount_cents as number,
        row.payment_method as string, row.customer_id as number | null, row.created_at as string,
      );
      restored++;
    }

    // Restore sale_items
    const saleItems = await supabaseSelectAll("sale_items");
    for (const si of saleItems) {
      const row = si as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO sale_items (id, sale_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number, row.sale_id as number, row.product_id as number,
        row.product_name as string, row.unit_price_cents as number,
        row.unit_cost_cents as number, row.quantity as number,
      );
      restored++;
    }

    // Restore utang
    const utang = await supabaseSelectAll("utang");
    for (const u of utang) {
      const row = u as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO utang (id, customer_id, amount_cents, amount_paid_cents, description, created_at, paid_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number, row.customer_id as number, row.amount_cents as number,
        row.amount_paid_cents as number, row.description as string | null,
        row.created_at as string, row.paid_at as string | null,
      );
      restored++;
    }
  } finally {
    // Always re-enable FK checks
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }

  const timestamp = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  await Storage.setItem(LAST_SYNC_KEY, timestamp);

  return restored > 0
    ? `Na-restore na! ${restored} records downloaded from cloud. (${timestamp})`
    : "Walang data sa cloud na i-restore.";
}

// ---------- helpers ----------

export async function getLastSyncTime(): Promise<string | null> {
  return Storage.getItem(LAST_SYNC_KEY);
}
