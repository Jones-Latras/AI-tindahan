import type { SQLiteDatabase } from "expo-sqlite";

import { getDaysBetween, getOverdueLevel } from "@/utils/date";
import {
  computeTransactionTotal,
  resolveWeightBasedPricing,
} from "@/utils/pricing";
import { sanitizeOptionalText, sanitizePhone, sanitizeText } from "@/utils/validation";
import type {
  CustomerRiskProfile,
  CustomerSummary,
  HomeMetrics,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  ProductPricingMode,
  ProductPricingStrategy,
  ProductVelocity,
  RiskCustomerAlert,
  SaleItemInput,
  SalesInsightContext,
  StoreAiContext,
  TopProductSummary,
  TrustScore,
  UtangLedgerEntry,
  WeeklyPaymentReport,
} from "@/types/models";

type ProductRow = {
  id: number;
  name: string;
  price_cents: number;
  cost_price_cents: number;
  stock: number;
  category: string | null;
  barcode: string | null;
  image_uri: string | null;
  min_stock: number;
  is_weight_based: number;
  pricing_mode: ProductPricingMode;
  pricing_strategy: ProductPricingStrategy;
  total_kg_available: number | null;
  cost_price_total_cents: number | null;
  selling_price_total_cents: number | null;
  cost_price_per_kg_cents: number | null;
  selling_price_per_kg_cents: number | null;
  target_margin_percent: number | null;
  computed_price_per_kg_cents: number | null;
  created_at: string;
};

type CategoryRow = {
  category: string | null;
};

type CustomerBalanceRow = {
  id: number;
  name: string;
  phone: string | null;
  trust_score: TrustScore;
  balance_cents: number;
  last_utang_date: string | null;
};

type LedgerRow = {
  id: number;
  customer_id: number;
  amount_cents: number;
  amount_paid_cents: number;
  description: string | null;
  created_at: string;
  paid_at: string | null;
};

type PaymentBreakdownRow = {
  cash_cents: number | null;
  gcash_cents: number | null;
  maya_cents: number | null;
  utang_cents: number | null;
};

type DailySalesRow = {
  sale_date: string;
  total_cents: number;
  transactions: number;
};

type TopProductRow = {
  id: number;
  name: string;
  quantity_sold: number;
  revenue_cents: number;
};

type ProductVelocityRow = {
  id: number;
  name: string;
  current_stock: number;
  units_sold: number;
  is_weight_based: number;
};

type CustomerRiskRow = {
  total_paid_cents: number | null;
  total_unpaid_cents: number | null;
  avg_days_to_pay: number | null;
  max_days_unpaid: number | null;
  paid_entries: number | null;
  unpaid_entries: number | null;
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    costPriceCents: row.cost_price_cents,
    stock: row.stock,
    category: row.category,
    barcode: row.barcode,
    imageUri: row.image_uri,
    minStock: row.min_stock,
    createdAt: row.created_at,
    isWeightBased: Boolean(row.is_weight_based),
    pricingMode: row.pricing_mode,
    pricingStrategy: row.pricing_strategy,
    totalKgAvailable: row.total_kg_available,
    costPriceTotalCents: row.cost_price_total_cents,
    sellingPriceTotalCents: row.selling_price_total_cents,
    costPricePerKgCents: row.cost_price_per_kg_cents,
    sellingPricePerKgCents: row.selling_price_per_kg_cents,
    targetMarginPercent: row.target_margin_percent,
    computedPricePerKgCents: row.computed_price_per_kg_cents,
  };
}

function normalizePaymentBreakdown(row?: PaymentBreakdownRow | null): PaymentBreakdown {
  return {
    cashCents: row?.cash_cents ?? 0,
    gcashCents: row?.gcash_cents ?? 0,
    mayaCents: row?.maya_cents ?? 0,
    utangCents: row?.utang_cents ?? 0,
  };
}

