import Storage from "expo-sqlite/kv-store";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  getExpenseSummary,
  getCustomerRiskProfile,
  getHomeMetrics,
  getProductSalesVelocity,
  getSalesInsightContext,
  getStoreAiContext,
  listCustomersWithBalances,
  updateCustomerTrustScore,
} from "@/db/repositories";
import type {
  AppLanguage,
  ChatMessage,
  CustomerRiskProfile,
  HomeAiBrief,
  Product,
  ProductVelocity,
  StoreAiContext,
  TrustScore,
} from "@/types/models";
import { invokeSupabaseFunction, isSupabaseReady } from "@/utils/supabase";
import { formatCurrencyFromCents } from "@/utils/money";

const GEMINI_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;
const GEMINI_PROXY_FUNCTION = "gemini-proxy";
const REQUEST_TIMEOUT_MS = 18_000;
const HOME_AI_BRIEF_KEY_PREFIX = "ai.home-brief.v6";

type GeminiContent = {
  role?: "user" | "model";
  parts: Array<{ text: string }>;
};

type GeminiTextOptions = {
  systemInstruction?: string;
  contents: GeminiContent[];
  temperature?: number;
};

type GeminiJsonOptions<T> = GeminiTextOptions & {
  schema: Record<string, unknown>;
  validate: (value: unknown) => T;
};

type TrustScoreResult = {
  trustScore: TrustScore;
  reason: string;
  source: "ai" | "fallback";
};

type GeminiFailure = {
  kind: "quota" | "network" | "config" | "generic";
  retryAfterSeconds?: number;
};

type GeminiRequestBody = {
  system_instruction?: {
    parts: Array<{ text: string }>;
  };
  contents: GeminiContent[];
  generationConfig: {
    temperature: number;
    responseMimeType: string;
    responseJsonSchema?: Record<string, unknown>;
    thinkingConfig: {
      thinkingBudget: number;
    };
  };
};

function getTodayCacheKey(language: AppLanguage) {
  const day = new Intl.DateTimeFormat("en-CA").format(new Date());
  return `${HOME_AI_BRIEF_KEY_PREFIX}.${language}.${day}`;
}

function getGeminiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

function formatHomeBriefInsightLegacy(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  const withBoldAmounts = normalized.replace(
    /(?:\*\*)?(₱\d[\d,]*(?:\.\d{1,2})?)(?:\*\*)?/g,
    (_match, amount: string) => `**${amount}**`,
  );
  const phrasesToEmphasize = [
    "out of stock",
    "low stock",
    "restock",
    "restocking",
    "utang",
    "bottle returns",
    "empty bottles",
    "follow up",
    "highest expense",
    "top-selling",
  ];

  return phrasesToEmphasize.reduce((text, phrase) => {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(
      new RegExp(`(?:\\*\\*)?(${escapedPhrase})(?:\\*\\*)?`, "gi"),
      (_match, value: string) => `**${value}**`,
    );
  }, withBoldAmounts);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyOutsideBold(text: string, transform: (segment: string) => string) {
  return text
    .split(/(\*\*.*?\*\*)/g)
    .map((segment) => (segment.startsWith("**") && segment.endsWith("**") ? segment : transform(segment)))
    .join("");
}

function formatHomeBriefInsight(input: string, productNames: string[] = []) {
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return "";
  }

  const phrasesToEmphasize = [
    "out of stock",
    "low stock",
    "restock",
    "restocking",
    "utang",
    "bottle returns",
    "empty bottles",
    "follow up",
    "highest expense",
    "top-selling",
  ];
  const termsToEmphasize = [
    ...phrasesToEmphasize,
    ...productNames.map((name) => name.trim()).filter(Boolean),
  ]
    .filter((term, index, collection) => collection.findIndex((value) => value.toLowerCase() === term.toLowerCase()) === index)
    .sort((left, right) => right.length - left.length);

  const withBoldTerms = termsToEmphasize.reduce((text, phrase) => {
    const escapedPhrase = escapeRegExp(phrase);
    return applyOutsideBold(text, (segment) =>
      segment.replace(
        new RegExp(`(?:\\*\\*)?(${escapedPhrase})(?:\\*\\*)?`, "gi"),
        (_match, value: string) => `**${value}**`,
      ),
    );
  }, normalized);

  const withBoldAmounts = applyOutsideBold(withBoldTerms, (segment) =>
    segment.replace(/(?:\*\*)?(\u20B1\d[\d,]*(?:\.\d{1,2})?)(?:\*\*)?/g, (_match, amount: string) => `**${amount}**`),
  );

  return applyOutsideBold(withBoldAmounts, (segment) =>
    segment.replace(
      /(?:\*\*)?(\d+(?:\.\d+)?\s?(?:g|kg|mg|ml|l|pcs|pc|packs?|bottles?|items?|units?))(?:\*\*)?/gi,
      (_match, quantity: string) => `**${quantity}**`,
    ),
  );
}

