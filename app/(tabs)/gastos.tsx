import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import {
  createExpenseTrip,
  deleteExpenseTrip,
  getExpenseTripById,
  getExpenseTripOverview,
  listExpenseTripSuggestions,
  listExpenseTrips,
  listProductCategories,
  type ExpenseTripItemSuggestion,
} from "@/db/repositories";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import type { AppLanguage, ExpenseTrip, ExpenseTripOverview, ExpenseTripSummary, PaymentMethod } from "@/types/models";
import { formatCurrencyFromCents, parseCurrencyToCents } from "@/utils/money";

type DraftTripItem = {
  id: string;
  itemName: string;
  quantity: string;
  unitPrice: string;
  category: string;
};

const COMMON_SARI_SARI_ITEMS = [
  { category: "bigas", name: "Bigas" },
  { category: "itlog", name: "Itlog" },
  { category: "delata", name: "Sardinas" },
  { category: "delata", name: "Corned Beef" },
  { category: "delata", name: "Tuna" },
  { category: "noodles", name: "Instant Noodles" },
  { category: "kape", name: "Kape" },
  { category: "asukal", name: "Asukal" },
  { category: "mantika", name: "Mantika" },
  { category: "bisyo", name: "Sigarilyo" },
  { category: "inumin", name: "Softdrinks" },
  { category: "inumin", name: "Tubig" },
  { category: "gatas", name: "Gatas" },
  { category: "biskwit", name: "Biskwit" },
  { category: "tinapay", name: "Tinapay" },
  { category: "pampaligo", name: "Sabon" },
  { category: "personal_care", name: "Shampoo" },
  { category: "panlinis", name: "Detergent" },
] as const;

const COMMON_ITEM_CATEGORIES = [
  "bigas",
  "itlog",
  "delata",
  "noodles",
  "inumin",
  "bisyo",
  "kape",
  "asukal",
  "mantika",
  "biskwit",
  "personal_care",
  "panlinis",
  "iba_pa",
] as const;

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ["cash", "gcash", "maya", "utang"];

function createDraftItem(): DraftTripItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemName: "",
    quantity: "1",
    unitPrice: "",
    category: "",
  };
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function safeMoneyInputToCents(value: string) {
  const cents = parseCurrencyToCents(value);
  return Number.isFinite(cents) ? cents : 0;
}

function parseQuantityInput(value: string) {
  const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "").trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatQuantityLabel(quantity: number) {
  if (Number.isInteger(quantity)) {
    return quantity.toString();
  }

  return quantity.toFixed(2).replace(/\.?0+$/, "");
}

