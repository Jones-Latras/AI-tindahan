import Constants from "expo-constants";
import Storage from "expo-sqlite/kv-store";
import type { SQLiteDatabase } from "expo-sqlite";

import {
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
import { formatCurrencyFromCents } from "@/utils/money";

const GEMINI_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;
const REQUEST_TIMEOUT_MS = 18_000;
const HOME_AI_BRIEF_KEY_PREFIX = "ai.home-brief";

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

function getGeminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getGeminiApiKey() {
  const fromEnv = process.env.EXPO_PUBLIC_GEMINI_KEY?.trim();

  if (fromEnv) {
    return fromEnv;
  }

  const fromExpoConfig = typeof Constants.expoConfig?.extra?.geminiKey === "string"
    ? Constants.expoConfig.extra.geminiKey.trim()
    : "";

  if (fromExpoConfig) {
    return fromExpoConfig;
  }

  const manifestExtra = (Constants as { manifest?: { extra?: Record<string, unknown> } }).manifest?.extra;
  const fromManifest = typeof manifestExtra?.geminiKey === "string" ? manifestExtra.geminiKey.trim() : "";

  if (fromManifest) {
    return fromManifest;
  }

  const manifest2Extra = (Constants as {
    manifest2?: { extra?: { expoClient?: { extra?: Record<string, unknown> } } };
  }).manifest2?.extra?.expoClient?.extra;

  return typeof manifest2Extra?.geminiKey === "string" ? manifest2Extra.geminiKey.trim() : "";
}

function getGeminiErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
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
  const geminiApiKey = getGeminiApiKey();

  if (!geminiApiKey) {
    throw new Error("Gemini API key is not configured. Add EXPO_PUBLIC_GEMINI_KEY to your local .env file.");
  }

  return geminiApiKey;
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
  const geminiApiKey = ensureGeminiConfigured();
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

  return callGeminiWithFallback(geminiApiKey, body, (payload) => extractGeminiText(payload));
}

async function callGeminiJson<T>(options: GeminiJsonOptions<T>) {
  const geminiApiKey = ensureGeminiConfigured();
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

  return callGeminiWithFallback(geminiApiKey, body, (payload) => {
    const text = extractGeminiText(payload);
    return options.validate(JSON.parse(text));
  });
}