function parseGeminiFailure(error: unknown): GeminiFailure {
  const message = getGeminiErrorMessage(error);
  const retryMatch =
    message.match(/retry(?: in)?[^\d]*(\d+)(?:\.\d+)?s?/i) ?? message.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  const retryAfterSeconds = retryMatch ? Number.parseInt(retryMatch[1] ?? "", 10) : undefined;
  const normalized = message.toLowerCase();

  if (
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("rate limit") ||
    normalized.includes("429")
  ) {
    return { kind: "quota", retryAfterSeconds };
  }

  if (normalized.includes("not configured")) {
    return { kind: "config" };
  }

  if (
    normalized.includes("network request failed") ||
    normalized.includes("unable to connect") ||
    normalized.includes("aborted") ||
    normalized.includes("timed out")
  ) {
    return { kind: "network" };
  }

  return { kind: "generic", retryAfterSeconds };
}

function formatRetryHint(language: AppLanguage, retryAfterSeconds?: number) {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    return language === "english" ? "after the limit resets" : "pag-reset ng limit";
  }

  if (retryAfterSeconds < 90) {
    return language === "english" ? "in about 1 minute" : "mga 1 minuto mula ngayon";
  }

  const minutes = Math.ceil(retryAfterSeconds / 60);
  return language === "english"
    ? `in about ${minutes} minutes`
    : `mga ${minutes} minuto mula ngayon`;
}

function ensureGeminiConfigured() {
  if (!isSupabaseReady()) {
    throw new Error(
      "Gemini proxy is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then deploy the gemini-proxy edge function.",
    );
  }
}

function extractGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts) || parts.length === 0) {
    const blockReason = payload?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Gemini blocked this request: ${blockReason}.`);
    }

    throw new Error("Gemini returned an empty response.");
  }

  const text = parts
    .map((part: { text?: string }) => part?.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response body.");
  }

  return text;
}

async function callGeminiText(options: GeminiTextOptions) {
  ensureGeminiConfigured();
  const body: GeminiRequestBody = {
    system_instruction: options.systemInstruction
      ? {
          parts: [{ text: options.systemInstruction }],
        }
      : undefined,
    contents: options.contents,
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      responseMimeType: "text/plain",
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  return callGeminiWithFallback(body, (payload) => extractGeminiText(payload));
}

async function callGeminiJson<T>(options: GeminiJsonOptions<T>) {
  ensureGeminiConfigured();
  const body: GeminiRequestBody = {
    system_instruction: options.systemInstruction
      ? {
          parts: [{ text: options.systemInstruction }],
        }
      : undefined,
    contents: options.contents,
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      responseMimeType: "application/json",
      responseJsonSchema: options.schema,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  return callGeminiWithFallback(body, (payload) => {
    const text = extractGeminiText(payload);
    return options.validate(JSON.parse(text));
  });
}

async function callGeminiWithFallback<T>(
  body: GeminiRequestBody,
  parsePayload: (payload: any) => T,
) {
  const failures: string[] = [];

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const payload = await invokeSupabaseFunction<any>(
        GEMINI_PROXY_FUNCTION,
        { model, body },
        { signal: controller.signal },
      );
      return parsePayload(payload);
    } catch (error) {
      const message = getGeminiErrorMessage(error) || `Unknown error for ${model}.`;
      const failure = parseGeminiFailure(error);
      failures.push(message);

      if (failure.kind === "network" || failure.kind === "config") {
        break;
      }

      if (model !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        console.warn(`Gemini model fallback from ${model}: ${message}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(failures.join(" | "));
}

