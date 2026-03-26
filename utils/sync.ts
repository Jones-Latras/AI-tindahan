/**
 * Cloud sync utility — pushes unsynced local rows to Supabase and
 * supports restoring data from the cloud to a fresh device.
 *
 * The local SQLite database is always the source of truth.
 * Sync runs manually via the "I-backup ngayon" button.
 */

import type { SQLiteDatabase } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";

import {
  isSupabaseReady,
  supabaseSelectAll,
  supabaseUploadStorageObject,
  supabaseUpsert,
} from "./supabase";

const LAST_SYNC_KEY = "tindahan.last-sync";
const PRODUCT_IMAGE_BUCKET = "product-images";

type PendingProductImageRow = {
  id: number;
  name: string;
  image_uri: string | null;
};

function isRemoteImageUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

function getProductImageUploadFormat(uri: string) {
  const normalizedUri = uri.split("?")[0]?.toLowerCase() ?? "";

  if (normalizedUri.endsWith(".png")) {
    return { contentType: "image/png", extension: "png" };
  }

  if (normalizedUri.endsWith(".webp")) {
    return { contentType: "image/webp", extension: "webp" };
  }

  return { contentType: "image/jpeg", extension: "jpg" };
}

function buildProductImagePath(productId: number, extension: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `products/${productId}/${Date.now()}-${suffix}.${extension}`;
}

async function uploadPendingProductImages(db: SQLiteDatabase) {
  const pendingImages = await db.getAllAsync<PendingProductImageRow>(
    `
      SELECT id, name, image_uri
      FROM products
      WHERE image_uri IS NOT NULL
        AND TRIM(image_uri) <> ''
    `,
  );

  for (const product of pendingImages) {
    const imageUri = product.image_uri?.trim();

    if (!imageUri || isRemoteImageUri(imageUri)) {
      continue;
    }

    let fileBytes: ArrayBuffer;

    try {
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new Error(`Could not read the local file (${response.status}).`);
      }

      fileBytes = await response.arrayBuffer();
    } catch {
      throw new Error(
        `The saved photo for "${product.name}" is no longer available on this device. Replace or remove it, then try backing up again.`,
      );
    }

    const { contentType, extension } = getProductImageUploadFormat(imageUri);
    const publicUrl = await supabaseUploadStorageObject(
      PRODUCT_IMAGE_BUCKET,
      buildProductImagePath(product.id, extension),
      fileBytes,
      contentType,
    );

    await db.runAsync("UPDATE products SET image_uri = ?, synced = 0 WHERE id = ?", publicUrl, product.id);
  }
}

// ---------- sync to cloud ----------