function assertMoney(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative amount.`);
  }
}

function assertWholeNumber(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
}

function assertNonNegativeNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
}

export type ProductInput = {
  name: string;
  priceCents: number;
  costPriceCents: number;
  stock: number;
  category: string;
  barcode: string;
  imageUri?: string;
  minStock: number;
  isWeightBased?: boolean;
  pricingMode?: ProductPricingMode;
  pricingStrategy?: ProductPricingStrategy;
  totalKgAvailable?: number | null;
  costPriceTotalCents?: number | null;
  sellingPriceTotalCents?: number | null;
  costPricePerKgCents?: number | null;
  sellingPricePerKgCents?: number | null;
  targetMarginPercent?: number | null;
  computedPricePerKgCents?: number | null;
};

export type CustomerInput = {
  name: string;
  phone: string;
  trustScore?: TrustScore;
};

export type UtangInput = {
  customerId: number;
  amountCents: number;
  description: string;
};

export type CheckoutInput = {
  items: SaleItemInput[];
  totalCents: number;
  discountCents: number;
  cashPaidCents: number;
  paymentMethod: PaymentMethod;
  customerId?: number | null;
  utangDescription?: string;
};

export async function listProducts(db: SQLiteDatabase, searchTerm = "") {
  const safeTerm = sanitizeText(searchTerm, 40);

  const rows = safeTerm
    ? await db.getAllAsync<ProductRow>(
        `
          SELECT *
          FROM products
          WHERE name LIKE ? OR COALESCE(category, '') LIKE ? OR COALESCE(barcode, '') LIKE ?
          ORDER BY name ASC
        `,
        `%${safeTerm}%`,
        `%${safeTerm}%`,
        `%${safeTerm}%`,
      )
    : await db.getAllAsync<ProductRow>(
        `
          SELECT *
          FROM products
          ORDER BY name ASC
        `,
      );

  return rows.map(mapProduct);
}

export async function listProductCategories(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<CategoryRow>(
    `
      SELECT DISTINCT TRIM(category) AS category
      FROM products
      WHERE category IS NOT NULL
        AND TRIM(category) <> ''
      ORDER BY category COLLATE NOCASE ASC
    `,
  );

  return rows
    .map((row) => row.category?.trim() ?? "")
    .filter((category) => category.length > 0);
}

export async function getProductByBarcode(db: SQLiteDatabase, barcode: string) {
  const safeBarcode = sanitizeText(barcode, 48);

  if (!safeBarcode) {
    return null;
  }

  const row = await db.getFirstAsync<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE barcode = ?
      LIMIT 1
    `,
    safeBarcode,
  );

  return row ? mapProduct(row) : null;
}

