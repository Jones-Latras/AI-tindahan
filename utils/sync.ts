/**
 * Cloud sync utility — pushes unsynced local rows to Supabase and
 * supports restoring data from the cloud to a fresh device.
 *
 * The local SQLite database is always the source of truth.
 * Sync runs manually via the "I-backup ngayon" button.
 */

import type { SQLiteDatabase } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";

import { isSupabaseReady, supabase } from "./supabase";

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
    const { error } = await supabase.from("products").upsert(products, { onConflict: "id" });
    if (error) throw new Error(`Products sync failed: ${error.message}`);
    await db.runAsync("UPDATE products SET synced = 1 WHERE synced = 0");
    pushed += products.length;
  }

  // Sync customers
  const customers = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, name, phone, trust_score, created_at FROM customers WHERE synced = 0",
  );
  if (customers.length > 0) {
    const { error } = await supabase.from("customers").upsert(customers, { onConflict: "id" });
    if (error) throw new Error(`Customers sync failed: ${error.message}`);
    await db.runAsync("UPDATE customers SET synced = 1 WHERE synced = 0");
    pushed += customers.length;
  }

  // Sync sales
  const sales = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, total_cents, cash_paid_cents, change_given_cents, discount_cents, payment_method, customer_id, created_at FROM sales WHERE synced = 0",
  );
  if (sales.length > 0) {
    const { error } = await supabase.from("sales").upsert(sales, { onConflict: "id" });
    if (error) throw new Error(`Sales sync failed: ${error.message}`);
    await db.runAsync("UPDATE sales SET synced = 1 WHERE synced = 0");
    pushed += sales.length;
  }

  // Sync sale_items
  const saleItems = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, sale_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity FROM sale_items WHERE synced = 0",
  );
  if (saleItems.length > 0) {
    const { error } = await supabase.from("sale_items").upsert(saleItems, { onConflict: "id" });
    if (error) throw new Error(`Sale items sync failed: ${error.message}`);
    await db.runAsync("UPDATE sale_items SET synced = 1 WHERE synced = 0");
    pushed += saleItems.length;
  }

  // Sync utang
  const utang = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, customer_id, amount_cents, amount_paid_cents, description, created_at, paid_at FROM utang WHERE synced = 0",
  );
  if (utang.length > 0) {
    const { error } = await supabase.from("utang").upsert(utang, { onConflict: "id" });
    if (error) throw new Error(`Utang sync failed: ${error.message}`);
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

  // Restore customers first (sales and utang reference them)
  const { data: customers, error: custErr } = await supabase.from("customers").select("*");
  if (custErr) throw new Error(`Customers restore failed: ${custErr.message}`);
  for (const c of customers ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO customers (id, name, phone, trust_score, created_at, synced)
       VALUES (?, ?, ?, ?, ?, 1)`,
      c.id, c.name, c.phone, c.trust_score, c.created_at,
    );
    restored++;
  }

  // Restore products
  const { data: products, error: prodErr } = await supabase.from("products").select("*");
  if (prodErr) throw new Error(`Products restore failed: ${prodErr.message}`);
  for (const p of products ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO products (id, name, price_cents, cost_price_cents, stock, category, barcode, min_stock, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      p.id, p.name, p.price_cents, p.cost_price_cents, p.stock, p.category, p.barcode, p.min_stock, p.created_at,
    );
    restored++;
  }

  // Restore sales
  const { data: sales, error: salesErr } = await supabase.from("sales").select("*");
  if (salesErr) throw new Error(`Sales restore failed: ${salesErr.message}`);
  for (const s of sales ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sales (id, total_cents, cash_paid_cents, change_given_cents, discount_cents, payment_method, customer_id, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      s.id, s.total_cents, s.cash_paid_cents, s.change_given_cents, s.discount_cents, s.payment_method, s.customer_id, s.created_at,
    );
    restored++;
  }

  // Restore sale_items
  const { data: saleItems, error: siErr } = await supabase.from("sale_items").select("*");
  if (siErr) throw new Error(`Sale items restore failed: ${siErr.message}`);
  for (const si of saleItems ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO sale_items (id, sale_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      si.id, si.sale_id, si.product_id, si.product_name, si.unit_price_cents, si.unit_cost_cents, si.quantity,
    );
    restored++;
  }

  // Restore utang
  const { data: utang, error: utangErr } = await supabase.from("utang").select("*");
  if (utangErr) throw new Error(`Utang restore failed: ${utangErr.message}`);
  for (const u of utang ?? []) {
    await db.runAsync(
      `INSERT OR REPLACE INTO utang (id, customer_id, amount_cents, amount_paid_cents, description, created_at, paid_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      u.id, u.customer_id, u.amount_cents, u.amount_paid_cents, u.description, u.created_at, u.paid_at,
    );
    restored++;
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
