export type ThemeMode = "light" | "dark";
export type AppLanguage = "english" | "taglish";

export type TrustScore = "Bago" | "Maaasahan" | "Bantayan" | "Delikado";

export type OverdueLevel = "fresh" | "attention" | "critical";

export type PaymentMethod = "cash" | "gcash" | "maya" | "utang";
export type ProductPricingMode = "derived" | "direct";
export type ProductPricingStrategy = "manual" | "margin_based";

export interface Product {
  id: number;
  name: string;
  priceCents: number;
  costPriceCents: number;
  stock: number;
  category: string | null;
  barcode: string | null;
  imageUri: string | null;
  minStock: number;
  createdAt: string;
  isWeightBased: boolean;
  pricingMode: ProductPricingMode;
  pricingStrategy: ProductPricingStrategy;
  totalKgAvailable: number | null;
  costPriceTotalCents: number | null;
  sellingPriceTotalCents: number | null;
  costPricePerKgCents: number | null;
  sellingPricePerKgCents: number | null;
  targetMarginPercent: number | null;
  computedPricePerKgCents: number | null;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  trustScore: TrustScore;
  createdAt: string;
}

export interface CartItem {
  id: number;
  name: string;
  priceCents: number;
  stock: number;
  quantity: number;
  isWeightBased: boolean;
}

export interface SaleItemInput {
  id: number;
  name: string;
  priceCents: number;
  costPriceCents: number;
  quantity: number;
  isWeightBased: boolean;
  weightKg: number | null;
  lineTotalCents: number;
  lineCostTotalCents: number;
}

export interface HomeMetrics {
  todaySalesCents: number;
  todayTransactions: number;
  todayProfitCents: number;
  totalUtangCents: number;
  lowStockProducts: Product[];
  delikadoCustomers: RiskCustomerAlert[];
  paymentBreakdown: PaymentBreakdown;
}

export interface CustomerSummary {
  id: number;
  name: string;
  phone: string | null;
  trustScore: TrustScore;
  balanceCents: number;
  lastUtangDate: string | null;
  overdueLevel: OverdueLevel;
}

export interface UtangLedgerEntry {
  id: number;
  customerId: number;
  amountCents: number;
  amountPaidCents: number;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface RiskCustomerAlert {
  id: number;
  name: string;
  balanceCents: number;
}

export interface PaymentBreakdown {
  cashCents: number;
  gcashCents: number;
  mayaCents: number;
  utangCents: number;
}

export interface WeeklyPaymentReport {
  weekLabel: string;
  totalCents: number;
  breakdown: PaymentBreakdown;
}

export interface DailySalesPoint {
  date: string;
  totalCents: number;
  transactions: number;
}

export interface TopProductSummary {
  id: number;
  name: string;
  quantitySold: number;
  revenueCents: number;
}

export interface SalesInsightContext {
  dailySales: DailySalesPoint[];
  totalSalesCents: number;
  totalTransactions: number;
  topProducts: TopProductSummary[];
}

export interface ProductVelocity {
  id: number;
  name: string;
  unitsPerDay: number;
  currentStock: number;
  daysUntilOutOfStock: number | null;
  isWeightBased: boolean;
}

export interface StoreAiProduct {
  id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  priceCents: number;
  costPriceCents: number;
  stock: number;
  minStock: number;
  isWeightBased: boolean;
  pricingMode: ProductPricingMode;
  pricingStrategy: ProductPricingStrategy;
  totalKgAvailable: number | null;
  costPriceTotalCents: number | null;
  sellingPriceTotalCents: number | null;
  costPricePerKgCents: number | null;
  sellingPricePerKgCents: number | null;
  targetMarginPercent: number | null;
  computedPricePerKgCents: number | null;
  createdAt: string;
}

export interface StoreAiCustomerLedgerEntry {
  id: number;
  amountCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface StoreAiCustomer {
  id: number;
  name: string;
  phone: string | null;
  trustScore: TrustScore;
  balanceCents: number;
  lastUtangDate: string | null;
  overdueLevel: OverdueLevel;
  ledgerEntries: StoreAiCustomerLedgerEntry[];
}

export interface StoreAiSaleItem {
  id: number;
  productId: number | null;
  productName: string;
  unitPriceCents: number;
  unitCostCents: number;
  quantity: number;
  isWeightBased: boolean;
  weightKg: number | null;
  lineTotalCents: number;
  lineCostTotalCents: number;
}

export interface StoreAiSale {
  id: number;
  totalCents: number;
  cashPaidCents: number;
  changeGivenCents: number;
  discountCents: number;
  paymentMethod: PaymentMethod;
  customerId: number | null;
  customerName: string | null;
  createdAt: string;
  items: StoreAiSaleItem[];
}

export interface StoreAiContext {
  storeName: string | null;
  todaySalesCents: number;
  todayTransactions: number;
  todayProfitCents: number;
  totalUtangCents: number;
  lowStockProducts: Product[];
  topProducts: TopProductSummary[];
  delikadoCustomers: RiskCustomerAlert[];
  paymentBreakdown: PaymentBreakdown;
  dailySales: DailySalesPoint[];
  weeklyReports: WeeklyPaymentReport[];
  productVelocity: ProductVelocity[];
  products: StoreAiProduct[];
  customers: StoreAiCustomer[];
  sales: StoreAiSale[];
}

export interface CustomerRiskProfile {
  customerId: number;
  totalPaidCents: number;
  totalUnpaidCents: number;
  avgDaysToPay: number;
  maxDaysUnpaid: number;
  paidEntries: number;
  unpaidEntries: number;
}

export interface HomeAiBrief {
  insight: string;
  restockSuggestions: string[];
  generatedOn: string;
  source: "ai" | "fallback";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}
