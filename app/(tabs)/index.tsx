import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { seedStoreData } from "@/scripts/seed-store";

import { ActionButton } from "@/components/ActionButton";
import { AutoSwipeSuggestionCarousel } from "@/components/AutoSwipeSuggestionCarousel";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getHomeMetrics, getProductSalesVelocity, getWeeklyPaymentBreakdown } from "@/db/repositories";
import { chatWithAlingAi, getOrCreateHomeAiBrief, isGeminiReady } from "@/services/ai";
import type { ChatMessage, HomeAiBrief, HomeMetrics, ProductVelocity, WeeklyPaymentReport } from "@/types/models";
import { formatCurrencyFromCents } from "@/utils/money";
import { isSupabaseReady } from "@/utils/supabase";
import { getLastSyncTime, restoreFromCloud, syncToCloud } from "@/utils/sync";

function createChatMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
  };
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
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
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createChatMessage(
      "assistant",
      "Kumusta. I can help explain sales, restock pressure, utang risk, and overall store performance in Taglish.",
    ),
  ]);
  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setAiLoading(true);

    try {
      const [nextMetrics, nextBrief, nextVelocity, nextWeekly] = await Promise.all([
        getHomeMetrics(db),
        getOrCreateHomeAiBrief(db),
        getProductSalesVelocity(db),
        getWeeklyPaymentBreakdown(db),
      ]);
      setMetrics(nextMetrics);
      setBrief(nextBrief);
      setVelocity(nextVelocity.filter((item) => item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 7).slice(0, 5));
      setWeeklyReports(nextWeekly);
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      void Storage.getItem("tindahan.store-name").then((name) => {
        if (name) setStoreName(name);
      });
      void getLastSyncTime().then(setLastSync);
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
      const reply = await chatWithAlingAi(db, messages, userText);
      setMessages((current) => [...current, createChatMessage("assistant", reply)]);
    } finally {
      setSendingChat(false);
    }
  }, [chatInput, db, messages, sendingChat]);

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
              bottom: 92,
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
              Aling AI
            </Text>
          </Pressable>
        }
        rightSlot={<ThemeToggle />}
        subtitle="Sales, stock, and utang in one quick glance."
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
                  Aling AI Daily Brief
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                  }}
                >
                  Fresh insight for today&apos;s store rhythm.
                </Text>
              </View>
              <StatusBadge
                label={brief.source === "ai" ? "Live Insight" : geminiReady ? "Fallback" : "AI Off"}
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
                Restock suggestions
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
                  No urgent restock recommendations right now.
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
              Loading today&apos;s numbers...
            </Text>
          </SurfaceCard>
        ) : metrics ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              <StatCard
                icon="bar-chart-2"
                label="Kita Today"
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
                label="Profit Today"
                tone="primary"
                value={formatCurrencyFromCents(metrics.todayProfitCents)}
              />
              <StatCard
                icon="alert-circle"
                label="Outstanding Utang"
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
                  Run-out Radar
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Estimated days left based on recent sales velocity.
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
                        {item.unitsPerDay} units/day
                      </Text>
                    </View>
                    <StatusBadge
                      label={`${item.daysUntilOutOfStock} days left`}
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
                  Not enough recent sales data to estimate stockout dates yet.
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
                  Payment Mix Today
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Cash and digital flow saved per checkout.
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
                  Weekly Sales Report
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Cash vs GCash vs Maya vs Utang by week.
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
                  No sales recorded in the last 4 weeks yet.
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
                  Delikado Customers
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  AI trust scores from Palista flow into this warning strip.
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
                  message="No customers are currently flagged as Delikado."
                  title="No High-Risk Alerts"
                />
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
                  Low Stock Alerts
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Products at or below their reorder threshold.
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
                        Reorder point: {product.minStock} units
                      </Text>
                    </View>
                    <StatusBadge label={`${product.stock} left`} tone="warning" />
                  </View>
                ))
              ) : (
                <EmptyState
                  icon="check-circle"
                  message="Everything looks healthy right now. No products are below their minimum stock."
                  title="Inventory Looks Good"
                />
              )}
            </SurfaceCard>
          </>
        ) : null}

        {isSupabaseReady() ? (
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
                Cloud Backup
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                }}
              >
                {lastSync ? `Last backup: ${lastSync}` : "Hindi pa naka-backup sa cloud."}
              </Text>
            </View>
            <ActionButton
              disabled={syncing}
              label={syncing ? "Syncing..." : "I-backup ngayon"}
              onPress={async () => {
                setSyncing(true);
                try {
                  const msg = await syncToCloud(db);
                  Alert.alert("Backup", msg);
                  setLastSync(await getLastSyncTime());
                } catch (err) {
                  Alert.alert("Backup failed", String(err));
                } finally {
                  setSyncing(false);
                }
              }}
            />
            <ActionButton
              disabled={syncing}
              label="Restore from Cloud"
              onPress={() => {
                Alert.alert(
                  "Restore Data?",
                  "I-o-overwrite nito ang local data mo. Sigurado ka ba?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Restore",
                      style: "destructive",
                      onPress: async () => {
                        setSyncing(true);
                        try {
                          const msg = await restoreFromCloud(db);
                          Alert.alert("Restore", msg);
                          void loadDashboard();
                          setLastSync(await getLastSyncTime());
                        } catch (err) {
                          Alert.alert("Restore failed", String(err));
                        } finally {
                          setSyncing(false);
                        }
                      },
                    },
                  ],
                );
              }}
              variant="secondary"
            />
          </SurfaceCard>
        ) : null}

        {__DEV__ ? (
          <SurfaceCard
            style={{
              borderColor: theme.colors.warning,
              borderWidth: 1,
              gap: theme.spacing.sm,
            }}
          >
            <Text
              style={{
                color: theme.colors.warning,
                fontFamily: theme.typography.body,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              Dev Tools
            </Text>
            <ActionButton
              disabled={seeding}
              label={seeding ? "Seeding..." : "Seed Store Data"}
              onPress={async () => {
                setSeeding(true);
                try {
                  const result = await seedStoreData(db);
                  Alert.alert(result.skipped ? "Skipped" : "Done", result.message);
                  if (!result.skipped) {
                    void loadDashboard();
                  }
                } catch (err) {
                  Alert.alert("Error", String(err));
                } finally {
                  setSeeding(false);
                }
              }}
              variant="secondary"
            />
          </SurfaceCard>
        ) : null}
      </Screen>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <InputField
              label="Ask Aling AI"
              multiline
              onChangeText={setChatInput}
              placeholder="Example: Anong produkto ang dapat kong i-restock?"
              value={chatInput}
            />
            <ActionButton
              disabled={sendingChat || chatInput.trim().length === 0}
              label={sendingChat ? "Thinking..." : "Send"}
              onPress={() => void handleSendChat()}
            />
          </View>
        }
        onClose={() => setChatVisible(false)}
        subtitle="Store-aware answers powered by Gemini when configured."
        title="Aling AI Chat"
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
              <Text
                style={{
                  color: message.role === "user" ? theme.colors.primaryText : theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {message.text}
              </Text>
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
                Aling AI is thinking...
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </ModalSheet>
    </>
  );
}