export async function saveProduct(db: SQLiteDatabase, input: ProductInput, productId?: number) {
  const name = sanitizeText(input.name, 80);
  const category = sanitizeOptionalText(input.category, 40);
  const barcode = sanitizeOptionalText(input.barcode, 48);
  const imageUri = sanitizeOptionalText(input.imageUri ?? "", 2048);
  const isWeightBased = Boolean(input.isWeightBased);
  const pricingMode: ProductPricingMode = isWeightBased ? input.pricingMode ?? "direct" : "direct";
  const pricingStrategy: ProductPricingStrategy = isWeightBased ? input.pricingStrategy ?? "manual" : "manual";

  if (name.length < 2) {
    throw new Error("Product name must be at least 2 characters.");
  }

  let priceCents = input.priceCents;
  let costPriceCents = input.costPriceCents;
  let stock = input.stock;
  let minStock = input.minStock;
  let totalKgAvailable: number | null = null;
  let costPriceTotalCents: number | null = null;
  let sellingPriceTotalCents: number | null = null;
  let costPricePerKgCents: number | null = null;
  let sellingPricePerKgCents: number | null = null;
  let targetMarginPercent: number | null = null;
  let computedPricePerKgCents: number | null = null;

  if (isWeightBased) {
    assertNonNegativeNumber(minStock, "Minimum stock");

    const resolvedPricing = resolveWeightBasedPricing({
      pricingMode,
      pricingStrategy,
      totalKgAvailable: input.totalKgAvailable ?? 0,
      costPriceTotalCents: input.costPriceTotalCents,
      sellingPriceTotalCents: input.sellingPriceTotalCents,
      costPricePerKgCents: input.costPricePerKgCents ?? input.costPriceCents,
      sellingPricePerKgCents: input.sellingPricePerKgCents ?? input.priceCents,
      targetMarginPercent: input.targetMarginPercent,
    });

    priceCents = resolvedPricing.sellingPricePerKgCents;
    costPriceCents = resolvedPricing.costPricePerKgCents;
    stock = 0;
    totalKgAvailable = resolvedPricing.totalKgAvailable;
    costPriceTotalCents = resolvedPricing.costPriceTotalCents;
    sellingPriceTotalCents = resolvedPricing.sellingPriceTotalCents;
    costPricePerKgCents = resolvedPricing.costPricePerKgCents;
    sellingPricePerKgCents = resolvedPricing.sellingPricePerKgCents;
    targetMarginPercent = resolvedPricing.targetMarginPercent;
    computedPricePerKgCents = resolvedPricing.computedPricePerKgCents;
  } else {
    assertMoney(priceCents, "Price");
    assertMoney(costPriceCents, "Cost price");
    assertWholeNumber(stock, "Stock");
    assertWholeNumber(minStock, "Minimum stock");

    if (costPriceCents >= priceCents) {
      throw new Error("Selling price must be greater than cost price.");
    }

    costPriceTotalCents = costPriceCents * stock;
    sellingPriceTotalCents = priceCents * stock;
  }

  if (productId) {
    await db.runAsync(
      `
        UPDATE products
        SET
          name = ?,
          price_cents = ?,
          cost_price_cents = ?,
          stock = ?,
          category = ?,
          barcode = ?,
          image_uri = ?,
          min_stock = ?,
          is_weight_based = ?,
          pricing_mode = ?,
          pricing_strategy = ?,
          total_kg_available = ?,
          cost_price_total_cents = ?,
          selling_price_total_cents = ?,
          cost_price_per_kg_cents = ?,
          selling_price_per_kg_cents = ?,
          target_margin_percent = ?,
          computed_price_per_kg_cents = ?,
          synced = 0
        WHERE id = ?
      `,
      name,
      priceCents,
      costPriceCents,
      stock,
      category,
      barcode,
      imageUri,
      minStock,
      isWeightBased ? 1 : 0,
      pricingMode,
      pricingStrategy,
      totalKgAvailable,
      costPriceTotalCents,
      sellingPriceTotalCents,
      costPricePerKgCents,
      sellingPricePerKgCents,
      targetMarginPercent,
      computedPricePerKgCents,
      productId,
    );
    return productId;
  }

  const result = await db.runAsync(
    `
      INSERT INTO products (
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
        computed_price_per_kg_cents
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    name,
    priceCents,
    costPriceCents,
    stock,
    category,
    barcode,
    imageUri,
    minStock,
    isWeightBased ? 1 : 0,
    pricingMode,
    pricingStrategy,
    totalKgAvailable,
    costPriceTotalCents,
    sellingPriceTotalCents,
    costPricePerKgCents,
    sellingPricePerKgCents,
    targetMarginPercent,
    computedPricePerKgCents,
  );

  return Number(result.lastInsertRowId);
}

export async function deleteProduct(db: SQLiteDatabase, productId: number) {
  await db.runAsync("DELETE FROM products WHERE id = ?", productId);
}

export async function getHomeMetrics(db: SQLiteDatabase): Promise<HomeMetrics> {
  const salesRow = await db.getFirstAsync<{ today_sales_cents: number | null; transaction_count: number | null }>(
    `
      SELECT
        COALESCE(SUM(total_cents), 0) AS today_sales_cents,
        COUNT(*) AS transaction_count
      FROM sales
      WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
    `,
  );

  const profitRow = await db.getFirstAsync<{ today_profit_cents: number | null }>(
    `
      SELECT
        COALESCE(SUM(si.line_total_cents - si.line_cost_total_cents), 0) AS today_profit_cents
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE DATE(s.created_at, 'localtime') = DATE('now', 'localtime')
    `,
  );

  const utangRow = await db.getFirstAsync<{ total_utang_cents: number | null }>(
    `
      SELECT
        COALESCE(SUM(amount_cents - amount_paid_cents), 0) AS total_utang_cents
      FROM utang
      WHERE amount_paid_cents < amount_cents
    `,
  );

  const paymentBreakdownRow = await db.getFirstAsync<PaymentBreakdownRow>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_cents ELSE 0 END), 0) AS cash_cents,
        COALESCE(SUM(CASE WHEN payment_method = 'gcash' THEN total_cents ELSE 0 END), 0) AS gcash_cents,
        COALESCE(SUM(CASE WHEN payment_method = 'maya' THEN total_cents ELSE 0 END), 0) AS maya_cents,
        COALESCE(SUM(CASE WHEN payment_method = 'utang' THEN total_cents ELSE 0 END), 0) AS utang_cents
      FROM sales
      WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
    `,
  );

  const lowStockRows = await db.getAllAsync<ProductRow>(
    `
      SELECT *
      FROM products
      WHERE
        CASE
          WHEN is_weight_based = 1 THEN COALESCE(total_kg_available, 0)
          ELSE stock
        END <= min_stock
      ORDER BY
        CASE
          WHEN is_weight_based = 1 THEN COALESCE(total_kg_available, 0)
          ELSE stock
        END ASC,
        name ASC
      LIMIT 5
    `,
  );

  const delikadoRows = await db.getAllAsync<{
    id: number;
    name: string;
    balance_cents: number;
  }>(
    `
      SELECT
        c.id,
        c.name,
        COALESCE(SUM(u.amount_cents - u.amount_paid_cents), 0) AS balance_cents
      FROM customers c
      LEFT JOIN utang u ON c.id = u.customer_id
      WHERE c.trust_score = 'Delikado'
      GROUP BY c.id, c.name
      HAVING balance_cents > 0
      ORDER BY balance_cents DESC, c.name ASC
      LIMIT 3
    `,
  );

  return {
    todaySalesCents: salesRow?.today_sales_cents ?? 0,
    todayTransactions: salesRow?.transaction_count ?? 0,
    todayProfitCents: profitRow?.today_profit_cents ?? 0,
    totalUtangCents: utangRow?.total_utang_cents ?? 0,
    lowStockProducts: lowStockRows.map(mapProduct),
    delikadoCustomers: delikadoRows.map<RiskCustomerAlert>((row) => ({
      id: row.id,
      name: row.name,
      balanceCents: row.balance_cents,
    })),
    paymentBreakdown: normalizePaymentBreakdown(paymentBreakdownRow),
  };
}

