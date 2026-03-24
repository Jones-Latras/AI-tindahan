import Storage from "expo-sqlite/kv-store";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  getCustomerRiskProfile,
  getProductSalesVelocity,
  getSalesInsightContext,
  getStoreAiContext,
  listCustomersWithBalances,
  updateCustomerTrustScore,
} from "@/db/repositories";
import type {
  ChatMessage,
  CustomerRiskProfile,
  HomeAiBrief,
  PaymentBreakdown,
  TrustScore,
} from "@/types/models";
import { formatCurrencyFromCents } from "@/utils/money";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY?.trim();
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

function getTodayCacheKey() {
  const day = new Intl.DateTimeFormat("en-CA").format(new Date());
  return `${HOME_AI_BRIEF_KEY_PREFIX}.${day}`;
}

function ensureGeminiConfigured() {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is not configured. Add EXPO_PUBLIC_GEMINI_KEY to your local .env file.");
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY!,
      },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${failureText || "Unknown error"}`);
    }

    const payload = await response.json();
    return extractGeminiText(payload);
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiJson<T>(options: GeminiJsonOptions<T>) {
  ensureGeminiConfigured();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY!,
      },
      body: JSON.stringify({
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
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const failureText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${failureText || "Unknown error"}`);
    }

    const payload = await response.json();
    const text = extractGeminiText(payload);
    return options.validate(JSON.parse(text));
  } finally {
    clearTimeout(timeout);
  }
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

function summarizePaymentBreakdown(paymentBreakdown: PaymentBreakdown) {
  return [
    `Cash ${formatCurrencyFromCents(paymentBreakdown.cashCents)}`,
    `GCash ${formatCurrencyFromCents(paymentBreakdown.gcashCents)}`,
    `Maya ${formatCurrencyFromCents(paymentBreakdown.mayaCents)}`,
    `Utang ${formatCurrencyFromCents(paymentBreakdown.utangCents)}`,
  ].join(", ");
}

function buildFallbackHomeAiBrief(): HomeAiBrief {
  return {
    insight:
      "Aling AI is offline right now. Core POS features still work, and you can add your Gemini key later to unlock daily insights.",
    restockSuggestions: [],
    generatedOn: new Date().toISOString(),
    source: "fallback",
  };
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
  return Boolean(GEMINI_API_KEY);
}

export async function getOrCreateHomeAiBrief(db: SQLiteDatabase) {
  const cacheKey = getTodayCacheKey();
  const cached = await Storage.getItem(cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as HomeAiBrief;
      if (parsed?.insight && Array.isArray(parsed?.restockSuggestions)) {
        return parsed;
      }
    } catch {
      // Ignore malformed cache and regenerate below.
    }
  }

  if (!isGeminiReady()) {
    return buildFallbackHomeAiBrief();
  }

  try {
    const salesContext = await getSalesInsightContext(db);
    const velocity = await getProductSalesVelocity(db);
    const atRiskProducts = velocity
      .filter((item) => item.currentStock > 0 && item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 3)
      .slice(0, 5);

    const brief = await callGeminiJson<HomeAiBrief>({
      systemInstruction:
        "You are Aling AI, a practical business assistant for a sari-sari store in the Philippines. Reply in warm Taglish, stay concise, and never invent store data that was not provided.",
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
            description: "A friendly Taglish insight in 2 or 3 short sentences.",
          },
          restockSuggestions: {
            type: "array",
            description: "Up to 5 Taglish restock suggestions. Each item should be actionable.",
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

    await Storage.setItem(cacheKey, JSON.stringify(brief));
    return brief;
  } catch {
    return buildFallbackHomeAiBrief();
  }
}

export async function chatWithAlingAi(db: SQLiteDatabase, history: ChatMessage[], userMessage: string) {
  if (!isGeminiReady()) {
    return "Hindi pa naka-connect ang Gemini key. Add EXPO_PUBLIC_GEMINI_KEY in your local .env to unlock Aling AI.";
  }

  const context = await getStoreAiContext(db);
  const trimmedHistory = history.slice(-8);

  try {
    return await callGeminiText({
      systemInstruction: [
        "You are Aling AI, the smart assistant inside TindaHan AI.",
        "Reply in practical Taglish.",
        "Be encouraging, brief, and specific to the store data provided.",
        "Never mention phone numbers. Only use the names and summaries provided.",
      ].join(" "),
      contents: [
        {
          parts: [
            {
              text: [
                "Store context:",
                `Today's sales: ${formatCurrencyFromCents(context.todaySalesCents)}`,
                `Outstanding utang: ${formatCurrencyFromCents(context.totalUtangCents)}`,
                `Low stock products: ${context.lowStockProducts.join(", ") || "None"}`,
                `Top products: ${context.topProducts.join(", ") || "None"}`,
                `Delikado customers: ${context.delikadoCustomers.join(", ") || "None"}`,
                `Payment mix today: ${summarizePaymentBreakdown(context.paymentBreakdown)}`,
                `Customer balances: ${
                  context.customerBalances.length > 0
                    ? context.customerBalances
                        .map((customer) => `${customer.name} ${formatCurrencyFromCents(customer.balanceCents)} (${customer.trustScore})`)
                        .join(", ")
                    : "None"
                }`,
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
  } catch {
    return "Hindi ako makakonekta ngayon. Gumagana pa rin ang POS at palista features habang offline.";
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