function validateHomeAiBrief(value: unknown): HomeAiBrief {
  const record = value as Partial<HomeAiBrief>;

  if (
    !record ||
    typeof record.insight !== "string" ||
    !Array.isArray(record.restockSuggestions) ||
    record.restockSuggestions.some((item) => typeof item !== "string")
  ) {
    throw new Error("Gemini returned an invalid home brief format.");
  }

  return {
    insight: formatHomeBriefInsight(record.insight),
    restockSuggestions: record.restockSuggestions.map((item) => item.trim()).filter(Boolean).slice(0, 5),
    generatedOn: new Date().toISOString(),
    source: "ai",
  };
}

function validateTrustScore(value: unknown): { trustScore: TrustScore; reason: string } {
  const record = value as Partial<{ trustScore: TrustScore; reason: string }>;
  const allowed: TrustScore[] = ["Bago", "Maaasahan", "Bantayan", "Delikado"];

  if (!record || !record.trustScore || !allowed.includes(record.trustScore)) {
    throw new Error("Gemini returned an invalid trust score.");
  }

  return {
    trustScore: record.trustScore,
    reason: typeof record.reason === "string" ? record.reason.trim() : "",
  };
}

function centsToPesoAmount(cents: number) {
  return Number(((Number.isFinite(cents) ? cents : 0) / 100).toFixed(2));
}

function convertMoneyFieldsForAi(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertMoneyFieldsForAi(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (key.endsWith("Cents") && typeof entryValue === "number") {
        return [`${key.slice(0, -"Cents".length)}Pesos`, centsToPesoAmount(entryValue)];
      }

      return [key, convertMoneyFieldsForAi(entryValue)];
    }),
  );
}

function buildStoreAiPromptContext(context: StoreAiContext) {
  return JSON.stringify(
    {
      currency: "PHP",
      moneyUnit: "All monetary values below are in Philippine pesos, not cents.",
      storeProfile: {
        storeName: context.storeName,
      },
      dashboard: convertMoneyFieldsForAi({
        todaySalesCents: context.todaySalesCents,
        todayTransactions: context.todayTransactions,
        todayProfitCents: context.todayProfitCents,
        todayGrossProfitCents: context.todayGrossProfitCents,
        todayExpenseCents: context.todayExpenseCents,
        todayNetProfitCents: context.todayNetProfitCents,
        restockUrgencyCount: context.restockUrgencyCount,
        todayPaymentEvents: context.todayPaymentEvents,
        todayPaymentCents: context.todayPaymentCents,
        totalUtangCents: context.totalUtangCents,
        openContainerReturnEvents: context.openContainerReturnEvents,
        openContainerReturnCustomers: context.openContainerReturnCustomers,
        openContainerReturnQuantity: context.openContainerReturnQuantity,
        paymentBreakdown: context.paymentBreakdown,
        lowStockProducts: context.lowStockProducts,
        delikadoCustomers: context.delikadoCustomers,
        dailySales: context.dailySales,
        weeklyReports: context.weeklyReports,
        expenseSummary: context.expenseSummary,
        topProducts: context.topProducts,
        productVelocity: context.productVelocity,
      }),
      catalog: convertMoneyFieldsForAi(context.products),
      customers: convertMoneyFieldsForAi(context.customers),
      sales: convertMoneyFieldsForAi(context.sales),
      expenses: convertMoneyFieldsForAi(context.expenses),
      utangPayments: convertMoneyFieldsForAi(context.utangPayments),
      openContainerReturns: convertMoneyFieldsForAi(context.openContainerReturns),
    },
    null,
    2,
  );
}

function buildHeuristicRestockSuggestions(language: AppLanguage, atRiskProducts: ProductVelocity[]) {
  return atRiskProducts.slice(0, 5).map((product) => {
    const daysLeft = product.daysUntilOutOfStock ?? 0;

    if (language === "english") {
      return `${product.name}: restock soon. Only ${product.currentStock} left, selling ${product.unitsPerDay.toFixed(1)} per day, around ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`;
    }

    return `${product.name}: mag-restock na soon. ${product.currentStock} na lang ang stock, benta na ${product.unitsPerDay.toFixed(1)} kada araw, mga ${daysLeft} araw na lang ang tira.`;
  });
}

function buildLowStockRestockSuggestions(language: AppLanguage, lowStockProducts: Product[]) {
  return lowStockProducts.slice(0, 5).map((product) => {
    if (language === "english") {
      if (product.stock <= 0) {
        return `${product.name}: out of stock. Restock immediately.`;
      }

      return `${product.name}: low stock with only ${product.stock} left. Restock soon to stay above the ${product.minStock} minimum.`;
    }

    if (product.stock <= 0) {
      return `${product.name}: ubos na ang stock. Mag-restock agad.`;
    }

    return `${product.name}: paubos na, ${product.stock} na lang ang natitira. Mag-restock na para lampas sa ${product.minStock} minimum.`;
  });
}