export async function syncToCloud(db: SQLiteDatabase): Promise<string> {
  if (!isSupabaseReady()) {
    return "Supabase is not configured. Add your project URL and anon key to .env.";
  }

  let pushed = 0;

  await uploadPendingProductImages(db);

  // Sync products
  const products = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      id,
      name,
      price_cents,
      cost_price_cents,
      stock,
      category,
      barcode,
      image_uri,
      min_stock,
      is_weight_based,
      pricing_mode,
      pricing_strategy,
      total_kg_available,
      cost_price_total_cents,
      selling_price_total_cents,
      cost_price_per_kg_cents,
      selling_price_per_kg_cents,
      target_margin_percent,
      computed_price_per_kg_cents,
      created_at
    FROM products
    WHERE synced = 0`,
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

  // Sync app settings
  const appSettings = await db.getAllAsync<Record<string, unknown>>(
    "SELECT key, value, updated_at FROM app_settings WHERE synced = 0",
  );
  if (appSettings.length > 0) {
    await supabaseUpsert("app_settings", appSettings, "key");
    await db.runAsync("UPDATE app_settings SET synced = 1 WHERE synced = 0");
    pushed += appSettings.length;
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
    `SELECT
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
      line_cost_total_cents
    FROM sale_items
    WHERE synced = 0`,
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

  // Sync utang_payments
  const utangPayments = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, utang_id, customer_id, amount_cents, note, source, created_at FROM utang_payments WHERE synced = 0",
  );
  if (utangPayments.length > 0) {
    await supabaseUpsert("utang_payments", utangPayments);
    await db.runAsync("UPDATE utang_payments SET synced = 1 WHERE synced = 0");
    pushed += utangPayments.length;
  }

  // Sync expenses
  const expenses = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      id,
      category,
      amount_cents,
      description,
      expense_date,
      created_at,
      updated_at
    FROM expenses
    WHERE synced = 0`,
  );
  if (expenses.length > 0) {
    await supabaseUpsert("expenses", expenses);
    await db.runAsync("UPDATE expenses SET synced = 1 WHERE synced = 0");
    pushed += expenses.length;
  }

  // Sync restock_lists
  const restockLists = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      id,
      title,
      status,
      created_at,
      completed_at
    FROM restock_lists
    WHERE synced = 0`,
  );
  if (restockLists.length > 0) {
    await supabaseUpsert("restock_lists", restockLists);
    await db.runAsync("UPDATE restock_lists SET synced = 1 WHERE synced = 0");
    pushed += restockLists.length;
  }

  // Sync restock_list_items
  const restockListItems = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      id,
      restock_list_id,
      product_id,
      product_name_snapshot,
      category_snapshot,
      current_stock_snapshot,
      min_stock_snapshot,
      suggested_quantity,
      is_weight_based_snapshot,
      is_checked,
      checked_at,
      note
    FROM restock_list_items
    WHERE synced = 0`,
  );
  if (restockListItems.length > 0) {
    await supabaseUpsert("restock_list_items", restockListItems);
    await db.runAsync("UPDATE restock_list_items SET synced = 1 WHERE synced = 0");
    pushed += restockListItems.length;
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
    // Restore app settings first so store metadata is ready immediately.
    const appSettings = await supabaseSelectAll("app_settings");
    for (const setting of appSettings) {
      const row = setting as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO app_settings (key, value, updated_at, synced)
         VALUES (?, ?, ?, 1)`,
        row.key as string,
        row.value as string,
        row.updated_at as string,
      );
      restored++;
    }

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
        `INSERT OR REPLACE INTO products (
          id,
          name,
          price_cents,
          cost_price_cents,
          stock,
          category,
          barcode,
          image_uri,
          min_stock,
          is_weight_based,
          pricing_mode,
          pricing_strategy,
          total_kg_available,
          cost_price_total_cents,
          selling_price_total_cents,
          cost_price_per_kg_cents,
          selling_price_per_kg_cents,
          target_margin_percent,
          computed_price_per_kg_cents,
          created_at,
          synced
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.name as string,
        row.price_cents as number,
        row.cost_price_cents as number,
        row.stock as number,
        row.category as string | null,
        row.barcode as string | null,
        row.image_uri as string | null,
        row.min_stock as number,
        row.is_weight_based as number,
        row.pricing_mode as string,
        row.pricing_strategy as string,
        row.total_kg_available as number | null,
        row.cost_price_total_cents as number | null,
        row.selling_price_total_cents as number | null,
        row.cost_price_per_kg_cents as number | null,
        row.selling_price_per_kg_cents as number | null,
        row.target_margin_percent as number | null,
        row.computed_price_per_kg_cents as number | null,
        row.created_at as string,
      );
      restored++;
    }

    // Restore expenses
    const expenses = await supabaseSelectAll("expenses");
    for (const expense of expenses) {
      const row = expense as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO expenses (
          id,
          category,
          amount_cents,
          description,
          expense_date,
          created_at,
          updated_at,
          synced
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.category as string,
        row.amount_cents as number,
        (row.description as string | null) ?? null,
        row.expense_date as string,
        row.created_at as string,
        row.updated_at as string,
      );
      restored++;
    }

    // Restore restock lists before their checklist items
    const restockLists = await supabaseSelectAll("restock_lists");
    for (const restockList of restockLists) {
      const row = restockList as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO restock_lists (
          id,
          title,
          status,
          created_at,
          completed_at,
          synced
        )
         VALUES (?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.title as string,
        row.status as string,
        row.created_at as string,
        (row.completed_at as string | null) ?? null,
      );
      restored++;
    }

    // Restore restock list items after lists and products exist
    const restockListItems = await supabaseSelectAll("restock_list_items");
    for (const item of restockListItems) {
      const row = item as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO restock_list_items (
          id,
          restock_list_id,
          product_id,
          product_name_snapshot,
          category_snapshot,
          current_stock_snapshot,
          min_stock_snapshot,
          suggested_quantity,
          is_weight_based_snapshot,
          is_checked,
          checked_at,
          note,
          synced
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.restock_list_id as number,
        (row.product_id as number | null) ?? null,
        row.product_name_snapshot as string,
        (row.category_snapshot as string | null) ?? null,
        row.current_stock_snapshot as number,
        row.min_stock_snapshot as number,
        row.suggested_quantity as number,
        row.is_weight_based_snapshot as number,
        row.is_checked as number,
        (row.checked_at as string | null) ?? null,
        (row.note as string | null) ?? null,
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
        `INSERT OR REPLACE INTO sale_items (
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.sale_id as number,
        row.product_id as number,
        row.product_name as string,
        row.unit_price_cents as number,
        row.unit_cost_cents as number,
        row.quantity as number,
        row.is_weight_based as number,
        row.weight_kg as number | null,
        row.line_total_cents as number,
        row.line_cost_total_cents as number,
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

    // Restore utang payments after utang rows exist
    const utangPayments = await supabaseSelectAll("utang_payments");
    for (const payment of utangPayments) {
      const row = payment as Record<string, unknown>;
      await db.runAsync(
        `INSERT OR REPLACE INTO utang_payments (
          id,
          utang_id,
          customer_id,
          amount_cents,
          note,
          source,
          created_at,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        row.id as number,
        row.utang_id as number,
        row.customer_id as number,
        row.amount_cents as number,
        (row.note as string | null) ?? null,
        row.source as string,
        row.created_at as string,
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
