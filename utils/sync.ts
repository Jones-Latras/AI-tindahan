import type { SQLiteDatabase } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";

import { getActiveStoreId } from "@/db/repositories";
import { getCurrentSession } from "@/utils/auth";
import {
  isSupabaseReady,
  supabaseSelectAll,
  supabaseUploadStorageObject,
  supabaseUpsert,
} from "@/utils/supabase";

const LAST_SYNC_KEY_PREFIX = "tindahan.last-sync";

type PendingProductImageRow = {
  id: number;
  image_uri: string | null;
  name: string;
  sync_id: string;
};

function getLastSyncKey(storeId: string) {
  return `${LAST_SYNC_KEY_PREFIX}.${storeId}`;
}

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

function buildProductImagePath(storeId: string, productSyncId: string, extension: string) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${storeId}/products/${productSyncId}/${Date.now()}-${suffix}.${extension}`;
}

async function requireStoreScope(db: SQLiteDatabase) {
  if (!isSupabaseReady()) {
    throw new Error("Supabase is not configured. Add your project URL and anon key to .env.");
  }

  const session = await getCurrentSession();

  if (!session?.user) {
    throw new Error("Sign in before using cloud backup or restore.");
  }

  const storeId = await getActiveStoreId(db);

  if (!storeId) {
    throw new Error("Create or select a store before using cloud backup or restore.");
  }

  return { session, storeId };
}

async function setLastSyncTime(storeId: string) {
  const timestamp = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  await Storage.setItem(getLastSyncKey(storeId), timestamp);
  return timestamp;
}

async function findLocalIdBySyncId(db: SQLiteDatabase, table: string, syncId: string | null | undefined) {
  if (!syncId) {
    return null;
  }

  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ${table} WHERE sync_id = ? LIMIT 1`,
    syncId,
  );

  return row?.id ?? null;
}

async function requireLocalIdBySyncId(db: SQLiteDatabase, table: string, syncId: string | null | undefined) {
  const localId = await findLocalIdBySyncId(db, table, syncId);

  if (!localId) {
    throw new Error(`Missing local ${table} row for sync id ${syncId ?? "unknown"}.`);
  }

  return localId;
}

