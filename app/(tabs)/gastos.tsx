import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
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
  deleteExpenseCategory,
  deleteExpense,
  deleteExpenseBudget,
  getExpenseBudgetSummary,
  getExpenseSummary,
  listExpenseBudgets,
  listExpenseCategories,
  listExpenses,
  updateExpense,
  updateExpenseBudget,
  upsertExpenseBudget,
} from "@/db/repositories";
import type {
  BudgetStatus,
  Expense,
  ExpenseBudget,
  ExpenseBudgetProgress,
  ExpenseBudgetSummary,
  ExpenseSummary,
} from "@/types/models";
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

type CategoryModalTarget = "expense" | "budget";

const HIDDEN_EXPENSE_CATEGORIES_KEY = "tindahan.expense-hidden-categories";

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCategoryDraft(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseStoredCategories(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return [...new Set(parsed.map((value) => normalizeCategoryDraft(String(value))).filter((value) => value.length >= 2))];
  } catch {
    return [];
  }
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

function formatBudgetCategoryLabel(
  category: string | null,
  t: (key: TranslationKey, params?: Record<string, number | string>) => string,
) {
  if (!category) {
    return t("gastos.budget.category.overall");
  }

  return formatExpenseCategoryLabel(category, t);
}

function getBudgetStatusTone(status: BudgetStatus) {
  if (status === "over") {
    return "danger" as const;
  }

  if (status === "warning") {
    return "warning" as const;
  }

  return "success" as const;
}

function getBudgetStatusLabel(
  status: BudgetStatus,
  t: (key: TranslationKey, params?: Record<string, number | string>) => string,
) {
  if (status === "over") {
    return t("gastos.budget.status.over");
  }

  if (status === "warning") {
    return t("gastos.budget.status.warning");
  }

  return t("gastos.budget.status.onTrack");
}

function formatBudgetMonthLabel(budgetMonth: string, locale: string) {
  const [yearString, monthString] = budgetMonth.split("-");
  const year = Number(yearString);
  const monthIndex = Number(monthString) - 1;

  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

function getBudgetProgressWidth(usageRatio: number) {
  return `${Math.max(0, Math.min(usageRatio, 1)) * 100}%` as `${number}%`;
}

function getBudgetCategoryKey(category: string | null) {
  return category ?? "__overall__";
}

export default function GastosScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { language, t } = useAppLanguage();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [budgetSummary, setBudgetSummary] = useState<ExpenseBudgetSummary | null>(null);
  const [budgets, setBudgets] = useState<ExpenseBudget[]>([]);
  const [savedCategories, setSavedCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<ExpenseBudget | null>(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalTarget, setCategoryModalTarget] = useState<CategoryModalTarget>("expense");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [draftCategory, setDraftCategory] = useState<string>("other");
  const [draftExpenseDate, setDraftExpenseDate] = useState(() => new Date().toISOString());
  const [budgetAmountInput, setBudgetAmountInput] = useState("");
  const [budgetScopeMode, setBudgetScopeMode] = useState<"overall" | "category">("overall");
  const [budgetCategory, setBudgetCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
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
      const [nextExpenses, nextSummary, nextSavedCategories, nextBudgetSummary, nextBudgets, hiddenCategoriesRaw] = await Promise.all([
        listExpenses(db),
        getExpenseSummary(db),
        listExpenseCategories(db),
        getExpenseBudgetSummary(db),
        listExpenseBudgets(db),
        Storage.getItem(HIDDEN_EXPENSE_CATEGORIES_KEY),
      ]);
      setExpenses(nextExpenses);
      setSummary(nextSummary);
      setSavedCategories(nextSavedCategories);
      setBudgetSummary(nextBudgetSummary);
      setBudgets(nextBudgets);
      setHiddenCategories(parseStoredCategories(hiddenCategoriesRaw));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const budgetCategories = useMemo(
    () => budgets.map((budget) => budget.category).filter((category): category is string => Boolean(category)),
    [budgets],
  );

  const filterCategories = useMemo(() => {
    const dynamicCategories = [...savedCategories, ...budgetCategories, ...customCategories].filter(
      (category) =>
        !PRESET_EXPENSE_CATEGORIES.includes(category as PresetExpenseCategory) &&
        !hiddenCategories.includes(category),
    );
    const visiblePresetCategories = PRESET_EXPENSE_CATEGORIES.filter((category) => !hiddenCategories.includes(category));
    return [...visiblePresetCategories, ...new Set(dynamicCategories)];
  }, [budgetCategories, customCategories, hiddenCategories, savedCategories]);

  const modalCategories = useMemo(() => {
    const recentCategories = summary?.recentCategories ?? [];
    const merged = [...recentCategories, ...filterCategories];
    return [...new Set(merged)];
  }, [filterCategories, summary?.recentCategories]);

  const budgetCategoryOptions = useMemo(() => {
    const merged = [editingBudget?.category ?? null, ...modalCategories];
    return [null, ...new Set(merged.filter((category): category is string => Boolean(category)))];
  }, [editingBudget?.category, modalCategories]);

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

  const budgetRows = useMemo(() => {
    if (!budgetSummary) {
      return [];
    }

    return [
      ...(budgetSummary.overallBudget ? [budgetSummary.overallBudget] : []),
      ...budgetSummary.categoryBudgets,
    ];
  }, [budgetSummary]);

  const trackedRemainingCents = budgetSummary?.trackedRemainingCents ?? 0;
  const currentBudgetMonth = budgetSummary?.budgetMonth ?? new Date().toISOString().slice(0, 7);
  const currentBudgetMonthLabel = useMemo(
    () => formatBudgetMonthLabel(currentBudgetMonth, locale),
    [currentBudgetMonth, locale],
  );
  const budgetStatusLabel = budgetSummary
    ? getBudgetStatusLabel(budgetSummary.trackedStatus, t)
    : t("gastos.budget.status.noBudget");

  const openNewExpenseModal = useCallback(() => {
    const initialCategory = summary?.recentCategories[0] ?? filterCategories[0] ?? "other";
    setEditingExpense(null);
    setAmountInput("");
    setDescriptionInput("");
    setDraftCategory(initialCategory);
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

  const openNewBudgetModal = useCallback((category: string | null = null) => {
    setEditingBudget(null);
    setBudgetAmountInput("");
    setBudgetScopeMode(category ? "category" : "overall");
    setBudgetCategory(category);
    setBudgetModalVisible(true);
  }, []);

  const openEditBudgetModal = useCallback((budget: ExpenseBudget) => {
    setEditingBudget(budget);
    setBudgetAmountInput(centsToDisplayValue(budget.amountCents));
    setBudgetScopeMode(budget.category ? "category" : "overall");
    setBudgetCategory(budget.category);
    setBudgetModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setEditingExpense(null);
    setAmountInput("");
    setDescriptionInput("");
    setDraftExpenseDate(new Date().toISOString());
  }, []);

  const closeBudgetModal = useCallback(() => {
    setBudgetModalVisible(false);
    setEditingBudget(null);
    setBudgetAmountInput("");
    setBudgetScopeMode("overall");
    setBudgetCategory(null);
  }, []);

  const openCategoryModal = useCallback(
    (target: CategoryModalTarget) => {
      setCategoryModalTarget(target);
      setCategoryDraft(target === "expense" ? draftCategory : budgetCategory ?? "");
      setCategoryModalVisible(true);
    },
    [budgetCategory, draftCategory],
  );

  const closeCategoryModal = useCallback(() => {
    setCategoryModalVisible(false);
    setCategoryDraft("");
  }, []);

  const persistHiddenCategories = useCallback(async (nextHiddenCategories: string[]) => {
    const normalizedCategories = [...new Set(nextHiddenCategories.map(normalizeCategoryDraft).filter((value) => value.length >= 2))];
    setHiddenCategories(normalizedCategories);
    await Storage.setItem(HIDDEN_EXPENSE_CATEGORIES_KEY, JSON.stringify(normalizedCategories));
    return normalizedCategories;
  }, []);

  const handleSaveExpense = useCallback(async () => {
    const amountCents = parseCurrencyToCents(amountInput);
    const resolvedCategory = draftCategory.trim();

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert(t("gastos.alert.invalidAmountTitle"), t("gastos.alert.invalidAmountMessage"));
      return;
    }

    if (resolvedCategory.length < 2) {
      Alert.alert(t("gastos.alert.invalidCategoryTitle"), t("gastos.alert.invalidCategoryMessage"));
      return;
    }

    setSaving(true);

    try {
      const payload = {
        amountCents,
        category: resolvedCategory,
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

  const handleSaveBudget = useCallback(async () => {
    const amountCents = parseCurrencyToCents(budgetAmountInput);
    const resolvedBudgetCategory = budgetScopeMode === "overall" ? null : budgetCategory?.trim() ?? "";

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      Alert.alert(t("gastos.budget.alert.invalidAmountTitle"), t("gastos.budget.alert.invalidAmountMessage"));
      return;
    }

    if (budgetScopeMode === "category" && (!resolvedBudgetCategory || resolvedBudgetCategory.length < 2)) {
      Alert.alert(t("gastos.budget.alert.invalidCategoryTitle"), t("gastos.budget.alert.invalidCategoryMessage"));
      return;
    }

    setSavingBudget(true);

    try {
      const payload = {
        amountCents,
        budgetMonth: currentBudgetMonth,
        category: resolvedBudgetCategory,
      };

      if (editingBudget) {
        await updateExpenseBudget(db, editingBudget.id, payload);
      } else {
        await upsertExpenseBudget(db, payload);
      }

      closeBudgetModal();
      await loadExpenses();
    } catch (error) {
      Alert.alert(
        t("gastos.budget.alert.saveFailedTitle"),
        error instanceof Error ? error.message : t("gastos.budget.alert.saveFailedMessage"),
      );
    } finally {
      setSavingBudget(false);
    }
  }, [
    budgetAmountInput,
    budgetCategory,
    budgetScopeMode,
    closeBudgetModal,
    currentBudgetMonth,
    db,
    editingBudget,
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

  const handleDeleteBudget = useCallback(() => {
    if (!editingBudget) {
      return;
    }

    Alert.alert(t("gastos.budget.alert.deleteTitle"), t("gastos.budget.alert.deleteMessage"), [
      { text: t("home.cloud.cancel"), style: "cancel" },
      {
        text: t("gastos.budget.alert.deleteConfirm"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteExpenseBudget(db, editingBudget.id);
              closeBudgetModal();
              await loadExpenses();
            } catch (error) {
              Alert.alert(
                t("gastos.budget.alert.deleteFailedTitle"),
                error instanceof Error ? error.message : t("gastos.budget.alert.deleteFailedMessage"),
              );
            }
          })();
        },
      },
    ]);
  }, [closeBudgetModal, db, editingBudget, loadExpenses, t]);

  const handleCreateCategory = useCallback(() => {
    const normalizedCategory = normalizeCategoryDraft(categoryDraft);

    if (normalizedCategory.length < 2) {
      Alert.alert(t("gastos.alert.invalidCategoryTitle"), t("gastos.alert.invalidCategoryMessage"));
      return;
    }

    void (async () => {
      await persistHiddenCategories(hiddenCategories.filter((category) => category !== normalizedCategory));
      setCustomCategories((current) => [...new Set([...current, normalizedCategory])]);

      if (categoryModalTarget === "expense") {
        setDraftCategory(normalizedCategory);
      } else {
        setBudgetScopeMode("category");
        setBudgetCategory(normalizedCategory);
      }

      closeCategoryModal();
    })();
  }, [categoryDraft, categoryModalTarget, closeCategoryModal, hiddenCategories, persistHiddenCategories, t]);

  const handleDeleteCategory = useCallback(
    (category: string) => {
      Alert.alert(t("gastos.category.deleteTitle"), t("gastos.category.deleteMessage"), [
        { text: t("home.cloud.cancel"), style: "cancel" },
        {
          text: t("gastos.category.deleteConfirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteExpenseCategory(db, category);
                await persistHiddenCategories([...hiddenCategories, category]);
                setCustomCategories((current) => current.filter((entry) => entry !== category));

                if (selectedCategory === category) {
                  setSelectedCategory(null);
                }

                if (draftCategory === category) {
                  setDraftCategory("other");
                }

                if (budgetCategory === category) {
                  setBudgetCategory("other");
                }

                if (categoryDraft === category) {
                  setCategoryDraft("");
                }

                await loadExpenses();
              } catch (error) {
                Alert.alert(
                  t("gastos.category.deleteFailedTitle"),
                  error instanceof Error ? error.message : t("gastos.category.deleteFailedMessage"),
                );
              }
            })();
          },
        },
      ]);
    },
    [
      budgetCategory,
      categoryDraft,
      db,
      draftCategory,
      hiddenCategories,
      loadExpenses,
      persistHiddenCategories,
      selectedCategory,
      t,
    ],
  );

  const renderBudgetRow = (progress: ExpenseBudgetProgress) => (
    <Pressable
      key={`${getBudgetCategoryKey(progress.category)}-${progress.budgetId}`}
      onPress={() => {
        const matchingBudget = budgets.find((budget) => budget.id === progress.budgetId);
        if (matchingBudget) {
          openEditBudgetModal(matchingBudget);
        }
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}
    >
      <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.xs, padding: theme.spacing.sm }]}>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: theme.spacing.xs,
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {formatBudgetCategoryLabel(progress.category, t)}
              </Text>
              <StatusBadge
                label={getBudgetStatusLabel(progress.status, t)}
                tone={getBudgetStatusTone(progress.status)}
              />
            </View>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
              }}
            >
              {t("gastos.budget.row.spentOfBudget", {
                budget: formatCurrencyFromCents(progress.budgetCents),
                spent: formatCurrencyFromCents(progress.spentCents),
              })}
            </Text>
          </View>

          <Text
            style={{
              color: progress.remainingCents < 0 ? theme.colors.danger : theme.colors.primary,
              fontFamily: theme.typography.display,
              fontSize: 20,
              fontWeight: "700",
            }}
          >
            {progress.remainingCents >= 0
              ? formatCurrencyFromCents(progress.remainingCents)
              : formatCurrencyFromCents(Math.abs(progress.remainingCents))}
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
          <View
            style={{
              backgroundColor:
                progress.status === "over"
                  ? theme.colors.danger
                  : progress.status === "warning"
                    ? theme.colors.warning
                    : theme.colors.success,
              borderRadius: theme.radius.pill,
              height: "100%",
              width: getBudgetProgressWidth(progress.usageRatio),
            }}
          />
        </View>

        <Text
          style={{
            color: theme.colors.textSoft,
            fontFamily: theme.typography.body,
            fontSize: 12,
          }}
        >
          {progress.remainingCents >= 0
            ? t("gastos.budget.row.remaining", { amount: formatCurrencyFromCents(progress.remainingCents) })
            : t("gastos.budget.row.over", { amount: formatCurrencyFromCents(Math.abs(progress.remainingCents)) })}
        </Text>
      </SurfaceCard>
    </Pressable>
  );

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
              accessibilityLabel={t("gastos.budget.openButton")}
              onPress={() => openNewBudgetModal()}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: theme.colors.primaryMuted,
                borderColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                height: 44,
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
                width: 44,
              })}
            >
              <Feather color={theme.colors.primary} name="target" size={16} />
            </Pressable>

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
            {
              key: "budget-left",
              label: trackedRemainingCents >= 0 ? t("gastos.budget.summary.remaining") : t("gastos.budget.summary.over"),
              tone: trackedRemainingCents >= 0 ? ("success" as const) : ("danger" as const),
              value: formatCurrencyFromCents(Math.abs(trackedRemainingCents)),
            },
          ].map((item) => (
            <SurfaceCard
              key={item.key}
              style={{
                flex: 1,
                gap: theme.spacing.xs,
                minWidth: "46%",
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
                  color:
                    item.tone === "warning"
                      ? theme.colors.warning
                      : item.tone === "danger"
                        ? theme.colors.danger
                        : item.tone === "success"
                          ? theme.colors.success
                          : theme.colors.primary,
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
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              gap: theme.spacing.sm,
            }}
          >
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {t("gastos.budget.title")}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {t("gastos.budget.subtitle")}
              </Text>
            </View>
            <StatusBadge label={budgetStatusLabel} tone={budgetSummary ? getBudgetStatusTone(budgetSummary.trackedStatus) : "neutral"} />
          </View>

          <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <StatusBadge label={currentBudgetMonthLabel} tone="neutral" />
            {budgetSummary?.overallBudget ? (
              <StatusBadge label={t("gastos.budget.summary.mode.overall")} tone="primary" />
            ) : budgetSummary && budgetSummary.categoryBudgets.length > 0 ? (
              <StatusBadge label={t("gastos.budget.summary.mode.category")} tone="primary" />
            ) : null}
          </View>

          {budgetSummary && budgetSummary.trackedBudgetCents > 0 ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {[
                  {
                    key: "budget",
                    label: t("gastos.budget.summary.budget"),
                    tone: theme.colors.primary,
                    value: formatCurrencyFromCents(budgetSummary.trackedBudgetCents),
                  },
                  {
                    key: "spent",
                    label: t("gastos.budget.summary.spent"),
                    tone: theme.colors.warning,
                    value: formatCurrencyFromCents(budgetSummary.totalSpentCents),
                  },
                  {
                    key: "remaining",
                    label:
                      budgetSummary.trackedRemainingCents >= 0
                        ? t("gastos.budget.summary.remaining")
                        : t("gastos.budget.summary.over"),
                    tone:
                      budgetSummary.trackedRemainingCents >= 0
                        ? theme.colors.success
                        : theme.colors.danger,
                    value: formatCurrencyFromCents(Math.abs(budgetSummary.trackedRemainingCents)),
                  },
                ].map((item) => (
                  <View
                    key={item.key}
                    style={{
                      backgroundColor: theme.colors.surfaceMuted,
                      borderRadius: theme.radius.md,
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
                        color: item.tone,
                        fontFamily: theme.typography.display,
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      {item.value}
                    </Text>
                  </View>
                ))}
              </View>

              {budgetSummary.unbudgetedSpentCents > 0 ? (
                <StatusBadge
                  label={t("gastos.budget.summary.unbudgeted", {
                    amount: formatCurrencyFromCents(budgetSummary.unbudgetedSpentCents),
                  })}
                  tone="warning"
                />
              ) : null}

              <View style={{ gap: theme.spacing.sm }}>
                {budgetRows.map(renderBudgetRow)}
              </View>

              <ActionButton
                label={t("gastos.budget.addButton")}
                onPress={() => openNewBudgetModal()}
                variant="outline"
              />
            </>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  lineHeight: 20,
                }}
              >
                {t("gastos.budget.emptyMessage")}
              </Text>
              <ActionButton label={t("gastos.budget.addButton")} onPress={() => openNewBudgetModal()} />
            </View>
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
            <ActionButton
              label={t("gastos.category.create")}
              onPress={handleCreateCategory}
            />
          </View>
        }
        onClose={closeCategoryModal}
        subtitle={
          categoryModalTarget === "expense"
            ? t("gastos.category.modal.subtitle.expense")
            : t("gastos.category.modal.subtitle.budget")
        }
        title={t("gastos.category.modal.title")}
        visible={categoryModalVisible}
      >
        <InputField
          label={t("gastos.category.modal.field")}
          onChangeText={setCategoryDraft}
          placeholder={t("gastos.category.modal.placeholder")}
          value={categoryDraft}
        />
        <SurfaceCard style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            {t("gastos.category.modal.saved")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {filterCategories.length > 0 ? (
              filterCategories.map((category) => (
                <View
                  key={category}
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 10,
                  }}
                >
                  <Pressable
                    onPress={() => setCategoryDraft(category)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.9 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {formatExpenseCategoryLabel(category, t)}
                    </Text>
                  </Pressable>

                  {category !== "other" ? (
                    <Pressable
                      accessibilityLabel={t("gastos.category.deleteButton")}
                      hitSlop={6}
                      onPress={() => handleDeleteCategory(category)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Feather color={theme.colors.danger} name="x" size={14} />
                    </Pressable>
                  ) : null}
                </View>
              ))
            ) : (
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {t("gastos.category.modal.empty")}
              </Text>
            )}
          </View>
        </SurfaceCard>
      </ModalSheet>

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
              <Pressable
                accessibilityLabel={t("gastos.category.addButton")}
                onPress={() => openCategoryModal("expense")}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: theme.colors.primaryMuted,
                  borderColor: theme.colors.primary,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  justifyContent: "center",
                  opacity: pressed ? 0.92 : 1,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 10,
                })}
              >
                <Feather color={theme.colors.primary} name="plus" size={14} />
              </Pressable>
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

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            {editingBudget ? (
              <ActionButton
                disabled={savingBudget}
                label={t("gastos.budget.delete")}
                onPress={handleDeleteBudget}
                variant="danger"
              />
            ) : null}
            <ActionButton
              disabled={savingBudget}
              label={
                savingBudget
                  ? t("gastos.budget.save.saving")
                  : editingBudget
                    ? t("gastos.budget.save.update")
                    : t("gastos.budget.save.create")
              }
              onPress={() => void handleSaveBudget()}
            />
          </View>
        }
        onClose={closeBudgetModal}
        subtitle={t("gastos.budget.modal.subtitle")}
        title={editingBudget ? t("gastos.budget.modal.editTitle") : t("gastos.budget.modal.newTitle")}
        visible={budgetModalVisible}
      >
        <View style={{ gap: theme.spacing.xs }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {t("gastos.budget.field.month")}
          </Text>
          <StatusBadge label={currentBudgetMonthLabel} tone="neutral" />
        </View>

        <InputField
          keyboardType="decimal-pad"
          label={t("gastos.budget.field.amount")}
          onChangeText={setBudgetAmountInput}
          placeholder="0.00"
          value={budgetAmountInput}
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
            {t("gastos.budget.field.scope")}
          </Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {[
              { key: "overall" as const, label: t("gastos.budget.scope.overall") },
              { key: "category" as const, label: t("gastos.budget.scope.category") },
            ].map((scope) => {
              const active = budgetScopeMode === scope.key;

              return (
                <Pressable
                  key={scope.key}
                  onPress={() => {
                    setBudgetScopeMode(scope.key);

                    if (scope.key === "overall") {
                      setBudgetCategory(null);
                      return;
                    }

                    const fallbackCategory = budgetCategory || modalCategories[0] || customCategories[0] || "other";
                    setBudgetCategory(fallbackCategory);
                  }}
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
                    {scope.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {budgetScopeMode === "category" ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t("gastos.budget.field.category")}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityLabel={t("gastos.category.addButton")}
                  onPress={() => openCategoryModal("budget")}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: theme.colors.primaryMuted,
                    borderColor: theme.colors.primary,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 10,
                  })}
                >
                  <Feather color={theme.colors.primary} name="plus" size={14} />
                </Pressable>
                {budgetCategoryOptions.filter((category): category is string => category !== null).map((category) => {
                  const active = budgetCategory === category;

                  return (
                    <Pressable
                      key={getBudgetCategoryKey(category)}
                      onPress={() => setBudgetCategory(category)}
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
        ) : null}
      </ModalSheet>
    </>
  );
}
