export type ThemeMode = "light" | "dark";

export type TrustScore = "Bago" | "Maaasahan" | "Bantayan" | "Delikado";

export type OverdueLevel = "fresh" | "attention" | "critical";

export type PaymentMethod = "cash" | "gcash" | "maya" | "utang";

export interface Product {
  id: number;
  name: string;
  priceCents: number;
  costPriceCents: number;
  stock: number;
  category: string | null;
  barcode: string | null;
  minStock: number;
  createdAt: string;
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
}

export interface SaleItemInput {
  id: number;
  name: string;
  priceCents: number;
  costPriceCents: number;
  quantity: number;
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
}

export interface StoreAiContext {
  todaySalesCents: number;
  totalUtangCents: number;
  lowStockProducts: string[];
  topProducts: string[];
  delikadoCustomers: string[];
  paymentBreakdown: PaymentBreakdown;
  customerBalances: Array<{ name: string; balanceCents: number; trustScore: TrustScore }>;
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