async function uploadPendingProductImages(db: SQLiteDatabase, storeId: string) {
  const pendingImages = await db.getAllAsync<PendingProductImageRow>(
    `
      SELECT id, sync_id, name, image_uri
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
      buildProductImagePath(storeId, product.sync_id, extension),
      fileBytes,
      contentType,
    );

    await db.runAsync("UPDATE products SET image_uri = ?, synced = 0 WHERE id = ?", publicUrl, product.id);
  }
}

export async function syncToCloud(db: SQLiteDatabase) {
  const { storeId } = await requireStoreScope(db);
  let pushed = 0;

  await uploadPendingProductImages(db, storeId);

  const products = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      sync_id,
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
      has_container_return,
      container_label,
      container_deposit_cents,
      default_container_quantity_per_sale,
      created_at
    FROM products
    WHERE synced = 0`,
  );
  if (products.length > 0) {
    await supabaseUpsert("products", products.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE products SET synced = 1 WHERE synced = 0");
    pushed += products.length;
  }

  const inventoryPools = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      sync_id,
      name,
      base_unit_label,
      quantity_available,
      reorder_threshold,
      created_at,
      updated_at
    FROM inventory_pools
    WHERE synced = 0`,
  );
  if (inventoryPools.length > 0) {
    await supabaseUpsert("inventory_pools", inventoryPools.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE inventory_pools SET synced = 1 WHERE synced = 0");
    pushed += inventoryPools.length;
  }

  const productInventoryLinks = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      pil.sync_id,
      p.sync_id AS product_sync_id,
      ip.sync_id AS inventory_pool_sync_id,
      pil.units_per_sale,
      pil.display_unit_label,
      pil.is_primary_restock_product,
      pil.created_at
    FROM product_inventory_links pil
    INNER JOIN products p ON p.id = pil.product_id
    INNER JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
    WHERE pil.synced = 0`,
  );
  if (productInventoryLinks.length > 0) {
    await supabaseUpsert("product_inventory_links", productInventoryLinks.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE product_inventory_links SET synced = 1 WHERE synced = 0");
    pushed += productInventoryLinks.length;
  }

  const customers = await db.getAllAsync<Record<string, unknown>>(
    "SELECT sync_id, name, COALESCE(phone, '') AS phone, trust_score, created_at FROM customers WHERE synced = 0",
  );
  if (customers.length > 0) {
    await supabaseUpsert("customers", customers.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE customers SET synced = 1 WHERE synced = 0");
    pushed += customers.length;
  }

  const appSettings = await db.getAllAsync<Record<string, unknown>>(
    "SELECT key, value, updated_at FROM app_settings WHERE synced = 0",
  );
  if (appSettings.length > 0) {
    await supabaseUpsert(
      "app_settings",
      appSettings.map((row) => ({ store_id: storeId, ...row })),
      "store_id,key",
    );
    await db.runAsync("UPDATE app_settings SET synced = 1 WHERE synced = 0");
    pushed += appSettings.length;
  }

  const sales = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      s.sync_id,
      s.total_cents,
      s.cash_paid_cents,
      s.change_given_cents,
      s.discount_cents,
      s.payment_method,
      c.sync_id AS customer_sync_id,
      s.created_at
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.synced = 0`,
  );
  if (sales.length > 0) {
    await supabaseUpsert("sales", sales.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE sales SET synced = 1 WHERE synced = 0");
    pushed += sales.length;
  }

  const saleItems = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      si.sync_id,
      s.sync_id AS sale_sync_id,
      p.sync_id AS product_sync_id,
      si.product_name,
      si.unit_price_cents,
      si.unit_cost_cents,
      si.quantity,
      si.is_weight_based,
      si.weight_kg,
      si.line_total_cents,
      si.line_cost_total_cents
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    WHERE si.synced = 0`,
  );
  if (saleItems.length > 0) {
    await supabaseUpsert("sale_items", saleItems.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE sale_items SET synced = 1 WHERE synced = 0");
    pushed += saleItems.length;
  }

  const containerReturnEvents = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      cre.sync_id,
      s.sync_id AS sale_sync_id,
      c.sync_id AS customer_sync_id,
      p.sync_id AS product_sync_id,
      cre.product_name_snapshot,
      cre.container_label_snapshot,
      cre.quantity_out,
      cre.quantity_returned,
      cre.created_at,
      cre.last_returned_at,
      cre.status
    FROM container_return_events cre
    INNER JOIN sales s ON s.id = cre.sale_id
    LEFT JOIN customers c ON c.id = cre.customer_id
    LEFT JOIN products p ON p.id = cre.product_id
    WHERE cre.synced = 0`,
  );
  if (containerReturnEvents.length > 0) {
    await supabaseUpsert(
      "container_return_events",
      containerReturnEvents.map((row) => ({ store_id: storeId, ...row })),
    );
    await db.runAsync("UPDATE container_return_events SET synced = 1 WHERE synced = 0");
    pushed += containerReturnEvents.length;
  }

  const repackSessions = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      rs.sync_id,
      ip.sync_id AS inventory_pool_sync_id,
      source_product.sync_id AS source_product_sync_id,
      output_product.sync_id AS output_product_sync_id,
      rs.source_quantity_used,
      rs.output_units_created,
      rs.wastage_units,
      rs.created_at,
      rs.note
    FROM repack_sessions rs
    INNER JOIN inventory_pools ip ON ip.id = rs.inventory_pool_id
    INNER JOIN products source_product ON source_product.id = rs.source_product_id
    INNER JOIN products output_product ON output_product.id = rs.output_product_id
    WHERE rs.synced = 0`,
  );
  if (repackSessions.length > 0) {
    await supabaseUpsert("repack_sessions", repackSessions.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE repack_sessions SET synced = 1 WHERE synced = 0");
    pushed += repackSessions.length;
  }

  const utang = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      u.sync_id,
      c.sync_id AS customer_sync_id,
      u.amount_cents,
      u.amount_paid_cents,
      u.description,
      u.created_at,
      u.paid_at
    FROM utang u
    INNER JOIN customers c ON c.id = u.customer_id
    WHERE u.synced = 0`,
  );
  if (utang.length > 0) {
    await supabaseUpsert("utang", utang.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE utang SET synced = 1 WHERE synced = 0");
    pushed += utang.length;
  }

  const utangPayments = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      up.sync_id,
      u.sync_id AS utang_sync_id,
      c.sync_id AS customer_sync_id,
      up.amount_cents,
      up.note,
      up.source,
      up.created_at
    FROM utang_payments up
    INNER JOIN utang u ON u.id = up.utang_id
    INNER JOIN customers c ON c.id = up.customer_id
    WHERE up.synced = 0`,
  );
  if (utangPayments.length > 0) {
    await supabaseUpsert("utang_payments", utangPayments.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE utang_payments SET synced = 1 WHERE synced = 0");
    pushed += utangPayments.length;
  }

  const expenses = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      sync_id,
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
    await supabaseUpsert("expenses", expenses.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE expenses SET synced = 1 WHERE synced = 0");
    pushed += expenses.length;
  }

  const expenseBudgets = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      sync_id,
      category,
      amount_cents,
      budget_month,
      created_at,
      updated_at
    FROM expense_budgets
    WHERE synced = 0`,
  );
  if (expenseBudgets.length > 0) {
    await supabaseUpsert("expense_budgets", expenseBudgets.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE expense_budgets SET synced = 1 WHERE synced = 0");
    pushed += expenseBudgets.length;
  }

  const restockLists = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      sync_id,
      title,
      status,
      created_at,
      completed_at
    FROM restock_lists
    WHERE synced = 0`,
  );
  if (restockLists.length > 0) {
    await supabaseUpsert("restock_lists", restockLists.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE restock_lists SET synced = 1 WHERE synced = 0");
    pushed += restockLists.length;
  }

  const restockListItems = await db.getAllAsync<Record<string, unknown>>(
    `SELECT
      rli.sync_id,
      rl.sync_id AS restock_list_sync_id,
      p.sync_id AS product_sync_id,
      rli.product_name_snapshot,
      rli.category_snapshot,
      rli.current_stock_snapshot,
      rli.min_stock_snapshot,
      rli.suggested_quantity,
      rli.is_weight_based_snapshot,
      rli.is_checked,
      rli.checked_at,
      rli.note
    FROM restock_list_items rli
    INNER JOIN restock_lists rl ON rl.id = rli.restock_list_id
    LEFT JOIN products p ON p.id = rli.product_id
    WHERE rli.synced = 0`,
  );
  if (restockListItems.length > 0) {
    await supabaseUpsert("restock_list_items", restockListItems.map((row) => ({ store_id: storeId, ...row })));
    await db.runAsync("UPDATE restock_list_items SET synced = 1 WHERE synced = 0");
    pushed += restockListItems.length;
  }

  const timestamp = await setLastSyncTime(storeId);
  return pushed > 0
    ? `Na-backup na! ${pushed} records pushed to your store cloud backup. (${timestamp})`
    : `Up to date na. Wala nang bagong data i-backup. (${timestamp})`;
}

export async function restoreFromCloud(db: SQLiteDatabase) {
  const { storeId } = await requireStoreScope(db);
  let restored = 0;

  await db.execAsync("PRAGMA foreign_keys = OFF;");

  try {
    const appSettings = await supabaseSelectAll("app_settings", { store_id: storeId });
    for (const setting of appSettings) {
      const row = setting as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at, synced)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at,
           synced = 1`,
        row.key as string,
        row.value as string,
        row.updated_at as string,
      );
      restored++;
    }

    const customers = await supabaseSelectAll("customers", { store_id: storeId });
    for (const customer of customers) {
      const row = customer as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO customers (name, phone, trust_score, created_at, sync_id, synced)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(sync_id) DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           trust_score = excluded.trust_score,
           created_at = excluded.created_at,
           synced = 1`,
        row.name as string,
        row.phone as string,
        row.trust_score as string,
        row.created_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const products = await supabaseSelectAll("products", { store_id: storeId });
    for (const product of products) {
      const row = product as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO products (
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
          has_container_return,
          container_label,
          container_deposit_cents,
          default_container_quantity_per_sale,
          created_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          name = excluded.name,
          price_cents = excluded.price_cents,
          cost_price_cents = excluded.cost_price_cents,
          stock = excluded.stock,
          category = excluded.category,
          barcode = excluded.barcode,
          image_uri = excluded.image_uri,
          min_stock = excluded.min_stock,
          is_weight_based = excluded.is_weight_based,
          pricing_mode = excluded.pricing_mode,
          pricing_strategy = excluded.pricing_strategy,
          total_kg_available = excluded.total_kg_available,
          cost_price_total_cents = excluded.cost_price_total_cents,
          selling_price_total_cents = excluded.selling_price_total_cents,
          cost_price_per_kg_cents = excluded.cost_price_per_kg_cents,
          selling_price_per_kg_cents = excluded.selling_price_per_kg_cents,
          target_margin_percent = excluded.target_margin_percent,
          computed_price_per_kg_cents = excluded.computed_price_per_kg_cents,
          has_container_return = excluded.has_container_return,
          container_label = excluded.container_label,
          container_deposit_cents = excluded.container_deposit_cents,
          default_container_quantity_per_sale = excluded.default_container_quantity_per_sale,
          created_at = excluded.created_at,
          synced = 1`,
        row.name as string,
        row.price_cents as number,
        row.cost_price_cents as number,
        row.stock as number,
        (row.category as string | null) ?? null,
        (row.barcode as string | null) ?? null,
        (row.image_uri as string | null) ?? null,
        row.min_stock as number,
        row.is_weight_based as number,
        row.pricing_mode as string,
        row.pricing_strategy as string,
        (row.total_kg_available as number | null) ?? null,
        (row.cost_price_total_cents as number | null) ?? null,
        (row.selling_price_total_cents as number | null) ?? null,
        (row.cost_price_per_kg_cents as number | null) ?? null,
        (row.selling_price_per_kg_cents as number | null) ?? null,
        (row.target_margin_percent as number | null) ?? null,
        (row.computed_price_per_kg_cents as number | null) ?? null,
        row.has_container_return as number,
        (row.container_label as string | null) ?? null,
        row.container_deposit_cents as number,
        row.default_container_quantity_per_sale as number,
        row.created_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const inventoryPools = await supabaseSelectAll("inventory_pools", { store_id: storeId });
    for (const inventoryPool of inventoryPools) {
      const row = inventoryPool as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO inventory_pools (
          name,
          base_unit_label,
          quantity_available,
          reorder_threshold,
          created_at,
          updated_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          name = excluded.name,
          base_unit_label = excluded.base_unit_label,
          quantity_available = excluded.quantity_available,
          reorder_threshold = excluded.reorder_threshold,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          synced = 1`,
        row.name as string,
        row.base_unit_label as string,
        row.quantity_available as number,
        row.reorder_threshold as number,
        row.created_at as string,
        row.updated_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const expenses = await supabaseSelectAll("expenses", { store_id: storeId });
    for (const expense of expenses) {
      const row = expense as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO expenses (
          category,
          amount_cents,
          description,
          expense_date,
          created_at,
          updated_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          category = excluded.category,
          amount_cents = excluded.amount_cents,
          description = excluded.description,
          expense_date = excluded.expense_date,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          synced = 1`,
        row.category as string,
        row.amount_cents as number,
        (row.description as string | null) ?? null,
        row.expense_date as string,
        row.created_at as string,
        row.updated_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const expenseBudgets = await supabaseSelectAll("expense_budgets", { store_id: storeId });
    for (const expenseBudget of expenseBudgets) {
      const row = expenseBudget as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO expense_budgets (
          category,
          amount_cents,
          budget_month,
          created_at,
          updated_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          category = excluded.category,
          amount_cents = excluded.amount_cents,
          budget_month = excluded.budget_month,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          synced = 1`,
        row.category as string,
        row.amount_cents as number,
        row.budget_month as string,
        row.created_at as string,
        row.updated_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const restockLists = await supabaseSelectAll("restock_lists", { store_id: storeId });
    for (const restockList of restockLists) {
      const row = restockList as Record<string, unknown>;
      await db.runAsync(
        `INSERT INTO restock_lists (
          title,
          status,
          created_at,
          completed_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          created_at = excluded.created_at,
          completed_at = excluded.completed_at,
          synced = 1`,
        row.title as string,
        row.status as string,
        row.created_at as string,
        (row.completed_at as string | null) ?? null,
        row.sync_id as string,
      );
      restored++;
    }

    const sales = await supabaseSelectAll("sales", { store_id: storeId });
    for (const sale of sales) {
      const row = sale as Record<string, unknown>;
      const customerId = await findLocalIdBySyncId(db, "customers", (row.customer_sync_id as string | null) ?? null);

      await db.runAsync(
        `INSERT INTO sales (
          total_cents,
          cash_paid_cents,
          change_given_cents,
          discount_cents,
          payment_method,
          customer_id,
          created_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          total_cents = excluded.total_cents,
          cash_paid_cents = excluded.cash_paid_cents,
          change_given_cents = excluded.change_given_cents,
          discount_cents = excluded.discount_cents,
          payment_method = excluded.payment_method,
          customer_id = excluded.customer_id,
          created_at = excluded.created_at,
          synced = 1`,
        row.total_cents as number,
        row.cash_paid_cents as number,
        row.change_given_cents as number,
        row.discount_cents as number,
        row.payment_method as string,
        customerId,
        row.created_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const utang = await supabaseSelectAll("utang", { store_id: storeId });
    for (const entry of utang) {
      const row = entry as Record<string, unknown>;
      const customerId = await requireLocalIdBySyncId(db, "customers", row.customer_sync_id as string);

      await db.runAsync(
        `INSERT INTO utang (
          customer_id,
          amount_cents,
          amount_paid_cents,
          description,
          created_at,
          paid_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          customer_id = excluded.customer_id,
          amount_cents = excluded.amount_cents,
          amount_paid_cents = excluded.amount_paid_cents,
          description = excluded.description,
          created_at = excluded.created_at,
          paid_at = excluded.paid_at,
          synced = 1`,
        customerId,
        row.amount_cents as number,
        row.amount_paid_cents as number,
        (row.description as string | null) ?? null,
        row.created_at as string,
        (row.paid_at as string | null) ?? null,
        row.sync_id as string,
      );
      restored++;
    }

    const productInventoryLinks = await supabaseSelectAll("product_inventory_links", { store_id: storeId });
    for (const link of productInventoryLinks) {
      const row = link as Record<string, unknown>;
      const productId = await requireLocalIdBySyncId(db, "products", row.product_sync_id as string);
      const inventoryPoolId = await requireLocalIdBySyncId(db, "inventory_pools", row.inventory_pool_sync_id as string);

      await db.runAsync(
        `INSERT INTO product_inventory_links (
          product_id,
          inventory_pool_id,
          units_per_sale,
          display_unit_label,
          is_primary_restock_product,
          created_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          product_id = excluded.product_id,
          inventory_pool_id = excluded.inventory_pool_id,
          units_per_sale = excluded.units_per_sale,
          display_unit_label = excluded.display_unit_label,
          is_primary_restock_product = excluded.is_primary_restock_product,
          created_at = excluded.created_at,
          synced = 1`,
        productId,
        inventoryPoolId,
        row.units_per_sale as number,
        row.display_unit_label as string,
        row.is_primary_restock_product as number,
        row.created_at as string,
        row.sync_id as string,
      );
      restored++;
    }

    const restockListItems = await supabaseSelectAll("restock_list_items", { store_id: storeId });
    for (const item of restockListItems) {
      const row = item as Record<string, unknown>;
      const restockListId = await requireLocalIdBySyncId(db, "restock_lists", row.restock_list_sync_id as string);
      const productId = await findLocalIdBySyncId(db, "products", (row.product_sync_id as string | null) ?? null);

      await db.runAsync(
        `INSERT INTO restock_list_items (
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
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          restock_list_id = excluded.restock_list_id,
          product_id = excluded.product_id,
          product_name_snapshot = excluded.product_name_snapshot,
          category_snapshot = excluded.category_snapshot,
          current_stock_snapshot = excluded.current_stock_snapshot,
          min_stock_snapshot = excluded.min_stock_snapshot,
          suggested_quantity = excluded.suggested_quantity,
          is_weight_based_snapshot = excluded.is_weight_based_snapshot,
          is_checked = excluded.is_checked,
          checked_at = excluded.checked_at,
          note = excluded.note,
          synced = 1`,
        restockListId,
        productId,
        row.product_name_snapshot as string,
        (row.category_snapshot as string | null) ?? null,
        row.current_stock_snapshot as number,
        row.min_stock_snapshot as number,
        row.suggested_quantity as number,
        row.is_weight_based_snapshot as number,
        row.is_checked as number,
        (row.checked_at as string | null) ?? null,
        (row.note as string | null) ?? null,
        row.sync_id as string,
      );
      restored++;
    }

    const saleItems = await supabaseSelectAll("sale_items", { store_id: storeId });
    for (const saleItem of saleItems) {
      const row = saleItem as Record<string, unknown>;
      const saleId = await requireLocalIdBySyncId(db, "sales", row.sale_sync_id as string);
      const productId = await findLocalIdBySyncId(db, "products", (row.product_sync_id as string | null) ?? null);

      await db.runAsync(
        `INSERT INTO sale_items (
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
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          sale_id = excluded.sale_id,
          product_id = excluded.product_id,
          product_name = excluded.product_name,
          unit_price_cents = excluded.unit_price_cents,
          unit_cost_cents = excluded.unit_cost_cents,
          quantity = excluded.quantity,
          is_weight_based = excluded.is_weight_based,
          weight_kg = excluded.weight_kg,
          line_total_cents = excluded.line_total_cents,
          line_cost_total_cents = excluded.line_cost_total_cents,
          synced = 1`,
        saleId,
        productId,
        row.product_name as string,
        row.unit_price_cents as number,
        row.unit_cost_cents as number,
        row.quantity as number,
        row.is_weight_based as number,
        (row.weight_kg as number | null) ?? null,
        row.line_total_cents as number,
        row.line_cost_total_cents as number,
        row.sync_id as string,
      );
      restored++;
    }

    const containerReturnEvents = await supabaseSelectAll("container_return_events", { store_id: storeId });
    for (const event of containerReturnEvents) {
      const row = event as Record<string, unknown>;
      const saleId = await requireLocalIdBySyncId(db, "sales", row.sale_sync_id as string);
      const customerId = await findLocalIdBySyncId(db, "customers", (row.customer_sync_id as string | null) ?? null);
      const productId = await findLocalIdBySyncId(db, "products", (row.product_sync_id as string | null) ?? null);

      await db.runAsync(
        `INSERT INTO container_return_events (
          sale_id,
          customer_id,
          product_id,
          product_name_snapshot,
          container_label_snapshot,
          quantity_out,
          quantity_returned,
          created_at,
          last_returned_at,
          status,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          sale_id = excluded.sale_id,
          customer_id = excluded.customer_id,
          product_id = excluded.product_id,
          product_name_snapshot = excluded.product_name_snapshot,
          container_label_snapshot = excluded.container_label_snapshot,
          quantity_out = excluded.quantity_out,
          quantity_returned = excluded.quantity_returned,
          created_at = excluded.created_at,
          last_returned_at = excluded.last_returned_at,
          status = excluded.status,
          synced = 1`,
        saleId,
        customerId,
        productId,
        row.product_name_snapshot as string,
        row.container_label_snapshot as string,
        row.quantity_out as number,
        row.quantity_returned as number,
        row.created_at as string,
        (row.last_returned_at as string | null) ?? null,
        row.status as string,
        row.sync_id as string,
      );
      restored++;
    }

    const repackSessions = await supabaseSelectAll("repack_sessions", { store_id: storeId });
    for (const session of repackSessions) {
      const row = session as Record<string, unknown>;
      const inventoryPoolId = await requireLocalIdBySyncId(db, "inventory_pools", row.inventory_pool_sync_id as string);
      const sourceProductId = await requireLocalIdBySyncId(db, "products", row.source_product_sync_id as string);
      const outputProductId = await requireLocalIdBySyncId(db, "products", row.output_product_sync_id as string);

      await db.runAsync(
        `INSERT INTO repack_sessions (
          inventory_pool_id,
          source_product_id,
          output_product_id,
          source_quantity_used,
          output_units_created,
          wastage_units,
          created_at,
          note,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          inventory_pool_id = excluded.inventory_pool_id,
          source_product_id = excluded.source_product_id,
          output_product_id = excluded.output_product_id,
          source_quantity_used = excluded.source_quantity_used,
          output_units_created = excluded.output_units_created,
          wastage_units = excluded.wastage_units,
          created_at = excluded.created_at,
          note = excluded.note,
          synced = 1`,
        inventoryPoolId,
        sourceProductId,
        outputProductId,
        row.source_quantity_used as number,
        row.output_units_created as number,
        row.wastage_units as number,
        row.created_at as string,
        (row.note as string | null) ?? null,
        row.sync_id as string,
      );
      restored++;
    }

    const utangPayments = await supabaseSelectAll("utang_payments", { store_id: storeId });
    for (const payment of utangPayments) {
      const row = payment as Record<string, unknown>;
      const utangId = await requireLocalIdBySyncId(db, "utang", row.utang_sync_id as string);
      const customerId = await requireLocalIdBySyncId(db, "customers", row.customer_sync_id as string);

      await db.runAsync(
        `INSERT INTO utang_payments (
          utang_id,
          customer_id,
          amount_cents,
          note,
          source,
          created_at,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(sync_id) DO UPDATE SET
          utang_id = excluded.utang_id,
          customer_id = excluded.customer_id,
          amount_cents = excluded.amount_cents,
          note = excluded.note,
          source = excluded.source,
          created_at = excluded.created_at,
          synced = 1`,
        utangId,
        customerId,
        row.amount_cents as number,
        (row.note as string | null) ?? null,
        row.source as string,
        row.created_at as string,
        row.sync_id as string,
      );
      restored++;
    }
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }

  const timestamp = await setLastSyncTime(storeId);
  return restored > 0
    ? `Na-restore na! ${restored} records downloaded from your store backup. (${timestamp})`
    : "Walang data sa cloud para sa active store.";
}

export async function getLastSyncTime(db: SQLiteDatabase) {
  const storeId = await getActiveStoreId(db);

  if (!storeId) {
    return null;
  }

  return Storage.getItem(getLastSyncKey(storeId));
}
