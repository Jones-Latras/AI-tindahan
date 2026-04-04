import type { SQLiteDatabase } from "expo-sqlite";

import { getDaysBetween, getOverdueLevel } from "@/utils/date";
import {
  computeTransactionTotal,
  formatWeightKg,
  roundWeightKg,
  resolveWeightBasedPricing,
} from "@/utils/pricing";
import { createSyncId } from "@/utils/id";
import { sanitizeOptionalText, sanitizePhone, sanitizeText } from "@/utils/validation";
import type {
  AnalyticsTimeframe,
  ContainerReturnEvent,
  ContainerReturnStatus,
  CustomerRiskProfile,
  CustomerSummary,
  Expense,
  ExpenseCategorySummary,
  ExpenseSummary,
  HomeMetrics,
  InventoryPool,
  PaymentBreakdown,
  PaymentMethod,
  Product,
  ProductInventoryMode,
  ProductPricingMode,
  ProductPricingStrategy,
  ProductVelocity,
  RepackSession,
  ReportsSnapshot,
  RestockList,
  RestockListItem,
  RestockListStatus,
  RestockListSummary,
  RiskCustomerAlert,
  SaleItemInput,
  SalesInsightContext,
  StoreAiContext,
  StoreAiSale,
  TopProductSummary,
  TrustScore,
  UtangLedgerEntry,
  UtangPayment,
  UtangPaymentSource,
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
  inventory_pool_id: number | null;
  inventory_pool_name: string | null;
  inventory_base_unit_label: string | null;
  inventory_quantity_available: number | null;
  inventory_reorder_threshold: number | null;
  linked_units_per_sale: number | null;
  linked_display_unit_label: string | null;
  is_primary_restock_product: number | null;
  has_container_return: number;
  container_label: string | null;
  container_deposit_cents: number;
  default_container_quantity_per_sale: number;
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

type UtangPaymentRow = {
  id: number;
  utang_id: number;
  customer_id: number;
  amount_cents: number;
  note: string | null;
  source: UtangPaymentSource;
  created_at: string;
};

type SaleContextRow = {
  id: number;
  total_cents: number;
  cash_paid_cents: number;
  change_given_cents: number;
  discount_cents: number;
  payment_method: PaymentMethod;
  customer_id: number | null;
  customer_name: string | null;
  created_at: string;
};

type SaleItemContextRow = {
  id: number;
  sale_id: number;
  product_id: number | null;
  product_name: string;
  unit_price_cents: number;
  unit_cost_cents: number;
  quantity: number;
  is_weight_based: number;
  weight_kg: number | null;
  line_total_cents: number;
  line_cost_total_cents: number;
};

type ContainerReturnEventRow = {
  id: number;
  sale_id: number;
  customer_id: number | null;
  product_id: number | null;
  product_name_snapshot: string;
  container_label_snapshot: string;
  quantity_out: number;
  quantity_returned: number;
  created_at: string;
  last_returned_at: string | null;
  status: ContainerReturnStatus;
};

type PaymentBreakdownRow = {
  cash_cents: number | null;
  gcash_cents: number | null;
  maya_cents: number | null;
  utang_cents: number | null;
};

type ReportsSalesTotalsRow = {
  sales_cents: number | null;
  transaction_count: number | null;
};

type ReportsGrossProfitRow = {
  gross_profit_cents: number | null;
};

type ReportsExpenseTotalRow = {
  expense_cents: number | null;
};

type ReportsPaymentActivityRow = {
  payment_events: number | null;
};

type ExpenseRow = {
  id: number;
  category: string;
  amount_cents: number;
  description: string | null;
  expense_date: string;
  created_at: string;
  updated_at: string;
};

type ExpenseSummaryTotalsRow = {
  today_expense_cents: number | null;
  week_expense_cents: number | null;
  month_expense_cents: number | null;
};

type ExpenseCategorySummaryRow = {
  category: string;
  total_cents: number;
  entry_count: number;
};

type InventoryPoolRow = {
  id: number;
  name: string;
  base_unit_label: string;
  quantity_available: number;
  reorder_threshold: number;
  created_at: string;
  updated_at: string;
  linked_product_count: number;
};

type ProductInventoryLinkRow = {
  inventory_pool_id: number;
  units_per_sale: number;
  display_unit_label: string;
  is_primary_restock_product: number;
};

type RepackSessionRow = {
  id: number;
  inventory_pool_id: number;
  source_product_id: number;
  source_product_name: string;
  output_product_id: number;
  output_product_name: string;
  source_quantity_used: number;
  output_units_created: number;
  wastage_units: number;
  created_at: string;
  note: string | null;
};

type RestockListRow = {
  id: number;
  title: string;
  status: RestockListStatus;
  created_at: string;
  completed_at: string | null;
};

type RestockListItemRow = {
  id: number;
  restock_list_id: number;
  product_id: number | null;
  product_name_snapshot: string;
  category_snapshot: string | null;
  current_stock_snapshot: number;
  min_stock_snapshot: number;
  suggested_quantity: number;
  is_weight_based_snapshot: number;
  is_checked: number;
  checked_at: string | null;
  note: string | null;
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

type AppSettingRow = {
  key: string;
  value: string;
};

function resolveLinkedInventoryMode(row: ProductRow): ProductInventoryMode {
  return row.inventory_pool_id ? "linked" : "standalone";
}

function resolveVisibleProductStock(row: ProductRow) {
  if (!row.inventory_pool_id || !row.linked_units_per_sale) {
    return row.stock;
  }

  const poolQuantity = Math.max(0, row.inventory_quantity_available ?? 0);
  return Math.max(0, Math.floor(poolQuantity / row.linked_units_per_sale));
}

function resolveVisibleWeightStock(row: ProductRow) {
  if (!row.inventory_pool_id || !row.linked_units_per_sale) {
    return row.total_kg_available;
  }

  const poolQuantity = Math.max(0, row.inventory_quantity_available ?? 0);
  return roundWeightKg(poolQuantity / row.linked_units_per_sale);
}

function resolveVisibleMinStock(row: ProductRow) {
  if (!row.inventory_pool_id || !row.linked_units_per_sale) {
    return row.min_stock;
  }

  const reorderThreshold = Math.max(0, row.inventory_reorder_threshold ?? 0);

  if (row.is_weight_based) {
    return roundWeightKg(reorderThreshold / row.linked_units_per_sale);
  }

  return Math.max(0, Math.ceil(reorderThreshold / row.linked_units_per_sale));
}

function mapProduct(row: ProductRow): Product {
  const inventoryMode = resolveLinkedInventoryMode(row);

  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    costPriceCents: row.cost_price_cents,
    stock: resolveVisibleProductStock(row),
    category: row.category,
    barcode: row.barcode,
    imageUri: row.image_uri,
    minStock: resolveVisibleMinStock(row),
    createdAt: row.created_at,
    isWeightBased: Boolean(row.is_weight_based),
    pricingMode: row.pricing_mode,
    pricingStrategy: row.pricing_strategy,
    totalKgAvailable: resolveVisibleWeightStock(row),
    costPriceTotalCents: row.cost_price_total_cents,
    sellingPriceTotalCents: row.selling_price_total_cents,
    costPricePerKgCents: row.cost_price_per_kg_cents,
    sellingPricePerKgCents: row.selling_price_per_kg_cents,
    targetMarginPercent: row.target_margin_percent,
    computedPricePerKgCents: row.computed_price_per_kg_cents,
    inventoryMode,
    inventoryPoolId: row.inventory_pool_id,
    inventoryPoolName: row.inventory_pool_name,
    inventoryBaseUnitLabel: row.inventory_base_unit_label,
    inventoryQuantityAvailable: row.inventory_quantity_available,
    inventoryReorderThreshold: row.inventory_reorder_threshold,
    linkedUnitsPerSale: row.linked_units_per_sale,
    linkedDisplayUnitLabel: row.linked_display_unit_label,
    isPrimaryRestockProduct: Boolean(row.is_primary_restock_product),
    hasContainerReturn: Boolean(row.has_container_return),
    containerLabel: row.container_label,
    containerDepositCents: row.container_deposit_cents ?? 0,
    defaultContainerQuantityPerSale: row.default_container_quantity_per_sale ?? 1,
  };
}

function mapContainerReturnEvent(row: ContainerReturnEventRow): ContainerReturnEvent {
  return {
    id: row.id,
    saleId: row.sale_id,
    customerId: row.customer_id,
    productId: row.product_id,
    productNameSnapshot: row.product_name_snapshot,
    containerLabelSnapshot: row.container_label_snapshot,
    quantityOut: row.quantity_out,
    quantityReturned: row.quantity_returned,
    createdAt: row.created_at,
    lastReturnedAt: row.last_returned_at,
    status: row.status,
  };
}

function mapUtangPayment(row: UtangPaymentRow): UtangPayment {
  return {
    id: row.id,
    utangId: row.utang_id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    note: row.note,
    createdAt: row.created_at,
    source: row.source,
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

function getTimeframeDateCondition(column: string, timeframe: AnalyticsTimeframe) {
  if (timeframe === "week") {
    return `DATE(${column}, 'localtime') >= DATE('now', '-6 days', 'localtime')`;
  }

  if (timeframe === "month") {
    return `STRFTIME('%Y-%m', ${column}, 'localtime') = STRFTIME('%Y-%m', 'now', 'localtime')`;
  }

  return `DATE(${column}, 'localtime') = DATE('now', 'localtime')`;
}

function mapExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    category: row.category,
    amountCents: row.amount_cents,
    description: row.description,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInventoryPool(row: InventoryPoolRow): InventoryPool {
  return {
    id: row.id,
    name: row.name,
    baseUnitLabel: row.base_unit_label,
    quantityAvailable: row.quantity_available,
    reorderThreshold: row.reorder_threshold,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    linkedProductCount: row.linked_product_count,
  };
}

function mapRepackSession(row: RepackSessionRow): RepackSession {
  return {
    id: row.id,
    inventoryPoolId: row.inventory_pool_id,
    sourceProductId: row.source_product_id,
    sourceProductName: row.source_product_name,
    outputProductId: row.output_product_id,
    outputProductName: row.output_product_name,
    sourceQuantityUsed: row.source_quantity_used,
    outputUnitsCreated: row.output_units_created,
    wastageUnits: row.wastage_units,
    createdAt: row.created_at,
    note: row.note,
  };
}

function mapRestockListItem(row: RestockListItemRow): RestockListItem {
  return {
    id: row.id,
    restockListId: row.restock_list_id,
    productId: row.product_id,
    productNameSnapshot: row.product_name_snapshot,
    categorySnapshot: row.category_snapshot,
    currentStockSnapshot: row.current_stock_snapshot,
    minStockSnapshot: row.min_stock_snapshot,
    suggestedQuantity: row.suggested_quantity,
    isWeightBasedSnapshot: Boolean(row.is_weight_based_snapshot),
    isChecked: Boolean(row.is_checked),
    checkedAt: row.checked_at,
    note: row.note,
  };
}

function mapRestockListSummary(
  row: RestockListRow & { total_items: number; checked_items: number },
): RestockListSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    totalItems: row.total_items,
    checkedItems: row.checked_items,
  };
}

function buildSaleItemsBySale(saleItemRows: SaleItemContextRow[]) {
  const itemsBySale = new Map<number, StoreAiSale["items"]>();

  for (const row of saleItemRows) {
    const nextItem = {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      unitPriceCents: row.unit_price_cents,
      unitCostCents: row.unit_cost_cents,
      quantity: row.quantity,
      isWeightBased: Boolean(row.is_weight_based),
      weightKg: row.weight_kg,
      lineTotalCents: row.line_total_cents,
      lineCostTotalCents: row.line_cost_total_cents,
    };

    const items = itemsBySale.get(row.sale_id) ?? [];
    items.push(nextItem);
    itemsBySale.set(row.sale_id, items);
  }

  return itemsBySale;
}

function buildContainerReturnsBySale(containerRows: ContainerReturnEventRow[]) {
  const returnsBySale = new Map<number, ContainerReturnEvent[]>();

  for (const row of containerRows) {
    const events = returnsBySale.get(row.sale_id) ?? [];
    events.push(mapContainerReturnEvent(row));
    returnsBySale.set(row.sale_id, events);
  }

  return returnsBySale;
}

function mapSalesHistory(
  salesRows: SaleContextRow[],
  saleItemRows: SaleItemContextRow[],
  containerRows: ContainerReturnEventRow[] = [],
): StoreAiSale[] {
  const itemsBySale = buildSaleItemsBySale(saleItemRows);
  const containerReturnsBySale = buildContainerReturnsBySale(containerRows);

  return salesRows.map((sale) => ({
    id: sale.id,
    totalCents: sale.total_cents,
    cashPaidCents: sale.cash_paid_cents,
    changeGivenCents: sale.change_given_cents,
    discountCents: sale.discount_cents,
    paymentMethod: sale.payment_method,
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    createdAt: sale.created_at,
    items: itemsBySale.get(sale.id) ?? [],
    containerReturns: containerReturnsBySale.get(sale.id) ?? [],
  }));
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatUtangSaleItemSummary(item: Pick<SaleItemInput, "isWeightBased" | "name" | "quantity" | "weightKg">) {
  return item.isWeightBased
    ? `${item.name} ${formatWeightKg(item.weightKg ?? item.quantity)}kg`
    : `${item.name} x${item.quantity}`;
}

function buildUtangSaleDescription(items: Array<Pick<SaleItemInput, "isWeightBased" | "name" | "quantity" | "weightKg">>) {
  const prefix = "POS sale: ";
  const maxLength = 140;
  const labels = items.map(formatUtangSaleItemSummary).filter((label) => label.length > 0);

  if (labels.length === 0) {
    return "POS sale";
  }

  let summary = "";

  for (let index = 0; index < labels.length; index += 1) {
    const baseSummary = labels.slice(0, index + 1).join(", ");
    const remainingCount = labels.length - index - 1;
    const suffix = remainingCount > 0 ? ` +${remainingCount} more` : "";
    const candidate = `${prefix}${baseSummary}${suffix}`;

    if (candidate.length <= maxLength) {
      summary = `${baseSummary}${suffix}`;
      continue;
    }

    break;
  }

  if (!summary) {
    const remainingCount = labels.length - 1;
    const suffix = remainingCount > 0 ? ` +${remainingCount} more` : "";
    const firstLabelMaxLength = Math.max(1, maxLength - prefix.length - suffix.length);
    summary = `${truncateText(labels[0] ?? "POS sale", firstLabelMaxLength)}${suffix}`;
  }

  return `${prefix}${summary}`;
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
  inventoryMode?: ProductInventoryMode;
  inventoryPoolId?: number | null;
  inventoryPoolName?: string;
  inventoryPoolBaseUnitLabel?: string;
  inventoryPoolQuantityAvailable?: number | null;
  inventoryPoolReorderThreshold?: number | null;
  linkedUnitsPerSale?: number | null;
  linkedDisplayUnitLabel?: string;
  isPrimaryRestockProduct?: boolean;
  hasContainerReturn?: boolean;
  containerLabel?: string;
  containerDepositCents?: number;
  defaultContainerQuantityPerSale?: number;
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

export type ExpenseInput = {
  category: string;
  amountCents: number;
  description?: string;
  expenseDate?: string;
};

export type RepackSessionInput = {
  sourceProductId: number;
  outputProductId: number;
  sourceQuantityUsed: number;
  outputUnitsCreated: number;
  wastageUnits?: number;
  note?: string;
};

export type ContainerReturnInput = {
  productId: number;
  containerLabel: string;
  quantityOut: number;
};

export type CheckoutInput = {
  items: SaleItemInput[];
  totalCents: number;
  discountCents: number;
  cashPaidCents: number;
  paymentMethod: PaymentMethod;
  customerId?: number | null;
  utangDescription?: string;
  containerReturns?: ContainerReturnInput[];
};

export type CheckoutResult = {
  saleId: number;
  containerReturns: ContainerReturnEvent[];
};

export const STORE_NAME_SETTING_KEY = "store_name";
export const ACTIVE_STORE_ID_METADATA_KEY = "active_store_id";
export const AUTH_USER_ID_METADATA_KEY = "auth_user_id";

const LOCAL_RESET_TABLES = [
  "container_return_events",
  "sale_items",
  "utang_payments",
  "repack_sessions",
  "restock_list_items",
  "product_inventory_links",
  "sales",
  "utang",
  "restock_lists",
  "expenses",
  "inventory_pools",
  "products",
  "customers",
  "app_settings",
  "local_metadata",
] as const;

function buildProductSelectQuery(whereClause = "", orderByClause = "ORDER BY p.name ASC") {
  return `
    SELECT
      p.id,
      p.name,
      p.price_cents,
      p.cost_price_cents,
      p.stock,
      p.category,
      p.barcode,
      p.image_uri,
      p.min_stock,
      p.is_weight_based,
      p.pricing_mode,
      p.pricing_strategy,
      p.total_kg_available,
      p.cost_price_total_cents,
      p.selling_price_total_cents,
      p.cost_price_per_kg_cents,
      p.selling_price_per_kg_cents,
      p.target_margin_percent,
      p.computed_price_per_kg_cents,
      p.has_container_return,
      p.container_label,
      p.container_deposit_cents,
      p.default_container_quantity_per_sale,
      p.created_at,
      pil.inventory_pool_id,
      ip.name AS inventory_pool_name,
      ip.base_unit_label AS inventory_base_unit_label,
      ip.quantity_available AS inventory_quantity_available,
      ip.reorder_threshold AS inventory_reorder_threshold,
      pil.units_per_sale AS linked_units_per_sale,
      pil.display_unit_label AS linked_display_unit_label,
      pil.is_primary_restock_product
    FROM products p
    LEFT JOIN product_inventory_links pil ON pil.product_id = p.id
    LEFT JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
    ${whereClause}
    ${orderByClause}
  `;
}

function sanitizeInventoryMode(mode?: ProductInventoryMode): ProductInventoryMode {
  return mode === "linked" ? "linked" : "standalone";
}

function sanitizeUnitLabel(value: string | undefined, label: string, maxLength = 32) {
  const normalized = sanitizeText(value ?? "", maxLength);

  if (normalized.length < 1) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function getProductAvailableQuantity(product: Pick<Product, "inventoryMode" | "inventoryQuantityAvailable" | "inventoryReorderThreshold" | "isWeightBased" | "stock" | "totalKgAvailable">) {
  if (product.inventoryMode === "linked") {
    return product.inventoryQuantityAvailable ?? 0;
  }

  return product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;
}

function getProductReorderThreshold(product: Pick<Product, "inventoryMode" | "inventoryReorderThreshold" | "minStock">) {
  return product.inventoryMode === "linked" ? product.inventoryReorderThreshold ?? 0 : product.minStock;
}

function shouldShowProductInLowStock(product: Product) {
  if (product.inventoryMode === "linked" && !product.isPrimaryRestockProduct) {
    return false;
  }

  return getProductAvailableQuantity(product) <= getProductReorderThreshold(product);
}

function compareLowStockProducts(left: Product, right: Product) {
  const leftAvailable = getProductAvailableQuantity(left);
  const rightAvailable = getProductAvailableQuantity(right);

  if (leftAvailable !== rightAvailable) {
    return leftAvailable - rightAvailable;
  }

  const leftThreshold = getProductReorderThreshold(left);
  const rightThreshold = getProductReorderThreshold(right);

  if (leftThreshold !== rightThreshold) {
    return rightThreshold - leftThreshold;
  }

  return left.name.localeCompare(right.name);
}

export async function listProducts(db: SQLiteDatabase, searchTerm = "") {
  const safeTerm = sanitizeText(searchTerm, 40);

  const rows = safeTerm
    ? await db.getAllAsync<ProductRow>(
        buildProductSelectQuery(
          `
            WHERE p.name LIKE ? OR COALESCE(p.category, '') LIKE ? OR COALESCE(p.barcode, '') LIKE ?
          `,
        ),
        [`%${safeTerm}%`, `%${safeTerm}%`, `%${safeTerm}%`],
      )
    : await db.getAllAsync<ProductRow>(buildProductSelectQuery());

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
    buildProductSelectQuery("WHERE p.barcode = ?", "LIMIT 1"),
    [safeBarcode],
  );

  return row ? mapProduct(row) : null;
}

export async function saveProduct(db: SQLiteDatabase, input: ProductInput, productId?: number) {
  const name = sanitizeText(input.name, 80);
  const category = sanitizeOptionalText(input.category, 40);
  const barcode = sanitizeOptionalText(input.barcode, 48);
  const imageUri = sanitizeOptionalText(input.imageUri ?? "", 2048);
  const isWeightBased = Boolean(input.isWeightBased);
  const hasContainerReturn = Boolean(input.hasContainerReturn);
  const inventoryMode = sanitizeInventoryMode(input.inventoryMode);
  const pricingMode: ProductPricingMode = isWeightBased ? input.pricingMode ?? "direct" : "direct";
  const pricingStrategy: ProductPricingStrategy = isWeightBased ? input.pricingStrategy ?? "manual" : "manual";
  const containerLabel = hasContainerReturn ? sanitizeText(input.containerLabel ?? "", 60) : null;
  const containerDepositCents = hasContainerReturn ? input.containerDepositCents ?? 0 : 0;
  const defaultContainerQuantityPerSale = hasContainerReturn ? input.defaultContainerQuantityPerSale ?? 1 : 1;

  if (name.length < 2) {
    throw new Error("Product name must be at least 2 characters.");
  }

  assertMoney(containerDepositCents, "Container deposit");
  assertWholeNumber(defaultContainerQuantityPerSale, "Bottle quantity per sale");

  if (hasContainerReturn && (!containerLabel || containerLabel.length < 2)) {
    throw new Error("Container label must be at least 2 characters.");
  }

  if (hasContainerReturn && defaultContainerQuantityPerSale <= 0) {
    throw new Error("Bottle quantity per sale must be greater than zero.");
  }

  const inventoryPoolIdInput = inventoryMode === "linked" ? input.inventoryPoolId ?? null : null;
  const inventoryPoolName =
    inventoryMode === "linked" ? sanitizeText(input.inventoryPoolName ?? "", 80) : null;
  const inventoryPoolBaseUnitLabel =
    inventoryMode === "linked"
      ? sanitizeUnitLabel(input.inventoryPoolBaseUnitLabel, "Inventory base unit label", 24)
      : null;
  const linkedDisplayUnitLabel =
    inventoryMode === "linked"
      ? sanitizeUnitLabel(input.linkedDisplayUnitLabel, "Display unit label", 32)
      : null;
  const linkedUnitsPerSale =
    inventoryMode === "linked"
      ? roundWeightKg(input.linkedUnitsPerSale ?? Number.NaN)
      : null;
  const inventoryPoolQuantityAvailable =
    inventoryMode === "linked"
      ? roundWeightKg(input.inventoryPoolQuantityAvailable ?? Number.NaN)
      : null;
  const inventoryPoolReorderThreshold =
    inventoryMode === "linked"
      ? roundWeightKg(input.inventoryPoolReorderThreshold ?? Number.NaN)
      : null;
  const isPrimaryRestockProduct = inventoryMode === "linked" ? Boolean(input.isPrimaryRestockProduct) : false;

  if (inventoryMode === "linked") {
    if (!inventoryPoolName || inventoryPoolName.length < 2) {
      throw new Error("Inventory pool name must be at least 2 characters.");
    }

    assertNonNegativeNumber(inventoryPoolQuantityAvailable ?? Number.NaN, "Inventory quantity available");
    assertNonNegativeNumber(inventoryPoolReorderThreshold ?? Number.NaN, "Inventory reorder threshold");
    assertNonNegativeNumber(linkedUnitsPerSale ?? Number.NaN, "Units per sale");

    if ((linkedUnitsPerSale ?? 0) <= 0) {
      throw new Error("Units per sale must be greater than zero.");
    }
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

  const derivedInventoryQuantityKg =
    inventoryMode === "linked" && isWeightBased && inventoryPoolQuantityAvailable !== null && linkedUnitsPerSale
      ? roundWeightKg(inventoryPoolQuantityAvailable / linkedUnitsPerSale)
      : input.totalKgAvailable ?? 0;

  if (isWeightBased) {
    assertNonNegativeNumber(minStock, "Minimum stock");

    const resolvedPricing = resolveWeightBasedPricing({
      pricingMode,
      pricingStrategy,
      totalKgAvailable: derivedInventoryQuantityKg,
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

  if (inventoryMode === "linked" && linkedUnitsPerSale && inventoryPoolQuantityAvailable !== null && inventoryPoolReorderThreshold !== null) {
    if (isWeightBased) {
      totalKgAvailable = roundWeightKg(inventoryPoolQuantityAvailable / linkedUnitsPerSale);
      minStock = roundWeightKg(inventoryPoolReorderThreshold / linkedUnitsPerSale);
      stock = 0;
    } else {
      stock = Math.max(0, Math.floor(inventoryPoolQuantityAvailable / linkedUnitsPerSale));
      minStock = Math.max(0, Math.ceil(inventoryPoolReorderThreshold / linkedUnitsPerSale));
      totalKgAvailable = null;
      costPriceTotalCents = costPriceCents * stock;
      sellingPriceTotalCents = priceCents * stock;
    }
  }

  async function ensurePoolHasPrimaryProduct(
    txn: Pick<SQLiteDatabase, "getFirstAsync" | "runAsync">,
    inventoryPoolId: number,
  ) {
    const existingPrimary = await txn.getFirstAsync<{ product_id: number }>(
      `
        SELECT product_id
        FROM product_inventory_links
        WHERE inventory_pool_id = ? AND is_primary_restock_product = 1
        LIMIT 1
      `,
      inventoryPoolId,
    );

    if (existingPrimary) {
      return;
    }

    const fallback = await txn.getFirstAsync<{ product_id: number }>(
      `
        SELECT product_id
        FROM product_inventory_links
        WHERE inventory_pool_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
      inventoryPoolId,
    );

    if (!fallback) {
      return;
    }

    await txn.runAsync(
      `
        UPDATE product_inventory_links
        SET is_primary_restock_product = 1, synced = 0
        WHERE product_id = ?
      `,
      fallback.product_id,
    );
  }

  let nextProductId = productId ?? 0;
  let resolvedInventoryPoolId: number | null = null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const previousLink = productId
      ? await txn.getFirstAsync<{ inventory_pool_id: number | null }>(
          `
            SELECT inventory_pool_id
            FROM product_inventory_links
            WHERE product_id = ?
            LIMIT 1
          `,
          productId,
        )
      : null;

    let nextInventoryPoolId: number | null = null;

    if (inventoryMode === "linked" && inventoryPoolName && inventoryPoolBaseUnitLabel && linkedDisplayUnitLabel) {
      const existingPool = inventoryPoolIdInput
        ? await txn.getFirstAsync<{ id: number }>(
            `
              SELECT id
              FROM inventory_pools
              WHERE id = ?
              LIMIT 1
            `,
            inventoryPoolIdInput,
          )
        : await txn.getFirstAsync<{ id: number }>(
            `
              SELECT id
              FROM inventory_pools
              WHERE name = ? COLLATE NOCASE
              LIMIT 1
            `,
            inventoryPoolName,
          );

      if (inventoryPoolIdInput && !existingPool) {
        throw new Error("The selected inventory pool was not found.");
      }

      if (existingPool) {
        nextInventoryPoolId = existingPool.id;
        await txn.runAsync(
          `
            UPDATE inventory_pools
            SET
              name = ?,
              base_unit_label = ?,
              quantity_available = ?,
              reorder_threshold = ?,
              updated_at = CURRENT_TIMESTAMP,
              synced = 0
            WHERE id = ?
          `,
          inventoryPoolName,
          inventoryPoolBaseUnitLabel,
          inventoryPoolQuantityAvailable ?? 0,
          inventoryPoolReorderThreshold ?? 0,
          nextInventoryPoolId,
        );
      } else {
        const poolResult = await txn.runAsync(
          `
            INSERT INTO inventory_pools (
              name,
              base_unit_label,
              quantity_available,
              reorder_threshold,
              sync_id,
              created_at,
              updated_at,
              synced
            )
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
          `,
          inventoryPoolName,
          inventoryPoolBaseUnitLabel,
          inventoryPoolQuantityAvailable ?? 0,
          inventoryPoolReorderThreshold ?? 0,
          createSyncId(),
        );

        nextInventoryPoolId = Number(poolResult.lastInsertRowId);
      }

      if (!nextInventoryPoolId) {
        throw new Error("Inventory pool could not be created.");
      }

      resolvedInventoryPoolId = nextInventoryPoolId;
    }

    if (productId) {
      await txn.runAsync(
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
            has_container_return = ?,
            container_label = ?,
            container_deposit_cents = ?,
            default_container_quantity_per_sale = ?,
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
        hasContainerReturn ? 1 : 0,
        containerLabel,
        containerDepositCents,
        defaultContainerQuantityPerSale,
        productId,
      );
      nextProductId = productId;
    } else {
      const result = await txn.runAsync(
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
            computed_price_per_kg_cents,
            has_container_return,
            container_label,
            container_deposit_cents,
            default_container_quantity_per_sale,
            sync_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        hasContainerReturn ? 1 : 0,
        containerLabel,
        containerDepositCents,
        defaultContainerQuantityPerSale,
        createSyncId(),
      );

      nextProductId = Number(result.lastInsertRowId);
    }

    if (inventoryMode === "linked" && nextInventoryPoolId && linkedUnitsPerSale && linkedDisplayUnitLabel) {
      await txn.runAsync(
        `
          INSERT INTO product_inventory_links (
            product_id,
            inventory_pool_id,
            units_per_sale,
            display_unit_label,
            is_primary_restock_product,
            sync_id,
            created_at,
            synced
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)
          ON CONFLICT(product_id) DO UPDATE SET
            inventory_pool_id = excluded.inventory_pool_id,
            units_per_sale = excluded.units_per_sale,
            display_unit_label = excluded.display_unit_label,
            is_primary_restock_product = excluded.is_primary_restock_product,
            synced = 0
        `,
        nextProductId,
        nextInventoryPoolId,
        linkedUnitsPerSale,
        linkedDisplayUnitLabel,
        isPrimaryRestockProduct ? 1 : 0,
        createSyncId(),
      );

      if (isPrimaryRestockProduct) {
        await txn.runAsync(
          `
            UPDATE product_inventory_links
            SET is_primary_restock_product = 0, synced = 0
            WHERE inventory_pool_id = ?
              AND product_id <> ?
          `,
          nextInventoryPoolId,
          nextProductId,
        );
      }

      await ensurePoolHasPrimaryProduct(txn, nextInventoryPoolId);
    } else if (nextProductId) {
      await txn.runAsync("DELETE FROM product_inventory_links WHERE product_id = ?", nextProductId);
    }

    if (previousLink?.inventory_pool_id && previousLink.inventory_pool_id !== resolvedInventoryPoolId) {
      await ensurePoolHasPrimaryProduct(txn, previousLink.inventory_pool_id);
    }
  });

  return nextProductId;
}

export async function deleteProduct(db: SQLiteDatabase, productId: number) {
  await db.runAsync("DELETE FROM products WHERE id = ?", productId);
}

export async function listInventoryPools(db: SQLiteDatabase): Promise<InventoryPool[]> {
  const rows = await db.getAllAsync<InventoryPoolRow>(
    `
      SELECT
        ip.id,
        ip.name,
        ip.base_unit_label,
        ip.quantity_available,
        ip.reorder_threshold,
        ip.created_at,
        ip.updated_at,
        COUNT(pil.id) AS linked_product_count
      FROM inventory_pools ip
      LEFT JOIN product_inventory_links pil ON pil.inventory_pool_id = ip.id
      GROUP BY ip.id, ip.name, ip.base_unit_label, ip.quantity_available, ip.reorder_threshold, ip.created_at, ip.updated_at
      ORDER BY ip.updated_at DESC, ip.name ASC
    `,
  );

  return rows.map(mapInventoryPool);
}

export async function listProductsByInventoryPool(db: SQLiteDatabase, inventoryPoolId: number): Promise<Product[]> {
  const rows = await db.getAllAsync<ProductRow>(
    buildProductSelectQuery("WHERE pil.inventory_pool_id = ?", "ORDER BY p.name ASC"),
    [inventoryPoolId],
  );

  return rows.map(mapProduct);
}

export async function listRepackSessionsForInventoryPool(
  db: SQLiteDatabase,
  inventoryPoolId: number,
  limit = 8,
): Promise<RepackSession[]> {
  const rows = await db.getAllAsync<RepackSessionRow>(
    `
      SELECT
        rs.id,
        rs.inventory_pool_id,
        rs.source_product_id,
        source_product.name AS source_product_name,
        rs.output_product_id,
        output_product.name AS output_product_name,
        rs.source_quantity_used,
        rs.output_units_created,
        rs.wastage_units,
        rs.created_at,
        rs.note
      FROM repack_sessions rs
      INNER JOIN products source_product ON source_product.id = rs.source_product_id
      INNER JOIN products output_product ON output_product.id = rs.output_product_id
      WHERE rs.inventory_pool_id = ?
      ORDER BY rs.created_at DESC, rs.id DESC
      LIMIT ?
    `,
    [inventoryPoolId, limit],
  );

  return rows.map(mapRepackSession);
}

export async function recordRepackSession(db: SQLiteDatabase, input: RepackSessionInput) {
  assertNonNegativeNumber(input.sourceQuantityUsed, "Source quantity used");
  assertNonNegativeNumber(input.outputUnitsCreated, "Output units created");
  assertNonNegativeNumber(input.wastageUnits ?? 0, "Wastage");

  if (input.sourceQuantityUsed <= 0 || input.outputUnitsCreated <= 0) {
    throw new Error("Source and output quantities must be greater than zero.");
  }

  if (input.sourceProductId === input.outputProductId) {
    throw new Error("Choose different source and output products for repacking.");
  }

  const note = sanitizeOptionalText(input.note ?? "", 140);
  const wastageUnits = roundWeightKg(input.wastageUnits ?? 0);

  await db.withExclusiveTransactionAsync(async (txn) => {
    const [sourceLink, outputLink] = await Promise.all([
      txn.getFirstAsync<ProductInventoryLinkRow & { is_weight_based: number; inventory_quantity_available: number | null }>(
        `
          SELECT
            pil.inventory_pool_id,
            pil.units_per_sale,
            pil.display_unit_label,
            pil.is_primary_restock_product,
            p.is_weight_based,
            ip.quantity_available AS inventory_quantity_available
          FROM product_inventory_links pil
          INNER JOIN products p ON p.id = pil.product_id
          INNER JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
          WHERE pil.product_id = ?
          LIMIT 1
        `,
        input.sourceProductId,
      ),
      txn.getFirstAsync<ProductInventoryLinkRow & { is_weight_based: number; inventory_quantity_available: number | null }>(
        `
          SELECT
            pil.inventory_pool_id,
            pil.units_per_sale,
            pil.display_unit_label,
            pil.is_primary_restock_product,
            p.is_weight_based,
            ip.quantity_available AS inventory_quantity_available
          FROM product_inventory_links pil
          INNER JOIN products p ON p.id = pil.product_id
          INNER JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
          WHERE pil.product_id = ?
          LIMIT 1
        `,
        input.outputProductId,
      ),
    ]);

    if (!sourceLink || !outputLink) {
      throw new Error("Both source and output products must be linked to the same inventory pool.");
    }

    if (sourceLink.inventory_pool_id !== outputLink.inventory_pool_id) {
      throw new Error("Source and output products must share the same inventory pool.");
    }

    const sourceBaseUnits = roundWeightKg(input.sourceQuantityUsed * sourceLink.units_per_sale);
    const outputBaseUnits = roundWeightKg(input.outputUnitsCreated * outputLink.units_per_sale);

    if (outputBaseUnits > sourceBaseUnits) {
      throw new Error("Output quantity cannot exceed the source quantity used.");
    }

    const stockLossBaseUnits = roundWeightKg(sourceBaseUnits - outputBaseUnits);

    if (wastageUnits > stockLossBaseUnits) {
      throw new Error("Wastage cannot be greater than the stock lost during repacking.");
    }

    const availablePoolQuantity = sourceLink.inventory_quantity_available ?? 0;

    if (sourceBaseUnits > availablePoolQuantity) {
      throw new Error("Not enough shared inventory is available for this repack session.");
    }

    if (stockLossBaseUnits > 0) {
      await txn.runAsync(
        `
          UPDATE inventory_pools
          SET
            quantity_available = quantity_available - ?,
            updated_at = CURRENT_TIMESTAMP,
            synced = 0
          WHERE id = ?
        `,
        stockLossBaseUnits,
        sourceLink.inventory_pool_id,
      );
    }

    await txn.runAsync(
      `
        INSERT INTO repack_sessions (
          inventory_pool_id,
          source_product_id,
          output_product_id,
          source_quantity_used,
          output_units_created,
          wastage_units,
          sync_id,
          created_at,
          note,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 0)
      `,
      sourceLink.inventory_pool_id,
      input.sourceProductId,
      input.outputProductId,
      input.sourceQuantityUsed,
      input.outputUnitsCreated,
      wastageUnits,
      createSyncId(),
      note,
    );
  });
}

export async function getAppSetting(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<AppSettingRow>(
    `
      SELECT key, value
      FROM app_settings
      WHERE key = ?
      LIMIT 1
    `,
    key,
  );

  return row?.value ?? null;
}

async function getLocalMetadata(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>(
    `
      SELECT value
      FROM local_metadata
      WHERE key = ?
      LIMIT 1
    `,
    key,
  );

  return row?.value ?? null;
}

async function setLocalMetadata(db: SQLiteDatabase, key: string, value: string | null) {
  if (value == null || value.trim().length === 0) {
    await db.runAsync("DELETE FROM local_metadata WHERE key = ?", key);
    return;
  }

  await db.runAsync(
    `
      INSERT INTO local_metadata (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `,
    key,
    value,
  );
}

async function setAppSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `
      INSERT INTO app_settings (key, value, updated_at, synced)
      VALUES (?, ?, CURRENT_TIMESTAMP, 0)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP,
        synced = 0
    `,
    key,
    value,
  );
}

export async function getStoreName(db: SQLiteDatabase) {
  const value = await getAppSetting(db, STORE_NAME_SETTING_KEY);
  return value?.trim() || null;
}

export async function getActiveStoreId(db: SQLiteDatabase) {
  return getLocalMetadata(db, ACTIVE_STORE_ID_METADATA_KEY);
}

export async function saveActiveStoreId(db: SQLiteDatabase, storeId: string | null) {
  await setLocalMetadata(db, ACTIVE_STORE_ID_METADATA_KEY, storeId?.trim() ?? null);
}

export async function getAuthenticatedUserId(db: SQLiteDatabase) {
  return getLocalMetadata(db, AUTH_USER_ID_METADATA_KEY);
}

export async function saveAuthenticatedUserId(db: SQLiteDatabase, userId: string | null) {
  await setLocalMetadata(db, AUTH_USER_ID_METADATA_KEY, userId?.trim() ?? null);
}

export async function clearAuthMetadata(db: SQLiteDatabase) {
  await Promise.all([
    setLocalMetadata(db, ACTIVE_STORE_ID_METADATA_KEY, null),
    setLocalMetadata(db, AUTH_USER_ID_METADATA_KEY, null),
  ]);
}

export async function saveStoreName(db: SQLiteDatabase, storeName: string) {
  const normalizedStoreName = sanitizeText(storeName, 80);

  if (normalizedStoreName.length < 2) {
    throw new Error("Store name must be at least 2 characters.");
  }

  await setAppSetting(db, STORE_NAME_SETTING_KEY, normalizedStoreName);
  return normalizedStoreName;
}

function sanitizeExpenseCategory(category: string) {
  const normalized = sanitizeText(category, 40).toLowerCase().replace(/\s+/g, "_");

  if (normalized.length < 2) {
    throw new Error("Expense category must be at least 2 characters.");
  }

  return normalized;
}

function normalizeExpenseDate(expenseDate?: string) {
  if (!expenseDate) {
    return new Date().toISOString();
  }

  const parsed = new Date(expenseDate);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Expense date is invalid.");
  }

  return parsed.toISOString();
}

function formatDefaultRestockListTitle(createdAt = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(createdAt);

  return `Restock ${formatted}`;
}

function computeSuggestedRestockQuantity(product: Product) {
  const currentStock = getProductAvailableQuantity(product);
  const reorderThreshold = getProductReorderThreshold(product);
  const baseSuggestion = Math.max(reorderThreshold * 2 - currentStock, reorderThreshold - currentStock, 0);

  if (product.isWeightBased) {
    return Number(baseSuggestion.toFixed(2));
  }

  return Math.max(1, Math.ceil(baseSuggestion));
}

type SqlExecutor = Pick<SQLiteDatabase, "getFirstAsync" | "runAsync">;

async function refreshRestockListStatus(db: SqlExecutor, restockListId: number) {
  const counts = await db.getFirstAsync<{
    status: RestockListStatus;
    total_items: number;
    checked_items: number;
  }>(
    `
      SELECT
        rl.status,
        COUNT(rli.id) AS total_items,
        COALESCE(SUM(CASE WHEN rli.is_checked = 1 THEN 1 ELSE 0 END), 0) AS checked_items
      FROM restock_lists rl
      LEFT JOIN restock_list_items rli ON rli.restock_list_id = rl.id
      WHERE rl.id = ?
      GROUP BY rl.id, rl.status
    `,
    restockListId,
  );

  if (!counts || counts.status === "archived") {
    return;
  }

  const isCompleted = counts.total_items > 0 && counts.checked_items >= counts.total_items;

  await db.runAsync(
    `
      UPDATE restock_lists
      SET
        status = ?,
        completed_at = ?,
        synced = 0
      WHERE id = ?
    `,
    isCompleted ? "completed" : "open",
    isCompleted ? new Date().toISOString() : null,
    restockListId,
  );
}

export async function listExpenses(db: SQLiteDatabase): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(
    `
      SELECT
        id,
        category,
        amount_cents,
        description,
        expense_date,
        created_at,
        updated_at
      FROM expenses
      ORDER BY expense_date DESC, id DESC
    `,
  );

  return rows.map(mapExpense);
}

export async function listLowStockProducts(db: SQLiteDatabase, limit?: number): Promise<Product[]> {
  const products = await listProducts(db);
  const filteredProducts = products.filter(shouldShowProductInLowStock).sort(compareLowStockProducts);

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return filteredProducts.slice(0, Math.floor(limit));
  }

  return filteredProducts;
}

export async function listExpenseCategories(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ category: string }>(
    `
      SELECT category
      FROM expenses
      GROUP BY category
      ORDER BY MAX(expense_date) DESC, category ASC
    `,
  );

  return rows.map((row) => row.category);
}

export async function addExpense(db: SQLiteDatabase, input: ExpenseInput) {
  assertMoney(input.amountCents, "Expense amount");

  if (input.amountCents <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const category = sanitizeExpenseCategory(input.category);
  const description = sanitizeOptionalText(input.description ?? "", 140);
  const expenseDate = normalizeExpenseDate(input.expenseDate);

  const result = await db.runAsync(
    `
      INSERT INTO expenses (
        category,
        amount_cents,
        description,
        expense_date,
        sync_id,
        created_at,
        updated_at,
        synced
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
    `,
    category,
    input.amountCents,
    description,
    expenseDate,
    createSyncId(),
  );

  return Number(result.lastInsertRowId);
}

export async function updateExpense(db: SQLiteDatabase, expenseId: number, input: ExpenseInput) {
  assertMoney(input.amountCents, "Expense amount");

  if (input.amountCents <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const category = sanitizeExpenseCategory(input.category);
  const description = sanitizeOptionalText(input.description ?? "", 140);
  const expenseDate = normalizeExpenseDate(input.expenseDate);

  await db.runAsync(
    `
      UPDATE expenses
      SET
        category = ?,
        amount_cents = ?,
        description = ?,
        expense_date = ?,
        updated_at = CURRENT_TIMESTAMP,
        synced = 0
      WHERE id = ?
    `,
    category,
    input.amountCents,
    description,
    expenseDate,
    expenseId,
  );
}

export async function deleteExpense(db: SQLiteDatabase, expenseId: number) {
  await db.runAsync("DELETE FROM expenses WHERE id = ?", expenseId);
}

export async function getTodayExpenseTotal(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ today_expense_cents: number | null }>(
    `
      SELECT
        COALESCE(SUM(amount_cents), 0) AS today_expense_cents
      FROM expenses
      WHERE DATE(expense_date, 'localtime') = DATE('now', 'localtime')
    `,
  );

  return row?.today_expense_cents ?? 0;
}

export async function getExpenseBreakdownByCategory(
  db: SQLiteDatabase,
  days = 30,
): Promise<ExpenseCategorySummary[]> {
  const lookbackModifier = `-${Math.max(0, days - 1)} days`;
  const rows = await db.getAllAsync<ExpenseCategorySummaryRow>(
    `
      SELECT
        category,
        COALESCE(SUM(amount_cents), 0) AS total_cents,
        COUNT(*) AS entry_count
      FROM expenses
      WHERE DATE(expense_date, 'localtime') >= DATE('now', ?, 'localtime')
      GROUP BY category
      ORDER BY total_cents DESC, entry_count DESC, category ASC
      LIMIT 5
    `,
    lookbackModifier,
  );

  return rows.map((row) => ({
    category: row.category,
    totalCents: row.total_cents,
    count: row.entry_count,
  }));
}

export async function getExpenseSummary(db: SQLiteDatabase): Promise<ExpenseSummary> {
  const [totalsRow, topCategories, recentCategoryRows] = await Promise.all([
    db.getFirstAsync<ExpenseSummaryTotalsRow>(
      `
        SELECT
          COALESCE(SUM(CASE WHEN DATE(expense_date, 'localtime') = DATE('now', 'localtime') THEN amount_cents ELSE 0 END), 0) AS today_expense_cents,
          COALESCE(SUM(CASE WHEN DATE(expense_date, 'localtime') >= DATE('now', '-6 days', 'localtime') THEN amount_cents ELSE 0 END), 0) AS week_expense_cents,
          COALESCE(
            SUM(
              CASE
                WHEN STRFTIME('%Y-%m', expense_date, 'localtime') = STRFTIME('%Y-%m', 'now', 'localtime')
                  THEN amount_cents
                ELSE 0
              END
            ),
            0
          ) AS month_expense_cents
        FROM expenses
      `,
    ),
    getExpenseBreakdownByCategory(db),
    db.getAllAsync<{ category: string }>(
      `
        SELECT category
        FROM expenses
        GROUP BY category
        ORDER BY MAX(expense_date) DESC, category ASC
        LIMIT 6
      `,
    ),
  ]);

  return {
    todayExpenseCents: totalsRow?.today_expense_cents ?? 0,
    weekExpenseCents: totalsRow?.week_expense_cents ?? 0,
    monthExpenseCents: totalsRow?.month_expense_cents ?? 0,
    topCategories,
    recentCategories: recentCategoryRows.map((row) => row.category),
  };
}

export async function getReportsSnapshot(
  db: SQLiteDatabase,
  timeframe: AnalyticsTimeframe,
): Promise<ReportsSnapshot> {
  const salesDateCondition = getTimeframeDateCondition("created_at", timeframe);
  const saleJoinedDateCondition = getTimeframeDateCondition("s.created_at", timeframe);
  const expenseDateCondition = getTimeframeDateCondition("expense_date", timeframe);
  const paymentDateCondition = getTimeframeDateCondition("created_at", timeframe);

  const [salesRow, profitRow, expenseRow, paymentBreakdownRow, paymentActivityRow, expenseBreakdown] = await Promise.all([
    db.getFirstAsync<ReportsSalesTotalsRow>(
      `
        SELECT
          COALESCE(SUM(total_cents), 0) AS sales_cents,
          COUNT(*) AS transaction_count
        FROM sales
        WHERE ${salesDateCondition}
      `,
    ),
    db.getFirstAsync<ReportsGrossProfitRow>(
      `
        SELECT
          COALESCE(SUM(si.line_total_cents - si.line_cost_total_cents), 0) AS gross_profit_cents
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
        WHERE ${saleJoinedDateCondition}
      `,
    ),
    db.getFirstAsync<ReportsExpenseTotalRow>(
      `
        SELECT
          COALESCE(SUM(amount_cents), 0) AS expense_cents
        FROM expenses
        WHERE ${expenseDateCondition}
      `,
    ),
    db.getFirstAsync<PaymentBreakdownRow>(
      `
        SELECT
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_cents ELSE 0 END), 0) AS cash_cents,
          COALESCE(SUM(CASE WHEN payment_method = 'gcash' THEN total_cents ELSE 0 END), 0) AS gcash_cents,
          COALESCE(SUM(CASE WHEN payment_method = 'maya' THEN total_cents ELSE 0 END), 0) AS maya_cents,
          COALESCE(SUM(CASE WHEN payment_method = 'utang' THEN total_cents ELSE 0 END), 0) AS utang_cents
        FROM sales
        WHERE ${salesDateCondition}
      `,
    ),
    db.getFirstAsync<ReportsPaymentActivityRow>(
      `
        SELECT
          COUNT(*) AS payment_events
        FROM utang_payments
        WHERE ${paymentDateCondition}
      `,
    ),
    db.getAllAsync<ExpenseCategorySummary>(
      `
        SELECT
          category,
          COALESCE(SUM(amount_cents), 0) AS totalCents,
          COUNT(*) AS count
        FROM expenses
        WHERE ${expenseDateCondition}
        GROUP BY category
        ORDER BY totalCents DESC, category ASC
        LIMIT 6
      `,
    ),
  ]);

  const grossProfitCents = profitRow?.gross_profit_cents ?? 0;
  const expenseCents = expenseRow?.expense_cents ?? 0;

  return {
    timeframe,
    salesCents: salesRow?.sales_cents ?? 0,
    grossProfitCents,
    expenseCents,
    netProfitCents: grossProfitCents - expenseCents,
    transactionCount: salesRow?.transaction_count ?? 0,
    paymentEvents: paymentActivityRow?.payment_events ?? 0,
    paymentBreakdown: normalizePaymentBreakdown(paymentBreakdownRow),
    expenseBreakdown: expenseBreakdown.map((entry) => ({
      category: entry.category,
      totalCents: entry.totalCents,
      count: entry.count,
    })),
  };
}

export async function createRestockListFromThresholds(
  db: SQLiteDatabase,
  title?: string,
): Promise<RestockList> {
  const products = await listLowStockProducts(db);

  if (products.length === 0) {
    throw new Error("No low-stock or out-of-stock products need restocking right now.");
  }

  const createdAt = new Date();
  const safeTitle = sanitizeText(title ?? formatDefaultRestockListTitle(createdAt), 80);

  let restockListId = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      `
        INSERT INTO restock_lists (title, status, created_at, sync_id, synced)
        VALUES (?, 'open', ?, ?, 0)
      `,
      safeTitle,
      createdAt.toISOString(),
      createSyncId(),
    );

    restockListId = Number(result.lastInsertRowId);

    for (const product of products) {
      const currentStock = product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;

      await txn.runAsync(
        `
          INSERT INTO restock_list_items (
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
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, 0)
        `,
        restockListId,
        product.id,
        product.name,
        sanitizeOptionalText(product.category ?? "", 40),
        currentStock,
        product.minStock,
        computeSuggestedRestockQuantity(product),
        product.isWeightBased ? 1 : 0,
        createSyncId(),
      );
    }
  });

  const nextList = await getRestockListById(db, restockListId);

  if (!nextList) {
    throw new Error("The restock list was created but could not be loaded.");
  }

  return nextList;
}

export async function listRestockLists(db: SQLiteDatabase): Promise<RestockListSummary[]> {
  const rows = await db.getAllAsync<RestockListRow & { total_items: number; checked_items: number }>(
    `
      SELECT
        rl.id,
        rl.title,
        rl.status,
        rl.created_at,
        rl.completed_at,
        COUNT(rli.id) AS total_items,
        COALESCE(SUM(CASE WHEN rli.is_checked = 1 THEN 1 ELSE 0 END), 0) AS checked_items
      FROM restock_lists rl
      LEFT JOIN restock_list_items rli ON rli.restock_list_id = rl.id
      GROUP BY rl.id, rl.title, rl.status, rl.created_at, rl.completed_at
      ORDER BY
        CASE rl.status
          WHEN 'open' THEN 0
          WHEN 'completed' THEN 1
          ELSE 2
        END,
        rl.created_at DESC,
        rl.id DESC
    `,
  );

  return rows.map(mapRestockListSummary);
}

export async function getRestockListById(db: SQLiteDatabase, restockListId: number): Promise<RestockList | null> {
  const summaryRow = await db.getFirstAsync<RestockListRow & { total_items: number; checked_items: number }>(
    `
      SELECT
        rl.id,
        rl.title,
        rl.status,
        rl.created_at,
        rl.completed_at,
        COUNT(rli.id) AS total_items,
        COALESCE(SUM(CASE WHEN rli.is_checked = 1 THEN 1 ELSE 0 END), 0) AS checked_items
      FROM restock_lists rl
      LEFT JOIN restock_list_items rli ON rli.restock_list_id = rl.id
      WHERE rl.id = ?
      GROUP BY rl.id, rl.title, rl.status, rl.created_at, rl.completed_at
      LIMIT 1
    `,
    [restockListId],
  );

  if (!summaryRow) {
    return null;
  }

  const itemRows = await db.getAllAsync<RestockListItemRow>(
    `
      SELECT
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
      WHERE restock_list_id = ?
      ORDER BY is_checked ASC, id ASC
    `,
    [restockListId],
  );

  return {
    ...mapRestockListSummary(summaryRow),
    items: itemRows.map(mapRestockListItem),
  };
}

export async function toggleRestockListItem(
  db: SQLiteDatabase,
  restockListItemId: number,
  nextChecked?: boolean,
): Promise<RestockList> {
  const row = await db.getFirstAsync<{ id: number; restock_list_id: number; is_checked: number }>(
    `
      SELECT id, restock_list_id, is_checked
      FROM restock_list_items
      WHERE id = ?
      LIMIT 1
    `,
    [restockListItemId],
  );

  if (!row) {
    throw new Error("Restock list item not found.");
  }

  const resolvedChecked = typeof nextChecked === "boolean" ? nextChecked : row.is_checked === 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        UPDATE restock_list_items
        SET
          is_checked = ?,
          checked_at = ?,
          synced = 0
        WHERE id = ?
      `,
      resolvedChecked ? 1 : 0,
      resolvedChecked ? new Date().toISOString() : null,
      restockListItemId,
    );

    await refreshRestockListStatus(txn, row.restock_list_id);
  });

  const nextList = await getRestockListById(db, row.restock_list_id);

  if (!nextList) {
    throw new Error("The restock list could not be reloaded.");
  }

  return nextList;
}

export async function updateRestockListItemNote(
  db: SQLiteDatabase,
  restockListItemId: number,
  note: string,
): Promise<void> {
  const safeNote = sanitizeOptionalText(note, 140);

  await db.runAsync(
    `
      UPDATE restock_list_items
      SET
        note = ?,
        synced = 0
      WHERE id = ?
    `,
    safeNote,
    restockListItemId,
  );
}

export async function archiveRestockList(db: SQLiteDatabase, restockListId: number): Promise<void> {
  const existing = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM restock_lists
      WHERE id = ?
      LIMIT 1
    `,
    [restockListId],
  );

  if (!existing) {
    throw new Error("Restock list not found.");
  }

  await db.runAsync(
    `
      UPDATE restock_lists
      SET
        status = 'archived',
        synced = 0
      WHERE id = ?
    `,
    restockListId,
  );
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

  const profitRow = await db.getFirstAsync<{ today_gross_profit_cents: number | null }>(
    `
      SELECT
        COALESCE(SUM(si.line_total_cents - si.line_cost_total_cents), 0) AS today_gross_profit_cents
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE DATE(s.created_at, 'localtime') = DATE('now', 'localtime')
    `,
  );

  const expenseRow = await db.getFirstAsync<{ today_expense_cents: number | null }>(
    `
      SELECT
        COALESCE(SUM(amount_cents), 0) AS today_expense_cents
      FROM expenses
      WHERE DATE(expense_date, 'localtime') = DATE('now', 'localtime')
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

  const paymentActivityRow = await db.getFirstAsync<{
    today_payment_events: number | null;
    today_payment_cents: number | null;
  }>(
    `
      SELECT
        COUNT(*) AS today_payment_events,
        COALESCE(SUM(amount_cents), 0) AS today_payment_cents
      FROM utang_payments
      WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
    `,
  );

  const containerSummaryRow = await db.getFirstAsync<{
    open_event_count: number | null;
    open_customer_count: number | null;
    open_quantity: number | null;
  }>(
    `
      SELECT
        COUNT(*) AS open_event_count,
        COUNT(DISTINCT customer_id) AS open_customer_count,
        COALESCE(SUM(quantity_out - quantity_returned), 0) AS open_quantity
      FROM container_return_events
      WHERE status <> 'returned' AND quantity_out > quantity_returned
    `,
  );

  const allLowStockProducts = await listLowStockProducts(db);
  const lowStockProducts = allLowStockProducts.slice(0, 5);

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

  const todayGrossProfitCents = profitRow?.today_gross_profit_cents ?? 0;
  const todayExpenseCents = expenseRow?.today_expense_cents ?? 0;

  return {
    todaySalesCents: salesRow?.today_sales_cents ?? 0,
    todayTransactions: salesRow?.transaction_count ?? 0,
    todayProfitCents: todayGrossProfitCents,
    todayGrossProfitCents,
    todayExpenseCents,
    todayNetProfitCents: todayGrossProfitCents - todayExpenseCents,
    restockUrgencyCount: allLowStockProducts.length,
    todayPaymentEvents: paymentActivityRow?.today_payment_events ?? 0,
    todayPaymentCents: paymentActivityRow?.today_payment_cents ?? 0,
    totalUtangCents: utangRow?.total_utang_cents ?? 0,
    openContainerReturnEvents: containerSummaryRow?.open_event_count ?? 0,
    openContainerReturnCustomers: containerSummaryRow?.open_customer_count ?? 0,
    openContainerReturnQuantity: containerSummaryRow?.open_quantity ?? 0,
    lowStockProducts,
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
          WHEN pil.id IS NOT NULL THEN COALESCE(ip.quantity_available / NULLIF(pil.units_per_sale, 0), 0)
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
      LEFT JOIN product_inventory_links pil ON pil.product_id = p.id
      LEFT JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
      LEFT JOIN sale_items si ON si.product_id = p.id
      LEFT JOIN sales s ON s.id = si.sale_id
        AND DATE(s.created_at, 'localtime') >= DATE('now', '-13 days', 'localtime')
      GROUP BY p.id, p.name, p.is_weight_based, p.stock, p.total_kg_available, pil.id, pil.units_per_sale, ip.quantity_available
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
  const [
    homeMetrics,
    salesInsight,
    expenseSummary,
    productVelocity,
    weeklyReports,
    products,
    expenses,
    customers,
    ledgerRows,
    paymentRows,
    salesRows,
    saleItemRows,
    containerReturnRows,
    storeName,
  ] = await Promise.all([
    getHomeMetrics(db),
    getSalesInsightContext(db),
    getExpenseSummary(db),
    getProductSalesVelocity(db),
    getWeeklyPaymentBreakdown(db),
    listProducts(db),
    db.getAllAsync<ExpenseRow>(
      `
        SELECT
          id,
          category,
          amount_cents,
          description,
          expense_date,
          created_at,
          updated_at
        FROM expenses
        ORDER BY expense_date DESC, id DESC
        LIMIT 40
      `,
    ),
    listCustomersWithBalances(db),
    db.getAllAsync<LedgerRow>(
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
        ORDER BY customer_id ASC, created_at DESC
      `,
    ),
    db.getAllAsync<UtangPaymentRow>(
      `
        SELECT
          id,
          utang_id,
          customer_id,
          amount_cents,
          note,
          source,
          created_at
        FROM utang_payments
        ORDER BY created_at DESC, id DESC
        LIMIT 80
      `,
    ),
    db.getAllAsync<SaleContextRow>(
      `
        SELECT
          s.id,
          s.total_cents,
          s.cash_paid_cents,
          s.change_given_cents,
          s.discount_cents,
          s.payment_method,
          s.customer_id,
          c.name AS customer_name,
          s.created_at
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        ORDER BY s.created_at DESC, s.id DESC
      `,
    ),
    db.getAllAsync<SaleItemContextRow>(
      `
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
          line_cost_total_cents
        FROM sale_items
        ORDER BY sale_id DESC, id ASC
      `,
    ),
    db.getAllAsync<ContainerReturnEventRow>(
      `
        SELECT
          id,
          sale_id,
          customer_id,
          product_id,
          product_name_snapshot,
          container_label_snapshot,
          quantity_out,
          quantity_returned,
          created_at,
          last_returned_at,
          status
        FROM container_return_events
        ORDER BY sale_id DESC, created_at ASC, id ASC
      `,
    ),
    getStoreName(db),
  ]);

  const ledgerByCustomer = new Map<number, Array<{
    id: number;
    amountCents: number;
    amountPaidCents: number;
    outstandingCents: number;
    description: string | null;
    createdAt: string;
    paidAt: string | null;
  }>>();

  for (const row of ledgerRows) {
    const nextEntry = {
      id: row.id,
      amountCents: row.amount_cents,
      amountPaidCents: row.amount_paid_cents,
      outstandingCents: Math.max(0, row.amount_cents - row.amount_paid_cents),
      description: row.description,
      createdAt: row.created_at,
      paidAt: row.paid_at,
    };

    const entries = ledgerByCustomer.get(row.customer_id) ?? [];
    entries.push(nextEntry);
    ledgerByCustomer.set(row.customer_id, entries);
  }

  const sales = mapSalesHistory(salesRows, saleItemRows, containerReturnRows);
  const utangPayments = paymentRows.map(mapUtangPayment);
  const openContainerReturns = containerReturnRows
    .map(mapContainerReturnEvent)
    .filter((event) => event.status !== "returned" && event.quantityOut > event.quantityReturned);

  return {
    storeName,
    todaySalesCents: homeMetrics.todaySalesCents,
    todayTransactions: homeMetrics.todayTransactions,
    todayProfitCents: homeMetrics.todayProfitCents,
    todayGrossProfitCents: homeMetrics.todayGrossProfitCents,
    todayExpenseCents: homeMetrics.todayExpenseCents,
    todayNetProfitCents: homeMetrics.todayNetProfitCents,
    restockUrgencyCount: homeMetrics.restockUrgencyCount,
    todayPaymentEvents: homeMetrics.todayPaymentEvents,
    todayPaymentCents: homeMetrics.todayPaymentCents,
    totalUtangCents: homeMetrics.totalUtangCents,
    openContainerReturnEvents: homeMetrics.openContainerReturnEvents,
    openContainerReturnCustomers: homeMetrics.openContainerReturnCustomers,
    openContainerReturnQuantity: homeMetrics.openContainerReturnQuantity,
    lowStockProducts: homeMetrics.lowStockProducts,
    topProducts: salesInsight.topProducts,
    delikadoCustomers: homeMetrics.delikadoCustomers,
    paymentBreakdown: homeMetrics.paymentBreakdown,
    dailySales: salesInsight.dailySales,
    weeklyReports,
    expenseSummary,
    productVelocity,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      barcode: product.barcode,
      priceCents: product.priceCents,
      costPriceCents: product.costPriceCents,
      stock: product.stock,
      minStock: product.minStock,
      isWeightBased: product.isWeightBased,
      pricingMode: product.pricingMode,
      pricingStrategy: product.pricingStrategy,
      totalKgAvailable: product.totalKgAvailable,
      costPriceTotalCents: product.costPriceTotalCents,
      sellingPriceTotalCents: product.sellingPriceTotalCents,
      costPricePerKgCents: product.costPricePerKgCents,
      sellingPricePerKgCents: product.sellingPricePerKgCents,
      targetMarginPercent: product.targetMarginPercent,
      computedPricePerKgCents: product.computedPricePerKgCents,
      createdAt: product.createdAt,
      inventoryMode: product.inventoryMode,
      inventoryPoolName: product.inventoryPoolName,
      linkedUnitsPerSale: product.linkedUnitsPerSale,
      linkedDisplayUnitLabel: product.linkedDisplayUnitLabel,
      isPrimaryRestockProduct: product.isPrimaryRestockProduct,
      hasContainerReturn: product.hasContainerReturn,
      containerLabel: product.containerLabel,
      containerDepositCents: product.containerDepositCents,
      defaultContainerQuantityPerSale: product.defaultContainerQuantityPerSale,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      trustScore: customer.trustScore,
      balanceCents: customer.balanceCents,
      lastUtangDate: customer.lastUtangDate,
      overdueLevel: customer.overdueLevel,
      ledgerEntries: ledgerByCustomer.get(customer.id) ?? [],
    })),
    sales,
    expenses: expenses.map(mapExpense),
    utangPayments,
    openContainerReturns,
  };
}

export async function listSalesHistory(db: SQLiteDatabase): Promise<StoreAiSale[]> {
  const [salesRows, saleItemRows, containerReturnRows] = await Promise.all([
    db.getAllAsync<SaleContextRow>(
      `
        SELECT
          s.id,
          s.total_cents,
          s.cash_paid_cents,
          s.change_given_cents,
          s.discount_cents,
          s.payment_method,
          s.customer_id,
          c.name AS customer_name,
          s.created_at
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        ORDER BY s.created_at DESC, s.id DESC
      `,
    ),
    db.getAllAsync<SaleItemContextRow>(
      `
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
          line_cost_total_cents
        FROM sale_items
        ORDER BY sale_id DESC, id ASC
      `,
    ),
    db.getAllAsync<ContainerReturnEventRow>(
      `
        SELECT
          id,
          sale_id,
          customer_id,
          product_id,
          product_name_snapshot,
          container_label_snapshot,
          quantity_out,
          quantity_returned,
          created_at,
          last_returned_at,
          status
        FROM container_return_events
        ORDER BY sale_id DESC, created_at ASC, id ASC
      `,
    ),
  ]);

  return mapSalesHistory(salesRows, saleItemRows, containerReturnRows);
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
        SET name = ?, phone = ?, trust_score = ?, synced = 0
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
      INSERT INTO customers (name, phone, trust_score, sync_id, synced)
      VALUES (?, ?, ?, ?, 0)
    `,
    name,
    phone,
    trustScore,
    createSyncId(),
  );

  return Number(result.lastInsertRowId);
}

export async function updateCustomerTrustScore(db: SQLiteDatabase, customerId: number, trustScore: TrustScore) {
  await db.runAsync(
    `
      UPDATE customers
      SET trust_score = ?, synced = 0
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
    [customerId],
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
      INSERT INTO utang (customer_id, amount_cents, amount_paid_cents, description, sync_id, synced)
      VALUES (?, ?, 0, ?, ?, 0)
    `,
    input.customerId,
    input.amountCents,
    description,
    createSyncId(),
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
    [customerId],
  );

  const paymentRows = await db.getAllAsync<UtangPaymentRow>(
    `
      SELECT
        id,
        utang_id,
        customer_id,
        amount_cents,
        note,
        source,
        created_at
      FROM utang_payments
      WHERE customer_id = ?
      ORDER BY created_at ASC, id ASC
    `,
    [customerId],
  );

  const paymentsByUtangId = new Map<number, UtangPayment[]>();

  for (const paymentRow of paymentRows) {
    const nextPayment: UtangPayment = {
      id: paymentRow.id,
      utangId: paymentRow.utang_id,
      customerId: paymentRow.customer_id,
      amountCents: paymentRow.amount_cents,
      note: paymentRow.note,
      createdAt: paymentRow.created_at,
      source: paymentRow.source,
    };
    const payments = paymentsByUtangId.get(paymentRow.utang_id) ?? [];
    payments.push(nextPayment);
    paymentsByUtangId.set(paymentRow.utang_id, payments);
  }

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    amountCents: row.amount_cents,
    amountPaidCents: row.amount_paid_cents,
    description: row.description,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    payments: paymentsByUtangId.get(row.id) ?? [],
  }));
}

export async function listOpenContainerReturnsByCustomer(
  db: SQLiteDatabase,
  customerId: number,
): Promise<ContainerReturnEvent[]> {
  const rows = await db.getAllAsync<ContainerReturnEventRow>(
    `
      SELECT
        id,
        sale_id,
        customer_id,
        product_id,
        product_name_snapshot,
        container_label_snapshot,
        quantity_out,
        quantity_returned,
        created_at,
        last_returned_at,
        status
      FROM container_return_events
      WHERE customer_id = ?
        AND status <> 'returned'
      ORDER BY created_at DESC, id DESC
    `,
    [customerId],
  );

  return rows.map(mapContainerReturnEvent);
}

export async function applyContainerReturn(db: SQLiteDatabase, eventId: number, quantityToReturn: number) {
  assertWholeNumber(quantityToReturn, "Returned bottle count");

  if (quantityToReturn <= 0) {
    throw new Error("Returned bottle count must be greater than zero.");
  }

  const event = await db.getFirstAsync<ContainerReturnEventRow>(
    `
      SELECT
        id,
        sale_id,
        customer_id,
        product_id,
        product_name_snapshot,
        container_label_snapshot,
        quantity_out,
        quantity_returned,
        created_at,
        last_returned_at,
        status
      FROM container_return_events
      WHERE id = ?
      LIMIT 1
    `,
    [eventId],
  );

  if (!event) {
    throw new Error("Bottle return record not found.");
  }

  const outstanding = Math.max(0, event.quantity_out - event.quantity_returned);

  if (outstanding <= 0) {
    throw new Error("This bottle return record is already cleared.");
  }

  const appliedQuantity = Math.min(quantityToReturn, outstanding);
  const nextReturned = event.quantity_returned + appliedQuantity;
  const nextStatus: ContainerReturnStatus =
    nextReturned >= event.quantity_out ? "returned" : nextReturned > 0 ? "partial" : "open";

  await db.runAsync(
    `
      UPDATE container_return_events
      SET
        quantity_returned = ?,
        last_returned_at = CURRENT_TIMESTAMP,
        status = ?,
        synced = 0
      WHERE id = ?
    `,
    nextReturned,
    nextStatus,
    eventId,
  );
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
    [utangId],
  );

  if (!entry) {
    throw new Error("Utang entry not found.");
  }

  const outstanding = entry.amount_cents - entry.amount_paid_cents;

  if (outstanding <= 0) {
    throw new Error("This utang entry is already fully paid.");
  }

  const safePayment = Math.min(paymentCents, outstanding);
  const nextPaid = entry.amount_paid_cents + safePayment;
  const fullyPaid = nextPaid >= entry.amount_cents;
  const paidAt = fullyPaid ? new Date().toISOString() : null;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `
        INSERT INTO utang_payments (
          utang_id,
          customer_id,
          amount_cents,
          note,
          source,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, NULL, 'manual', ?, 0)
      `,
      utangId,
      entry.customer_id,
      safePayment,
      createSyncId(),
    );

    await txn.runAsync(
      `
        UPDATE utang
        SET amount_paid_cents = ?, paid_at = ?, synced = 0
        WHERE id = ?
      `,
      nextPaid,
      paidAt,
      utangId,
    );
  });
}

export async function clearAllLocalStoreData(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const table of LOCAL_RESET_TABLES) {
      await txn.runAsync(`DELETE FROM ${table}`);
    }
  });
}

