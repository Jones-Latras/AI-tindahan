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
import { useAppLanguage } from "@/contexts/LanguageContext";
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
    return "danger" as const;
  }

  if (level === "attention") {
    return "warning" as const;
  }

  return "success" as const;
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
  const { t } = useAppLanguage();
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
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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
  const selectedEntryOutstanding = selectedEntry
    ? Math.max(0, selectedEntry.amountCents - selectedEntry.amountPaidCents)
    : 0;
  const paymentAmountCents = parseCurrencyToCents(paymentAmount);
  const hasValidPaymentAmount = Number.isFinite(paymentAmountCents) && paymentAmountCents > 0;
  const appliedPaymentCents = hasValidPaymentAmount
    ? Math.min(paymentAmountCents, selectedEntryOutstanding)
    : 0;
  const remainingBalanceCents = Math.max(0, selectedEntryOutstanding - appliedPaymentCents);
  const changeDueCents = hasValidPaymentAmount
    ? Math.max(0, paymentAmountCents - selectedEntryOutstanding)
    : 0;

  const getTrustLabel = useCallback(
    (trustScore: CustomerSummary["trustScore"]) => {
      if (trustScore === "Delikado") {
        return t("palista.trust.delikado");
      }

      if (trustScore === "Bantayan") {
        return t("palista.trust.bantayan");
      }

      if (trustScore === "Maaasahan") {
        return t("palista.trust.maaasahan");
      }

      return t("palista.trust.bago");
    },
    [t],
  );

  const getOverdueLabel = useCallback(
    (level: CustomerSummary["overdueLevel"]) => {
      if (level === "critical") {
        return t("palista.overdue.critical");
      }

      if (level === "attention") {
        return t("palista.overdue.attention");
      }

      return t("palista.overdue.fresh");
    },
    [t],
  );

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return customers;
    }

    return customers.filter((customer) => {
      const searchFields = [
        customer.name,
        customer.phone ?? "",
        customer.trustScore,
        getTrustLabel(customer.trustScore),
      ];

      return searchFields.some((field) => field.toLowerCase().includes(query));
    });
  }, [customers, getTrustLabel, searchTerm]);

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
          : t("palista.alert.saveFailedCustomer");
      Alert.alert(t("palista.alert.saveFailedTitle"), message);
    } finally {
      setSaving(false);
    }
  }, [customerForm.name, customerForm.phone, db, editingCustomer?.id, refreshCustomers, t]);

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
      Alert.alert(t("palista.alert.invalidAmountTitle"), t("palista.alert.invalidUtangAmount"));
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
      const message = error instanceof Error ? error.message : t("palista.alert.saveFailedUtang");
      Alert.alert(t("palista.alert.saveFailedTitle"), message);
    } finally {
      setSaving(false);
    }
  }, [db, refreshLedger, refreshSingleTrustScore, selectedCustomer, t, utangForm.amount, utangForm.description]);

  const handlePayment = useCallback(async () => {
    if (!selectedEntry || !selectedCustomer) {
      return;
    }

    const amountCents = parseCurrencyToCents(paymentAmount);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert(t("palista.alert.invalidAmountTitle"), t("palista.alert.invalidPaymentAmount"));
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
      const message = error instanceof Error ? error.message : t("palista.alert.paymentFailed");
      Alert.alert(t("palista.alert.paymentFailedTitle"), message);
    } finally {
      setSaving(false);
    }
  }, [db, paymentAmount, refreshLedger, refreshSingleTrustScore, selectedCustomer, selectedEntry, t]);

  const handleRefreshAllScores = useCallback(async () => {
    setRefreshingScores(true);

    try {
      await refreshAllCustomerTrustScores(db);
      await refreshCustomers("background");
      Alert.alert(t("palista.alert.refreshDoneTitle"), t("palista.alert.refreshDoneMessage"));
    } catch {
      Alert.alert(t("palista.alert.refreshFailedTitle"), t("palista.alert.refreshFailedMessage"));
    } finally {
      setRefreshingScores(false);
    }
  }, [db, refreshCustomers, t]);

  return (
    <Screen subtitle={t("palista.subtitle")} title={t("palista.title")}>
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
            {t("palista.ledgerTitle")}
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
                {t("palista.updating")}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <ActionButton
            icon={<Feather color={theme.colors.primaryText} name="user-plus" size={16} />}
            label={t("palista.newCustomerButton")}
            onPress={() => openCustomerModal()}
            style={{ flex: 1, minWidth: 150 }}
          />
          <ActionButton
            icon={<Feather color={theme.colors.primary} name="search" size={16} />}
            label={searchVisible ? t("palista.search.hide") : t("palista.search.show")}
            onPress={() => {
              setSearchVisible((current) => {
                if (current) {
                  setSearchTerm("");
                }

                return !current;
              });
            }}
            style={{ flex: 1, minWidth: 150 }}
            variant="ghost"
          />
          <ActionButton
            icon={<Feather color={theme.colors.primary} name="refresh-cw" size={16} />}
            label={refreshingScores ? t("palista.refreshingScores") : t("palista.refreshScores")}
            onPress={() => void handleRefreshAllScores()}
            style={{ flex: 1, minWidth: 150 }}
            variant="secondary"
          />
        </View>
        {searchVisible ? (
          <InputField
            label={t("palista.search.label")}
            onChangeText={setSearchTerm}
            placeholder={t("palista.search.placeholder")}
            value={searchTerm}
          />
        ) : null}
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
            {t("palista.loadingBalances")}
          </Text>
        </SurfaceCard>
      ) : filteredCustomers.length > 0 ? (
        <Animated.View style={{ gap: theme.spacing.md, opacity: customerListOpacity }}>
          {filteredCustomers.map((customer) => {
            const overdueTone = getOverdueTone(customer.overdueLevel);
            const overdueLabel = getOverdueLabel(customer.overdueLevel);
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
                      {customer.phone || t("palista.noPhone")}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: theme.spacing.xs }}>
                    <StatusBadge label={getTrustLabel(customer.trustScore)} tone={getTrustTone(customer.trustScore)} />
                    <StatusBadge label={overdueLabel} tone={overdueTone} />
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
                      {t("palista.outstandingBalance")}
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
                      {t("palista.lastUtang")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {customer.lastUtangDate ? `${daysSince} day(s)` : t("palista.noRecord")}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  <ActionButton
                    label={t("palista.viewHistory")}
                    onPress={() => void openCustomerDetail(customer)}
                    style={{ flex: 1, minWidth: 150 }}
                  />
                  <ActionButton
                    label={t("palista.refreshScore")}
                    onPress={() => void refreshSingleTrustScore(customer.id)}
                    style={{ flex: 1, minWidth: 150 }}
                    variant="secondary"
                  />
                  <ActionButton
                    label={t("palista.editCustomerButton")}
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
            message={customers.length > 0 ? t("palista.search.emptyMessage") : t("palista.emptyMessage")}
            title={customers.length > 0 ? t("palista.search.emptyTitle") : t("palista.noUtangTitle")}
          />
        </Animated.View>
      )}

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? t("palista.save.saving") : editingCustomer ? t("palista.save.updateCustomer") : t("palista.save.createCustomer")}
            onPress={() => void handleSaveCustomer()}
          />
        }
        onClose={() => setCustomerModalVisible(false)}
        subtitle={t("palista.customerSubtitle")}
        title={editingCustomer ? t("palista.customerTitle.edit") : t("palista.customerTitle.new")}
        visible={customerModalVisible}
      >
        <InputField
          label={t("palista.field.customerName")}
          onChangeText={(value) => setCustomerForm((current) => ({ ...current, name: value }))}
          placeholder={t("palista.field.customerNamePlaceholder")}
          value={customerForm.name}
        />
        <InputField
          keyboardType="phone-pad"
          label={t("palista.field.phoneNumber")}
          onChangeText={(value) => setCustomerForm((current) => ({ ...current, phone: value }))}
          placeholder={t("palista.field.optional")}
          value={customerForm.phone}
        />
      </ModalSheet>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              label={t("palista.newUtangButton")}
              onPress={() => {
                setUtangForm(emptyUtangForm);
                setUtangModalVisible(true);
              }}
            />
            <ActionButton label={t("palista.close")} onPress={() => setDetailVisible(false)} variant="ghost" />
          </View>
        }
        onClose={() => setDetailVisible(false)}
        subtitle={
          selectedCustomer
            ? t("palista.historySubtitle.selected", {
                amount: formatCurrencyFromCents(selectedOutstandingTotal),
                name: selectedCustomer.name,
              })
            : t("palista.historySubtitle.empty")
        }
        title={t("palista.historyTitle")}
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
                    {t("palista.lastEntry")}
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
                <StatusBadge label={getTrustLabel(selectedCustomer.trustScore)} tone={getTrustTone(selectedCustomer.trustScore)} />
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
                          {entry.description || t("palista.generalCreditPurchase")}
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
                          {isPaid
                            ? t("palista.paid")
                            : t("palista.paidAmount", {
                                amount: formatCurrencyFromCents(entry.amountPaidCents),
                              })}
                        </Text>
                      </View>
                    </View>

                    {!isPaid ? (
                      <ActionButton
                        label={t("palista.receivePaymentTitle")}
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
                message={t("palista.noHistoryMessage")}
                title={t("palista.noHistoryTitle")}
              />
            )}
          </>
        ) : null}
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? t("palista.save.saving") : t("palista.saveUtang")}
            onPress={() => void handleAddUtang()}
          />
        }
        onClose={() => setUtangModalVisible(false)}
        subtitle={t("palista.bagongUtangSubtitle")}
        title={t("palista.bagongUtangTitle")}
        visible={utangModalVisible}
      >
        <InputField
          keyboardType="decimal-pad"
          label={t("palista.field.amount")}
          onChangeText={(value) => setUtangForm((current) => ({ ...current, amount: value }))}
          placeholder="0.00"
          value={utangForm.amount}
        />
        <InputField
          label={t("palista.field.description")}
          multiline
          onChangeText={(value) => setUtangForm((current) => ({ ...current, description: value }))}
          placeholder={t("palista.field.descriptionPlaceholder")}
          value={utangForm.description}
        />
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={saving}
            label={saving ? t("palista.recording") : t("palista.recordPayment")}
            onPress={() => void handlePayment()}
          />
        }
        onClose={() => setPaymentModalVisible(false)}
        subtitle={
          selectedEntry
            ? t("palista.receivePaymentSubtitle.selected", {
                amount: formatCurrencyFromCents(
                  Math.max(0, selectedEntry.amountCents - selectedEntry.amountPaidCents),
                ),
              })
            : t("palista.receivePaymentSubtitle.empty")
        }
        title={t("palista.receivePaymentTitle")}
        visible={paymentModalVisible}
      >
        <InputField
          keyboardType="decimal-pad"
          label={t("palista.field.paymentAmount")}
          onChangeText={setPaymentAmount}
          placeholder="0.00"
          value={paymentAmount}
        />
        {selectedEntry ? (
          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {t("palista.paymentSummary.title")}
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {t("palista.paymentSummary.outstanding")}
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {formatCurrencyFromCents(selectedEntryOutstanding)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {t("palista.paymentSummary.received")}
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {formatCurrencyFromCents(hasValidPaymentAmount ? paymentAmountCents : 0)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {t("palista.paymentSummary.applied")}
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {formatCurrencyFromCents(appliedPaymentCents)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {t("palista.paymentSummary.remaining")}
              </Text>
              <Text
                style={{
                  color: remainingBalanceCents === 0 ? theme.colors.success : theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {formatCurrencyFromCents(remainingBalanceCents)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {t("palista.paymentSummary.change")}
              </Text>
              <Text
                style={{
                  color: changeDueCents > 0 ? theme.colors.warning : theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {formatCurrencyFromCents(changeDueCents)}
              </Text>
            </View>
          </SurfaceCard>
        ) : null}
      </ModalSheet>
    </Screen>
  );
}