function buildFallbackRestockSuggestions(
  language: AppLanguage,
  atRiskProducts: ProductVelocity[],
  lowStockProducts: Product[],
) {
  const atRiskSuggestions = buildHeuristicRestockSuggestions(language, atRiskProducts);

  if (atRiskSuggestions.length >= 5) {
    return atRiskSuggestions.slice(0, 5);
  }

  const atRiskIds = new Set(atRiskProducts.map((product) => product.id));
  const lowStockSuggestions = buildLowStockRestockSuggestions(
    language,
    lowStockProducts.filter((product) => !atRiskIds.has(product.id)),
  );

  return [...atRiskSuggestions, ...lowStockSuggestions].slice(0, 5);
}

function humanizeExpenseCategory(category: string | undefined) {
  if (!category) {
    return "";
  }

  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFallbackExpenseInsight(
  language: AppLanguage,
  todayExpenseCents: number,
  todayNetProfitCents: number,
  topCategoryLabel?: string,
) {
  if (todayExpenseCents <= 0) {
    return "";
  }

  const expenseAmount = formatCurrencyFromCents(todayExpenseCents);
  const netProfitAmount = formatCurrencyFromCents(todayNetProfitCents);
  const categorySuffix = topCategoryLabel ?? "";

  if (language === "english") {
    return todayNetProfitCents < 0
      ? `Today's expenses are already at ${expenseAmount}, pushing net profit down to ${netProfitAmount}.${categorySuffix ? ` Biggest pressure: ${categorySuffix}.` : ""}`
      : `Today's expenses are ${expenseAmount}, leaving net profit at ${netProfitAmount}.${categorySuffix ? ` Biggest pressure: ${categorySuffix}.` : ""}`;
  }

  return todayNetProfitCents < 0
    ? `Umabot na sa ${expenseAmount} ang gastos ngayon kaya nasa ${netProfitAmount} ang net profit.${categorySuffix ? ` Pinakamalaking pressure: ${categorySuffix}.` : ""}`
    : `Nasa ${expenseAmount} ang gastos ngayon kaya ${netProfitAmount} ang net profit.${categorySuffix ? ` Pinakamalaking pressure: ${categorySuffix}.` : ""}`;
}

function buildFallbackOperationsInsight(
  language: AppLanguage,
  todayPaymentEvents: number,
  todayPaymentCents: number,
  openContainerReturnQuantity: number,
  openContainerReturnCustomers: number,
) {
  const paymentInsight =
    todayPaymentEvents > 0
      ? language === "english"
        ? `Logged ${todayPaymentEvents} utang payment ${todayPaymentEvents === 1 ? "entry" : "entries"} today worth ${formatCurrencyFromCents(todayPaymentCents)}.`
        : `May ${todayPaymentEvents} na log ng bayad sa utang ngayon na nagkakahalaga ng ${formatCurrencyFromCents(todayPaymentCents)}.`
      : "";

  const bottleInsight =
    openContainerReturnQuantity > 0
      ? language === "english"
        ? `There are still ${openContainerReturnQuantity} empty ${openContainerReturnQuantity === 1 ? "bottle" : "bottles"} pending across ${openContainerReturnCustomers} ${openContainerReturnCustomers === 1 ? "customer" : "customers"}.`
        : `May ${openContainerReturnQuantity} pang empty bottle na hindi pa naibabalik mula sa ${openContainerReturnCustomers} ${openContainerReturnCustomers === 1 ? "customer" : "customers"}.`
      : "";

  return [paymentInsight, bottleInsight].filter(Boolean).join(" ");
}

function buildFallbackHomeAiBrief(
  language: AppLanguage,
  restockSuggestions: string[] = [],
  error?: unknown,
  options?: {
    productNamesToEmphasize?: string[];
    todayExpenseCents?: number;
    todayNetProfitCents?: number;
    topExpenseCategory?: string;
    todayPaymentEvents?: number;
    todayPaymentCents?: number;
    openContainerReturnQuantity?: number;
    openContainerReturnCustomers?: number;
  },
): HomeAiBrief {
  const failure = error ? parseGeminiFailure(error) : null;
  let insight: string;

  if (failure?.kind === "quota") {
    const retryHint = formatRetryHint(language, failure.retryAfterSeconds);
    insight =
      language === "english"
        ? `IndAI hit the current Gemini request limit. Core POS features still work, and the AI brief should recover ${retryHint}.`
        : `Naabot ni IndAI ang current Gemini request limit. Gumagana pa rin ang core POS features, at babalik ang AI brief ${retryHint}.`;
  } else if (failure?.kind === "network") {
    insight =
      language === "english"
        ? "IndAI can't reach Gemini right now. Core POS features still work, and the daily brief will return once the connection is back."
        : "Hindi makakonekta si IndAI sa Gemini ngayon. Gumagana pa rin ang core POS features, at babalik ang daily brief pag maayos na ang connection.";
  } else if (failure?.kind === "config") {
    insight =
      language === "english"
        ? "Gemini proxy is not configured in this app build yet. Core POS features still work, and you can restart after wiring Supabase and deploying the edge function."
        : "Hindi pa configured ang Gemini proxy sa app build na ito. Gumagana pa rin ang core POS features, at puwede mong i-restart pagkatapos i-wire ang Supabase at i-deploy ang edge function.";
  } else {
    insight =
      language === "english"
        ? "IndAI is unavailable right now. Core POS features still work, and you can try again shortly."
        : "Unavailable si IndAI ngayon. Gumagana pa rin ang core POS features, at puwede kang sumubok ulit mamaya.";
  }

  const expenseInsight = buildFallbackExpenseInsight(
    language,
    options?.todayExpenseCents ?? 0,
    options?.todayNetProfitCents ?? 0,
    options?.topExpenseCategory,
  );
  const operationsInsight = buildFallbackOperationsInsight(
    language,
    options?.todayPaymentEvents ?? 0,
    options?.todayPaymentCents ?? 0,
    options?.openContainerReturnQuantity ?? 0,
    options?.openContainerReturnCustomers ?? 0,
  );

  return {
    insight: formatHomeBriefInsight([insight, expenseInsight, operationsInsight].filter(Boolean).join(" "), options?.productNamesToEmphasize),
    restockSuggestions,
    generatedOn: new Date().toISOString(),
    source: "fallback",
  };
}

function getReplyLanguageInstruction(language: AppLanguage) {
  return language === "english"
    ? "Reply in clear English."
    : "Reply in warm Taglish.";
}

function computeHeuristicTrustScore(profile: CustomerRiskProfile): TrustScoreResult {
  if (profile.paidEntries === 0 && profile.unpaidEntries === 0 && profile.totalPaidCents === 0 && profile.totalUnpaidCents === 0) {
    return {
      trustScore: "Bago",
      reason: "No payment history yet.",
      source: "fallback",
    };
  }

  if (
    profile.totalUnpaidCents >= 3_000_00 ||
    profile.maxDaysUnpaid >= 30 ||
    profile.unpaidEntries >= 3
  ) {
    return {
      trustScore: "Delikado",
      reason: "Large unpaid balance or long overdue entries detected.",
      source: "fallback",
    };
  }

  if (
    profile.totalUnpaidCents >= 1_000_00 ||
    profile.avgDaysToPay > 14 ||
    profile.unpaidEntries >= 1
  ) {
    return {
      trustScore: "Bantayan",
      reason: "Moderate outstanding balance or slower payment behavior.",
      source: "fallback",
    };
  }

  return {
    trustScore: "Maaasahan",
    reason: "Payment history looks healthy and unpaid balances are low.",
    source: "fallback",
  };
}

export function isGeminiReady() {
  return isSupabaseReady();
}

export async function getOrCreateHomeAiBrief(db: SQLiteDatabase, language: AppLanguage = "taglish") {
  const cacheKey = getTodayCacheKey(language);
  const cached = await Storage.getItem(cacheKey);
  const geminiReady = isGeminiReady();

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as HomeAiBrief;
      const hasUsableSuggestions =
        Boolean(parsed?.insight) &&
        Array.isArray(parsed?.restockSuggestions) &&
        parsed.restockSuggestions.length > 0;

      if (
        hasUsableSuggestions &&
        ((parsed.source === "ai" && geminiReady) || (parsed.source === "fallback" && !geminiReady))
      ) {
        return parsed;
      }
    } catch {
      // Ignore malformed cache and regenerate below.
    }
  }

  const [salesContext, velocity, homeMetrics, expenseSummary] = await Promise.all([
    getSalesInsightContext(db),
    getProductSalesVelocity(db),
    getHomeMetrics(db),
    getExpenseSummary(db),
  ]);
  const atRiskProducts = velocity
    .filter(
      (item) =>
        (item.currentStock > 0 && item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 3) ||
        item.currentStock <= 0,
    )
    .slice(0, 5);
  const heuristicRestockSuggestions = buildFallbackRestockSuggestions(
    language,
    atRiskProducts,
    homeMetrics.lowStockProducts,
  );
  const productNamesToEmphasize = [
    ...salesContext.topProducts.map((product) => product.name),
    ...atRiskProducts.map((product) => product.name),
    ...homeMetrics.lowStockProducts.map((product) => product.name),
  ]
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, collection) => collection.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index)
    .sort((left, right) => right.length - left.length);

  if (!geminiReady) {
    const fallback = buildFallbackHomeAiBrief(language, heuristicRestockSuggestions, undefined, {
      productNamesToEmphasize,
      todayExpenseCents: homeMetrics.todayExpenseCents,
      todayNetProfitCents: homeMetrics.todayNetProfitCents,
      topExpenseCategory: humanizeExpenseCategory(expenseSummary.topCategories[0]?.category),
      todayPaymentEvents: homeMetrics.todayPaymentEvents,
      todayPaymentCents: homeMetrics.todayPaymentCents,
      openContainerReturnQuantity: homeMetrics.openContainerReturnQuantity,
      openContainerReturnCustomers: homeMetrics.openContainerReturnCustomers,
    });
    await Storage.setItem(cacheKey, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const brief = await callGeminiJson<HomeAiBrief>({
      systemInstruction:
        [
          "You are IndAI, a practical business assistant for a sari-sari store in the Philippines.",
          getReplyLanguageInstruction(language),
          "If products are low stock, out of stock, or at risk of running out soon, include concrete restock suggestions.",
          "When linked inventory exists, reason about the shared stock pool and prefer the primary restock product over the child tingi item when recommending restocks.",
          "Treat utang payments and open bottle-return obligations as operational signals worth mentioning when relevant.",
          "Stay concise, mobile-friendly, and never invent store data that was not provided.",
          "Use 2 short sentences by default, and use a 3rd sentence only when it prevents the brief from feeling cut off or incomplete.",
          "Do not drop the main action item or exact product name just to make the brief shorter.",
          "If you mention money, quantities, products, or urgent alerts, wrap only those exact parts in **double asterisks**.",
          "Do not use bullets, headings, or emojis.",
        ].join(" "),
      contents: [
        {
          parts: [
            {
              text: [
                "Create a daily store brief.",
                `7-day total sales: ${formatCurrencyFromCents(salesContext.totalSalesCents)}`,
                `7-day transaction count: ${salesContext.totalTransactions}`,
                `Today's gross profit: ${formatCurrencyFromCents(homeMetrics.todayGrossProfitCents)}`,
                `Today's expenses: ${formatCurrencyFromCents(homeMetrics.todayExpenseCents)}`,
                `Today's net profit: ${formatCurrencyFromCents(homeMetrics.todayNetProfitCents)}`,
                `Restock alerts right now: ${homeMetrics.restockUrgencyCount}`,
                `Today's utang payments: ${homeMetrics.todayPaymentEvents} log(s) totaling ${formatCurrencyFromCents(homeMetrics.todayPaymentCents)}`,
                `Open bottle-return obligations: ${homeMetrics.openContainerReturnQuantity} container(s) across ${homeMetrics.openContainerReturnCustomers} customer(s)`,
                `Top products this week: ${salesContext.topProducts.map((product) => product.name).join(", ") || "None yet"}`,
                `Top expense categories this month: ${
                  expenseSummary.topCategories.length > 0
                    ? expenseSummary.topCategories
                        .map((entry) => `${humanizeExpenseCategory(entry.category)}=${formatCurrencyFromCents(entry.totalCents)}`)
                        .join("; ")
                    : "None"
                }`,
                `Daily sales trend: ${salesContext.dailySales
                  .map((day) => `${day.date}=${formatCurrencyFromCents(day.totalCents)} (${day.transactions} txns)`)
                  .join("; ") || "No sales yet"}`,
                `Products likely to run out in 3 days: ${
                  atRiskProducts.length > 0
                    ? atRiskProducts
                        .map(
                          (item) =>
                            `${item.name}: ${item.unitsPerDay} units/day, ${item.currentStock} stock, ${item.daysUntilOutOfStock} days left`,
                        )
                        .join("; ")
                    : "None"
                }`,
                `Low stock products right now: ${
                  homeMetrics.lowStockProducts.length > 0
                    ? homeMetrics.lowStockProducts
                        .map((item) =>
                          item.inventoryMode === "linked"
                            ? `${item.name}: linked pool ${item.inventoryPoolName ?? "shared stock"}, ${item.isPrimaryRestockProduct ? "primary restock item" : "linked child item"}, ${item.stock} stock, ${item.minStock} minimum`
                            : `${item.name}: ${item.stock} stock, ${item.minStock} minimum`,
                        )
                        .join("; ")
                    : "None"
                }`,
                "Keep the insight easy to scan on a phone screen.",
                "Do not make the brief feel abruptly cut off.",
                "Return JSON only.",
              ].join("\n"),
            },
          ],
        },
      ],
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          insight: {
            type: "string",
            description:
              language === "english"
                ? "A friendly English insight in 2 short sentences, or 3 short sentences if needed for clarity. You may use **bold** markdown for important amounts, quantities, exact product names, or urgent alert phrases."
                : "A friendly Taglish insight in 2 short sentences, o 3 short sentences kung kailangan para malinaw. Puwedeng gumamit ng **bold** markdown para sa importanteng amounts, quantities, exact product names, o urgent alert phrases.",
          },
          restockSuggestions: {
            type: "array",
            description:
              language === "english"
                ? "Up to 5 English restock suggestions. Each item should be actionable."
                : "Up to 5 Taglish restock suggestions. Each item should be actionable.",
            items: {
              type: "string",
            },
            maxItems: 5,
          },
        },
        required: ["insight", "restockSuggestions"],
      },
      temperature: 0.5,
      validate: validateHomeAiBrief,
    });
    const finalizedBrief = {
      ...brief,
      insight: formatHomeBriefInsight(brief.insight, productNamesToEmphasize),
      restockSuggestions:
        brief.restockSuggestions.length > 0 ? brief.restockSuggestions : heuristicRestockSuggestions,
    };

    await Storage.setItem(cacheKey, JSON.stringify(finalizedBrief));
    return finalizedBrief;
  } catch (error) {
    console.warn("Gemini home brief failed:", getGeminiErrorMessage(error));
    const fallback = buildFallbackHomeAiBrief(language, heuristicRestockSuggestions, error, {
      productNamesToEmphasize,
      todayExpenseCents: homeMetrics.todayExpenseCents,
      todayNetProfitCents: homeMetrics.todayNetProfitCents,
      topExpenseCategory: humanizeExpenseCategory(expenseSummary.topCategories[0]?.category),
      todayPaymentEvents: homeMetrics.todayPaymentEvents,
      todayPaymentCents: homeMetrics.todayPaymentCents,
      openContainerReturnQuantity: homeMetrics.openContainerReturnQuantity,
      openContainerReturnCustomers: homeMetrics.openContainerReturnCustomers,
    });
    return fallback;
  }
}

