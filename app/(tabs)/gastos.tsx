import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import type { TranslationKey } from "@/constants/translations";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  addExpense,
  deleteExpense,
  getExpenseSummary,
  listExpenseCategories,
  listExpenses,
  updateExpense,
} from "@/db/repositories";
import type { Expense, ExpenseSummary } from "@/types/models";
import { centsToDisplayValue, formatCurrencyFromCents, parseCurrencyToCents } from "@/utils/money";

const QUICK_AMOUNT_OPTIONS = [5_000, 10_000, 20_000, 50_000];
const PRESET_EXPENSE_CATEGORIES = [
  "rent",
  "electricity",
  "pamasahe",
  "plastic_bags",
  "ice",
  "restock_transport",
  "supplies",
  "other",
] as const;

type PresetExpenseCategory = typeof PRESET_EXPENSE_CATEGORIES[number];

const EXPENSE_CATEGORY_TRANSLATION_KEYS: Partial<Record<string, TranslationKey>> = {
  rent: "gastos.category.rent",
  electricity: "gastos.category.electricity",
  pamasahe: "gastos.category.pamasahe",
  plastic_bags: "gastos.category.plastic_bags",
  ice: "gastos.category.ice",
  restock_transport: "gastos.category.restock_transport",
  supplies: "gastos.category.supplies",
  other: "gastos.category.other",
};

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function formatExpenseCategoryLabel(
  category: string,
  t: (key: TranslationKey, params?: Record<string, number | string>) => string,
) {
  const translationKey = EXPENSE_CATEGORY_TRANSLATION_KEYS[category as PresetExpenseCategory];

  if (translationKey) {
    return t(translationKey);
  }

  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function GastosScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { language, t } = useAppLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>("other");
  const [draftExpenseDate, setDraftExpenseDate] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const locale = language === "english" ? "en-PH" : "fil-PH";

  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;

  const formatExpenseTimestamp = useCallback(
    (dateIso: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(dateIso)),
    [locale],
  );

  const loadExpenses = useCallback(async () => {
    setLoading(true);

    try {
      const [nextExpenses, nextSummary, nextSavedCategories] = await Promise.all([
        listExpenses(db),
        getExpenseSummary(db),
        listExpenseCategories(db),
      ]);
      setExpenses(nextExpenses);
      setSummary(nextSummary);
      setSavedCategories(nextSavedCategories);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const filterCategories = useMemo(() => {
    const dynamicCategories = savedCategories.filter((category) => !PRESET_EXPENSE_CATEGORIES.includes(category as PresetExpenseCategory));
    return [...PRESET_EXPENSE_CATEGORIES, ...dynamicCategories];
  }, [savedCategories]);

  const modalCategories = useMemo(() => {
    const recentCategories = summary?.recentCategories ?? [];
    const merged = [...recentCategories, ...filterCategories];
    return [...new Set(merged)];
  }, [filterCategories, summary?.recentCategories]);

  const normalizedSearch = useMemo(() => normalizeSearchValue(searchTerm), [searchTerm]);
  const filteredExpenses = useMemo(
    () =>
      expenses.filter((expense) => {
        const matchesCategory = !selectedCategory || expense.category === selectedCategory;

        if (!matchesCategory) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return (
          normalizeSearchValue(expense.category).includes(normalizedSearch) ||
          normalizeSearchValue(expense.description ?? "").includes(normalizedSearch)
        );
      }),
    [expenses, normalizedSearch, selectedCategory],
  );

  const openNewExpenseModal = useCallback(() => {
    setEditingExpense(null);
    setAmountInput("");
    setDescriptionInput("");
    setDraftCategory(summary?.recentCategories[0] ?? filterCategories[0] ?? "other");
    setDraftExpenseDate(new Date().toISOString());
    setModalVisible(true);
  }, [filterCategories, summary?.recentCategories]);

  const openEditExpenseModal = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setAmountInput(centsToDisplayValue(expense.amountCents));
    setDescriptionInput(expense.description ?? "");
    setDraftCategory(expense.category);
    setDraftExpenseDate(expense.expenseDate);
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingExpense(null);
    setAmountInput("");
    setDescriptionInput("");
    setDraftExpenseDate(new Date().toISOString());
  }, []);

  const handleSaveExpense = useCallback(async () => {
    const amountCents = parseCurrencyToCents(amountInput);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert(t("gastos.alert.invalidAmountTitle"), t("gastos.alert.invalidAmountMessage"));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        amountCents,
        category: draftCategory,
        description: descriptionInput,
        expenseDate: draftExpenseDate,
      };

      if (editingExpense) {
        await updateExpense(db, editingExpense.id, payload);
      } else {
        await addExpense(db, payload);
      }

      closeModal();
      await loadExpenses();
    } catch (error) {
      Alert.alert(
        t("gastos.alert.saveFailedTitle"),
        error instanceof Error ? error.message : t("gastos.alert.saveFailedMessage"),
      );
    } finally {
      setSaving(false);
    }
  }, [
    amountInput,
    closeModal,
    db,
    descriptionInput,
    draftCategory,
    draftExpenseDate,
    editingExpense,
    loadExpenses,
    t,
  ]);

  const handleDeleteExpense = useCallback(() => {
    if (!editingExpense) {
      return;
    }

    Alert.alert(t("gastos.alert.deleteTitle"), t("gastos.alert.deleteMessage"), [
      { text: t("home.cloud.cancel"), style: "cancel" },
      {
        text: t("gastos.alert.deleteConfirm"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteExpense(db, editingExpense.id);
              closeModal();
              await loadExpenses();
            } catch (error) {
              Alert.alert(
                t("gastos.alert.deleteFailedTitle"),
                error instanceof Error ? error.message : t("gastos.alert.deleteFailedMessage"),
              );
            }
          })();
        },
      },
    ]);
  }, [closeModal, db, editingExpense, loadExpenses, t]);

  return (
    <>
      <Screen
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingBottom: 120,
          paddingTop: theme.spacing.md,
        }}
        title={t("gastos.title")}
      >
        <SurfaceCard style={compactCardStyle}>
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
                placeholder={t("gastos.searchPlaceholder")}
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
              accessibilityLabel={t("gastos.addButton")}
              onPress={openNewExpenseModal}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                height: 44,
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
                width: 44,
              })}
            >
              <Feather color={theme.colors.primaryText} name="plus" size={16} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Pressable
                key="all"
                onPress={() => setSelectedCategory(null)}
                style={({ pressed }) => ({
                  backgroundColor: selectedCategory === null ? theme.colors.primaryMuted : theme.colors.surface,
                  borderColor: selectedCategory === null ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  opacity: pressed ? 0.92 : 1,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 10,
                })}
              >
                <Text
                  style={{
                    color: selectedCategory === null ? theme.colors.primary : theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {t("gastos.category.all")}
                </Text>
              </Pressable>

              {filterCategories.map((category) => {
                const active = selectedCategory === category;

                return (
                  <Pressable
                    key={category}
                    onPress={() => setSelectedCategory(category)}
                    style={({ pressed }) => ({
                      backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      opacity: pressed ? 0.92 : 1,
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
                      {formatExpenseCategoryLabel(category, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </SurfaceCard>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {[
            {
              key: "today",
              label: t("gastos.summary.today"),
              tone: "warning" as const,
              value: formatCurrencyFromCents(summary?.todayExpenseCents ?? 0),
            },
            {
              key: "week",
              label: t("gastos.summary.week"),
              tone: "warning" as const,
              value: formatCurrencyFromCents(summary?.weekExpenseCents ?? 0),
            },
            {
              key: "month",
              label: t("gastos.summary.month"),
              tone: "primary" as const,
              value: formatCurrencyFromCents(summary?.monthExpenseCents ?? 0),
            },
          ].map((item) => (
            <SurfaceCard
              key={item.key}
              style={{
                flex: 1,
                gap: theme.spacing.xs,
                minWidth: "30%",
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  color: item.tone === "warning" ? theme.colors.warning : theme.colors.primary,
                  fontFamily: theme.typography.display,
                  fontSize: 20,
                  fontWeight: "700",
                }}
              >
                {item.value}
              </Text>
            </SurfaceCard>
          ))}
        </View>

        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            {t("gastos.topCategories")}
          </Text>

          {summary && summary.topCategories.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {summary.topCategories.map((entry) => (
                <StatusBadge
                  key={entry.category}
                  label={`${formatExpenseCategoryLabel(entry.category, t)} ${formatCurrencyFromCents(entry.totalCents)}`}
                  tone="warning"
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
              {t("gastos.loading")}
            </Text>
          </SurfaceCard>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="minus-circle"
            message={t("gastos.emptyMessage")}
            title={t("gastos.emptyTitle")}
          />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon="search"
            message={t("gastos.noResultsMessage")}
            title={t("gastos.noResultsTitle")}
          />
        ) : (
          filteredExpenses.map((expense) => (
            <Pressable
              key={expense.id}
              onPress={() => openEditExpenseModal(expense)}
              style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
            >
              <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.xs }]}>
                <View
                  style={{
                    alignItems: "flex-start",
                    flexDirection: "row",
                    gap: theme.spacing.md,
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1, gap: theme.spacing.xs }}>
                    <View
                      style={{
                        alignItems: "center",
                        columnGap: theme.spacing.sm,
                        flexDirection: "row",
                        flexWrap: "wrap",
                        rowGap: theme.spacing.xs,
                      }}
                    >
                      <StatusBadge label={formatExpenseCategoryLabel(expense.category, t)} tone="warning" />
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 13,
                        }}
                      >
                        {formatExpenseTimestamp(expense.expenseDate)}
                      </Text>
                    </View>

                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        lineHeight: 20,
                      }}
                    >
                      {expense.description?.trim() || t("gastos.noDescription")}
                    </Text>
                  </View>

                  <Text
                    style={{
                      color: theme.colors.warning,
                      fontFamily: theme.typography.display,
                      fontSize: 20,
                      fontWeight: "700",
                    }}
                  >
                    {formatCurrencyFromCents(expense.amountCents)}
                  </Text>
                </View>
              </SurfaceCard>
            </Pressable>
          ))
        )}
      </Screen>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            {editingExpense ? (
              <ActionButton
                disabled={saving}
                label={t("gastos.delete")}
                onPress={handleDeleteExpense}
                variant="danger"
              />
            ) : null}
            <ActionButton
              disabled={saving}
              label={
                saving
                  ? t("gastos.save.saving")
                  : editingExpense
                    ? t("gastos.save.update")
                    : t("gastos.save.create")
              }
              onPress={() => void handleSaveExpense()}
            />
          </View>
        }
        onClose={closeModal}
        subtitle={t("gastos.modal.subtitle")}
        title={editingExpense ? t("gastos.modal.editTitle") : t("gastos.modal.newTitle")}
        visible={modalVisible}
      >
        <InputField
          keyboardType="decimal-pad"
          label={t("gastos.field.amount")}
          onChangeText={setAmountInput}
          placeholder="0.00"
          value={amountInput}
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
            {t("gastos.quickAmount.title")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {QUICK_AMOUNT_OPTIONS.map((amountCents) => {
                const active = parseCurrencyToCents(amountInput) === amountCents;

                return (
                  <Pressable
                    key={amountCents}
                    onPress={() => setAmountInput(centsToDisplayValue(amountCents))}
                    style={({ pressed }) => ({
                      backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      opacity: pressed ? 0.92 : 1,
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
                      {formatCurrencyFromCents(amountCents)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {t("gastos.field.category")}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {modalCategories.map((category) => {
                const active = draftCategory === category;

                return (
                  <Pressable
                    key={category}
                    onPress={() => setDraftCategory(category)}
                    style={({ pressed }) => ({
                      backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      opacity: pressed ? 0.92 : 1,
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
                      {formatExpenseCategoryLabel(category, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <InputField
          label={t("gastos.field.description")}
          onChangeText={setDescriptionInput}
          placeholder={t("gastos.field.descriptionPlaceholder")}
          value={descriptionInput}
        />

        <View style={{ gap: theme.spacing.xs }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {t("gastos.field.loggedAt")}
          </Text>
          <StatusBadge label={formatExpenseTimestamp(draftExpenseDate)} tone="neutral" />
        </View>
      </ModalSheet>
    </>
  );
}
