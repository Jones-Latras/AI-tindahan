import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Text,
  UIManager,
  View,
} from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  addUtangEntry,
  applyUtangPayment,
  listCustomerLedger,
  listCustomersWithBalances,
  saveCustomer,
} from "@/db/repositories";
import { refreshAllCustomerTrustScores, refreshCustomerTrustScore } from "@/services/ai";
import type { CustomerSummary, UtangLedgerEntry } from "@/types/models";
import { formatDateLabel, getDaysBetween } from "@/utils/date";
import { formatCurrencyFromCents, parseCurrencyToCents } from "@/utils/money";

type CustomerFormState = {
  name: string;
  phone: string;
};

type UtangFormState = {
  amount: string;
  description: string;
};

const emptyCustomerForm: CustomerFormState = {
  name: "",
  phone: "",
};

const emptyUtangForm: UtangFormState = {
  amount: "",
  description: "",
};

function getOverdueTone(level: CustomerSummary["overdueLevel"]) {
  if (level === "critical") {
    return { label: "2+ weeks", tone: "danger" as const };
  }

  if (level === "attention") {
    return { label: "1 week", tone: "warning" as const };
  }

  return { label: "Fresh", tone: "success" as const };
}

function getTrustTone(trustScore: CustomerSummary["trustScore"]) {
  if (trustScore === "Delikado") {
    return "danger" as const;
  }

  if (trustScore === "Bantayan") {
    return "warning" as const;
  }

  if (trustScore === "Maaasahan") {
    return "success" as const;
  }

  return "neutral" as const;
}

