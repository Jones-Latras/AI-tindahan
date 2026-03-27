import { Feather } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { ActionButton } from "@/components/ActionButton";
import { AutoSwipeSuggestionCarousel } from "@/components/AutoSwipeSuggestionCarousel";
import { ChatRichText } from "@/components/ChatRichText";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { ReceiptView } from "@/components/ReceiptView";
import { Screen } from "@/components/Screen";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import type { TranslationKey } from "@/constants/translations";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  createRestockListFromThresholds,
  getExpenseSummary,
  getHomeMetrics,
  getProductSalesVelocity,
  getStoreName,
  getWeeklyPaymentBreakdown,
  listSalesHistory,
  saveStoreName,
} from "@/db/repositories";
import { chatWithAlingAi, getOrCreateHomeAiBrief, isGeminiReady } from "@/services/ai";
import type {
  ChatMessage,
  ExpenseSummary,
  HomeAiBrief,
  HomeMetrics,
  ProductVelocity,
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

type HomePanel = "analytics" | "inventory" | "credit" | "history";
type HistorySort = "latest" | "oldest" | "highest-total" | "lowest-total" | "most-quantity" | "least-quantity";
type HistorySaleMatch = {
  sale: StoreAiSale;
  matchedItems: StoreAiSale["items"];
  totalQuantity: number;
};

const STORE_NAME_KEY = "tindahan.store-name";
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
          fontWeight: "500",
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
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary | null>(null);
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
  const [receiptSale, setReceiptSale] = useState<StoreAiSale | null>(null);
  const [receiptAction, setReceiptAction] = useState<"share" | "download" | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createChatMessage("assistant", t("home.aiWelcome"))]);
  const receiptCaptureRef = useRef<View>(null);
  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;
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
      ];

    return items;
  }, [t]);
  const activeShortcut = shortcutItems.find((item) => item.key === activePanel) ?? null;
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

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant"
        ? [createChatMessage("assistant", t("home.aiWelcome"))]
        : current,
    );
  }, [t]);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setAiLoading(true);
    }

    try {
      const [nextMetrics, nextExpenseSummary, nextBrief, nextVelocity, nextWeekly] = await Promise.all([
        getHomeMetrics(db),
        getExpenseSummary(db),
        getOrCreateHomeAiBrief(db, language),
        getProductSalesVelocity(db),
        getWeeklyPaymentBreakdown(db),
      ]);
      setMetrics(nextMetrics);
      setExpenseSummary(nextExpenseSummary);
      setBrief(nextBrief);
      setVelocity(nextVelocity.filter((item) => item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 7).slice(0, 5));
      setWeeklyReports(nextWeekly);
    } finally {
      if (!options?.silent) {
        setLoading(false);
        setAiLoading(false);
      }
    }
  }, [db, language]);

  useFocusEffect(
    useCallback(() => {
      let midnightRefreshTimeout: ReturnType<typeof setTimeout> | null = null;

      const scheduleMidnightRefresh = () => {
        midnightRefreshTimeout = setTimeout(() => {
          void loadDashboard({ silent: true });
          scheduleMidnightRefresh();
        }, getMillisecondsUntilNextMidnight());
      };

      void loadDashboard();
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
        if (midnightRefreshTimeout) {
          clearTimeout(midnightRefreshTimeout);
        }
      };
    }, [db, loadDashboard]),
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
    if (!metrics) {
      return null;
    }

    return (
      <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <StatCard
            icon="bar-chart-2"
            label={t("home.analytics.salesToday")}
            tone="primary"
            value={formatCurrencyFromCents(metrics.todaySalesCents)}
          />
          <StatCard
            icon="layers"
            label={t("home.analytics.transactions")}
            tone="accent"
            value={String(metrics.todayTransactions)}
          />
          <StatCard
            icon="trending-up"
            label={t("home.analytics.grossProfit")}
            tone="primary"
            value={formatCurrencyFromCents(metrics.todayGrossProfitCents)}
          />
          <StatCard
            icon="minus-circle"
            label={t("home.analytics.expenses")}
            tone="warning"
            value={formatCurrencyFromCents(metrics.todayExpenseCents)}
          />
          <StatCard
            icon="dollar-sign"
            label={t("home.analytics.netProfit")}
            tone={metrics.todayNetProfitCents >= 0 ? "accent" : "warning"}
            value={formatCurrencyFromCents(metrics.todayNetProfitCents)}
          />
          <StatCard
            icon="alert-triangle"
            label={t("home.analytics.restockAlerts")}
            tone="warning"
            value={String(metrics.restockUrgencyCount)}
          />
          <StatCard
            icon="repeat"
            label={t("home.analytics.paymentsLogged")}
            tone={metrics.todayPaymentEvents > 0 ? "primary" : "accent"}
            value={String(metrics.todayPaymentEvents)}
          />
          <StatCard
            icon="alert-circle"
            label={t("home.analytics.debts")}
            tone="warning"
            value={formatCurrencyFromCents(metrics.totalUtangCents)}
          />
        </View>

        <SurfaceCard style={compactCardStyle}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              {t("home.paymentMix.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.paymentMix.subtitle")}
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <StatusBadge label={`Cash ${formatCurrencyFromCents(metrics.paymentBreakdown.cashCents)}`} tone="success" />
            <StatusBadge label={`GCash ${formatCurrencyFromCents(metrics.paymentBreakdown.gcashCents)}`} tone="primary" />
            <StatusBadge label={`Maya ${formatCurrencyFromCents(metrics.paymentBreakdown.mayaCents)}`} tone="primary" />
            <StatusBadge label={`Utang ${formatCurrencyFromCents(metrics.paymentBreakdown.utangCents)}`} tone="warning" />
          </View>
        </SurfaceCard>

        <SurfaceCard style={compactCardStyle}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              {t("home.expenses.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.expenses.subtitle")}
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <StatusBadge
              label={`${t("gastos.summary.today")} ${formatCurrencyFromCents(expenseSummary?.todayExpenseCents ?? 0)}`}
              tone="warning"
            />
            <StatusBadge
              label={`${t("gastos.summary.week")} ${formatCurrencyFromCents(expenseSummary?.weekExpenseCents ?? 0)}`}
              tone="warning"
            />
            <StatusBadge
              label={`${t("gastos.summary.month")} ${formatCurrencyFromCents(expenseSummary?.monthExpenseCents ?? 0)}`}
              tone="warning"
            />
          </View>

          {expenseSummary && expenseSummary.topCategories.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {expenseSummary.topCategories.map((entry) => (
                <StatusBadge
                  key={entry.category}
                  label={`${formatExpenseCategoryLabel(entry.category, t)} ${formatCurrencyFromCents(entry.totalCents)}`}
                  tone="neutral"
                />
              ))}
            </View>
          ) : (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("home.expenses.empty")}
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
                fontWeight: "700",
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
                        fontWeight: "700",
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
                fontWeight: "700",
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
                      fontWeight: "700",
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
                fontWeight: "700",
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
                      fontWeight: "700",
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
              fontWeight: "700",
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
                  fontWeight: "700",
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
                          fontWeight: "700",
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
                          fontWeight: "700",
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
                      fontWeight: "700",
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
          fontWeight: "700",
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
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: 22,
                    fontWeight: "700",
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

            <View style={{ gap: theme.spacing.xs }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {t("home.brief.restock")}
              </Text>
              {brief.restockSuggestions.length > 0 ? (
                <AutoSwipeSuggestionCarousel suggestions={brief.restockSuggestions} />
              ) : (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  {t("home.brief.noRestock")}
                </Text>
              )}
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