async function callGeminiWithFallback<T>(
  geminiApiKey: string,
  body: GeminiRequestBody,
  parsePayload: (payload: any) => T,
) {
  const failures: string[] = [];

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(getGeminiUrl(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const failureText = await response.text();
        throw new Error(`Gemini request failed for ${model} (${response.status}): ${failureText || "Unknown error"}`);
      }

      const payload = await response.json();
      return parsePayload(payload);
    } catch (error) {
      const message = getGeminiErrorMessage(error) || `Unknown error for ${model}.`;
      failures.push(message);

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
    insight: record.insight.trim(),
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

function buildStoreAiPromptContext(context: StoreAiContext) {
  return JSON.stringify(
    {
      storeProfile: {
        storeName: context.storeName,
      },
      dashboard: {
        todaySalesCents: context.todaySalesCents,
        todayTransactions: context.todayTransactions,
        todayProfitCents: context.todayProfitCents,
        totalUtangCents: context.totalUtangCents,
        paymentBreakdown: context.paymentBreakdown,
        lowStockProducts: context.lowStockProducts,
        delikadoCustomers: context.delikadoCustomers,
        dailySales: context.dailySales,
        weeklyReports: context.weeklyReports,
        topProducts: context.topProducts,
        productVelocity: context.productVelocity,
      },
      catalog: context.products,
      customers: context.customers,
      sales: context.sales,
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

function buildFallbackHomeAiBrief(
  language: AppLanguage,
  restockSuggestions: string[] = [],
  error?: unknown,
): HomeAiBrief {
  const failure = error ? parseGeminiFailure(error) : null;
  let insight: string;

  if (failure?.kind === "quota") {
    const retryHint = formatRetryHint(language, failure.retryAfterSeconds);
    insight =
      language === "english"
        ? `Aling AI hit the current Gemini request limit. Core POS features still work, and the AI brief should recover ${retryHint}.`
        : `Naabot ni Aling AI ang current Gemini request limit. Gumagana pa rin ang core POS features, at babalik ang AI brief ${retryHint}.`;
  } else if (failure?.kind === "network") {
    insight =
      language === "english"
        ? "Aling AI can't reach Gemini right now. Core POS features still work, and the daily brief will return once the connection is back."
        : "Hindi makakonekta si Aling AI sa Gemini ngayon. Gumagana pa rin ang core POS features, at babalik ang daily brief pag maayos na ang connection.";
  } else if (failure?.kind === "config") {
    insight =
      language === "english"
        ? "Gemini is not configured in this app build yet. Core POS features still work, and you can restart Expo after updating the Gemini key."
        : "Hindi pa configured ang Gemini sa app build na ito. Gumagana pa rin ang core POS features, at puwede mong i-restart ang Expo pagkatapos i-update ang Gemini key.";
  } else {
    insight =
      language === "english"
        ? "Aling AI is unavailable right now. Core POS features still work, and you can try again shortly."
        : "Unavailable si Aling AI ngayon. Gumagana pa rin ang core POS features, at puwede kang sumubok ulit mamaya.";
  }

  return {
    insight,
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
  return Boolean(getGeminiApiKey());
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

  const [salesContext, velocity, homeMetrics] = await Promise.all([
    getSalesInsightContext(db),
    getProductSalesVelocity(db),
    getHomeMetrics(db),
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

  if (!geminiReady) {
    const fallback = buildFallbackHomeAiBrief(language, heuristicRestockSuggestions);
    await Storage.setItem(cacheKey, JSON.stringify(fallback));
    return fallback;
  }

  try {
    const brief = await callGeminiJson<HomeAiBrief>({
      systemInstruction:
        [
          "You are Aling AI, a practical business assistant for a sari-sari store in the Philippines.",
          getReplyLanguageInstruction(language),
          "If products are low stock, out of stock, or at risk of running out soon, include concrete restock suggestions.",
          "Stay concise and never invent store data that was not provided.",
        ].join(" "),
      contents: [
        {
          parts: [
            {
              text: [
                "Create a daily store brief.",
                `7-day total sales: ${formatCurrencyFromCents(salesContext.totalSalesCents)}`,
                `7-day transaction count: ${salesContext.totalTransactions}`,
                `Top products this week: ${salesContext.topProducts.map((product) => product.name).join(", ") || "None yet"}`,
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
                        .map((item) => `${item.name}: ${item.stock} stock, ${item.minStock} minimum`)
                        .join("; ")
                    : "None"
                }`,
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
                ? "A friendly English insight in 2 or 3 short sentences."
                : "A friendly Taglish insight in 2 or 3 short sentences.",
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
      restockSuggestions:
        brief.restockSuggestions.length > 0 ? brief.restockSuggestions : heuristicRestockSuggestions,
    };

    await Storage.setItem(cacheKey, JSON.stringify(finalizedBrief));
    return finalizedBrief;
  } catch (error) {
    console.warn("Gemini home brief failed:", getGeminiErrorMessage(error));
    const fallback = buildFallbackHomeAiBrief(language, heuristicRestockSuggestions, error);
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
      ? "Gemini is not connected yet. Add EXPO_PUBLIC_GEMINI_KEY to your local .env to unlock Aling AI."
      : "Hindi pa naka-connect ang Gemini key. Add EXPO_PUBLIC_GEMINI_KEY sa local .env mo para ma-unlock si Aling AI.";
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
        "You are Aling AI, the smart assistant inside TindaHan AI.",
        getReplyLanguageInstruction(language),
        "Be encouraging, brief, and specific to the store data provided.",
        "The store data provided is authoritative. Use it as your source of truth for products, stock, sales, utang, customers, pricing, and payment mix.",
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
      ? "Aling AI is unavailable right now, but POS and credit features still work."
      : "Unavailable si Aling AI ngayon, pero gumagana pa rin ang POS at palista features.";
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