export async function getSalesInsightContext(db: SQLiteDatabase): Promise<SalesInsightContext> {
  const dailySalesRows = await db.getAllAsync<DailySalesRow>(
    `
      SELECT
        DATE(created_at, 'localtime') AS sale_date,
        COALESCE(SUM(total_cents), 0) AS total_cents,
        COUNT(*) AS transactions
      FROM sales
      WHERE DATE(created_at, 'localtime') >= DATE('now', '-6 days', 'localtime')
      GROUP BY DATE(created_at, 'localtime')
      ORDER BY sale_date ASC
    `,
  );

  const topProductRows = await db.getAllAsync<TopProductRow>(
    `
      SELECT
        p.id,
        p.name,
        COALESCE(
          SUM(
            CASE
              WHEN si.is_weight_based = 1 THEN COALESCE(si.weight_kg, 0)
              ELSE si.quantity
            END
          ),
          0
        ) AS quantity_sold,
        COALESCE(SUM(si.line_total_cents), 0) AS revenue_cents
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      INNER JOIN products p ON p.id = si.product_id
      WHERE DATE(s.created_at, 'localtime') >= DATE('now', '-6 days', 'localtime')
      GROUP BY p.id, p.name
      ORDER BY quantity_sold DESC, revenue_cents DESC
      LIMIT 5
    `,
  );

  const totalSalesCents = dailySalesRows.reduce((total, row) => total + row.total_cents, 0);
  const totalTransactions = dailySalesRows.reduce((total, row) => total + row.transactions, 0);

  return {
    dailySales: dailySalesRows.map((row) => ({
      date: row.sale_date,
      totalCents: row.total_cents,
      transactions: row.transactions,
    })),
    totalSalesCents,
    totalTransactions,
    topProducts: topProductRows.map<TopProductSummary>((row) => ({
      id: row.id,
      name: row.name,
      quantitySold: row.quantity_sold,
      revenueCents: row.revenue_cents,
    })),
  };
}

