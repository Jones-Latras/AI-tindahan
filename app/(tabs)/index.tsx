import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

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
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getHomeMetrics, getProductSalesVelocity, getWeeklyPaymentBreakdown, listSalesHistory } from "@/db/repositories";
import { chatWithAlingAi, getOrCreateHomeAiBrief, isGeminiReady } from "@/services/ai";
import type { ChatMessage, HomeAiBrief, HomeMetrics, ProductVelocity, StoreAiSale, WeeklyPaymentReport } from "@/types/models";
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

type HomeShortcutCardProps = {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  subtitle: string;
  title: string;
  tone: "primary" | "accent" | "warning" | "danger" | "neutral";
};

function HomeShortcutCard({ icon, onPress, subtitle, title, tone }: HomeShortcutCardProps) {
  const { theme } = useAppTheme();

  const palette =
    tone === "accent"
      ? { backgroundColor: theme.colors.accentMuted, color: theme.colors.accent }
      : tone === "warning"
        ? { backgroundColor: theme.colors.warningMuted, color: theme.colors.warning }
        : tone === "danger"
          ? { backgroundColor: theme.colors.dangerMuted, color: theme.colors.danger }
          : tone === "neutral"
            ? { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }
            : { backgroundColor: theme.colors.primaryMuted, color: theme.colors.primary };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flex: 1,
        gap: theme.spacing.md,
        minWidth: "47%",
        opacity: pressed ? 0.9 : 1,
        padding: theme.spacing.md,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette.backgroundColor,
            borderRadius: theme.radius.pill,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <Feather color={palette.color} name={icon} size={18} />
        </View>
        <Feather color={theme.colors.textSoft} name="chevron-right" size={18} />
      </View>

      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.display,
            fontSize: 20,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          {subtitle}
        </Text>
      </View>
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
  const geminiReady = isGeminiReady();
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null);
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
  const [salesHistory, setSalesHistory] = useState<StoreAiSale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [receiptSale, setReceiptSale] = useState<StoreAiSale | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createChatMessage("assistant", t("home.aiWelcome"))]);
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
      tone: HomeShortcutCardProps["tone"];
    }> = [
        {
          icon: "bar-chart-2",
          key: "analytics",
          subtitle: t("home.shortcuts.analytics.subtitle"),
          title: t("home.shortcuts.analytics.title"),
          tone: "primary",
        },
        {
          icon: "package",
          key: "inventory",
          subtitle: t("home.shortcuts.inventory.subtitle"),
          title: t("home.shortcuts.inventory.title"),
          tone: "warning",
        },
        {
          icon: "users",
          key: "credit",
          subtitle: t("home.shortcuts.credit.subtitle"),
          title: t("home.shortcuts.credit.title"),
          tone: "danger",
        },
        {
          icon: "file-text",
          key: "history",
          subtitle: t("home.shortcuts.history.subtitle"),
          title: t("home.shortcuts.history.title"),
          tone: "accent",
        },
      ];

    return items;
  }, [t]);
  const activeShortcut = shortcutItems.find((item) => item.key === activePanel) ?? null;

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
      const [nextMetrics, nextBrief, nextVelocity, nextWeekly] = await Promise.all([
        getHomeMetrics(db),
        getOrCreateHomeAiBrief(db, language),
        getProductSalesVelocity(db),
        getWeeklyPaymentBreakdown(db),
      ]);
      setMetrics(nextMetrics);
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
      void Storage.getItem("tindahan.store-name").then((name) => {
        setStoreName(name ?? "");
      });
      scheduleMidnightRefresh();

      return () => {
        if (midnightRefreshTimeout) {
          clearTimeout(midnightRefreshTimeout);
        }
      };
    }, [loadDashboard]),
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

  useEffect(() => {
    if (activePanel === "history") {
      void loadSalesHistory();
    }
  }, [activePanel, loadSalesHistory]);

  const renderAnalyticsPanel = () => {
    if (!metrics) {
      return null;
    }

    return (
      <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <StatCard
            icon="bar-chart-2"
            label={language === "english" ? "Sales Today" : "Kita Today"}
            tone="primary"
            value={formatCurrencyFromCents(metrics.todaySalesCents)}
          />
          <StatCard
            icon="layers"
            label="Transactions"
            tone="accent"
            value={String(metrics.todayTransactions)}
          />
          <StatCard
            icon="trending-up"
            label={language === "english" ? "Profit Today" : "Profit Today"}
            tone="primary"
            value={formatCurrencyFromCents(metrics.todayProfitCents)}
          />
          <StatCard
            icon="alert-circle"
            label={language === "english" ? "Many Debts" : "Maraming Utang"}
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
        </SurfaceCard>
      </>
    );
  };

  const renderCreditPanel = () => {
    if (!metrics) {
      return null;
    }

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
        dateStyle: "medium",
        timeStyle: "short",
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
        {salesHistory.map((sale) => {
          const subtotalCents = sale.totalCents + sale.discountCents;
          const paymentLabel = getPaymentMethodLabel(sale.paymentMethod);

          return (
            <SurfaceCard key={sale.id} style={compactCardStyle}>
              <View style={{ alignItems: "flex-start", flexDirection: "row", gap: theme.spacing.md, justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.display,
                      fontSize: 22,
                      fontWeight: "700",
                    }}
                  >
                    #{sale.id}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    {formatHistoryDate(sale.createdAt)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end", gap: theme.spacing.xs }}>
                  <StatusBadge label={paymentLabel} tone={getPaymentMethodTone(sale.paymentMethod)} />
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
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                <StatusBadge
                  label={`${t("home.history.items")}: ${sale.items.length}`}
                  tone="neutral"
                />
                <StatusBadge
                  label={`${t("home.history.customer")}: ${sale.customerName ?? t("home.history.walkIn")}`}
                  tone={sale.customerName ? "warning" : "neutral"}
                />
                {sale.discountCents > 0 ? (
                  <StatusBadge
                    label={`${t("home.history.discount")}: ${formatCurrencyFromCents(sale.discountCents)}`}
                    tone="success"
                  />
                ) : null}
              </View>

              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  gap: theme.spacing.sm,
                  padding: theme.spacing.md,
                }}
              >
                {sale.items.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      alignItems: "flex-start",
                      flexDirection: "row",
                      gap: theme.spacing.md,
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 14,
                          fontWeight: "700",
                        }}
                      >
                        {item.productName}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        {item.isWeightBased
                          ? `${formatWeightKg(item.weightKg ?? 0)} kg x ${formatCurrencyFromCents(item.unitPriceCents)}/kg`
                          : `${item.quantity}x ${formatCurrencyFromCents(item.unitPriceCents)}`}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {formatCurrencyFromCents(item.lineTotalCents)}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={{
                  backgroundColor: theme.colors.surfaceMuted,
                  borderRadius: theme.radius.sm,
                  gap: theme.spacing.xs,
                  padding: theme.spacing.md,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                    }}
                  >
                    {t("home.history.subtotal")}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {formatCurrencyFromCents(subtotalCents)}
                  </Text>
                </View>
                {sale.discountCents > 0 ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text
                      style={{
                        color: theme.colors.success,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {t("home.history.discount")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.success,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      -{formatCurrencyFromCents(sale.discountCents)}
                    </Text>
                  </View>
                ) : null}
                {sale.paymentMethod === "cash" ? (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                        }}
                      >
                        {t("home.history.cashReceived")}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {formatCurrencyFromCents(sale.cashPaidCents)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                        }}
                      >
                        {t("home.history.change")}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {formatCurrencyFromCents(sale.changeGivenCents)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              <ActionButton
                label={t("home.history.viewReceipt")}
                onPress={() => setReceiptSale(sale)}
                variant="secondary"
              />
            </SurfaceCard>
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
        overlay={
          <Pressable
            onPress={() => setChatVisible(true)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              bottom: 30,
              elevation: 4,
              flexDirection: "row",
              gap: theme.spacing.sm,
              opacity: pressed ? 0.92 : 1,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 14,
              position: "absolute",
              right: theme.spacing.lg,
              shadowColor: theme.colors.shadow,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 1,
              shadowRadius: 20,
            })}
          >
            <Feather color={theme.colors.primaryText} name="message-circle" size={18} />
            <Text
              style={{
                color: theme.colors.primaryText,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {t("home.aiButton")}
            </Text>
          </Pressable>
        }
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
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                  }}
                >
                  {t("home.brief.subtitle")}
                </Text>
              </View>
              <StatusBadge
                label={brief.source === "ai" ? t("home.brief.live") : geminiReady ? t("home.brief.fallback") : t("home.brief.aiOff")}
                tone={brief.source === "ai" ? "primary" : "neutral"}
              />
            </View>

            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                lineHeight: 22,
              }}
            >
              {brief.insight}
            </Text>

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
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 24,
                  fontWeight: "700",
                }}
              >
                {t("home.shortcuts.title")}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                }}
              >
                {t("home.shortcuts.subtitle")}
              </Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {shortcutItems.map((item) => (
                <HomeShortcutCard
                  icon={item.icon}
                  key={item.key}
                  onPress={() => setActivePanel(item.key)}
                  subtitle={item.subtitle}
                  title={item.title}
                  tone={item.tone}
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
        footer={<ActionButton label={t("home.history.closeReceipt")} onPress={() => setReceiptSale(null)} variant="ghost" />}
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
        title={t("home.history.receiptTitle")}
        visible={receiptSale !== null}
      >
        {receiptSale ? (
          <View style={{ alignItems: "center", paddingBottom: theme.spacing.md }}>
            <ReceiptView
              cashPaidCents={receiptSale.cashPaidCents}
              changeCents={receiptSale.changeGivenCents}
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