function humanizeCategory(category: string) {
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInputToIso(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day, 12, 0, 0, 0);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function getPaymentMethodLabel(paymentMethod: PaymentMethod, language: AppLanguage) {
  if (paymentMethod === "gcash") {
    return "GCash";
  }

  if (paymentMethod === "maya") {
    return "Maya";
  }

  if (paymentMethod === "utang") {
    return language === "english" ? "Credit" : "Utang";
  }

  return "Cash";
}

function getPaymentMethodTone(paymentMethod: PaymentMethod) {
  if (paymentMethod === "cash") {
    return "success" as const;
  }

  if (paymentMethod === "utang") {
    return "warning" as const;
  }

  return "primary" as const;
}

export default function GastosScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { language } = useAppLanguage();
  const [overview, setOverview] = useState<ExpenseTripOverview | null>(null);
  const [trips, setTrips] = useState<ExpenseTripSummary[]>([]);
  const [itemSuggestions, setItemSuggestions] = useState<ExpenseTripItemSuggestion[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailTripId, setDetailTripId] = useState<number | null>(null);
  const [detailTrip, setDetailTrip] = useState<ExpenseTrip | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tripDateInput, setTripDateInput] = useState(() => formatDateInput());
  const [marketNameInput, setMarketNameInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [pamasaheInput, setPamasaheInput] = useState("");
  const [gasolinaInput, setGasolinaInput] = useState("");
  const [otherTravelInput, setOtherTravelInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [draftItems, setDraftItems] = useState<DraftTripItem[]>(() => [createDraftItem()]);
  const locale = language === "english" ? "en-PH" : "fil-PH";
  const copy = useMemo(
    () =>
      language === "english"
        ? {
            addItem: "Add item",
            addTrip: "Log New Trip",
            addTripAccessibility: "Log a trip",
            allTime: "All Time",
            cancel: "Cancel",
            date: "Date",
            delete: "Delete Trip",
            deleteConfirm: "Delete",
            deleteFailedMessage: "There was a problem deleting the trip.",
            deleteFailedTitle: "Trip not deleted",
            deleteMessage: "This will remove the full trip record together with all attached items and travel costs.",
            deleteProgress: "Deleting trip...",
            deleteTitle: "Delete trip?",
            detailEmptyMessage: "Could not find the details for this trip.",
            detailEmptyTitle: "No Details",
            detailFallbackSubtitle: "Details",
            detailItemsCount: (count: number) => `${count} ${count === 1 ? "item bought" : "items bought"}`,
            detailLoading: "Loading trip details...",
            detailTitle: "Trip Details",
            detailsLoadFailedMessage: "There was a problem loading this trip.",
            detailsLoadFailedTitle: "Could not load details",
            emptyMessage: "Your restock trips will show up here.",
            emptyTitle: "No Trips Logged Yet",
            enterCategory: (itemName: string) => `Enter a category for ${itemName}.`,
            enterItemName: "Complete the item name before saving.",
            formGrandTotal: "Total Before Save",
            formItemsTotal: "Items",
            formLoadingHistory: "Loading trips...",
            formRunningTotal: "Running Total",
            formTravelTotal: "Travel",
            history: "History",
            historyTitle: "Past Trips",
            invalidDateMessage: "Use the format YYYY-MM-DD for the trip date.",
            invalidDateTitle: "Invalid date",
            invalidMarketMessage: "Enter the store or market name.",
            invalidMarketTitle: "Missing store",
            invalidPriceTitle: "Invalid price",
            invalidQuantityTitle: "Invalid quantity",
            invalidPrice: (itemName: string) => `Fix the price for ${itemName}.`,
            invalidQuantity: (itemName: string) => `Fix the quantity for ${itemName}.`,
            itemCategory: "Category",
            itemCategoryPlaceholder: "Example: Canned Goods, Rice, Drinks",
            itemCount: (count: number) => `${count} ${count === 1 ? "item" : "items"}`,
            itemHint: "Subtotal will appear after quantity and price.",
            itemIndex: (index: number) => `Item ${index}`,
            itemName: "Item Name",
            itemNamePlaceholder: "Example: Sardines, Rice, Noodles",
            itemQuantity: "Quantity",
            itemsSectionLabel: "Items Bought",
            itemsSectionTitle: "Item Breakdown",
            itemUnitPrice: "Unit Price",
            listSummary: "Summary",
            loadFailedMessage: "There was a problem loading trip expenses.",
            loadFailedTitle: "Could not load trips",
            marketName: "Store / Market",
            marketNamePlaceholder: "Example: Puregold Bocaue or Town Market",
            moreItems: (count: number) => `+${count} more`,
            newTripSubtitle: "Items, travel costs, and notes.",
            newTripTitle: "New Trip",
            noItemsMessage: "Add at least one purchased item before saving.",
            noItemsTitle: "No items yet",
            notes: "Notes",
            notesPlaceholder: "Optional note about this trip",
            otherTravel: "Other Travel Costs",
            otherTravelLabel: "Other",
            otherTravelPlaceholder: "Food, helper fee, etc.",
            paymentMethod: "Payment Method",
            save: "Save Trip",
            saveFailedMessage: "There was a problem while saving the trip.",
            saveFailedTitle: "Trip not saved",
            saveProgress: "Saving trip...",
            screenSubtitle: "Track restock trips, items, and travel costs.",
            screenTitle: "Restock Trips",
            thisMonth: "This Month",
            totalCost: "Total Cost",
            travelCosts: "Travel Expenses",
            travelSubtitle: "Fare and Other Costs",
            tripCount: (count: number) => `${count} ${count === 1 ? "trip" : "trips"}`,
            tripSummaryLine: (dateLabel: string, itemCount: number) =>
              `${dateLabel} - ${itemCount} ${itemCount === 1 ? "item" : "items"}`,
          }
        : {
            addItem: "Magdagdag ng item",
            addTrip: "Mag-log ng Bagong Biyahe",
            addTripAccessibility: "Mag-log ng biyahe",
            allTime: "Simula Noong Una",
            cancel: "Huwag",
            date: "Petsa",
            delete: "Burahin ang Biyahe",
            deleteConfirm: "Burahin",
            deleteFailedMessage: "May problema habang binubura ang biyahe.",
            deleteFailedTitle: "Hindi nabura ang biyahe",
            deleteMessage: "Tatanggalin nito ang buong record ng biyahe pati ang lahat ng item at gastos na kasama rito.",
            deleteProgress: "Binubura ang biyahe...",
            deleteTitle: "Burahin ang biyahe?",
            detailEmptyMessage: "Hindi makita ang detalye ng biyahe na ito.",
            detailEmptyTitle: "Walang Detalye",
            detailFallbackSubtitle: "Detalye",
            detailItemsCount: (count: number) => `${count} item na binili`,
            detailLoading: "Kinukuha ang detalye ng biyahe...",
            detailTitle: "Detalye ng Biyahe",
            detailsLoadFailedMessage: "May problema habang kinukuha ang detalye ng biyahe.",
            detailsLoadFailedTitle: "Hindi makuha ang detalye",
            emptyMessage: "Lalabas dito ang mga restock trip mo.",
            emptyTitle: "Wala Pang Nai-log na Biyahe",
            enterCategory: (itemName: string) => `Maglagay ng category para sa ${itemName}.`,
            enterItemName: "Kumpletuhin ang pangalan ng item bago mag-save.",
            formGrandTotal: "Kabuuan Bago I-save",
            formItemsTotal: "Mga Item",
            formLoadingHistory: "Inaayos ang mga biyahe...",
            formRunningTotal: "Tumatakbong Total",
            formTravelTotal: "Biyahe",
            history: "Kasaysayan",
            historyTitle: "Mga Nakaraang Biyahe",
            invalidDateMessage: "Gamitin ang format na YYYY-MM-DD para sa petsa ng biyahe.",
            invalidDateTitle: "Invalid na petsa",
            invalidMarketMessage: "Ilagay ang pangalan ng palengke o tindahan.",
            invalidMarketTitle: "Kulang ang lugar",
            invalidPriceTitle: "Invalid na presyo",
            invalidQuantityTitle: "Invalid na dami",
            invalidPrice: (itemName: string) => `Ayusin ang presyo para sa ${itemName}.`,
            invalidQuantity: (itemName: string) => `Ayusin ang dami para sa ${itemName}.`,
            itemCategory: "Kategorya",
            itemCategoryPlaceholder: "Halimbawa: Delata, Bigas, Inumin",
            itemCount: (count: number) => `${count} item`,
            itemHint: "Hintayin ang quantity at presyo para lumabas ang subtotal.",
            itemIndex: (index: number) => `Binili ${index}`,
            itemName: "Pangalan ng Item",
            itemNamePlaceholder: "Halimbawa: Sardinas, Bigas, Noodles",
            itemQuantity: "Dami",
            itemsSectionLabel: "Mga Binili",
            itemsSectionTitle: "Listahan ng Mga Binili",
            itemUnitPrice: "Presyo Kada Unit",
            listSummary: "Buod",
            loadFailedMessage: "May problema habang kinukuha ang gastos sa biyahe.",
            loadFailedTitle: "Hindi makuha ang mga biyahe",
            marketName: "Palengke / Tindahan",
            marketNamePlaceholder: "Halimbawa: Puregold Bocaue o Palengke ng Bayan",
            moreItems: (count: number) => `+${count} pa`,
            newTripSubtitle: "Mga item, pamasahe, at tala.",
            newTripTitle: "Bagong Biyahe",
            noItemsMessage: "Maglagay ng kahit isang item na binili bago mag-save.",
            noItemsTitle: "Walang laman ang listahan",
            notes: "Mga Tala",
            notesPlaceholder: "Opsyonal na tala tungkol sa biyaheng ito",
            otherTravel: "Iba Pang Gastos sa Biyahe",
            otherTravelLabel: "Iba Pa",
            otherTravelPlaceholder: "Pagkain, bayad sa tao, atbp.",
            paymentMethod: "Paraan ng Bayad",
            save: "I-save ang Biyahe",
            saveFailedMessage: "May nangyaring problema habang sine-save ang biyahe.",
            saveFailedTitle: "Hindi na-save ang biyahe",
            saveProgress: "Sine-save ang biyahe...",
            screenSubtitle: "I-track ang restock trips, items, at gastos sa biyahe.",
            screenTitle: "Biyahe sa Restock",
            thisMonth: "Ngayong Buwan",
            totalCost: "Kabuuang Gastos",
            travelCosts: "Gastos sa Biyahe",
            travelSubtitle: "Pamasahe at Iba Pa",
            tripCount: (count: number) => `${count} biyahe`,
            tripSummaryLine: (dateLabel: string, itemCount: number) => `${dateLabel} - ${itemCount} item`,
          },
    [language],
  );

  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;
  const microLabelStyle = {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.label,
    fontSize: theme.typography.scale.label.fontSize,
    letterSpacing: 0.3,
    lineHeight: theme.typography.scale.label.lineHeight,
  };

  const resetForm = useCallback(() => {
    setTripDateInput(formatDateInput());
    setMarketNameInput("");
    setPaymentMethod("cash");
    setPamasaheInput("");
    setGasolinaInput("");
    setOtherTravelInput("");
    setNotesInput("");
    setDraftItems([createDraftItem()]);
  }, []);

  const loadTrips = useCallback(async () => {
    setLoading(true);

    try {
      const [nextOverview, nextTrips, nextItemSuggestions, productCategories] = await Promise.all([
        getExpenseTripOverview(db),
        listExpenseTrips(db),
        listExpenseTripSuggestions(db),
        listProductCategories(db),
      ]);

      setOverview(nextOverview);
      setTrips(nextTrips);
      setItemSuggestions(nextItemSuggestions);
      setCategorySuggestions(productCategories);
    } catch {
      Alert.alert(copy.loadFailedTitle, copy.loadFailedMessage);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailedMessage, copy.loadFailedTitle, db]);

  useFocusEffect(
    useCallback(() => {
      void loadTrips();
    }, [loadTrips]),
  );

  const mergedItemSuggestions = useMemo(() => {
    const suggestions = new Map<string, ExpenseTripItemSuggestion>();

    for (const entry of COMMON_SARI_SARI_ITEMS) {
      suggestions.set(entry.name.toLowerCase(), { name: entry.name, category: entry.category });
    }

    for (const suggestion of itemSuggestions) {
      const key = suggestion.name.trim().toLowerCase();

      if (!key || suggestions.has(key)) {
        continue;
      }

      suggestions.set(key, suggestion);
    }

    return [...suggestions.values()];
  }, [itemSuggestions]);

  const mergedCategorySuggestions = useMemo(
    () => [...new Set([...COMMON_ITEM_CATEGORIES, ...categorySuggestions].filter(Boolean))],
    [categorySuggestions],
  );

  const draftItemRows = useMemo(
    () =>
      draftItems.map((item) => {
        const quantityValue = parseQuantityInput(item.quantity);
        const unitPriceCents = parseCurrencyToCents(item.unitPrice);
        const lineTotalCents =
          Number.isFinite(quantityValue) &&
          quantityValue > 0 &&
          Number.isFinite(unitPriceCents) &&
          unitPriceCents >= 0
            ? Math.max(0, Math.round(quantityValue * unitPriceCents))
            : 0;

        return {
          ...item,
          lineTotalCents,
          quantityValue,
          unitPriceCentsValue: unitPriceCents,
        };
      }),
    [draftItems],
  );

  const pamasaheCents = safeMoneyInputToCents(pamasaheInput);
  const gasolinaCents = safeMoneyInputToCents(gasolinaInput);
  const otherTravelCents = safeMoneyInputToCents(otherTravelInput);
  const totalItemsCents = draftItemRows.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalTravelCents = pamasaheCents + gasolinaCents + otherTravelCents;
  const grandTotalCents = totalItemsCents + totalTravelCents;
  const currentMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [locale],
  );

  const updateDraftItem = useCallback(
    (itemId: string, field: keyof Omit<DraftTripItem, "id">, value: string) => {
      setDraftItems((current) =>
        current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
      );
    },
    [],
  );

  const handleSuggestionSelect = useCallback((itemId: string, suggestion: ExpenseTripItemSuggestion) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              category: item.category || suggestion.category || "",
              itemName: suggestion.name,
            }
          : item,
      ),
    );
  }, []);

  const handleRemoveItem = useCallback((itemId: string) => {
    setDraftItems((current) => {
      const nextItems = current.filter((item) => item.id !== itemId);
      return nextItems.length > 0 ? nextItems : [createDraftItem()];
    });
  }, []);

  const openNewTripModal = useCallback(() => {
    resetForm();
    setFormVisible(true);
  }, [resetForm]);

  const closeNewTripModal = useCallback(() => {
    if (!saving) {
      setFormVisible(false);
    }
  }, [saving]);

  const openTripDetail = useCallback(
    async (tripId: number) => {
      setDetailTripId(tripId);
      setDetailTrip(null);
      setDetailLoading(true);

      try {
        const nextTrip = await getExpenseTripById(db, tripId);
        setDetailTrip(nextTrip);
      } catch {
        setDetailTripId(null);
        Alert.alert(copy.detailsLoadFailedTitle, copy.detailsLoadFailedMessage);
      } finally {
        setDetailLoading(false);
      }
    },
    [copy.detailsLoadFailedMessage, copy.detailsLoadFailedTitle, db],
  );

  const closeTripDetail = useCallback(() => {
    if (!deleting) {
      setDetailTripId(null);
      setDetailTrip(null);
      setDetailLoading(false);
    }
  }, [deleting]);

  const handleSaveTrip = useCallback(async () => {
    const tripDate = parseDateInputToIso(tripDateInput);

    if (!tripDate) {
      Alert.alert(copy.invalidDateTitle, copy.invalidDateMessage);
      return;
    }

    if (marketNameInput.trim().length < 2) {
      Alert.alert(copy.invalidMarketTitle, copy.invalidMarketMessage);
      return;
    }

    const activeItems = draftItemRows.filter(
      (item) =>
        item.itemName.trim().length > 0 ||
        item.quantity.trim().length > 0 ||
        item.unitPrice.trim().length > 0 ||
        item.category.trim().length > 0,
    );

    if (!activeItems.length) {
      Alert.alert(copy.noItemsTitle, copy.noItemsMessage);
      return;
    }

    for (const item of activeItems) {
      if (item.itemName.trim().length < 2) {
        Alert.alert(copy.noItemsTitle, copy.enterItemName);
        return;
      }

      if (!Number.isFinite(item.quantityValue) || item.quantityValue <= 0) {
        Alert.alert(copy.invalidQuantityTitle, copy.invalidQuantity(item.itemName));
        return;
      }

      if (!Number.isFinite(item.unitPriceCentsValue) || item.unitPriceCentsValue <= 0) {
        Alert.alert(copy.invalidPriceTitle, copy.invalidPrice(item.itemName));
        return;
      }

      if (item.category.trim().length < 2) {
        Alert.alert(copy.invalidMarketTitle, copy.enterCategory(item.itemName));
        return;
      }
    }

    setSaving(true);

    try {
      await createExpenseTrip(db, {
        tripDate,
        marketName: marketNameInput,
        paymentMethod,
        pamasaheCents,
        gasolinaCents,
        otherTravelCents,
        notes: notesInput,
        items: activeItems.map((item) => ({
          category: item.category,
          itemName: item.itemName,
          quantity: item.quantityValue,
          unitPriceCents: item.unitPriceCentsValue,
        })),
      });

      setFormVisible(false);
      resetForm();
      await loadTrips();
    } catch {
      Alert.alert(copy.saveFailedTitle, copy.saveFailedMessage);
    } finally {
      setSaving(false);
    }
  }, [
    copy,
    db,
    draftItemRows,
    gasolinaCents,
    loadTrips,
    marketNameInput,
    notesInput,
    otherTravelCents,
    pamasaheCents,
    paymentMethod,
    resetForm,
    tripDateInput,
  ]);

  const handleDeleteTrip = useCallback(() => {
    if (!detailTrip) {
      return;
    }

    Alert.alert(
      copy.deleteTitle,
      copy.deleteMessage,
      [
        { text: copy.cancel, style: "cancel" },
        {
          text: copy.deleteConfirm,
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);

              try {
                await deleteExpenseTrip(db, detailTrip.id);
                closeTripDetail();
                await loadTrips();
              } catch {
                Alert.alert(copy.deleteFailedTitle, copy.deleteFailedMessage);
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  }, [closeTripDetail, copy, db, detailTrip, loadTrips]);

  const formatTripDate = useCallback(
    (dateIso: string, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options ?? { day: "numeric", month: "short", year: "numeric" }).format(
        new Date(dateIso),
      ),
    [locale],
  );

  const renderHistoryContent = () => (
    <>
      <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={microLabelStyle}>{copy.listSummary}</Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.strong,
              fontSize: theme.typography.scale.h2.fontSize,
              lineHeight: theme.typography.scale.h2.lineHeight,
            }}
          >
            {currentMonthLabel}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[
            {
              helper: copy.tripCount(overview?.currentMonthTripCount ?? 0),
              label: copy.thisMonth,
              value: formatCurrencyFromCents(overview?.currentMonthTotalCents ?? 0),
            },
            {
              helper: copy.tripCount(overview?.allTimeTripCount ?? 0),
              label: copy.allTime,
              value: formatCurrencyFromCents(overview?.allTimeTotalCents ?? 0),
            },
          ].map((card) => (
            <View
              key={card.label}
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                flex: 1,
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
              }}
            >
              <Text style={[microLabelStyle, { color: theme.colors.textSoft }]}>{card.label}</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.money,
                  fontSize: theme.typography.scale.body.fontSize,
                  lineHeight: theme.typography.scale.body.lineHeight,
                }}
              >
                {card.value}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {card.helper}
              </Text>
            </View>
          ))}
        </View>

      </SurfaceCard>

      <View style={{ gap: theme.spacing.md }}>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ gap: 2 }}>
            <Text style={microLabelStyle}>{copy.history}</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.strong,
                fontSize: theme.typography.scale.h2.fontSize,
                lineHeight: theme.typography.scale.h2.lineHeight,
              }}
            >
              {copy.historyTitle}
            </Text>
          </View>
          {!loading && trips.length > 0 ? <StatusBadge label={copy.tripCount(trips.length)} tone="neutral" /> : null}
        </View>

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
              {copy.formLoadingHistory}
            </Text>
          </SurfaceCard>
        ) : trips.length === 0 ? (
          <EmptyState
            icon="truck"
            message={copy.emptyMessage}
            title={copy.emptyTitle}
          />
        ) : (
          trips.map((trip) => (
            <Pressable key={trip.id} onPress={() => void openTripDetail(trip.id)}>
              {({ pressed }) => (
                <SurfaceCard
                  style={[
                    compactCardStyle,
                    {
                      gap: theme.spacing.md,
                      opacity: pressed ? 0.94 : 1,
                      transform: [{ scale: pressed ? 0.995 : 1 }],
                    },
                  ]}
                >
                  <View
                    style={{
                      alignItems: "center",
                      flexDirection: "row",
                      gap: theme.spacing.md,
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, gap: theme.spacing.xs }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.strong,
                          fontSize: theme.typography.scale.body.fontSize,
                          lineHeight: theme.typography.scale.body.lineHeight,
                        }}
                      >
                        {trip.marketName}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 13,
                        }}
                      >
                        {copy.tripSummaryLine(formatTripDate(trip.tripDate), trip.itemCount)}
                      </Text>
                    </View>
                    <StatusBadge
                      label={getPaymentMethodLabel(trip.paymentMethod, language)}
                      tone={getPaymentMethodTone(trip.paymentMethod)}
                    />
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                    {trip.itemTags.slice(0, 3).map((tag) => (
                      <View
                        key={`${trip.id}-${tag}`}
                        style={{
                          backgroundColor: theme.colors.surfaceMuted,
                          borderRadius: theme.radius.pill,
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: 8,
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
                          {tag}
                        </Text>
                      </View>
                    ))}
                    {trip.itemTags.length > 3 ? (
                      <View
                        style={{
                          backgroundColor: theme.colors.primaryMuted,
                          borderRadius: theme.radius.pill,
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.colors.primary,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {copy.moreItems(trip.itemTags.length - 3)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={{
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ gap: 2 }}>
                      <Text style={[microLabelStyle, { color: theme.colors.textSoft }]}>{copy.totalCost}</Text>
                      <Text
                        style={{
                          color: theme.colors.primary,
                          fontFamily: theme.typography.money,
                          fontSize: theme.typography.scale.body.fontSize,
                          lineHeight: theme.typography.scale.body.lineHeight,
                        }}
                      >
                        {formatCurrencyFromCents(trip.grandTotalCents)}
                      </Text>
                    </View>
                    <Feather color={theme.colors.textSoft} name="chevron-right" size={18} />
                  </View>
                </SurfaceCard>
              )}
            </Pressable>
          ))
        )}
      </View>
    </>
  );

  const renderFormContent = () => (
    <>
      <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
        <Text style={microLabelStyle}>{copy.formRunningTotal}</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[
            { label: copy.formItemsTotal, value: formatCurrencyFromCents(totalItemsCents) },
            { label: copy.formTravelTotal, value: formatCurrencyFromCents(totalTravelCents) },
          ].map((entry) => (
            <View
              key={entry.label}
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                flex: 1,
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
              }}
            >
              <Text style={[microLabelStyle, { color: theme.colors.textSoft }]}>{entry.label}</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.money,
                  fontSize: theme.typography.scale.body.fontSize,
                  lineHeight: theme.typography.scale.body.lineHeight,
                }}
              >
                {entry.value}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={{
            backgroundColor: theme.colors.primaryMuted,
            borderRadius: theme.radius.md,
            gap: theme.spacing.xs,
            padding: theme.spacing.md,
          }}
        >
          <Text style={[microLabelStyle, { color: theme.colors.primary }]}>{copy.formGrandTotal}</Text>
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.typography.money,
              fontSize: theme.typography.scale.h2.fontSize,
              lineHeight: theme.typography.scale.h2.lineHeight,
            }}
          >
            {formatCurrencyFromCents(grandTotalCents)}
          </Text>
        </View>
      </SurfaceCard>

      <InputField
        label={copy.date}
        onChangeText={setTripDateInput}
        placeholder="YYYY-MM-DD"
        value={tripDateInput}
      />

      <InputField
        label={copy.marketName}
        onChangeText={setMarketNameInput}
        placeholder={copy.marketNamePlaceholder}
        value={marketNameInput}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={microLabelStyle}>{copy.paymentMethod}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {PAYMENT_METHOD_OPTIONS.map((option) => {
            const active = paymentMethod === option;

            return (
              <Pressable
                key={option}
                onPress={() => setPaymentMethod(option)}
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
                    fontWeight: "600",
                  }}
                >
                  {getPaymentMethodLabel(option, language)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ gap: 2 }}>
            <Text style={microLabelStyle}>{copy.itemsSectionLabel}</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.strong,
                fontSize: theme.typography.scale.body.fontSize,
                lineHeight: theme.typography.scale.body.lineHeight,
              }}
            >
              {copy.itemsSectionTitle}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={copy.addItem}
            onPress={() => setDraftItems((current) => [...current, createDraftItem()])}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.primaryMuted,
              borderRadius: theme.radius.pill,
              height: 38,
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
              width: 38,
            })}
          >
            <Feather color={theme.colors.primary} name="plus" size={16} />
          </Pressable>
        </View>

        {draftItemRows.map((item, index) => {
          const searchValue = normalizeSearchValue(item.itemName);
          const matchingSuggestions =
            searchValue.length === 0
              ? mergedItemSuggestions.slice(0, 6)
              : mergedItemSuggestions
                  .filter((suggestion) => normalizeSearchValue(suggestion.name).includes(searchValue))
                  .slice(0, 6);

          return (
            <SurfaceCard key={item.id} style={[compactCardStyle, { gap: theme.spacing.md }]}>
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={microLabelStyle}>{copy.itemIndex(index + 1)}</Text>
                {draftItems.length > 1 ? (
                  <Pressable
                    accessibilityLabel={language === "english" ? "Remove item" : "Tanggalin ang item"}
                    onPress={() => handleRemoveItem(item.id)}
                    style={({ pressed }) => ({
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Feather color={theme.colors.danger} name="trash-2" size={16} />
                  </Pressable>
                ) : null}
              </View>

              <InputField
                label={copy.itemName}
                onChangeText={(value) => updateDraftItem(item.id, "itemName", value)}
                placeholder={copy.itemNamePlaceholder}
                value={item.itemName}
              />

              {matchingSuggestions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                    {matchingSuggestions.map((suggestion) => (
                      <Pressable
                        key={`${item.id}-${suggestion.name}`}
                        onPress={() => handleSuggestionSelect(item.id, suggestion)}
                        style={({ pressed }) => ({
                          backgroundColor: theme.colors.surfaceMuted,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.pill,
                          borderWidth: 1,
                          opacity: pressed ? 0.92 : 1,
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: 10,
                        })}
                      >
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {suggestion.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label={copy.itemQuantity}
                    onChangeText={(value) => updateDraftItem(item.id, "quantity", value)}
                    placeholder="1"
                    value={item.quantity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label={copy.itemUnitPrice}
                    onChangeText={(value) => updateDraftItem(item.id, "unitPrice", value)}
                    placeholder="0.00"
                    value={item.unitPrice}
                  />
                </View>
              </View>

              <InputField
                label={copy.itemCategory}
                onChangeText={(value) => updateDraftItem(item.id, "category", value)}
                placeholder={copy.itemCategoryPlaceholder}
                value={item.category}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  {mergedCategorySuggestions.slice(0, 10).map((category) => {
                    const active = normalizeSearchValue(item.category) === normalizeSearchValue(category);

                    return (
                      <Pressable
                        key={`${item.id}-${category}`}
                        onPress={() => updateDraftItem(item.id, "category", category)}
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
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {humanizeCategory(category)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                  }}
                >
                  {Number.isFinite(item.quantityValue) && item.quantityValue > 0
                    ? `${formatQuantityLabel(item.quantityValue)} x ${formatCurrencyFromCents(
                        Number.isFinite(item.unitPriceCentsValue) && item.unitPriceCentsValue > 0 ? item.unitPriceCentsValue : 0,
                      )}`
                    : copy.itemHint}
                </Text>
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: theme.typography.money,
                    fontSize: theme.typography.scale.body.fontSize,
                    lineHeight: theme.typography.scale.body.lineHeight,
                  }}
                >
                  {formatCurrencyFromCents(item.lineTotalCents)}
                </Text>
              </View>
            </SurfaceCard>
          );
        })}
      </View>

      <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
        <View style={{ gap: 2 }}>
          <Text style={microLabelStyle}>{copy.travelCosts}</Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.strong,
              fontSize: theme.typography.scale.body.fontSize,
              lineHeight: theme.typography.scale.body.lineHeight,
            }}
          >
            {copy.travelSubtitle}
          </Text>
        </View>

        <InputField
          keyboardType="decimal-pad"
          label={language === "english" ? "Fare" : "Pamasahe"}
          onChangeText={setPamasaheInput}
          placeholder="0.00"
          value={pamasaheInput}
        />
        <InputField
          keyboardType="decimal-pad"
          label={language === "english" ? "Gas" : "Gasolina"}
          onChangeText={setGasolinaInput}
          placeholder="0.00"
          value={gasolinaInput}
        />
        <InputField
          keyboardType="decimal-pad"
          label={copy.otherTravel}
          onChangeText={setOtherTravelInput}
          placeholder={copy.otherTravelPlaceholder}
          value={otherTravelInput}
        />
      </SurfaceCard>

      <InputField
        label={copy.notes}
        multiline
        onChangeText={setNotesInput}
        placeholder={copy.notesPlaceholder}
        value={notesInput}
      />
    </>
  );

  const renderDetailContent = () => (
    <>
      {detailLoading ? (
        <SurfaceCard style={[compactCardStyle, { alignItems: "center" }]}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
            }}
          >
            {copy.detailLoading}
          </Text>
        </SurfaceCard>
      ) : detailTrip ? (
        <View style={{ gap: theme.spacing.md }}>
          <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <StatusBadge
                label={getPaymentMethodLabel(detailTrip.paymentMethod, language)}
                tone={getPaymentMethodTone(detailTrip.paymentMethod)}
              />
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {formatTripDate(detailTrip.tripDate)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {[
                { label: copy.formItemsTotal, value: formatCurrencyFromCents(detailTrip.totalItemsCents) },
                { label: copy.formTravelTotal, value: formatCurrencyFromCents(detailTrip.totalTravelCents) },
                { label: language === "english" ? "Total" : "Kabuuan", value: formatCurrencyFromCents(detailTrip.grandTotalCents) },
              ].map((entry) => (
                <View
                  key={entry.label}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    flex: 1,
                    gap: theme.spacing.xs,
                    padding: theme.spacing.md,
                  }}
                >
                  <Text style={[microLabelStyle, { color: theme.colors.textSoft }]}>{entry.label}</Text>
                  <Text
                    style={{
                      color:
                        entry.label === (language === "english" ? "Total" : "Kabuuan")
                          ? theme.colors.primary
                          : theme.colors.text,
                      fontFamily: theme.typography.money,
                      fontSize: theme.typography.scale.body.fontSize,
                      lineHeight: theme.typography.scale.body.lineHeight,
                    }}
                  >
                    {entry.value}
                  </Text>
                </View>
              ))}
            </View>
          </SurfaceCard>

          <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
            <View style={{ gap: 2 }}>
              <Text style={microLabelStyle}>{copy.itemsSectionTitle}</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.strong,
                  fontSize: theme.typography.scale.body.fontSize,
                  lineHeight: theme.typography.scale.body.lineHeight,
                }}
              >
                {copy.detailItemsCount(detailTrip.items.length)}
              </Text>
            </View>

            {detailTrip.items.map((item) => (
              <View
                key={item.id}
                style={{
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  gap: theme.spacing.sm,
                  padding: theme.spacing.md,
                }}
              >
                <View
                  style={{
                    alignItems: "center",
                    flexDirection: "row",
                    gap: theme.spacing.sm,
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.label,
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      {item.itemName}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                      }}
                    >
                      {`${formatQuantityLabel(item.quantity)} x ${formatCurrencyFromCents(item.unitPriceCents)}`}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontFamily: theme.typography.money,
                      fontSize: theme.typography.scale.body.fontSize,
                      lineHeight: theme.typography.scale.body.lineHeight,
                    }}
                  >
                    {formatCurrencyFromCents(item.lineTotalCents)}
                  </Text>
                </View>
                <StatusBadge label={humanizeCategory(item.category)} tone="neutral" />
              </View>
            ))}
          </SurfaceCard>

          <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.md }]}>
            <View style={{ gap: 2 }}>
              <Text style={microLabelStyle}>{copy.travelCosts}</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.strong,
                  fontSize: theme.typography.scale.body.fontSize,
                  lineHeight: theme.typography.scale.body.lineHeight,
                }}
              >
                {copy.travelSubtitle}
              </Text>
            </View>

            {[
              { label: language === "english" ? "Fare" : "Pamasahe", value: detailTrip.pamasaheCents },
              { label: language === "english" ? "Gas" : "Gasolina", value: detailTrip.gasolinaCents },
              { label: copy.otherTravelLabel, value: detailTrip.otherTravelCents },
            ].map((entry) => (
              <View
                key={entry.label}
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  {entry.label}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.label,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {formatCurrencyFromCents(entry.value)}
                </Text>
              </View>
            ))}
          </SurfaceCard>

          {detailTrip.notes?.trim() ? (
            <SurfaceCard style={[compactCardStyle, { gap: theme.spacing.sm }]}>
              <Text style={microLabelStyle}>{copy.notes}</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  lineHeight: 22,
                }}
              >
                {detailTrip.notes}
              </Text>
            </SurfaceCard>
          ) : null}
        </View>
      ) : (
        <EmptyState
          icon="file-text"
          message={copy.detailEmptyMessage}
          title={copy.detailEmptyTitle}
        />
      )}
    </>
  );

  return (
    <>
      <Screen
        rightSlot={
          <Pressable
            accessibilityLabel={copy.addTripAccessibility}
            hitSlop={6}
            onPress={openNewTripModal}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              height: 40,
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
              width: 40,
            })}
          >
            <Feather color={theme.colors.primaryText} name="plus" size={18} />
          </Pressable>
        }
        subtitle={copy.screenSubtitle}
        title={copy.screenTitle}
      >
        {renderHistoryContent()}
      </Screen>

      <ModalSheet
        contentContainerStyle={{ paddingBottom: theme.spacing.md }}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={saving}
              label={saving ? copy.saveProgress : copy.save}
              onPress={() => void handleSaveTrip()}
            />
          </View>
        }
        fullHeight
        onClose={closeNewTripModal}
        subtitle={copy.newTripSubtitle}
        title={copy.newTripTitle}
        visible={formVisible}
      >
        {renderFormContent()}
      </ModalSheet>

      <ModalSheet
        footer={
          detailTrip ? (
            <View style={{ gap: theme.spacing.sm }}>
              <ActionButton
                disabled={deleting}
                label={deleting ? copy.deleteProgress : copy.delete}
                onPress={handleDeleteTrip}
                variant="danger"
              />
            </View>
          ) : undefined
        }
        fullHeight
        onClose={closeTripDetail}
        subtitle={
          detailTrip
            ? formatTripDate(detailTrip.tripDate, { day: "numeric", month: "long", year: "numeric" })
            : copy.detailFallbackSubtitle
        }
        title={detailTrip?.marketName ?? copy.detailTitle}
        visible={detailTripId !== null}
      >
        {renderDetailContent()}
      </ModalSheet>
    </>
  );
}