export async function getProductSalesVelocity(db: SQLiteDatabase): Promise<ProductVelocity[]> {
  const rows = await db.getAllAsync<ProductVelocityRow>(
    `
      SELECT
        p.id,
        p.name,
        p.is_weight_based,
        CASE
          WHEN p.is_weight_based = 1 THEN COALESCE(p.total_kg_available, 0)
          ELSE p.stock
        END AS current_stock,
        COALESCE(
          SUM(
            CASE
              WHEN s.id IS NOT NULL THEN
                CASE
                  WHEN si.is_weight_based = 1 THEN COALESCE(si.weight_kg, 0)
                  ELSE si.quantity
                END
              ELSE 0
            END
          ),
          0
        ) AS units_sold
      FROM products p
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
        AND DATE(s.created_at, 'localtime') >= DATE('now', '-13 days', 'localtime')
      GROUP BY p.id, p.name, p.is_weight_based, p.stock, p.total_kg_available
      ORDER BY units_sold DESC, p.name ASC
    `,
  );

  return rows.map((row) => {
    const unitsPerDay = Number((row.units_sold / 14).toFixed(2));
    const daysUntilOutOfStock = unitsPerDay > 0 ? Number((row.current_stock / unitsPerDay).toFixed(1)) : null;

    return {
      id: row.id,
      name: row.name,
      unitsPerDay,
      currentStock: row.current_stock,
      daysUntilOutOfStock,
      isWeightBased: Boolean(row.is_weight_based),
    };
  });
}

export async function getStoreAiContext(db: SQLiteDatabase): Promise<StoreAiContext> {
  const homeMetrics = await getHomeMetrics(db);
  const topProducts = await db.getAllAsync<{ name: string }>(
    `
      SELECT
        p.name
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      INNER JOIN products p ON p.id = si.product_id
      WHERE DATE(s.created_at, 'localtime') >= DATE('now', '-29 days', 'localtime')
      GROUP BY p.id, p.name
      ORDER BY
        SUM(
          CASE
            WHEN si.is_weight_based = 1 THEN COALESCE(si.weight_kg, 0)
            ELSE si.quantity
          END
        ) DESC,
        p.name ASC
      LIMIT 5
    `,
  );
  const customerBalances = await db.getAllAsync<{
    name: string;
    balance_cents: number;
    trust_score: TrustScore;
  }>(
    `
      SELECT
        c.name,
        COALESCE(SUM(u.amount_cents - u.amount_paid_cents), 0) AS balance_cents,
        c.trust_score
      FROM customers c
      LEFT JOIN utang u ON u.customer_id = c.id
      GROUP BY c.id, c.name, c.trust_score
      HAVING balance_cents > 0
      ORDER BY balance_cents DESC, c.name ASC
      LIMIT 5
    `,
  );

  return {
    todaySalesCents: homeMetrics.todaySalesCents,
    totalUtangCents: homeMetrics.totalUtangCents,
    lowStockProducts: homeMetrics.lowStockProducts.map((product) => product.name),
    topProducts: topProducts.map((product) => product.name),
    delikadoCustomers: homeMetrics.delikadoCustomers.map((customer) => customer.name),
    paymentBreakdown: homeMetrics.paymentBreakdown,
    customerBalances: customerBalances.map((row) => ({
      name: row.name,
      balanceCents: row.balance_cents,
      trustScore: row.trust_score,
    })),
  };
}

export async function listCustomersWithBalances(db: SQLiteDatabase): Promise<CustomerSummary[]> {
  const rows = await db.getAllAsync<CustomerBalanceRow>(
    `
      SELECT
        c.id,
        c.name,
        c.phone,
        c.trust_score,
        COALESCE(SUM(u.amount_cents - u.amount_paid_cents), 0) AS balance_cents,
        MAX(u.created_at) AS last_utang_date
      FROM customers c
      LEFT JOIN utang u ON c.id = u.customer_id
      GROUP BY c.id, c.name, c.phone, c.trust_score
      ORDER BY balance_cents DESC, c.name ASC
    `,
  );

  return rows.map((row) => {
    const days = getDaysBetween(row.last_utang_date);

    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      trustScore: row.trust_score,
      balanceCents: row.balance_cents ?? 0,
      lastUtangDate: row.last_utang_date,
      overdueLevel: getOverdueLevel(days),
    };
  });
}

