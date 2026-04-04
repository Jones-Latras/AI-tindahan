import { Feather } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, InteractionManager, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { ActionButton } from "@/components/ActionButton";
import { ChatRichText } from "@/components/ChatRichText";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { ReceiptView } from "@/components/ReceiptView";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import type { TranslationKey } from "@/constants/translations";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  createRestockListFromThresholds,
  getHomeMetrics,
  getProductSalesVelocity,
  getReportsSnapshot,
  getStoreName,
  getWeeklyPaymentBreakdown,
  listSalesHistory,
  saveStoreName,
} from "@/db/repositories";
import { chatWithAlingAi, getOrCreateHomeAiBrief, isGeminiReady } from "@/services/ai";
import type {
  AnalyticsTimeframe,
  ChatMessage,
  HomeAiBrief,
  HomeMetrics,
  ProductVelocity,
  ReportsSnapshot,
  StoreAiSale,
  WeeklyPaymentReport,
} from "@/types/models";
import { formatCurrencyFromCents } from "@/utils/money";
import { formatWeightKg } from "@/utils/pricing";

function createChatMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

type HomePanel = "analytics" | "inventory" | "credit" | "history" | "calculator";
type HistorySort = "latest" | "oldest" | "highest-total" | "lowest-total" | "most-quantity" | "least-quantity";
type HistorySaleMatch = {
  sale: StoreAiSale;
  matchedItems: StoreAiSale["items"];
  totalQuantity: number;
};
type CalculatorOperator = "+" | "-" | "*" | "/";
type CalculatorButton = {
  label: string;
  type: "action" | "digit" | "equals" | "operator";
  value: string;
};

const STORE_NAME_KEY = "tindahan.store-name";
const HOME_REFRESH_DEBOUNCE_MS = 12_000;
const REPORTS_TIMEFRAMES: AnalyticsTimeframe[] = ["today", "week", "month"];
const CALCULATOR_BUTTON_ROWS: CalculatorButton[][] = [
  [
    { label: "AC", type: "action", value: "clear" },
    { label: "DEL", type: "action", value: "backspace" },
    { label: "/", type: "operator", value: "/" },
    { label: "x", type: "operator", value: "*" },
  ],
  [
    { label: "7", type: "digit", value: "7" },
    { label: "8", type: "digit", value: "8" },
    { label: "9", type: "digit", value: "9" },
    { label: "-", type: "operator", value: "-" },
  ],
  [
    { label: "4", type: "digit", value: "4" },
    { label: "5", type: "digit", value: "5" },
    { label: "6", type: "digit", value: "6" },
    { label: "+", type: "operator", value: "+" },
  ],
  [
    { label: "1", type: "digit", value: "1" },
    { label: "2", type: "digit", value: "2" },
    { label: "3", type: "digit", value: "3" },
    { label: "=", type: "equals", value: "=" },
  ],
  [
    { label: "0", type: "digit", value: "0" },
    { label: "00", type: "digit", value: "00" },
    { label: ".", type: "digit", value: "." },
    { label: "=", type: "equals", value: "=" },
  ],
];
const EXPENSE_CATEGORY_TRANSLATION_KEYS: Partial<Record<string, TranslationKey>> = {
  electricity: "gastos.category.electricity",
  ice: "gastos.category.ice",
  other: "gastos.category.other",
  pamasahe: "gastos.category.pamasahe",
  plastic_bags: "gastos.category.plastic_bags",
  rent: "gastos.category.rent",
  restock_transport: "gastos.category.restock_transport",
  supplies: "gastos.category.supplies",
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function isCalculatorOperator(value: string): value is CalculatorOperator {
  return value === "+" || value === "-" || value === "*" || value === "/";
}

function getCalculatorOperatorPrecedence(operator: CalculatorOperator) {
  return operator === "+" || operator === "-" ? 1 : 2;
}

function applyCalculatorOperation(left: number, right: number, operator: CalculatorOperator) {
  if (operator === "+") {
    return left + right;
  }

  if (operator === "-") {
    return left - right;
  }

  if (operator === "*") {
    return left * right;
  }

  if (right === 0) {
    throw new Error("Division by zero");
  }

  return left / right;
}

function roundCalculatorNumber(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000_000) / 1_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function getLastCalculatorNumberSegment(expression: string) {
  const match = expression.match(/-?\d*\.?\d*$/);
  return match?.[0] ?? "";
}

function stringifyCalculatorNumber(value: number) {
  return roundCalculatorNumber(value).toString();
}

function formatCalculatorNumber(value: number, language: "english" | "taglish") {
  return new Intl.NumberFormat(language === "english" ? "en-PH" : "fil-PH", {
    maximumFractionDigits: 9,
  }).format(roundCalculatorNumber(value));
}

function evaluateCalculatorExpression(expression: string) {
  const compactExpression = expression.replace(/\s+/g, "");

  if (!compactExpression) {
    return 0;
  }

  const values: number[] = [];
  const operators: CalculatorOperator[] = [];
  let index = 0;

  const resolveTopOperation = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();

    if (!operator || right === undefined || left === undefined) {
      throw new Error("Incomplete expression");
    }

    values.push(roundCalculatorNumber(applyCalculatorOperation(left, right, operator)));
  };

  while (index < compactExpression.length) {
    const currentCharacter = compactExpression[index];
    const previousCharacter = index > 0 ? compactExpression[index - 1] : "";
    const isUnaryMinus = currentCharacter === "-" && (index === 0 || isCalculatorOperator(previousCharacter));

    if (/\d/.test(currentCharacter) || currentCharacter === "." || isUnaryMinus) {
      let endIndex = index + 1;

      while (endIndex < compactExpression.length && /[\d.]/.test(compactExpression[endIndex] ?? "")) {
        endIndex += 1;
      }

      const token = compactExpression.slice(index, endIndex);

      if (token === "-" || token === "." || token === "-." || (token.match(/\./g) ?? []).length > 1) {
        throw new Error("Invalid number");
      }

      const parsedValue = Number.parseFloat(token);

      if (!Number.isFinite(parsedValue)) {
        throw new Error("Invalid number");
      }

      values.push(parsedValue);
      index = endIndex;
      continue;
    }

    if (!isCalculatorOperator(currentCharacter)) {
      throw new Error("Unsupported input");
    }

    while (
      operators.length > 0 &&
      getCalculatorOperatorPrecedence(operators[operators.length - 1]!) >= getCalculatorOperatorPrecedence(currentCharacter)
    ) {
      resolveTopOperation();
    }

    operators.push(currentCharacter);
    index += 1;
  }

  while (operators.length > 0) {
    resolveTopOperation();
  }

  if (values.length !== 1) {
    throw new Error("Incomplete expression");
  }

  return roundCalculatorNumber(values[0]!);
}