export default function PalistaScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<UtangLedgerEntry[]>([]);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [utangModalVisible, setUtangModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerSummary | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<UtangLedgerEntry | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [utangForm, setUtangForm] = useState<UtangFormState>(emptyUtangForm);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingScores, setRefreshingScores] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);
  const hasLoadedCustomersRef = useRef(false);
  const customerListOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const animateCustomerList = useCallback(
    (toValue: number, duration: number) => {
      Animated.timing(customerListOpacity, {
        duration,
        easing: Easing.out(Easing.cubic),
        toValue,
        useNativeDriver: true,
      }).start();
    },
    [customerListOpacity],
  );

  const refreshCustomers = useCallback(
    async (mode: "foreground" | "background" = "background") => {
      const showSkeleton = mode === "foreground" && !hasLoadedCustomersRef.current;

      if (showSkeleton) {
        setLoading(true);
      } else {
        setRefreshingList(true);
        animateCustomerList(0.86, 120);
      }

      try {
        const nextCustomers = await listCustomersWithBalances(db);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setCustomers(nextCustomers);
        setSelectedCustomer((currentSelected) =>
          currentSelected
            ? nextCustomers.find((customer) => customer.id === currentSelected.id) ?? null
            : currentSelected,
        );
        hasLoadedCustomersRef.current = true;
      } finally {
        if (showSkeleton) {
          setLoading(false);
        } else {
          setRefreshingList(false);
          animateCustomerList(1, 200);
        }
      }
    },
    [animateCustomerList, db],
  );

  const refreshLedger = useCallback(
    async (customerId: number) => {
      const nextLedger = await listCustomerLedger(db, customerId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setLedgerEntries(nextLedger);
    },
    [db],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshCustomers(hasLoadedCustomersRef.current ? "background" : "foreground");
    }, [refreshCustomers]),
  );

  const selectedOutstandingTotal = useMemo(
    () =>
      ledgerEntries.reduce((total, entry) => total + Math.max(0, entry.amountCents - entry.amountPaidCents), 0),
    [ledgerEntries],
  );

  const openCustomerModal = useCallback((customer?: CustomerSummary) => {
    setEditingCustomer(customer ?? null);
    setCustomerForm({
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
    });
    setCustomerModalVisible(true);
  }, []);

  const openCustomerDetail = useCallback(
    async (customer: CustomerSummary) => {
      setSelectedCustomer(customer);
      setDetailVisible(true);
      await refreshLedger(customer.id);
    },
    [refreshLedger],
  );

  const handleSaveCustomer = useCallback(async () => {
    setSaving(true);

    try {
      await saveCustomer(
        db,
        {
          name: customerForm.name,
          phone: customerForm.phone,
        },
        editingCustomer?.id,
      );
      setCustomerModalVisible(false);
      setEditingCustomer(null);
      setCustomerForm(emptyCustomerForm);
      await refreshCustomers("background");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The customer could not be saved. Please review the form values.";
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  }, [customerForm.name, customerForm.phone, db, editingCustomer?.id, refreshCustomers]);

  const refreshSingleTrustScore = useCallback(
    async (customerId: number) => {
      await refreshCustomerTrustScore(db, customerId);
      await refreshCustomers("background");
    },
    [db, refreshCustomers],
  );

  const handleAddUtang = useCallback(async () => {
    if (!selectedCustomer) {
      return;
    }

    const amountCents = parseCurrencyToCents(utangForm.amount);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert("Invalid amount", "Enter a valid peso amount for the utang entry.");
      return;
    }

    setSaving(true);

    try {
      await addUtangEntry(db, {
        customerId: selectedCustomer.id,
        amountCents,
        description: utangForm.description,
      });

      setUtangModalVisible(false);
      setUtangForm(emptyUtangForm);
      await refreshSingleTrustScore(selectedCustomer.id);
      await refreshLedger(selectedCustomer.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The utang entry could not be saved.";
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  }, [db, refreshLedger, refreshSingleTrustScore, selectedCustomer, utangForm.amount, utangForm.description]);

  const handlePayment = useCallback(async () => {
    if (!selectedEntry || !selectedCustomer) {
      return;
    }

    const amountCents = parseCurrencyToCents(paymentAmount);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert("Invalid amount", "Enter a valid peso amount for the payment.");
      return;
    }

    setSaving(true);

    try {
      await applyUtangPayment(db, selectedEntry.id, amountCents);
      setPaymentModalVisible(false);
      setSelectedEntry(null);
      setPaymentAmount("");
      await refreshSingleTrustScore(selectedCustomer.id);
      await refreshLedger(selectedCustomer.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The payment could not be recorded.";
      Alert.alert("Payment failed", message);
    } finally {
      setSaving(false);
    }
  }, [db, paymentAmount, refreshLedger, refreshSingleTrustScore, selectedCustomer, selectedEntry]);

  const handleRefreshAllScores = useCallback(async () => {
    setRefreshingScores(true);

    try {
      await refreshAllCustomerTrustScores(db);
      await refreshCustomers("background");
      Alert.alert("AI scores refreshed", "Customer trust scores have been updated.");
    } catch {
      Alert.alert("Refresh failed", "Trust scores could not be refreshed right now.");
    } finally {
      setRefreshingScores(false);
    }
  }, [db, refreshCustomers]);

  return (
    <Screen subtitle="Track customers, outstanding balances, partial payments, and AI trust score updates." title="Palista">
      <SurfaceCard style={{ gap: theme.spacing.md }}>
        <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
          <Text
            style={{
              color: theme.colors.text,
              flex: 1,
              fontFamily: theme.typography.display,
              fontSize: 24,
              fontWeight: "700",
            }}
          >
            Customer Ledger
          </Text>
          {refreshingList ? (
            <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.xs }}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Updating
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <ActionButton
            icon={<Feather color={theme.colors.primaryText} name="user-plus" size={16} />}
            label="Bagong Customer"
            onPress={() => openCustomerModal()}
            style={{ flex: 1, minWidth: 150 }}
          />
          <ActionButton
            icon={<Feather color={theme.colors.primary} name="refresh-cw" size={16} />}
            label={refreshingScores ? "Refreshing..." : "Refresh AI Scores"}
            onPress={() => void handleRefreshAllScores()}
            style={{ flex: 1, minWidth: 150 }}
            variant="secondary"
          />
        </View>
      </SurfaceCard>

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
            Loading customer balances...
          </Text>
        </SurfaceCard>
      ) : customers.length > 0 ? (
        <Animated.View style={{ gap: theme.spacing.md, opacity: customerListOpacity }}>
          {customers.map((customer) => {
            const overdue = getOverdueTone(customer.overdueLevel);
            const daysSince = getDaysBetween(customer.lastUtangDate);

            return (
              <SurfaceCard key={customer.id} style={{ gap: theme.spacing.md }}>
                <View style={{ alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.display,
                        fontSize: 22,
                        fontWeight: "700",
                      }}
                    >
                      {customer.name}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                      }}
                    >
                      {customer.phone || "No phone number"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: theme.spacing.xs }}>
                    <StatusBadge label={customer.trustScore} tone={getTrustTone(customer.trustScore)} />
                    <StatusBadge label={overdue.label} tone={overdue.tone} />
                  </View>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                      }}
                    >
                      Outstanding balance
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.display,
                        fontSize: 26,
                        fontWeight: "700",
                      }}
                    >
                      {formatCurrencyFromCents(customer.balanceCents)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                      }}
                    >
                      Last utang
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {customer.lastUtangDate ? `${daysSince} day(s)` : "No record"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  <ActionButton
                    label="View History"
                    onPress={() => void openCustomerDetail(customer)}
                    style={{ flex: 1, minWidth: 150 }}
                  />
                  <ActionButton
                    label="Refresh Score"
                    onPress={() => void refreshSingleTrustScore(customer.id)}
                    style={{ flex: 1, minWidth: 150 }}
                    variant="secondary"
                  />
                  <ActionButton
                    label="Edit Customer"
                    onPress={() => openCustomerModal(customer)}
                    style={{ flex: 1, minWidth: 150 }}
                    variant="ghost"
                  />
                </View>
              </SurfaceCard>
            );
          })}
        </Animated.View>
      ) : (
        <Animated.View style={{ opacity: customerListOpacity }}>
          <EmptyState
            icon="book-open"
            message="Add your first customer and start logging balances instead of relying on a handwritten notebook."
            title="No Utang Records Yet"
          />
        </Animated.View>
      )}

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? "Saving..." : editingCustomer ? "Update Customer" : "Create Customer"}
            onPress={() => void handleSaveCustomer()}
          />
        }
        onClose={() => setCustomerModalVisible(false)}
        subtitle="A clean customer list makes credit tracking much easier later on."
        title={editingCustomer ? "Edit Customer" : "New Customer"}
        visible={customerModalVisible}
      >
        <InputField
          label="Customer name"
          onChangeText={(value) => setCustomerForm((current) => ({ ...current, name: value }))}
          placeholder="Example: Aling Nena"
          value={customerForm.name}
        />
        <InputField
          keyboardType="phone-pad"
          label="Phone number"
          onChangeText={(value) => setCustomerForm((current) => ({ ...current, phone: value }))}
          placeholder="Optional"
          value={customerForm.phone}
        />
      </ModalSheet>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              label="Bagong Utang"
              onPress={() => {
                setUtangForm(emptyUtangForm);
                setUtangModalVisible(true);
              }}
            />
            <ActionButton label="Close" onPress={() => setDetailVisible(false)} variant="ghost" />
          </View>
        }
        onClose={() => setDetailVisible(false)}
        subtitle={
          selectedCustomer
            ? `${selectedCustomer.name} | Outstanding ${formatCurrencyFromCents(selectedOutstandingTotal)}`
            : undefined
        }
        title="Customer History"
        visible={detailVisible}
      >
        {selectedCustomer ? (
          <>
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    Last entry
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    {formatDateLabel(selectedCustomer.lastUtangDate)}
                  </Text>
                </View>
                <StatusBadge label={selectedCustomer.trustScore} tone={getTrustTone(selectedCustomer.trustScore)} />
              </View>
            </SurfaceCard>

            {ledgerEntries.length > 0 ? (
              ledgerEntries.map((entry) => {
                const outstanding = Math.max(0, entry.amountCents - entry.amountPaidCents);
                const isPaid = outstanding === 0;

                return (
                  <SurfaceCard key={entry.id} style={{ gap: theme.spacing.md }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, gap: 6, paddingRight: theme.spacing.md }}>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontFamily: theme.typography.body,
                            fontSize: 15,
                            fontWeight: "700",
                          }}
                        >
                          {entry.description || "General credit purchase"}
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 13,
                          }}
                        >
                          {formatDateLabel(entry.createdAt)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontFamily: theme.typography.body,
                            fontSize: 15,
                            fontWeight: "700",
                          }}
                        >
                          {formatCurrencyFromCents(outstanding)}
                        </Text>
                        <Text
                          style={{
                            color: isPaid ? theme.colors.success : theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          {isPaid ? "Paid" : `Paid ${formatCurrencyFromCents(entry.amountPaidCents)}`}
                        </Text>
                      </View>
                    </View>

                    {!isPaid ? (
                      <ActionButton
                        label="Receive Payment"
                        onPress={() => {
                          setSelectedEntry(entry);
                          setPaymentAmount("");
                          setPaymentModalVisible(true);
                        }}
                        variant="secondary"
                      />
                    ) : null}
                  </SurfaceCard>
                );
              })
            ) : (
              <EmptyState
                icon="file-text"
                message="No utang entries for this customer yet. Add the first one from the button below."
                title="No History Yet"
              />
            )}
          </>
        ) : null}
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? "Saving..." : "Save Utang"}
            onPress={() => void handleAddUtang()}
          />
        }
        onClose={() => setUtangModalVisible(false)}
        subtitle="Record what was borrowed and how much is still owed."
        title="Bagong Utang"
        visible={utangModalVisible}
      >
        <InputField
          keyboardType="decimal-pad"
          label="Amount"
          onChangeText={(value) => setUtangForm((current) => ({ ...current, amount: value }))}
          placeholder="0.00"
          value={utangForm.amount}
        />
        <InputField
          label="Description"
          multiline
          onChangeText={(value) => setUtangForm((current) => ({ ...current, description: value }))}
          placeholder="Examples: bigas, noodles, softdrinks"
          value={utangForm.description}
        />
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? "Recording..." : "Record Payment"}
            onPress={() => void handlePayment()}
          />
        }
        onClose={() => setPaymentModalVisible(false)}
        subtitle={
          selectedEntry
            ? `Outstanding ${formatCurrencyFromCents(
                Math.max(0, selectedEntry.amountCents - selectedEntry.amountPaidCents),
              )}`
            : undefined
        }
        title="Receive Payment"
        visible={paymentModalVisible}
      >
        <InputField
          keyboardType="decimal-pad"
          label="Payment amount"
          onChangeText={setPaymentAmount}
          placeholder="0.00"
          value={paymentAmount}
        />
      </ModalSheet>
    </Screen>
  );
}
