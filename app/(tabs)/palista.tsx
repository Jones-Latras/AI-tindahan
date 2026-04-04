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
  Pressable,
  Text,
  TextInput,
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
  applyContainerReturn,
  applyUtangPayment,
  listCustomerLedger,
  listOpenContainerReturnsByCustomer,
  listCustomersWithBalances,
  saveCustomer,
} from "@/db/repositories";
import { refreshAllCustomerTrustScores, refreshCustomerTrustScore } from "@/services/ai";
import type { ContainerReturnEvent, CustomerSummary, UtangLedgerEntry } from "@/types/models";
import { formatDateLabel, formatDateTimeLabel, getDaysBetween } from "@/utils/date";
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
  const { language, t } = useAppLanguage();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<UtangLedgerEntry[]>([]);
  const [containerReturns, setContainerReturns] = useState<ContainerReturnEvent[]>([]);
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
  const [returningContainerId, setReturningContainerId] = useState<number | null>(null);
  const [refreshingScores, setRefreshingScores] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);
  const hasLoadedCustomersRef = useRef(false);
  const customerListOpacity = useRef(new Animated.Value(1)).current;
  const compactCustomerControlsStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  } as const;

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
        setExpandedCustomerId((currentExpanded) =>
          currentExpanded !== null && nextCustomers.some((customer) => customer.id === currentExpanded) ? currentExpanded : null,
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
      setSelectedEntry((currentSelected) =>
        currentSelected
          ? nextLedger.find((entry) => entry.id === currentSelected.id) ?? null
          : currentSelected,
      );
    },
    [db],
  );

  const refreshContainerReturns = useCallback(
    async (customerId: number) => {
      const nextReturns = await listOpenContainerReturnsByCustomer(db, customerId);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setContainerReturns(nextReturns);
    },
    [db],
  );

  const refreshCustomerDetail = useCallback(
    async (customerId: number) => {
      await Promise.all([refreshLedger(customerId), refreshContainerReturns(customerId)]);
    },
    [refreshContainerReturns, refreshLedger],
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
  const outstandingBottleCount = useMemo(
    () =>
      containerReturns.reduce(
        (total, event) => total + Math.max(0, event.quantityOut - event.quantityReturned),
        0,
      ),
    [containerReturns],
  );
  const dateLocale = language === "english" ? "en-PH" : "fil-PH";
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
  const quickPaymentOptions = selectedEntryOutstanding > 0
    ? [5000, 10000, 20000, selectedEntryOutstanding]
        .filter((amount, index, amounts) => amount > 0 && amounts.indexOf(amount) === index)
    : [];

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
  const getCustomerActivityLabel = useCallback(
    (lastUtangDate: string | null) => {
      if (!lastUtangDate) {
        return null;
      }

      const daysSince = getDaysBetween(lastUtangDate);
      if (daysSince <= 0) {
        return t("palista.lastActive.today");
      }

      return t("palista.lastCreditDate", { date: formatDateLabel(lastUtangDate) });
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

  const toggleCustomerExpanded = useCallback((customerId: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCustomerId((currentExpanded) => (currentExpanded === customerId ? null : customerId));
  }, []);

  const openCustomerDetail = useCallback(
    async (customer: CustomerSummary) => {
      setSelectedCustomer(customer);
      setDetailVisible(true);
      await refreshCustomerDetail(customer.id);
    },
    [refreshCustomerDetail],
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
      await refreshCustomerDetail(selectedCustomer.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("palista.alert.saveFailedUtang");
      Alert.alert(t("palista.alert.saveFailedTitle"), message);
    } finally {
      setSaving(false);
    }
  }, [db, refreshCustomerDetail, refreshSingleTrustScore, selectedCustomer, t, utangForm.amount, utangForm.description]);

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
      await refreshCustomerDetail(selectedCustomer.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("palista.alert.paymentFailed");
      Alert.alert(t("palista.alert.paymentFailedTitle"), message);
    } finally {
      setSaving(false);
    }
  }, [db, paymentAmount, refreshCustomerDetail, refreshSingleTrustScore, selectedCustomer, selectedEntry, t]);

  const handleContainerReturn = useCallback(
    async (event: ContainerReturnEvent, quantityToReturn: number) => {
      if (!selectedCustomer) {
        return;
      }

      setReturningContainerId(event.id);

      try {
        await applyContainerReturn(db, event.id, quantityToReturn);
        await refreshCustomerDetail(selectedCustomer.id);
    } catch (error) {
      Alert.alert(
          t("palista.alert.containerReturnFailedTitle"),
          error instanceof Error ? error.message : t("palista.alert.containerReturnFailedMessage"),
      );
    } finally {
      setReturningContainerId(null);
      }
    },
    [db, refreshCustomerDetail, selectedCustomer],
  );

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
    <Screen title={t("palista.title")}>
      <SurfaceCard style={compactCustomerControlsStyle}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.sm }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              flex: 1,
              flexDirection: "row",
              minHeight: 52,
              paddingHorizontal: theme.spacing.md,
            }}
          >
            <Feather color={theme.colors.textSoft} name="search" size={16} />
            <TextInput
              allowFontScaling={false}
              onChangeText={setSearchTerm}
              placeholder={t("palista.search.placeholder")}
              placeholderTextColor={theme.colors.textSoft}
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 14,
                minHeight: 50,
                paddingLeft: theme.spacing.sm,
              }}
              value={searchTerm}
            />
          </View>
          <Pressable
            accessibilityLabel={t("palista.newCustomerButton")}
            onPress={() => openCustomerModal()}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.primary,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
              width: 44,
            })}
          >
            <Feather color={theme.colors.primaryText} name="plus" size={14} />
          </Pressable>
          <Pressable
            accessibilityLabel={t("palista.refreshScores")}
            disabled={refreshingScores}
            onPress={() => void handleRefreshAllScores()}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
              width: 44,
            })}
          >
            {refreshingScores || refreshingList ? (
              <ActivityIndicator color={theme.colors.primary} size="small" />
            ) : (
              <Feather color={theme.colors.primary} name="refresh-cw" size={16} />
            )}
          </Pressable>
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
            {t("palista.loadingBalances")}
          </Text>
        </SurfaceCard>
      ) : filteredCustomers.length > 0 ? (
        <Animated.View style={{ gap: theme.spacing.sm, opacity: customerListOpacity }}>
          {filteredCustomers.map((customer) => {
            const overdueTone = getOverdueTone(customer.overdueLevel);
            const overdueLabel = getOverdueLabel(customer.overdueLevel);
            const isExpanded = expandedCustomerId === customer.id;
            const activityLabel = getCustomerActivityLabel(customer.lastUtangDate);

            return (
              <Pressable
                key={customer.id}
                onPress={() => toggleCustomerExpanded(customer.id)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.96 : 1,
                })}
              >
                <SurfaceCard style={{ gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: theme.spacing.sm,
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, gap: theme.spacing.xs, paddingRight: theme.spacing.sm }}>
                      <View
                        style={{
                          alignItems: "center",
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontFamily: theme.typography.display,
                            fontSize: 18,
                            fontWeight: "600",
                          }}
                        >
                          {customer.name}
                        </Text>
                        <StatusBadge label={getTrustLabel(customer.trustScore)} tone={getTrustTone(customer.trustScore)} />
                        <StatusBadge label={overdueLabel} tone={overdueTone} />
                      </View>
                      {customer.phone ? (
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                          }}
                          numberOfLines={1}
                        >
                          {customer.phone}
                        </Text>
                      ) : null}
                      {activityLabel ? (
                        <Text
                          style={{
                            color: theme.colors.textSoft,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                          }}
                          numberOfLines={1}
                        >
                          {activityLabel}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.display,
                          fontSize: 20,
                          fontWeight: "600",
                        }}
                        numberOfLines={1}
                      >
                        {formatCurrencyFromCents(customer.balanceCents)}
                      </Text>
                      <Feather
                        color={theme.colors.textSoft}
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                      />
                    </View>
                  </View>

                  {isExpanded ? (
                    <View
                      style={{
                        borderTopColor: theme.colors.border,
                        borderTopWidth: 1,
                        gap: theme.spacing.sm,
                        paddingTop: theme.spacing.md,
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
                        {t("palista.quickActions")}
                      </Text>

                      <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
                        <Pressable
                          onPress={() => void openCustomerDetail(customer)}
                          style={({ pressed }) => ({
                            alignItems: "center",
                            backgroundColor: theme.colors.primaryMuted,
                            borderColor: theme.colors.primaryMuted,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            flex: 1,
                            flexDirection: "row",
                            gap: 6,
                            justifyContent: "center",
                            opacity: pressed ? 0.88 : 1,
                            paddingHorizontal: 6,
                            paddingVertical: 7,
                          })}
                        >
                          <Feather color={theme.colors.primary} name="list" size={13} />
                          <Text
                            style={{
                              color: theme.colors.primary,
                              fontFamily: theme.typography.body,
                              fontSize: 10,
                              fontWeight: "600",
                            }}
                            numberOfLines={1}
                          >
                            {t("palista.quickAction.history")}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void refreshSingleTrustScore(customer.id)}
                          style={({ pressed }) => ({
                            alignItems: "center",
                            backgroundColor: theme.colors.surfaceMuted,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            flex: 1,
                            flexDirection: "row",
                            gap: 6,
                            justifyContent: "center",
                            opacity: pressed ? 0.88 : 1,
                            paddingHorizontal: 6,
                            paddingVertical: 7,
                          })}
                        >
                          <Feather color={theme.colors.textMuted} name="refresh-cw" size={13} />
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontFamily: theme.typography.body,
                              fontSize: 10,
                              fontWeight: "600",
                            }}
                            numberOfLines={1}
                          >
                            {t("palista.quickAction.refresh")}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => openCustomerModal(customer)}
                          style={({ pressed }) => ({
                            alignItems: "center",
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radius.pill,
                            borderWidth: 1,
                            flex: 1,
                            flexDirection: "row",
                            gap: 6,
                            justifyContent: "center",
                            opacity: pressed ? 0.88 : 1,
                            paddingHorizontal: 6,
                            paddingVertical: 7,
                          })}
                        >
                          <Feather color={theme.colors.textMuted} name="edit-2" size={13} />
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontFamily: theme.typography.body,
                              fontSize: 10,
                              fontWeight: "600",
                            }}
                            numberOfLines={1}
                          >
                            {t("palista.quickAction.edit")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                </SurfaceCard>
              </Pressable>
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
                      fontWeight: "600",
                    }}
                  >
                    {formatDateLabel(selectedCustomer.lastUtangDate)}
                  </Text>
                </View>
                <StatusBadge label={getTrustLabel(selectedCustomer.trustScore)} tone={getTrustTone(selectedCustomer.trustScore)} />
              </View>
            </SurfaceCard>

            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {t("palista.containerReturns.title")}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {outstandingBottleCount === 0
                      ? t("palista.containerReturns.outstanding.none")
                      : outstandingBottleCount === 1
                        ? t("palista.containerReturns.outstanding.single")
                        : t("palista.containerReturns.outstanding.plural", { count: outstandingBottleCount })}
                  </Text>
                </View>
                <StatusBadge
                  label={
                    outstandingBottleCount > 0
                      ? t("palista.containerReturns.status.pending")
                      : t("palista.containerReturns.status.clear")
                  }
                  tone={outstandingBottleCount > 0 ? "warning" : "success"}
                />
              </View>

              {containerReturns.length > 0 ? (
                containerReturns.map((event) => {
                  const outstandingQuantity = Math.max(0, event.quantityOut - event.quantityReturned);

                  return (
                    <View
                      key={event.id}
                      style={{
                        borderTopColor: theme.colors.border,
                        borderTopWidth: 1,
                        gap: theme.spacing.sm,
                        paddingTop: theme.spacing.sm,
                      }}
                    >
                      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontFamily: theme.typography.body,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            {event.containerLabelSnapshot}
                          </Text>
                          <Text
                            style={{
                              color: theme.colors.textMuted,
                              fontFamily: theme.typography.body,
                              fontSize: 12,
                            }}
                          >
                            {event.productNameSnapshot} • {formatDateLabel(event.createdAt)}
                          </Text>
                        </View>
                        <StatusBadge
                          label={t("palista.containerReturns.left", { count: outstandingQuantity })}
                          tone={outstandingQuantity > 0 ? "warning" : "success"}
                        />
                      </View>

                      <Text
                        style={{
                          color: theme.colors.textSoft,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                        }}
                      >
                        {event.quantityReturned > 0
                          ? t("palista.containerReturns.returnedProgress", {
                              returned: event.quantityReturned,
                              total: event.quantityOut,
                            })
                          : t("palista.containerReturns.toReturn", { count: event.quantityOut })}
                      </Text>

                      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                        {outstandingQuantity > 1 ? (
                          <ActionButton
                            disabled={returningContainerId === event.id}
                            label={
                              returningContainerId === event.id
                                ? t("palista.containerReturns.saving")
                                : t("palista.containerReturns.returnOne")
                            }
                            onPress={() => void handleContainerReturn(event, 1)}
                            style={{ flex: 1 }}
                            variant="secondary"
                          />
                        ) : null}
                        <ActionButton
                          disabled={returningContainerId === event.id}
                          label={
                            returningContainerId === event.id
                              ? t("palista.containerReturns.saving")
                              : outstandingQuantity === 1
                                ? t("palista.containerReturns.markReturned")
                                : t("palista.containerReturns.returnAll")
                          }
                          onPress={() => void handleContainerReturn(event, outstandingQuantity)}
                          style={{ flex: 1 }}
                          variant="ghost"
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text
                  style={{
                    color: theme.colors.textSoft,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {t("palista.containerReturns.empty")}
                </Text>
              )}
            </SurfaceCard>

            {ledgerEntries.length > 0 ? (
              ledgerEntries.map((entry) => {
                const outstanding = Math.max(0, entry.amountCents - entry.amountPaidCents);
                const isPaid = outstanding === 0;
                const totalPaidLabel = entry.amountPaidCents > 0
                  ? t("palista.paidAmount", {
                      amount: formatCurrencyFromCents(entry.amountPaidCents),
                    })
                  : t("palista.noPaymentsYet");

                return (
                  <SurfaceCard key={entry.id} style={{ gap: theme.spacing.md }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, gap: 6, paddingRight: theme.spacing.md }}>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontFamily: theme.typography.body,
                            fontSize: 15,
                            fontWeight: "600",
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
                            fontWeight: "600",
                          }}
                        >
                          {formatCurrencyFromCents(outstanding)}
                        </Text>
                        <Text
                          style={{
                            color: isPaid ? theme.colors.success : theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {isPaid
                            ? t("palista.paid")
                            : totalPaidLabel}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        borderTopColor: theme.colors.border,
                        borderTopWidth: 1,
                        gap: theme.spacing.sm,
                        paddingTop: theme.spacing.sm,
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
                        {t("palista.paymentHistoryTitle")}
                      </Text>

                      <View style={{ gap: theme.spacing.xs }}>
                        <View
                          style={{
                            alignItems: "center",
                            flexDirection: "row",
                            gap: theme.spacing.sm,
                          }}
                        >
                          <View
                            style={{
                              alignItems: "center",
                              backgroundColor: theme.colors.primaryMuted,
                              borderRadius: theme.radius.pill,
                              height: 28,
                              justifyContent: "center",
                              width: 28,
                            }}
                          >
                            <Feather color={theme.colors.primary} name="file-text" size={13} />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text
                              style={{
                                color: theme.colors.text,
                                fontFamily: theme.typography.body,
                                fontSize: 13,
                                fontWeight: "600",
                              }}
                            >
                              {t("palista.timeline.creditLogged")}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.textMuted,
                                fontFamily: theme.typography.body,
                                fontSize: 12,
                              }}
                            >
                              {formatDateTimeLabel(entry.createdAt, dateLocale)}
                            </Text>
                          </View>
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontFamily: theme.typography.body,
                              fontSize: 13,
                              fontWeight: "600",
                            }}
                          >
                            {formatCurrencyFromCents(entry.amountCents)}
                          </Text>
                        </View>

                        {entry.payments.length > 0 ? (
                          entry.payments.map((payment) => (
                            <View
                              key={payment.id}
                              style={{
                                alignItems: "center",
                                flexDirection: "row",
                                gap: theme.spacing.sm,
                              }}
                            >
                              <View
                                style={{
                                  alignItems: "center",
                                  backgroundColor: theme.colors.successMuted,
                                  borderRadius: theme.radius.pill,
                                  height: 28,
                                  justifyContent: "center",
                                  width: 28,
                                }}
                              >
                                <Feather color={theme.colors.success} name="arrow-down-left" size={13} />
                              </View>
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text
                                  style={{
                                    color: theme.colors.text,
                                    fontFamily: theme.typography.body,
                                    fontSize: 13,
                                    fontWeight: "600",
                                  }}
                                >
                                  {t("palista.timeline.paymentReceived")}
                                </Text>
                                <Text
                                  style={{
                                    color: theme.colors.textMuted,
                                    fontFamily: theme.typography.body,
                                    fontSize: 12,
                                  }}
                                >
                                  {formatDateTimeLabel(payment.createdAt, dateLocale)}
                                </Text>
                              </View>
                              <Text
                                style={{
                                  color: theme.colors.success,
                                  fontFamily: theme.typography.body,
                                  fontSize: 13,
                                  fontWeight: "600",
                                }}
                              >
                                {formatCurrencyFromCents(payment.amountCents)}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <Text
                            style={{
                              color: theme.colors.textSoft,
                              fontFamily: theme.typography.body,
                              fontSize: 12,
                              lineHeight: 18,
                              paddingLeft: 38,
                            }}
                          >
                            {t("palista.paymentHistoryEmpty")}
                          </Text>
                        )}
                      </View>
                    </View>

                    {!isPaid ? (
                      <ActionButton
                        label={t("palista.logPayment")}
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
        {quickPaymentOptions.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {quickPaymentOptions.map((amountCents, index) => {
              const isFullAmount = amountCents === selectedEntryOutstanding;
              const label = isFullAmount
                ? t("palista.quickPayment.full")
                : formatCurrencyFromCents(amountCents);

              return (
                <Pressable
                  key={`${amountCents}-${index}`}
                  onPress={() => setPaymentAmount((amountCents / 100).toFixed(2))}
                  style={({ pressed }) => ({
                    backgroundColor: isFullAmount ? theme.colors.primaryMuted : theme.colors.surface,
                    borderColor: isFullAmount ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    opacity: pressed ? 0.9 : 1,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 10,
                  })}
                >
                  <Text
                    style={{
                      color: isFullAmount ? theme.colors.primary : theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {selectedEntry ? (
          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
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
                  fontWeight: "600",
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
                  fontWeight: "600",
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
                  fontWeight: "600",
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
                  fontWeight: "600",
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
                  fontWeight: "600",
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