export async function saveCustomer(db: SQLiteDatabase, input: CustomerInput, customerId?: number) {
  const name = sanitizeText(input.name, 80);
  const phone = sanitizePhone(input.phone);
  const trustScore = input.trustScore ?? "Bago";

  if (name.length < 2) {
    throw new Error("Customer name must be at least 2 characters.");
  }

  if (customerId) {
    await db.runAsync(
      `
        UPDATE customers
        SET name = ?, phone = ?, trust_score = ?
        WHERE id = ?
      `,
      name,
      phone,
      trustScore,
      customerId,
    );
    return customerId;
  }

  const result = await db.runAsync(
    `
      INSERT INTO customers (name, phone, trust_score)
      VALUES (?, ?, ?)
    `,
    name,
    phone,
    trustScore,
  );

  return Number(result.lastInsertRowId);
}

export async function updateCustomerTrustScore(db: SQLiteDatabase, customerId: number, trustScore: TrustScore) {
  await db.runAsync(
    `
      UPDATE customers
      SET trust_score = ?
      WHERE id = ?
    `,
    trustScore,
    customerId,
  );
}

export async function getCustomerRiskProfile(db: SQLiteDatabase, customerId: number): Promise<CustomerRiskProfile> {
  const row = await db.getFirstAsync<CustomerRiskRow>(
    `
      SELECT
        COALESCE(SUM(amount_paid_cents), 0) AS total_paid_cents,
        COALESCE(SUM(amount_cents - amount_paid_cents), 0) AS total_unpaid_cents,
        AVG(
          CASE
            WHEN paid_at IS NOT NULL THEN julianday(paid_at) - julianday(created_at)
            ELSE NULL
          END
        ) AS avg_days_to_pay,
        MAX(
          CASE
            WHEN amount_paid_cents < amount_cents THEN julianday('now') - julianday(created_at)
            ELSE 0
          END
        ) AS max_days_unpaid,
        SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) AS paid_entries,
        SUM(CASE WHEN amount_paid_cents < amount_cents THEN 1 ELSE 0 END) AS unpaid_entries
      FROM utang
      WHERE customer_id = ?
    `,
    customerId,
  );

  return {
    customerId,
    totalPaidCents: Math.round(row?.total_paid_cents ?? 0),
    totalUnpaidCents: Math.round(row?.total_unpaid_cents ?? 0),
    avgDaysToPay: Number((row?.avg_days_to_pay ?? 0).toFixed(1)),
    maxDaysUnpaid: Number((row?.max_days_unpaid ?? 0).toFixed(1)),
    paidEntries: Math.round(row?.paid_entries ?? 0),
    unpaidEntries: Math.round(row?.unpaid_entries ?? 0),
  };
}

export async function addUtangEntry(db: SQLiteDatabase, input: UtangInput) {
  assertMoney(input.amountCents, "Utang amount");

  const description = sanitizeOptionalText(input.description, 140);

  if (input.amountCents <= 0) {
    throw new Error("Utang amount must be greater than zero.");
  }

  const result = await db.runAsync(
    `
      INSERT INTO utang (customer_id, amount_cents, amount_paid_cents, description)
      VALUES (?, ?, 0, ?)
    `,
    input.customerId,
    input.amountCents,
    description,
  );

  return Number(result.lastInsertRowId);
}

export async function listCustomerLedger(db: SQLiteDatabase, customerId: number): Promise<UtangLedgerEntry[]> {
  const rows = await db.getAllAsync<LedgerRow>(
    `
      SELECT
        id,
        customer_id,
        amount_cents,
        amount_paid_cents,
        description,
        created_at,
        paid_at
      FROM utang
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `,
    customerId,
  );

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    amountPaidCents: row.amount_paid_cents,
    description: row.description,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  }));
}