export async function chatWithAlingAi(
  db: SQLiteDatabase,
  history: ChatMessage[],
  userMessage: string,
  language: AppLanguage = "taglish",
) {
  if (!isGeminiReady()) {
    return language === "english"
      ? "Gemini is not connected yet. Configure Supabase and deploy the gemini-proxy edge function to unlock IndAI."
      : "Hindi pa naka-connect ang Gemini proxy. I-configure ang Supabase at i-deploy ang gemini-proxy edge function para ma-unlock si IndAI.";
  }

  const [context, storedStoreName] = await Promise.all([
    getStoreAiContext(db),
    Storage.getItem("tindahan.store-name"),
  ]);
  const promptContext = buildStoreAiPromptContext({
    ...context,
    storeName: storedStoreName?.trim() || context.storeName,
  });
  const trimmedHistory = history.slice(-8);

  try {
    return await callGeminiText({
      systemInstruction: [
        "You are IndAI, the smart assistant inside TindaHan AI.",
        getReplyLanguageInstruction(language),
        "Be encouraging, brief, and specific to the store data provided.",
        "The store data provided is authoritative. Use it as your source of truth for products, stock, sales, utang, customers, pricing, and payment mix.",
        "Linked inventory pools, repack sessions, utang payment logs, and bottle-return obligations are meaningful operational context. Use them when relevant.",
        "All money in the provided context is already in Philippine pesos (PHP). Never reply in cents unless the user explicitly asks for cents.",
        "When the user asks about specific products, customers, balances, stock, or sales, inspect the provided data carefully before answering.",
        "Do not volunteer phone numbers unless the user explicitly asks for them.",
        "You may use light markdown for structure and emphasis, including **bold**, short bullet lists, and numbered lists.",
        "Do not use tables, code blocks, or HTML.",
      ].join(" "),
      contents: [
        {
          parts: [
            {
              text: [
                "Full store context JSON:",
                promptContext,
              ].join("\n"),
            },
          ],
        },
        ...trimmedHistory.map<GeminiContent>((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.text }],
        })),
        {
          role: "user",
          parts: [{ text: userMessage.trim() }],
        },
      ],
      temperature: 0.6,
    });
  } catch (error) {
    console.warn("Gemini chat failed:", getGeminiErrorMessage(error));
    const failure = parseGeminiFailure(error);

    if (failure.kind === "quota") {
      const retryHint = formatRetryHint(language, failure.retryAfterSeconds);
      return language === "english"
        ? `Gemini hit the current request limit. Please try again ${retryHint}. POS and credit features still work.`
        : `Naabot ng Gemini ang current request limit. Pakisubukan ulit ${retryHint}. Gumagana pa rin ang POS at palista features.`;
    }

    if (failure.kind === "network") {
      return language === "english"
        ? "Gemini can't be reached right now. POS and credit features still work while the connection is down."
        : "Hindi ma-reach ang Gemini ngayon. Gumagana pa rin ang POS at palista features habang may problema sa connection.";
    }

    return language === "english"
      ? "IndAI is unavailable right now, but POS and credit features still work."
      : "Unavailable si IndAI ngayon, pero gumagana pa rin ang POS at palista features.";
  }
}

