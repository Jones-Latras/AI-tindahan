import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getHomeMetrics, getProductSalesVelocity } from "@/db/repositories";
import { chatWithAlingAi, getOrCreateHomeAiBrief, isGeminiReady } from "@/services/ai";
import type { ChatMessage, HomeAiBrief, HomeMetrics, ProductVelocity } from "@/types/models";
import { formatCurrencyFromCents } from "@/utils/money";

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
  const router = useRouter();
  const { theme } = useAppTheme();
  const [metrics, setMetrics] = useState<HomeMetrics | null>(null);
  const [brief, setBrief] = useState<HomeAiBrief | null>(null);
  const [velocity, setVelocity] = useState<ProductVelocity[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    createChatMessage(
      "assistant",
      "Kumusta. I can help explain sales, restock pressure, utang risk, and overall store performance in Taglish.",
    ),
  ]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setAiLoading(true);

    try {
      const [nextMetrics, nextBrief, nextVelocity] = await Promise.all([
        getHomeMetrics(db),
        getOrCreateHomeAiBrief(db),
        getProductSalesVelocity(db),
      ]);
      setMetrics(nextMetrics);
      setBrief(nextBrief);
      setVelocity(nextVelocity.filter((item) => item.unitsPerDay > 0 && (item.daysUntilOutOfStock ?? Infinity) <= 7).slice(0, 5));
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
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
        subtitle="Offline-first operations with an optional Gemini-powered assistant layered on top."
        title="TindaHan AI"
      >
        <SurfaceCard
          style={{
            backgroundColor: theme.colors.surface,
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center", flexWrap: "wrap" }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 26,
                  fontWeight: "700",
                }}
              >
                Store Pulse
              </Text>
              <StatusBadge label={isGeminiReady() ? "Gemini Ready" : "AI Not Configured"} tone={isGeminiReady() ? "primary" : "neutral"} />
            </View>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 15,
                lineHeight: 22,
              }}
            >
              Secure local storage, clean checkout flow, AI-powered insights, and a theme system that keeps every screen consistent.
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <ActionButton
              icon={<Feather color={theme.colors.primaryText} name="shopping-bag" size={16} />}
              label="Open Benta"
              onPress={() => router.push("/benta")}
              style={{ flex: 1, minWidth: 160 }}
            />
            <ActionButton
              icon={<Feather color={theme.colors.primary} name="package" size={16} />}
              label="Manage Products"
              onPress={() => router.push("/produkto")}
              style={{ flex: 1, minWidth: 160 }}
              variant="secondary"
            />
            <ActionButton
              icon={<Feather color={theme.colors.text} name="users" size={16} />}
              label="Open Palista"
              onPress={() => router.push("/palista")}
              style={{ flex: 1, minWidth: 160 }}
              variant="ghost"
            />
          </View>
        </SurfaceCard>

        {aiLoading ? (
          <SurfaceCard style={{ gap: theme.spacing.md }}>
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
          <SurfaceCard style={{ gap: theme.spacing.md }}>
            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: 24,
                    fontWeight: "700",
                  }}
                >
                  Aling AI Daily Brief
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Fresh insight for today&apos;s store rhythm.
                </Text>
              </View>
              <StatusBadge label={brief.source === "ai" ? "Live Insight" : "Fallback"} tone={brief.source === "ai" ? "primary" : "neutral"} />
            </View>

            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 15,
                lineHeight: 24,
              }}
            >
              {brief.insight}
            </Text>

            <View style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Restock suggestions
              </Text>
              {brief.restockSuggestions.length > 0 ? (
                brief.restockSuggestions.map((suggestion) => (
                  <View
                    key={suggestion}
                    style={{
                      backgroundColor: theme.colors.primaryMuted,
                      borderRadius: theme.radius.sm,
                      padding: theme.spacing.md,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.primary,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {suggestion}
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
                  No urgent restock recommendations right now.
                </Text>
              )}
            </View>
          </SurfaceCard>
        ) : null}

        {loading ? (
          <SurfaceCard style={{ alignItems: "center", gap: theme.spacing.md }}>
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
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
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

            <SurfaceCard style={{ gap: theme.spacing.md }}>
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

            <SurfaceCard style={{ gap: theme.spacing.md }}>
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

            <SurfaceCard style={{ gap: theme.spacing.md }}>
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

            <SurfaceCard style={{ gap: theme.spacing.md }}>
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