export async function applyUtangPayment(db: SQLiteDatabase, utangId: number, paymentCents: number) {
  assertMoney(paymentCents, "Payment amount");

  if (paymentCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const entry = await db.getFirstAsync<LedgerRow>(
    `
      SELECT
        id,
        customer_id,
        amount_cents,
        amount_paid_cents,
        description,
        created_at,
        paid_at
      FROM utang
      WHERE id = ?
    `,
    utangId,
  );

  if (!entry) {
    throw new Error("Utang entry not found.");
  }

  const outstanding = entry.amount_cents - entry.amount_paid_cents;
  const safePayment = Math.min(paymentCents, outstanding);
  const nextPaid = entry.amount_paid_cents + safePayment;
  const fullyPaid = nextPaid >= entry.amount_cents;

  await db.runAsync(
    `
      UPDATE utang
      SET amount_paid_cents = ?, paid_at = ?
      WHERE id = ?
    `,
    nextPaid,
    fullyPaid ? new Date().toISOString() : null,
    utangId,
  );
}

export async function checkoutSale(db: SQLiteDatabase, input: CheckoutInput) {
  assertMoney(input.totalCents, "Sale total");
  assertMoney(input.discountCents, "Discount");
  assertMoney(input.cashPaidCents, "Cash paid");

  if (input.items.length === 0) {
    throw new Error("Add at least one item before checkout.");
  }

  if (input.paymentMethod === "cash" && input.cashPaidCents < input.totalCents) {
    throw new Error("Cash paid cannot be less than the sale total.");
  }

  if (input.paymentMethod === "utang" && !input.customerId) {
    throw new Error("Select a customer before saving an utang sale.");
  }

  const safeItems = input.items.map((item) => ({
    id: item.id,
    name: sanitizeText(item.name, 80),
    priceCents: item.priceCents,
    costPriceCents: item.costPriceCents,
    quantity: item.isWeightBased ? 1 : item.quantity,
    isWeightBased: item.isWeightBased,
    weightKg: item.isWeightBased ? item.weightKg ?? item.quantity : null,
    lineTotalCents: item.lineTotalCents,
    lineCostTotalCents: item.lineCostTotalCents,
  }));

  safeItems.forEach((item) => {
    if (item.name.length < 2) {
      throw new Error("Invalid product found in the cart.");
    }

    assertMoney(item.priceCents, "Item price");
    assertMoney(item.costPriceCents, "Item cost");

    assertMoney(item.lineTotalCents, "Line total");
    assertMoney(item.lineCostTotalCents, "Line cost total");

    if (item.isWeightBased) {
      assertNonNegativeNumber(item.weightKg ?? Number.NaN, "Weight");

      if ((item.weightKg ?? 0) <= 0) {
        throw new Error("Weight-based items must have a weight greater than zero.");
      }

      if (item.lineTotalCents !== computeTransactionTotal(item.weightKg ?? 0, item.priceCents)) {
        throw new Error(`Weight-based total is invalid for ${item.name}.`);
      }

      if (item.lineCostTotalCents !== computeTransactionTotal(item.weightKg ?? 0, item.costPriceCents)) {
        throw new Error(`Weight-based cost total is invalid for ${item.name}.`);
      }
    } else {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("Cart quantities must be whole numbers.");
      }

      if (item.lineTotalCents !== item.priceCents * item.quantity) {
        throw new Error(`Line total is invalid for ${item.name}.`);
      }

      if (item.lineCostTotalCents !== item.costPriceCents * item.quantity) {
        throw new Error(`Line cost total is invalid for ${item.name}.`);
      }
    }
  });

  const cashPaidCents = input.paymentMethod === "cash" ? input.cashPaidCents : 0;
  const changeGivenCents = input.paymentMethod === "cash" ? input.cashPaidCents - input.totalCents : 0;
  const utangDescription = sanitizeOptionalText(input.utangDescription ?? "", 140);

  let saleId = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const item of safeItems) {
      const product = await txn.getFirstAsync<{
        stock: number;
        is_weight_based: number;
        total_kg_available: number | null;
      }>(
        `
          SELECT stock, is_weight_based, total_kg_available
          FROM products
          WHERE id = ?
        `,
        item.id,
      );

      if (!product) {
        throw new Error(`Product "${item.name}" was not found.`);
      }

      if (Boolean(product.is_weight_based)) {
        const availableKg = product.total_kg_available ?? 0;

        if (availableKg < (item.weightKg ?? 0)) {
          throw new Error(`Not enough stock left for ${item.name}.`);
        }
      } else if (product.stock < item.quantity) {
        throw new Error(`Not enough stock left for ${item.name}.`);
      }
    }

    const saleResult = await txn.runAsync(
      `
        INSERT INTO sales (total_cents, cash_paid_cents, change_given_cents, discount_cents, payment_method, customer_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      input.totalCents,
      cashPaidCents,
      changeGivenCents,
      input.discountCents,
      input.paymentMethod,
      input.customerId ?? null,
    );

    saleId = Number(saleResult.lastInsertRowId);

    for (const item of safeItems) {
      await txn.runAsync(
        `
          INSERT INTO sale_items (
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
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        saleId,
        item.id,
        item.name,
        item.priceCents,
        item.costPriceCents,
        item.quantity,
        item.isWeightBased ? 1 : 0,
        item.weightKg,
        item.lineTotalCents,
        item.lineCostTotalCents,
      );

      if (item.isWeightBased) {
        await txn.runAsync(
          `
            UPDATE products
            SET total_kg_available = COALESCE(total_kg_available, 0) - ?, synced = 0
            WHERE id = ?
          `,
          item.weightKg ?? 0,
          item.id,
        );
      } else {
        await txn.runAsync(
          `
            UPDATE products
            SET stock = stock - ?, synced = 0
            WHERE id = ?
          `,
          item.quantity,
          item.id,
        );
      }
    }

    if (input.paymentMethod === "utang" && input.customerId) {
      await txn.runAsync(
        `
          INSERT INTO utang (customer_id, amount_cents, amount_paid_cents, description)
          VALUES (?, ?, 0, ?)
        `,
        input.customerId,
        input.totalCents,
        utangDescription ?? `POS sale #${saleId}`,
      );
    }
  });

  return saleId;
}

