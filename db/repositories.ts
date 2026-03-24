import type { SQLiteDatabase } from "expo-sqlite";

import { getDaysBetween, getOverdueLevel } from "@/utils/date";
import { sanitizeOptionalText, sanitizePhone, sanitizeText } from "@/utils/validation";
import type {
  CustomerRiskProfile,
  CustomerSummary,
  HomeMetrics,
  PaymentBreakdown,
  PaymentMethod,
  Product,
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
  min_stock: number;
  created_at: string;
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
    minStock: row.min_stock,
    createdAt: row.created_at,
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

export type ProductInput = {
  name: string;
  priceCents: number;
  costPriceCents: number;
  stock: number;
  category: string;
  barcode: string;
  minStock: number;
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

  if (name.length < 2) {
    throw new Error("Product name must be at least 2 characters.");
  }

  assertMoney(input.priceCents, "Price");
  assertMoney(input.costPriceCents, "Cost price");
  assertWholeNumber(input.stock, "Stock");
  assertWholeNumber(input.minStock, "Minimum stock");

  if (input.costPriceCents > input.priceCents) {
    throw new Error("Cost price cannot be higher than the selling price.");
  }

  if (productId) {
    await db.runAsync(
      `
        UPDATE products
        SET name = ?, price_cents = ?, cost_price_cents = ?, stock = ?, category = ?, barcode = ?, min_stock = ?
        WHERE id = ?
      `,
      name,
      input.priceCents,
      input.costPriceCents,
      input.stock,
      category,
      barcode,
      input.minStock,
      productId,
    );
    return productId;
  }

  const result = await db.runAsync(
    `
      INSERT INTO products (name, price_cents, cost_price_cents, stock, category, barcode, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    name,
    input.priceCents,
    input.costPriceCents,
    input.stock,
    category,
    barcode,
    input.minStock,
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
        COALESCE(SUM((si.unit_price_cents - si.unit_cost_cents) * si.quantity), 0) AS today_profit_cents
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
      WHERE stock <= min_stock
      ORDER BY stock ASC, name ASC
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
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.unit_price_cents * si.quantity), 0) AS revenue_cents
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
        p.stock AS current_stock,
        COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity ELSE 0 END), 0) AS units_sold
      FROM products p
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
        AND DATE(s.created_at, 'localtime') >= DATE('now', '-13 days', 'localtime')
      GROUP BY p.id, p.name, p.stock
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
      ORDER BY SUM(si.quantity) DESC, p.name ASC
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
    quantity: item.quantity,
  }));

  safeItems.forEach((item) => {
    if (item.name.length < 2) {
      throw new Error("Invalid product found in the cart.");
    }

    assertMoney(item.priceCents, "Item price");
    assertMoney(item.costPriceCents, "Item cost");

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Cart quantities must be whole numbers.");
    }
  });

  const cashPaidCents = input.paymentMethod === "cash" ? input.cashPaidCents : 0;
  const changeGivenCents = input.paymentMethod === "cash" ? input.cashPaidCents - input.totalCents : 0;
  const utangDescription = sanitizeOptionalText(input.utangDescription ?? "", 140);

  let saleId = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const item of safeItems) {
      const product = await txn.getFirstAsync<{ stock: number }>(
        `
          SELECT stock
          FROM products
          WHERE id = ?
        `,
        item.id,
      );

      if (!product) {
        throw new Error(`Product "${item.name}" was not found.`);
      }

      if (product.stock < item.quantity) {
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
          INSERT INTO sale_items (sale_id, product_id, product_name, unit_price_cents, unit_cost_cents, quantity)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        saleId,
        item.id,
        item.name,
        item.priceCents,
        item.costPriceCents,
        item.quantity,
      );

      await txn.runAsync(
        `
          UPDATE products
          SET stock = stock - ?
          WHERE id = ?
        `,
        item.quantity,
        item.id,
      );
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