export async function checkoutSale(db: SQLiteDatabase, input: CheckoutInput): Promise<CheckoutResult> {
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
  const fallbackUtangDescription = sanitizeOptionalText(buildUtangSaleDescription(safeItems), 140);
  const safeContainerReturns = (input.containerReturns ?? []).map((containerReturn) => {
    const containerLabel = sanitizeText(containerReturn.containerLabel, 60);
    const quantityOut = containerReturn.quantityOut;

    if (containerLabel.length < 2) {
      throw new Error("Container label must be at least 2 characters.");
    }

    assertWholeNumber(quantityOut, "Container quantity");

    if (quantityOut <= 0) {
      throw new Error("Container quantity must be greater than zero.");
    }

    return {
      productId: containerReturn.productId,
      containerLabel,
      quantityOut,
    };
  });

  let saleId = 0;
  const createdContainerReturns: ContainerReturnEvent[] = [];

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const item of safeItems) {
      const product = await txn.getFirstAsync<{
        stock: number;
        is_weight_based: number;
        total_kg_available: number | null;
        inventory_pool_id: number | null;
        units_per_sale: number | null;
        inventory_quantity_available: number | null;
      }>(
        `
          SELECT
            p.stock,
            p.is_weight_based,
            p.total_kg_available,
            pil.inventory_pool_id,
            pil.units_per_sale,
            ip.quantity_available AS inventory_quantity_available
          FROM products p
          LEFT JOIN product_inventory_links pil ON pil.product_id = p.id
          LEFT JOIN inventory_pools ip ON ip.id = pil.inventory_pool_id
          WHERE p.id = ?
        `,
        item.id,
      );

      if (!product) {
        throw new Error(`Product "${item.name}" was not found.`);
      }

      if (product.inventory_pool_id && product.units_per_sale) {
        const requiredBaseUnits = Boolean(product.is_weight_based)
          ? roundWeightKg((item.weightKg ?? 0) * product.units_per_sale)
          : roundWeightKg(item.quantity * product.units_per_sale);
        const availableBaseUnits = product.inventory_quantity_available ?? 0;

        if (availableBaseUnits < requiredBaseUnits) {
          throw new Error(`Not enough stock left for ${item.name}.`);
        }
      } else if (Boolean(product.is_weight_based)) {
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
        INSERT INTO sales (
          total_cents,
          cash_paid_cents,
          change_given_cents,
          discount_cents,
          payment_method,
          customer_id,
          sync_id,
          synced
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `,
      input.totalCents,
      cashPaidCents,
      changeGivenCents,
      input.discountCents,
      input.paymentMethod,
      input.customerId ?? null,
      createSyncId(),
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
            line_cost_total_cents,
            sync_id,
            synced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
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
        createSyncId(),
      );

      const productInventory = await txn.getFirstAsync<{
        inventory_pool_id: number | null;
        units_per_sale: number | null;
      }>(
        `
          SELECT
            pil.inventory_pool_id,
            pil.units_per_sale
          FROM product_inventory_links pil
          WHERE pil.product_id = ?
          LIMIT 1
        `,
        item.id,
      );

      if (productInventory?.inventory_pool_id && productInventory.units_per_sale) {
        const consumedBaseUnits = item.isWeightBased
          ? roundWeightKg((item.weightKg ?? 0) * productInventory.units_per_sale)
          : roundWeightKg(item.quantity * productInventory.units_per_sale);

        await txn.runAsync(
          `
            UPDATE inventory_pools
            SET
              quantity_available = quantity_available - ?,
              updated_at = CURRENT_TIMESTAMP,
              synced = 0
            WHERE id = ?
          `,
          consumedBaseUnits,
          productInventory.inventory_pool_id,
        );
      } else if (item.isWeightBased) {
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

      const containerReturn = safeContainerReturns.find((entry) => entry.productId === item.id);

      if (containerReturn) {
        const result = await txn.runAsync(
          `
            INSERT INTO container_return_events (
              sale_id,
              customer_id,
              product_id,
              product_name_snapshot,
              container_label_snapshot,
              quantity_out,
              quantity_returned,
              sync_id,
              created_at,
              last_returned_at,
              status,
              synced
            )
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, NULL, 'open', 0)
          `,
          saleId,
          input.customerId ?? null,
          item.id,
          item.name,
          containerReturn.containerLabel,
          containerReturn.quantityOut,
          createSyncId(),
        );

        createdContainerReturns.push({
          id: Number(result.lastInsertRowId),
          saleId,
          customerId: input.customerId ?? null,
          productId: item.id,
          productNameSnapshot: item.name,
          containerLabelSnapshot: containerReturn.containerLabel,
          quantityOut: containerReturn.quantityOut,
          quantityReturned: 0,
          createdAt: new Date().toISOString(),
          lastReturnedAt: null,
          status: "open",
        });
      }
    }

    if (input.paymentMethod === "utang" && input.customerId) {
      await txn.runAsync(
        `
          INSERT INTO utang (customer_id, amount_cents, amount_paid_cents, description, sync_id, synced)
          VALUES (?, ?, 0, ?, ?, 0)
        `,
        input.customerId,
        input.totalCents,
        utangDescription || fallbackUtangDescription || `POS sale #${saleId}`,
        createSyncId(),
      );
    }
  });

  return {
    saleId,
    containerReturns: createdContainerReturns,
  };
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