type WeeklyBreakdownRow = {
  week_start: string;
  cash_cents: number | null;
  gcash_cents: number | null;
  maya_cents: number | null;
  utang_cents: number | null;
};

export async function getWeeklyPaymentBreakdown(db: SQLiteDatabase, weeks = 4): Promise<WeeklyPaymentReport[]> {
  const rows = await db.getAllAsync<WeeklyBreakdownRow>(
    `
      WITH RECURSIVE week_series(week_offset) AS (
        SELECT 0
        UNION ALL
        SELECT week_offset + 1 FROM week_series WHERE week_offset < ? - 1
      )
      SELECT
        DATE('now', '-' || (week_offset * 7 + 6) || ' days', 'localtime') AS week_start,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_cents ELSE 0 END), 0) AS cash_cents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'gcash' THEN s.total_cents ELSE 0 END), 0) AS gcash_cents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'maya' THEN s.total_cents ELSE 0 END), 0) AS maya_cents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'utang' THEN s.total_cents ELSE 0 END), 0) AS utang_cents
      FROM week_series ws
      LEFT JOIN sales s
        ON DATE(s.created_at, 'localtime') BETWEEN DATE('now', '-' || (ws.week_offset * 7 + 6) || ' days', 'localtime')
                                                AND DATE('now', '-' || (ws.week_offset * 7) || ' days', 'localtime')
      GROUP BY ws.week_offset
      ORDER BY ws.week_offset ASC
    `,
    weeks,
  );

  return rows.map((row) => {
    const start = new Date(row.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

    const breakdown = normalizePaymentBreakdown(row);

    return {
      weekLabel: `${fmt(start)}–${fmt(end)}`,
      totalCents:
        breakdown.cashCents +
        breakdown.gcashCents +
        breakdown.mayaCents +
        breakdown.utangCents,
      breakdown,
    };
  });
}