export async function refreshCustomerTrustScore(db: SQLiteDatabase, customerId: number): Promise<TrustScoreResult> {
  const profile = await getCustomerRiskProfile(db, customerId);

  if (!isGeminiReady()) {
    const fallback = computeHeuristicTrustScore(profile);
    await updateCustomerTrustScore(db, customerId, fallback.trustScore);
    return fallback;
  }

  try {
    const result = await callGeminiJson<{ trustScore: TrustScore; reason: string }>({
      systemInstruction:
        "You evaluate credit behavior for a sari-sari store customer. Base the answer only on the numeric payment profile. Return one trust score and a short reason.",
      contents: [
        {
          parts: [
            {
              text: [
                "Evaluate this payment profile.",
                `Total paid: ${formatCurrencyFromCents(profile.totalPaidCents)}`,
                `Total unpaid: ${formatCurrencyFromCents(profile.totalUnpaidCents)}`,
                `Average days to pay: ${profile.avgDaysToPay}`,
                `Longest unpaid age in days: ${profile.maxDaysUnpaid}`,
                `Paid entries: ${profile.paidEntries}`,
                `Unpaid entries: ${profile.unpaidEntries}`,
                "Use one of these trust scores only: Bago, Maaasahan, Bantayan, Delikado.",
                "Return JSON only.",
              ].join("\n"),
            },
          ],
        },
      ],
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          trustScore: {
            type: "string",
            enum: ["Bago", "Maaasahan", "Bantayan", "Delikado"],
          },
          reason: {
            type: "string",
          },
        },
        required: ["trustScore", "reason"],
      },
      temperature: 0.2,
      validate: validateTrustScore,
    });

    await updateCustomerTrustScore(db, customerId, result.trustScore);
    return {
      trustScore: result.trustScore,
      reason: result.reason,
      source: "ai",
    };
  } catch {
    const fallback = computeHeuristicTrustScore(profile);
    await updateCustomerTrustScore(db, customerId, fallback.trustScore);
    return fallback;
  }
}

export async function refreshAllCustomerTrustScores(db: SQLiteDatabase) {
  const customers = await listCustomersWithBalances(db);

  for (const customer of customers) {
    await refreshCustomerTrustScore(db, customer.id);
  }
}