function formatExpenseCategoryLabel(
  category: string,
  t: (key: TranslationKey, params?: Record<string, number | string>) => string,
) {
  const translationKey = EXPENSE_CATEGORY_TRANSLATION_KEYS[category];

  if (translationKey) {
    return t(translationKey);
  }

  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSaleItemQuantity(sale: StoreAiSale) {
  return sale.items.reduce((sum, item) => sum + item.quantity, 0);
}

function compareSalesByNewest(left: StoreAiSale, right: StoreAiSale) {
  const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return right.id - left.id;
}

function sortHistoryMatches(left: HistorySaleMatch, right: HistorySaleMatch, sort: HistorySort) {
  if (sort === "oldest") {
    const timeDifference = Date.parse(left.sale.createdAt) - Date.parse(right.sale.createdAt);
    return timeDifference !== 0 ? timeDifference : left.sale.id - right.sale.id;
  }

  if (sort === "highest-total") {
    const totalDifference = right.sale.totalCents - left.sale.totalCents;
    return totalDifference !== 0 ? totalDifference : compareSalesByNewest(left.sale, right.sale);
  }

  if (sort === "lowest-total") {
    const totalDifference = left.sale.totalCents - right.sale.totalCents;
    return totalDifference !== 0 ? totalDifference : compareSalesByNewest(left.sale, right.sale);
  }

  if (sort === "most-quantity") {
    const quantityDifference = right.totalQuantity - left.totalQuantity;
    return quantityDifference !== 0 ? quantityDifference : compareSalesByNewest(left.sale, right.sale);
  }

  if (sort === "least-quantity") {
    const quantityDifference = left.totalQuantity - right.totalQuantity;
    return quantityDifference !== 0 ? quantityDifference : compareSalesByNewest(left.sale, right.sale);
  }

  return compareSalesByNewest(left.sale, right.sale);
}

function createReceiptFileName(storeName: string, saleId: number) {
  const normalizedStoreName = (storeName || "TindaHan AI")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${normalizedStoreName || "tindahan-ai"}-receipt-${saleId}.png`;
}

type HomeShortcutCardProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
};

function HomeShortcutCard({ icon, label, onPress }: HomeShortcutCardProps) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexBasis: "23%",
        gap: theme.spacing.sm,
        maxWidth: "23.5%",
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.94 : 1 }],
        paddingVertical: theme.spacing.xs,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderStrong,
          borderWidth: 1,
          borderRadius: theme.radius.pill,
          height: 52,
          justifyContent: "center",
          width: 52,
        }}
      >
        <Feather color={theme.colors.primary} name={icon} size={24} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 12,
          fontWeight: "600",
          lineHeight: 16,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getMillisecondsUntilNextMidnight(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);

  return Math.max(1000, nextMidnight.getTime() - now.getTime());
}

function getPaymentMethodLabel(paymentMethod: StoreAiSale["paymentMethod"]) {
  if (paymentMethod === "gcash") {
    return "GCash";
  }

  if (paymentMethod === "maya") {
    return "Maya";
  }

  if (paymentMethod === "utang") {
    return "Utang";
  }

  return "Cash";
}

function getPaymentMethodTone(paymentMethod: StoreAiSale["paymentMethod"]) {
  if (paymentMethod === "cash") {
    return "success" as const;
  }

  if (paymentMethod === "utang") {
    return "warning" as const;
  }

  return "primary" as const;
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { language, t } = useAppLanguage();
  const router = useRouter();
  const geminiReady = isGeminiReady();
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null);
  const [reportsSnapshots, setReportsSnapshots] = useState<Record<AnalyticsTimeframe, ReportsSnapshot> | null>(null);
  const [reportsTimeframe, setReportsTimeframe] = useState<AnalyticsTimeframe>("today");
  const [brief, setBrief] = useState<HomeAiBrief | null>(null);
  const [velocity, setVelocity] = useState<ProductVelocity[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyPaymentReport[]>([]);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [activePanel, setActivePanel] = useState<HomePanel | null>(null);
  const [creatingRestockList, setCreatingRestockList] = useState(false);
  const [salesHistory, setSalesHistory] = useState<StoreAiSale[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historySort, setHistorySort] = useState<HistorySort>("latest");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [calculatorExpression, setCalculatorExpression] = useState("0");
  const [receiptSale, setReceiptSale] = useState<StoreAiSale | null>(null);
  const [receiptAction, setReceiptAction] = useState<"share" | "download" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createChatMessage("assistant", t("home.aiWelcome"))]);
  const [briefDate, setBriefDate] = useState(() => new Date());
  const receiptCaptureRef = useRef<View>(null);
  const hasLoadedOverviewRef = useRef(false);
  const hasLoadedBriefRef = useRef(false);
  const lastHomeRefreshAtRef = useRef(0);
  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;
  const briefDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(language === "english" ? "en-PH" : "fil-PH", {
        day: "numeric",
        month: "short",
        weekday: "long",
      })
        .format(briefDate)
        .toUpperCase(),
    [briefDate, language],
  );
  const shortcutItems = useMemo(() => {
    const items: Array<{
      icon: keyof typeof Feather.glyphMap;
      key: HomePanel;
      subtitle: string;
      title: string;
    }> = [
        {
          icon: "bar-chart-2",
          key: "analytics",
          subtitle: t("home.shortcuts.analytics.subtitle"),
          title: t("home.shortcuts.analytics.title"),
        },
        {
          icon: "package",
          key: "inventory",
          subtitle: t("home.shortcuts.inventory.subtitle"),
          title: t("home.shortcuts.inventory.title"),
        },
        {
          icon: "users",
          key: "credit",
          subtitle: t("home.shortcuts.credit.subtitle"),
          title: t("home.shortcuts.credit.title"),
        },
        {
          icon: "file-text",
          key: "history",
          subtitle: t("home.shortcuts.history.subtitle"),
          title: t("home.shortcuts.history.title"),
        },
        {
          icon: "plus-square",
          key: "calculator",
          subtitle: t("home.shortcuts.calculator.subtitle"),
          title: t("home.shortcuts.calculator.title"),
        },
      ];

    return items;
  }, [t]);
  const activeShortcut = shortcutItems.find((item) => item.key === activePanel) ?? null;

  useEffect(() => {
    const timer = setInterval(() => {
      setBriefDate(new Date());
    }, 60_000);

    return () => clearInterval(timer);
  }, []);
  const historySortOptions = useMemo(
    () => [
      { key: "latest" as const, label: t("home.history.sort.latest") },
      { key: "oldest" as const, label: t("home.history.sort.oldest") },
      { key: "highest-total" as const, label: t("home.history.sort.highestTotal") },
      { key: "lowest-total" as const, label: t("home.history.sort.lowestTotal") },
      { key: "most-quantity" as const, label: t("home.history.sort.mostQuantity") },
      { key: "least-quantity" as const, label: t("home.history.sort.leastQuantity") },
    ],
    [t],
  );
  const normalizedHistorySearch = useMemo(() => normalizeSearchValue(historySearch), [historySearch]);
  const filteredSalesHistory = useMemo(() => {
    const nextHistory = salesHistory
      .map((sale) => {
        const matchedItems =
          normalizedHistorySearch.length > 0
            ? sale.items.filter((item) => normalizeSearchValue(item.productName).includes(normalizedHistorySearch))
            : [];

        return {
          sale,
          matchedItems,
          totalQuantity: getSaleItemQuantity(sale),
        };
      })
      .filter(({ sale, matchedItems }) => {
        if (normalizedHistorySearch.length === 0) {
          return true;
        }

        return (
          sale.id.toString().includes(normalizedHistorySearch) ||
          normalizeSearchValue(sale.customerName ?? "").includes(normalizedHistorySearch) ||
          matchedItems.length > 0
        );
      });

    nextHistory.sort((left, right) => sortHistoryMatches(left, right, historySort));

    return nextHistory;
  }, [historySort, normalizedHistorySearch, salesHistory]);
  const calculatorPreview = useMemo(() => {
    try {
      return evaluateCalculatorExpression(calculatorExpression);
    } catch {
      return null;
    }
  }, [calculatorExpression]);
  const calculatorExpressionLabel = useMemo(
    () => calculatorExpression.replace(/\*/g, "x"),
    [calculatorExpression],
  );
  const calculatorResultLabel = useMemo(
    () =>
      calculatorPreview === null
        ? t("home.calculator.invalid")
        : formatCalculatorNumber(calculatorPreview, language),
    [calculatorPreview, language, t],
  );

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant"
        ? [createChatMessage("assistant", t("home.aiWelcome"))]
        : current,
    );
  }, [t]);

  const loadHomeOverview = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const [nextMetrics, nextVelocity, nextWeekly, todayReports, weekReports, monthReports] = await Promise.all([
        getHomeMetrics(db),
        getProductSalesVelocity(db),
        getWeeklyPaymentBreakdown(db),
        getReportsSnapshot(db, "today"),
        getReportsSnapshot(db, "week"),
        getReportsSnapshot(db, "month"),
      ]);
      setMetrics(nextMetrics);
      setReportsSnapshots({
        month: monthReports,
        today: todayReports,
        week: weekReports,
      });
      setVelocity(nextVelocity.filter((item) => item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 7).slice(0, 5));
      setWeeklyReports(nextWeekly);
      hasLoadedOverviewRef.current = true;
      lastHomeRefreshAtRef.current = Date.now();
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [db]);

  const loadHomeBrief = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setAiLoading(true);
    }

    try {
      const nextBrief = await getOrCreateHomeAiBrief(db, language);
      setBrief(nextBrief);
      hasLoadedBriefRef.current = true;
    } finally {
      setAiLoading(false);
    }
  }, [db, language]);

  useFocusEffect(
    useCallback(() => {
      let midnightRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
      let cancelled = false;
      let interactionTask: { cancel?: () => void } | null = null;

      const scheduleMidnightRefresh = () => {
        midnightRefreshTimeout = setTimeout(() => {
          void loadHomeOverview({ silent: true });
          void loadHomeBrief({ silent: true });
          scheduleMidnightRefresh();
        }, getMillisecondsUntilNextMidnight());
      };

      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) {
          return;
        }

        const justRefreshed = Date.now() - lastHomeRefreshAtRef.current < HOME_REFRESH_DEBOUNCE_MS;
        const shouldRefreshOverview = !hasLoadedOverviewRef.current || !justRefreshed;
        const shouldRefreshBrief = !hasLoadedBriefRef.current || !justRefreshed;

        if (shouldRefreshOverview) {
          void loadHomeOverview({ silent: hasLoadedOverviewRef.current });
        }

        if (shouldRefreshBrief) {
          void loadHomeBrief({ silent: hasLoadedBriefRef.current });
        }
      });

      void (async () => {
        const [dbStoreName, legacyStoreName] = await Promise.all([
          getStoreName(db),
          Storage.getItem(STORE_NAME_KEY),
        ]);
        const normalizedLegacyStoreName = legacyStoreName?.trim() ?? "";
        const nextStoreName = dbStoreName ?? normalizedLegacyStoreName;

        if (!dbStoreName && normalizedLegacyStoreName.length >= 2) {
          await saveStoreName(db, normalizedLegacyStoreName);
        }

        setStoreName(nextStoreName);
      })();
      scheduleMidnightRefresh();

      return () => {
        cancelled = true;
        interactionTask?.cancel?.();
        if (midnightRefreshTimeout) {
          clearTimeout(midnightRefreshTimeout);
        }
      };
    }, [db, loadHomeBrief, loadHomeOverview]),
  );

  const handleSendChat = useCallback(async () => {
    const userText = chatInput.trim();

    if (!userText || sendingChat) {
      return;
    }

    const userMessage = createChatMessage("user", userText);
    setMessages((current) => [...current, userMessage]);
    setChatInput("");
    setSendingChat(true);

    try {
      const reply = await chatWithAlingAi(db, messages, userText, language);
      setMessages((current) => [...current, createChatMessage("assistant", reply)]);
    } finally {
      setSendingChat(false);
    }
  }, [chatInput, db, language, messages, sendingChat]);

  const loadSalesHistory = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const nextHistory = await listSalesHistory(db);
      setSalesHistory(nextHistory);
    } finally {
      setHistoryLoading(false);
    }
  }, [db]);

  const handleCalculatorInput = useCallback((value: string) => {
    setCalculatorExpression((current) => {
      if (value === "clear") {
        return "0";
      }

      if (value === "backspace") {
        if (current.length <= 1) {
          return "0";
        }

        const nextExpression = current.slice(0, -1);
        return nextExpression === "" ? "0" : nextExpression;
      }

      if (value === "=") {
        try {
          return stringifyCalculatorNumber(evaluateCalculatorExpression(current));
        } catch {
          return current;
        }
      }

      const lastCharacter = current.slice(-1);

      if (value === ".") {
        const currentSegment = getLastCalculatorNumberSegment(current);

        if (currentSegment.includes(".")) {
          return current;
        }

        if (current === "0" || current === "") {
          return "0.";
        }

        if (current === "-") {
          return "-0.";
        }

        if (isCalculatorOperator(lastCharacter)) {
          return `${current}0.`;
        }

        return `${current}.`;
      }

      if (isCalculatorOperator(value)) {
        if (current === "0" && value !== "-") {
          return current;
        }

        if (current === "-" && value !== "-") {
          return current;
        }

        if (current.endsWith(".")) {
          return `${current}0${value}`;
        }

        if (isCalculatorOperator(lastCharacter)) {
          return `${current.slice(0, -1)}${value}`;
        }

        return `${current}${value}`;
      }

      if (current === "0") {
        return value === "00" ? current : value;
      }

      if (current === "-0") {
        return value === "00" ? current : `-${value}`;
      }

      return `${current}${value}`;
    });
  }, []);

  const handleOpenRestockLists = useCallback(() => {
    setActivePanel(null);
    router.push("../restock");
  }, [router]);

  const handleGenerateRestockList = useCallback(async () => {
    setCreatingRestockList(true);

    try {
      await createRestockListFromThresholds(db);
      setActivePanel(null);
      router.push("../restock");
    } catch (error) {
      Alert.alert(
        t("restock.alert.generateFailedTitle"),
        error instanceof Error ? error.message : t("restock.alert.generateFailedMessage"),
      );
    } finally {
      setCreatingRestockList(false);
    }
  }, [db, router, t]);

  useEffect(() => {
    if (activePanel === "history") {
      void loadSalesHistory();
    }
  }, [activePanel, loadSalesHistory]);

  const captureReceiptImage = useCallback(async () => {
    if (!receiptSale || !receiptCaptureRef.current) {
      throw new Error(t("home.history.receiptUnavailable"));
    }

    await new Promise((resolve) => setTimeout(resolve, 180));

    return captureRef(receiptCaptureRef.current, {
      format: "png",
      quality: 1,
      result: Platform.OS === "web" ? "data-uri" : "tmpfile",
    });
  }, [receiptSale, t]);

  const downloadReceiptOnWeb = useCallback((uri: string, fileName: string) => {
    if (!("document" in globalThis) || !globalThis.document?.body) {
      throw new Error(t("home.history.downloadUnavailable"));
    }

    const link = globalThis.document.createElement("a");
    link.href = uri;
    link.download = fileName;
    globalThis.document.body.appendChild(link);
    link.click();
    globalThis.document.body.removeChild(link);
  }, [t]);

  const shareReceiptImage = useCallback(
    async (receiptImageUri: string) => {
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        throw new Error(t("home.history.shareUnavailable"));
      }

      await Sharing.shareAsync(receiptImageUri, {
        dialogTitle: `${storeName || "TindaHan AI"} Receipt`,
        mimeType: "image/png",
        UTI: "public.png",
      });
    },
    [storeName, t],
  );

  const handleExportReceipt = useCallback(
    async (mode: "share" | "download") => {
      if (!receiptSale) {
        Alert.alert(
          t("home.history.receiptUnavailableTitle"),
          t("home.history.receiptUnavailable"),
        );
        return;
      }

      setReceiptAction(mode);

      try {
        const receiptImageUri = await captureReceiptImage();
        const fileName = createReceiptFileName(storeName, receiptSale.id);

        if (mode === "download") {
          if (Platform.OS === "web") {
            downloadReceiptOnWeb(receiptImageUri, fileName);
            return;
          }

          if (
            Platform.OS === "android" &&
            Constants.executionEnvironment === ExecutionEnvironment.StoreClient
          ) {
            throw new Error(t("home.history.downloadExpoGoUnsupported"));
          }

          const nextPermission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);

          if (!nextPermission.granted) {
            throw new Error(t("home.history.downloadPermissionDenied"));
          }

          await MediaLibrary.saveToLibraryAsync(receiptImageUri);
          Alert.alert(t("home.history.downloadSavedTitle"), t("home.history.downloadSavedMessage"));
          return;
        }

        await shareReceiptImage(receiptImageUri);
      } catch (error) {
        Alert.alert(
          mode === "share" ? t("home.history.shareFailedTitle") : t("home.history.downloadFailedTitle"),
          error instanceof Error
            ? error.message
            : mode === "share"
              ? t("home.history.shareFailedMessage")
              : t("home.history.downloadFailedMessage"),
        );
      } finally {
        setReceiptAction(null);
      }
    },
    [captureReceiptImage, downloadReceiptOnWeb, receiptSale, shareReceiptImage, storeName, t],
  );

  const renderAnalyticsPanel = () => {
    if (!metrics || !reportsSnapshots) {
      return null;
    }

    const report = reportsSnapshots[reportsTimeframe];
    const timeframeLabel =
      reportsTimeframe === "today"
        ? t("gastos.summary.today")
        : reportsTimeframe === "week"
          ? t("gastos.summary.week")
          : t("gastos.summary.month");
    const paymentMixEntries = [
      { amountCents: report.paymentBreakdown.cashCents, color: theme.colors.success, label: "Cash" },
      { amountCents: report.paymentBreakdown.gcashCents, color: theme.colors.primary, label: "GCash" },
      { amountCents: report.paymentBreakdown.mayaCents, color: theme.colors.accent, label: "Maya" },
      { amountCents: report.paymentBreakdown.utangCents, color: theme.colors.warning, label: "Utang" },
    ];
    const paymentMixTotal = Math.max(paymentMixEntries.reduce((total, entry) => total + entry.amountCents, 0), 1);
    const performanceEntries = [
      { label: t("home.analytics.grossProfit"), value: formatCurrencyFromCents(report.grossProfitCents) },
      { label: t("home.analytics.transactions"), value: String(report.transactionCount) },
      { label: t("home.analytics.expenses"), value: formatCurrencyFromCents(report.expenseCents) },
      { label: t("home.analytics.paymentsLogged"), value: String(report.paymentEvents) },
    ];
    const expenseEntries = report.expenseBreakdown.slice(0, 3);

    return (
      <>
        <View
          style={{
            alignSelf: "stretch",
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            flexDirection: "row",
            padding: 4,
          }}
        >
          {REPORTS_TIMEFRAMES.map((timeframe) => {
            const isActive = timeframe === reportsTimeframe;
            const label =
              timeframe === "today"
                ? t("gastos.summary.today")
                : timeframe === "week"
                  ? t("gastos.summary.week")
                  : t("gastos.summary.month");

            return (
              <Pressable
                key={timeframe}
                onPress={() => setReportsTimeframe(timeframe)}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: isActive ? theme.colors.surface : "transparent",
                  borderRadius: theme.radius.pill,
                  flex: 1,
                  opacity: pressed ? 0.88 : 1,
                  paddingVertical: 10,
                })}
              >
                <Text
                  style={{
                    color: isActive ? theme.colors.text : theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {t("home.reports.bottomLine.title")}
          </Text>

          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                flex: 1,
                gap: 8,
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {t("home.analytics.netProfit")}
              </Text>
              <Text
                style={{
                  color: report.netProfitCents >= 0 ? theme.colors.text : theme.colors.danger,
                  fontFamily: theme.typography.display,
                  fontSize: 24,
                  fontWeight: "600",
                }}
              >
                {formatCurrencyFromCents(report.netProfitCents)}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {t("home.reports.netProfit.subtitle")}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                flex: 1,
                gap: 8,
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {t("home.reports.sales.label")}
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 24,
                  fontWeight: "600",
                }}
              >
                {formatCurrencyFromCents(report.salesCents)}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {t("home.reports.sales.subtitle")}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {t("home.reports.actions.title")}
          </Text>

          <Pressable
            onPress={() => setActivePanel("inventory")}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.warningMuted,
              borderRadius: theme.radius.sm,
              flexDirection: "row",
              gap: theme.spacing.md,
              opacity: pressed ? 0.92 : 1,
              padding: theme.spacing.md,
            })}
          >
            <View
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.pill,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <Feather color={theme.colors.warning} name="package" size={16} />
            </View>
            <Text
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {`${metrics.restockUrgencyCount} ${t("home.analytics.restockAlerts")}`}
            </Text>
            <Feather color={theme.colors.warning} name="chevron-right" size={18} />
          </Pressable>

          <Pressable
            onPress={() => setActivePanel("credit")}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.dangerMuted,
              borderRadius: theme.radius.sm,
              flexDirection: "row",
              gap: theme.spacing.md,
              opacity: pressed ? 0.92 : 1,
              padding: theme.spacing.md,
            })}
          >
            <View
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.pill,
                height: 34,
                justifyContent: "center",
                width: 34,
              }}
            >
              <Feather color={theme.colors.danger} name="alert-triangle" size={16} />
            </View>
            <Text
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {`${formatCurrencyFromCents(metrics.totalUtangCents)} ${t("home.reports.actions.unpaidUtang")}`}
            </Text>
            <Feather color={theme.colors.danger} name="chevron-right" size={18} />
          </Pressable>
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {t("home.reports.performance.title")}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {performanceEntries.map((entry) => (
              <View
                key={entry.label}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  flex: 1,
                  gap: 6,
                  minWidth: "47%",
                  padding: theme.spacing.md,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {entry.label}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: 22,
                    fontWeight: "600",
                  }}
                >
                  {entry.value}
                </Text>
              </View>
            ))}
          </View>
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {t("home.reports.paymentMix.title")}
          </Text>

          {paymentMixEntries.map((entry) => {
            const widthPercent =
              entry.amountCents > 0 ? Math.max((entry.amountCents / paymentMixTotal) * 100, 6) : 0;

            return (
              <View key={entry.label} style={{ gap: 6 }}>
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {entry.label}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    {formatCurrencyFromCents(entry.amountCents)}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: theme.colors.surfaceMuted,
                    borderRadius: theme.radius.pill,
                    height: 10,
                    overflow: "hidden",
                  }}
                >
                  {widthPercent > 0 ? (
                    <View
                      style={{
                        backgroundColor: entry.color,
                        borderRadius: theme.radius.pill,
                        height: "100%",
                        width: `${widthPercent}%`,
                      }}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 16,
              fontWeight: "600",
            }}
          >
            {t("home.reports.expenses.title")}
          </Text>

          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
            }}
          >
            {timeframeLabel}
          </Text>

          {expenseEntries.length > 0 ? (
            expenseEntries.map((entry) => (
              <View
                key={entry.category}
                style={{
                  alignItems: "center",
                  borderBottomColor: theme.colors.border,
                  borderBottomWidth: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingBottom: theme.spacing.sm,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    flex: 1,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  {formatExpenseCategoryLabel(entry.category, t)}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {formatCurrencyFromCents(entry.totalCents)}
                </Text>
              </View>
            ))
          ) : (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.reports.expenses.empty")}
            </Text>
          )}
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "600",
              }}
            >
              {t("home.weekly.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.weekly.subtitle")}
            </Text>
          </View>

          {weeklyReports.length > 0 && weeklyReports.some((w) => w.totalCents > 0) ? (
            weeklyReports.map((week) => {
              const maxCents = Math.max(...weeklyReports.map((w) => w.totalCents), 1);
              const barWidth = Math.max((week.totalCents / maxCents) * 100, 2);
              const { breakdown } = week;
              const total = week.totalCents || 1;

              return (
                <View key={week.weekLabel} style={{ gap: theme.spacing.xs }}>
                  <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {week.weekLabel}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                      }}
                    >
                      {formatCurrencyFromCents(week.totalCents)}
                    </Text>
                  </View>

                  <View
                    style={{
                      borderRadius: theme.radius.sm,
                      flexDirection: "row",
                      height: 14,
                      overflow: "hidden",
                      width: `${barWidth}%`,
                    }}
                  >
                    {breakdown.cashCents > 0 ? (
                      <View style={{ backgroundColor: theme.colors.success, flex: breakdown.cashCents / total }} />
                    ) : null}
                    {breakdown.gcashCents > 0 ? (
                      <View style={{ backgroundColor: theme.colors.primary, flex: breakdown.gcashCents / total }} />
                    ) : null}
                    {breakdown.mayaCents > 0 ? (
                      <View style={{ backgroundColor: theme.colors.accent, flex: breakdown.mayaCents / total }} />
                    ) : null}
                    {breakdown.utangCents > 0 ? (
                      <View style={{ backgroundColor: theme.colors.warning, flex: breakdown.utangCents / total }} />
                    ) : null}
                  </View>
                </View>
              );
            })
          ) : (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.weekly.noData")}
            </Text>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: theme.colors.success, borderRadius: 4, height: 10, width: 10 }} />
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 12 }}>Cash</Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: theme.colors.primary, borderRadius: 4, height: 10, width: 10 }} />
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 12 }}>GCash</Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: theme.colors.accent, borderRadius: 4, height: 10, width: 10 }} />
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 12 }}>Maya</Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
              <View style={{ backgroundColor: theme.colors.warning, borderRadius: 4, height: 10, width: 10 }} />
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 12 }}>Utang</Text>
            </View>
          </View>
        </SurfaceCard>
      </>
    );
  };

  const renderInventoryPanel = () => {
    if (!metrics) {
      return null;
    }

    return (
      <>
        <SurfaceCard style={compactCardStyle}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "600",
              }}
            >
              {t("home.runout.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.runout.subtitle")}
            </Text>
          </View>

          {velocity.length > 0 ? (
            velocity.map((item) => (
              <View
                key={item.id}
                style={{
                  alignItems: "center",
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: theme.spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 4, paddingRight: theme.spacing.md }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    {item.unitsPerDay} {item.isWeightBased ? "kg" : "units"}/day
                  </Text>
                </View>
                <StatusBadge
                  label={t("home.runout.daysLeft", { days: item.daysUntilOutOfStock ?? 0 })}
                  tone={(item.daysUntilOutOfStock ?? 99) <= 3 ? "danger" : "warning"}
                />
              </View>
            ))
          ) : (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.runout.noData")}
            </Text>
          )}
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "600",
              }}
            >
              {t("home.lowStock.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.lowStock.subtitle")}
            </Text>
          </View>

          {metrics.lowStockProducts.length > 0 ? (
            metrics.lowStockProducts.map((product) => (
              <View
                key={product.id}
                style={{
                  alignItems: "center",
                  backgroundColor: theme.colors.warningMuted,
                  borderRadius: theme.radius.sm,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: theme.spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 4, paddingRight: theme.spacing.md }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {product.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    Reorder point: {product.isWeightBased ? `${formatWeightKg(product.minStock)} kg` : `${product.minStock} units`}
                  </Text>
                </View>
                <StatusBadge
                  label={
                    product.isWeightBased
                      ? `${formatWeightKg(product.totalKgAvailable ?? 0)} kg left`
                      : `${product.stock} left`
                  }
                  tone="warning"
                />
              </View>
            ))
          ) : (
            <EmptyState
              icon="check-circle"
              message={t("home.lowStock.emptyMessage")}
              title={t("home.lowStock.emptyTitle")}
            />
          )}

          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <ActionButton
              disabled={creatingRestockList}
              label={creatingRestockList ? t("restock.generating") : t("restock.generate")}
              onPress={() => {
                void handleGenerateRestockList();
              }}
              style={{ flex: 1 }}
            />
            <ActionButton
              label={t("restock.open")}
              onPress={handleOpenRestockLists}
              style={{ flex: 1 }}
              variant="ghost"
            />
          </View>
        </SurfaceCard>
      </>
    );
  };

  const renderCreditPanel = () => {
    if (!metrics) {
      return null;
    }

    const paymentActivityLabel =
      metrics.todayPaymentEvents === 0
        ? t("home.credit.paymentLogs.none")
        : metrics.todayPaymentEvents === 1
          ? t("home.credit.paymentLogs.single")
          : t("home.credit.paymentLogs.plural", { count: metrics.todayPaymentEvents });
    const bottleReturnLabel =
      metrics.openContainerReturnQuantity === 0
        ? t("home.credit.bottleReturns.none")
        : metrics.openContainerReturnQuantity === 1
          ? t("home.credit.bottlesPending.single")
          : t("home.credit.bottlesPending.plural", { count: metrics.openContainerReturnQuantity });
    const bottleCustomerLabel =
      metrics.openContainerReturnCustomers === 1
        ? t("home.credit.customersHolding.single")
        : t("home.credit.customersHolding.plural", { count: metrics.openContainerReturnCustomers });

    return (
      <SurfaceCard style={compactCardStyle}>
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.display,
              fontSize: 24,
              fontWeight: "600",
            }}
          >
            {t("home.risk.title")}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
            }}
          >
            {t("home.risk.subtitle")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <StatusBadge
            label={t("home.credit.paymentsToday", {
              amount: formatCurrencyFromCents(metrics.todayPaymentCents),
            })}
            tone={metrics.todayPaymentEvents > 0 ? "primary" : "neutral"}
          />
          <StatusBadge label={paymentActivityLabel} tone={metrics.todayPaymentEvents > 0 ? "primary" : "neutral"} />
          <StatusBadge
            label={bottleReturnLabel}
            tone={metrics.openContainerReturnQuantity > 0 ? "warning" : "success"}
          />
          {metrics.openContainerReturnCustomers > 0 ? (
            <StatusBadge label={bottleCustomerLabel} tone="warning" />
          ) : null}
        </View>

        {metrics.delikadoCustomers.length > 0 ? (
          metrics.delikadoCustomers.map((customer) => (
            <View
              key={customer.id}
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.dangerMuted,
                borderRadius: theme.radius.sm,
                flexDirection: "row",
                justifyContent: "space-between",
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  fontWeight: "600",
                  paddingRight: theme.spacing.md,
                }}
              >
                {customer.name}
              </Text>
              <StatusBadge label={formatCurrencyFromCents(customer.balanceCents)} tone="danger" />
            </View>
          ))
        ) : (
          <EmptyState
            icon="shield"
            message={t("home.risk.emptyMessage")}
            title={t("home.risk.emptyTitle")}
          />
        )}
      </SurfaceCard>
    );
  };

  const renderHistoryPanel = () => {
    const locale = language === "english" ? "en-PH" : "fil-PH";

    const formatHistoryDate = (dateIso: string) =>
      new Date(dateIso).toLocaleString(locale, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
      });

    if (historyLoading) {
      return (
        <SurfaceCard style={[compactCardStyle, { alignItems: "center" }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
            }}
          >
            {t("home.history.loading")}
          </Text>
        </SurfaceCard>
      );
    }

    if (salesHistory.length === 0) {
      return (
        <EmptyState
          icon="file-text"
          message={t("home.history.emptyMessage")}
          title={t("home.history.emptyTitle")}
        />
      );
    }

    return (
      <>
        <SurfaceCard style={compactCardStyle}>
          <InputField
            label={t("home.history.searchLabel")}
            onChangeText={setHistorySearch}
            placeholder={t("home.history.searchPlaceholder")}
            value={historySearch}
          />

          <View style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t("home.history.sortLabel")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                {historySortOptions.map((option) => {
                  const active = option.key === historySort;

                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setHistorySort(option.key)}
                      style={({ pressed }) => ({
                        backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        opacity: pressed ? 0.9 : 1,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 10,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.primary : theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {t("home.history.showingResults", {
              count: filteredSalesHistory.length,
              total: salesHistory.length,
            })}
          </Text>
        </SurfaceCard>

        {filteredSalesHistory.length === 0 ? (
          <EmptyState
            icon="search"
            message={t("home.history.noResultsMessage")}
            title={t("home.history.noResultsTitle")}
          />
        ) : null}

        {filteredSalesHistory.map(({ sale, matchedItems, totalQuantity }) => {
          const customerLabel = sale.customerName?.trim() || t("home.history.walkIn");
          const itemCountLabel =
            totalQuantity === 1
              ? t("home.history.itemCount.single")
              : t("home.history.itemCount.plural", { count: totalQuantity });
          const paymentLabel = getPaymentMethodLabel(sale.paymentMethod);
          const hasMatchedProducts = normalizedHistorySearch.length > 0 && matchedItems.length > 0;

          return (
            <Pressable
              key={sale.id}
              onPress={() => setReceiptSale(sale)}
              style={({ pressed }) => ({ opacity: pressed ? 0.94 : 1 })}
            >
              <SurfaceCard
                style={[
                  compactCardStyle,
                  hasMatchedProducts ? { borderColor: theme.colors.primary, borderWidth: 1.5 } : null,
                  { gap: theme.spacing.xs },
                ]}
              >
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: theme.spacing.md, justifyContent: "space-between" }}>
                  <View style={{ flex: 1, gap: theme.spacing.xs }}>
                    <View style={{ alignItems: "center", columnGap: theme.spacing.sm, flexDirection: "row", flexWrap: "wrap", rowGap: theme.spacing.xs }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          flexShrink: 1,
                          fontFamily: theme.typography.display,
                          fontSize: 19,
                          fontWeight: "600",
                        }}
                      >
                        {customerLabel}
                      </Text>
                      <StatusBadge label={paymentLabel} tone={getPaymentMethodTone(sale.paymentMethod)} />
                    </View>

                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        lineHeight: 18,
                      }}
                    >
                      {`${formatHistoryDate(sale.createdAt)} | #${sale.id}`}
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontFamily: theme.typography.display,
                      fontSize: 20,
                      fontWeight: "600",
                    }}
                  >
                    {formatCurrencyFromCents(sale.totalCents)}
                  </Text>
                </View>

                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    {itemCountLabel}
                  </Text>
                  <Feather color={theme.colors.textSoft} name="chevron-right" size={18} />
                </View>
              </SurfaceCard>
            </Pressable>
          );
        })}
      </>
    );
  };

  const renderCalculatorPanel = () => (
    <View style={{ gap: theme.spacing.md }}>
      <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
            }}
          >
            {t("home.calculator.expression")}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.display,
              fontSize: 28,
              fontWeight: "600",
              textAlign: "right",
            }}
          >
            {calculatorExpressionLabel}
          </Text>
        </View>

        <View style={{ backgroundColor: theme.colors.border, height: 1 }} />

        <View style={{ gap: theme.spacing.xs }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "600",
              textTransform: "uppercase",
            }}
          >
            {t("home.calculator.result")}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: calculatorPreview === null ? theme.colors.textSoft : theme.colors.primary,
              fontFamily: theme.typography.display,
              fontSize: 24,
              fontWeight: "600",
              textAlign: "right",
            }}
          >
            {calculatorResultLabel}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {t("home.calculator.ready")}
          </Text>
        </View>
      </SurfaceCard>

      <View style={{ gap: theme.spacing.sm }}>
        {CALCULATOR_BUTTON_ROWS.map((row, rowIndex) => (
          <View key={`calculator-row-${rowIndex}`} style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {row.map((button, buttonIndex) => {
              const palette =
                button.type === "equals"
                  ? {
                      backgroundColor: theme.colors.primary,
                      borderColor: theme.colors.primary,
                      textColor: theme.colors.primaryText,
                    }
                  : button.type === "operator"
                    ? {
                        backgroundColor: theme.colors.primaryMuted,
                        borderColor: theme.colors.primaryMuted,
                        textColor: theme.colors.primary,
                      }
                    : button.value === "clear"
                      ? {
                          backgroundColor: theme.colors.dangerMuted,
                          borderColor: theme.colors.dangerMuted,
                          textColor: theme.colors.danger,
                        }
                      : {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          textColor: theme.colors.text,
                        };

              return (
                <Pressable
                  key={`${button.label}-${buttonIndex}`}
                  onPress={() => handleCalculatorInput(button.value)}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    flex: 1,
                    justifyContent: "center",
                    minHeight: 58,
                    opacity: pressed ? 0.88 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Text
                    style={{
                      color: palette.textColor,
                      fontFamily: theme.typography.body,
                      fontSize: button.label.length > 2 ? 14 : 20,
                      fontWeight: "600",
                    }}
                  >
                    {button.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  const renderActivePanelContent = () => {
    if (activePanel === "analytics") {
      return renderAnalyticsPanel();
    }

    if (activePanel === "inventory") {
      return renderInventoryPanel();
    }

    if (activePanel === "credit") {
      return renderCreditPanel();
    }

    if (activePanel === "history") {
      return renderHistoryPanel();
    }

    if (activePanel === "calculator") {
      return renderCalculatorPanel();
    }

    return null;
  };

  return (
    <>
      <Screen
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingBottom: 120,
          paddingTop: theme.spacing.md,
        }}
        rightSlot={
          <Pressable
            accessibilityLabel={t("home.openSettings")}
            hitSlop={6}
            onPress={() => router.push("/settings")}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 38,
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
              width: 38,
            })}
          >
            <Feather color={theme.colors.text} name="settings" size={16} />
          </Pressable>
        }
        titleStyle={{
          fontFamily: theme.typography.body,
          fontSize: 26,
          fontWeight: "600",
          letterSpacing: 0.1,
        }}
        title={storeName || "TindaHan AI"}
      >
        {aiLoading ? (
          <SurfaceCard style={compactCardStyle}>
            <View
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.sm,
                height: 18,
                width: "42%",
              }}
            />
            <View
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.sm,
                height: 16,
                width: "100%",
              }}
            />
            <View
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.sm,
                height: 16,
                width: "88%",
              }}
            />
            <View style={{ gap: theme.spacing.sm }}>
              <View
                style={{
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.sm,
                  height: 48,
                  width: "100%",
                }}
              />
              <View
                style={{
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.sm,
                  height: 48,
                  width: "94%",
                }}
              />
            </View>
          </SurfaceCard>
        ) : brief ? (
          <SurfaceCard style={compactCardStyle}>
            <Text
              style={{
                color: theme.colors.textSoft,
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              {briefDateLabel}
            </Text>

            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: 22,
                    fontWeight: "600",
                  }}
                >
                  {t("home.brief.title")}
                </Text>
              </View>
              <StatusBadge
                label={brief.source === "ai" ? t("home.brief.live") : geminiReady ? t("home.brief.fallback") : t("home.brief.aiOff")}
                tone={brief.source === "ai" ? "primary" : "neutral"}
              />
            </View>

            <View
              style={{
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                padding: theme.spacing.md,
              }}
            >
              <ChatRichText
                color={theme.colors.text}
                fontSize={14}
                lineHeight={22}
                text={brief.insight}
              />
            </View>

            <ActionButton
              icon={<Feather color={theme.colors.primary} name="message-circle" size={18} />}
              label={t("home.chat.ask")}
              onPress={() => setChatVisible(true)}
              variant="outline"
              style={{ marginTop: theme.spacing.xs }}
            />
          </SurfaceCard>
        ) : null}

        {loading ? (
          <SurfaceCard style={[compactCardStyle, { alignItems: "center" }]}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.loadingNumbers")}
            </Text>
          </SurfaceCard>
        ) : metrics ? (
          <SurfaceCard style={compactCardStyle}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                rowGap: theme.spacing.lg,
              }}
            >
              {shortcutItems.map((item) => (
                <HomeShortcutCard
                  icon={item.icon}
                  key={item.key}
                  label={item.title}
                  onPress={() => setActivePanel(item.key)}
                />
              ))}
            </View>
          </SurfaceCard>
        ) : null}
      </Screen>

      <ModalSheet
        fullHeight
        onClose={() => setActivePanel(null)}
        subtitle={activeShortcut?.subtitle}
        title={activeShortcut?.title ?? ""}
        visible={activePanel !== null}
      >
        {renderActivePanelContent()}
      </ModalSheet>

      <ModalSheet
        fullHeight
        footer={
          receiptSale ? (
            <View style={{ gap: theme.spacing.sm }}>
              <ActionButton
                disabled={receiptAction !== null}
                icon={
                  receiptAction === "download" ? (
                    <ActivityIndicator color={theme.colors.primary} />
                  ) : (
                    <Feather color={theme.colors.primary} name="download" size={16} />
                  )
                }
                label={receiptAction === "download" ? t("home.history.exporting") : t("home.history.downloadReceipt")}
                onPress={() => void handleExportReceipt("download")}
                variant="secondary"
              />
              <ActionButton
                disabled={receiptAction !== null}
                icon={
                  receiptAction === "share" ? (
                    <ActivityIndicator color={theme.colors.primaryText} />
                  ) : (
                    <Feather color={theme.colors.primaryText} name="share-2" size={16} />
                  )
                }
                label={receiptAction === "share" ? t("home.history.exporting") : t("home.history.shareReceipt")}
                onPress={() => void handleExportReceipt("share")}
              />
              <ActionButton label={t("home.history.closeReceipt")} onPress={() => setReceiptSale(null)} variant="ghost" />
            </View>
          ) : undefined
        }
        onClose={() => setReceiptSale(null)}
        subtitle={
          receiptSale
            ? t("home.history.receiptSubtitle", {
              date:
                new Date(receiptSale.createdAt).toLocaleString(language === "english" ? "en-PH" : "fil-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              id: receiptSale.id,
            })
            : ""
        }
        title={t("home.history.receiptDetailsTitle")}
        visible={receiptSale !== null}
      >
        {receiptSale ? (
          <View style={{ alignItems: "center", paddingBottom: theme.spacing.md }}>
            <View collapsable={false} ref={receiptCaptureRef}>
              <ReceiptView
                cashPaidCents={receiptSale.cashPaidCents}
                changeCents={receiptSale.changeGivenCents}
                containerReturns={receiptSale.containerReturns.map((event) => ({
                  containerLabelSnapshot: event.containerLabelSnapshot,
                  quantityOut: event.quantityOut,
                  quantityReturned: event.quantityReturned,
                  status: event.status,
                }))}
                date={new Date(receiptSale.createdAt).toLocaleString(language === "english" ? "en-PH" : "fil-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                discountCents={receiptSale.discountCents}
                items={receiptSale.items.map((item) => ({
                  name: item.productName,
                  quantity: item.quantity,
                  weightKg: item.weightKg,
                  priceCents: item.unitPriceCents,
                  lineTotalCents: item.lineTotalCents,
                  isWeightBased: item.isWeightBased,
                }))}
                paymentMethod={receiptSale.paymentMethod}
                saleId={receiptSale.id}
                storeName={storeName}
                subtotalCents={receiptSale.totalCents + receiptSale.discountCents}
                totalCents={receiptSale.totalCents}
              />
            </View>
          </View>
        ) : null}
      </ModalSheet>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <InputField
              label={t("home.chat.ask")}
              multiline
              onChangeText={setChatInput}
              placeholder={t("home.chat.placeholder")}
              value={chatInput}
            />
            <ActionButton
              disabled={sendingChat || chatInput.trim().length === 0}
              label={sendingChat ? t("home.chat.thinking") : t("home.chat.send")}
              onPress={() => void handleSendChat()}
            />
          </View>
        }
        onClose={() => setChatVisible(false)}
        subtitle={t("home.chat.subtitle")}
        title={t("home.chat.title")}
        visible={chatVisible}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md }}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "stretch",
                backgroundColor: message.role === "user" ? theme.colors.primary : theme.colors.surface,
                borderColor: message.role === "user" ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                maxWidth: "92%",
                padding: theme.spacing.md,
              }}
            >
              <ChatRichText
                color={message.role === "user" ? theme.colors.primaryText : theme.colors.text}
                text={message.text}
              />
            </View>
          ))}

          {sendingChat ? (
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                }}
              >
                {t("home.chat.aiThinking")}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </>
  );
}

