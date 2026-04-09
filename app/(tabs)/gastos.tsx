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
import type { ExpenseTrip, ExpenseTripOverview, ExpenseTripSummary, PaymentMethod } from "@/types/models";
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

const PAYMENT_METHOD_OPTIONS: { label: string; value: PaymentMethod }[] = [
  { label: "Cash", value: "cash" },
  { label: "GCash", value: "gcash" },
  { label: "Maya", value: "maya" },
  { label: "Utang", value: "utang" },
];

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

function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
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

  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;
  const microLabelStyle = {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.label,
    fontSize: 11,
    fontWeight: "600" as const,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
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
    } catch (error) {
      Alert.alert(
        "Hindi makuha ang mga biyahe",
        error instanceof Error ? error.message : "May problema habang kinukuha ang gastos sa biyahe.",
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

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
      } catch (error) {
        setDetailTripId(null);
        Alert.alert(
          "Hindi makuha ang detalye",
          error instanceof Error ? error.message : "May problema habang kinukuha ang detalye ng biyahe.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [db],
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
      Alert.alert("Invalid na petsa", "Gamitin ang format na YYYY-MM-DD para sa petsa ng biyahe.");
      return;
    }

    if (marketNameInput.trim().length < 2) {
      Alert.alert("Kulang ang lugar", "Ilagay ang pangalan ng palengke o tindahan.");
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
      Alert.alert("Walang laman ang listahan", "Maglagay ng kahit isang item na binili bago mag-save.");
      return;
    }

    for (const item of activeItems) {
      if (item.itemName.trim().length < 2) {
        Alert.alert("May kulang na item", "Kumpletuhin ang pangalan ng item bago mag-save.");
        return;
      }

      if (!Number.isFinite(item.quantityValue) || item.quantityValue <= 0) {
        Alert.alert("Invalid na dami", `Ayusin ang dami para sa ${item.itemName}.`);
        return;
      }

      if (!Number.isFinite(item.unitPriceCentsValue) || item.unitPriceCentsValue <= 0) {
        Alert.alert("Invalid na presyo", `Ayusin ang presyo para sa ${item.itemName}.`);
        return;
      }

      if (item.category.trim().length < 2) {
        Alert.alert("Kulang ang category", `Maglagay ng category para sa ${item.itemName}.`);
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
    } catch (error) {
      Alert.alert(
        "Hindi na-save ang biyahe",
        error instanceof Error ? error.message : "May nangyaring problema habang sine-save ang biyahe.",
      );
    } finally {
      setSaving(false);
    }
  }, [
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
      "Burahin ang biyahe?",
      "Tatanggalin nito ang buong record ng biyahe pati ang lahat ng item at gastos na kasama rito.",
      [
        { text: "Huwag", style: "cancel" },
        {
          text: "Burahin",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);

              try {
                await deleteExpenseTrip(db, detailTrip.id);
                closeTripDetail();
                await loadTrips();
              } catch (error) {
                Alert.alert(
                  "Hindi nabura ang biyahe",
                  error instanceof Error ? error.message : "May problema habang binubura ang biyahe.",
                );
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ],
    );
  }, [closeTripDetail, db, detailTrip, loadTrips]);

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
          <Text style={microLabelStyle}>Buod</Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.display,
              fontSize: 22,
              fontWeight: "600",
            }}
          >
            {currentMonthLabel}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[
            {
              helper: `${overview?.currentMonthTripCount ?? 0} biyahe`,
              label: "Ngayong Buwan",
              value: formatCurrencyFromCents(overview?.currentMonthTotalCents ?? 0),
            },
            {
              helper: `${overview?.allTimeTripCount ?? 0} lahat`,
              label: "Simula Noong Una",
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
                  fontFamily: theme.typography.display,
                  fontSize: 21,
                  fontWeight: "600",
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

        <ActionButton
          icon={<Feather color={theme.colors.primaryText} name="shopping-bag" size={16} />}
          label="Mag-log ng Bagong Biyahe"
          onPress={openNewTripModal}
        />
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
            <Text style={microLabelStyle}>Kasaysayan</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 22,
                fontWeight: "600",
              }}
            >
              Mga Nakaraang Biyahe
            </Text>
          </View>
          {!loading && trips.length > 0 ? <StatusBadge label={`${trips.length} biyahe`} tone="neutral" /> : null}
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
              Inaayos ang kasaysayan ng biyahe...
            </Text>
          </SurfaceCard>
        ) : trips.length === 0 ? (
          <EmptyState
            icon="truck"
            message="Kapag may biyahe ka na sa restock, lalabas dito ang tindahan, petsa, mga item, at kabuuang gastos."
            title="Wala Pang Nai-log na Biyahe"
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
                          fontFamily: theme.typography.display,
                          fontSize: 20,
                          fontWeight: "600",
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
                        {`${formatTripDate(trip.tripDate)} - ${trip.itemCount} item`}
                      </Text>
                    </View>
                    <StatusBadge label={getPaymentMethodLabel(trip.paymentMethod)} tone={getPaymentMethodTone(trip.paymentMethod)} />
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
                          {`+${trip.itemTags.length - 3} pa`}
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
                      <Text style={[microLabelStyle, { color: theme.colors.textSoft }]}>Kabuuang Gastos</Text>
                      <Text
                        style={{
                          color: theme.colors.primary,
                          fontFamily: theme.typography.display,
                          fontSize: 24,
                          fontWeight: "600",
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
        <Text style={microLabelStyle}>Tumatakbong Total</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[
            { label: "Mga Item", value: formatCurrencyFromCents(totalItemsCents) },
            { label: "Biyahe", value: formatCurrencyFromCents(totalTravelCents) },
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
                  fontFamily: theme.typography.display,
                  fontSize: 18,
                  fontWeight: "600",
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
          <Text style={[microLabelStyle, { color: theme.colors.primary }]}>Kabuuan Bago I-save</Text>
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.typography.display,
              fontSize: 28,
              fontWeight: "600",
            }}
          >
            {formatCurrencyFromCents(grandTotalCents)}
          </Text>
        </View>
      </SurfaceCard>

      <InputField
        label="Petsa"
        onChangeText={setTripDateInput}
        placeholder="YYYY-MM-DD"
        value={tripDateInput}
      />

      <InputField
        label="Palengke / Tindahan"
        onChangeText={setMarketNameInput}
        placeholder="Halimbawa: Puregold Bocaue o Palengke ng Bayan"
        value={marketNameInput}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={microLabelStyle}>Paraan ng Bayad</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {PAYMENT_METHOD_OPTIONS.map((option) => {
            const active = paymentMethod === option.value;

            return (
              <Pressable
                key={option.value}
                onPress={() => setPaymentMethod(option.value)}
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
                  {option.label}
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
            <Text style={microLabelStyle}>Mga Binili</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
              fontSize: 20,
              fontWeight: "600",
            }}
          >
              Listahan ng Mga Binili
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Magdagdag ng item"
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
                <Text style={microLabelStyle}>{`Binili ${index + 1}`}</Text>
                {draftItems.length > 1 ? (
                  <Pressable
                    accessibilityLabel="Tanggalin ang item"
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
                label="Pangalan ng Item"
                onChangeText={(value) => updateDraftItem(item.id, "itemName", value)}
                placeholder="Halimbawa: Sardinas, Bigas, Noodles"
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
                    label="Dami"
                    onChangeText={(value) => updateDraftItem(item.id, "quantity", value)}
                    placeholder="1"
                    value={item.quantity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Presyo Kada Unit"
                    onChangeText={(value) => updateDraftItem(item.id, "unitPrice", value)}
                    placeholder="0.00"
                    value={item.unitPrice}
                  />
                </View>
              </View>

              <InputField
                label="Kategorya"
                onChangeText={(value) => updateDraftItem(item.id, "category", value)}
                placeholder="Halimbawa: Delata, Bigas, Inumin"
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
                    : "Hintayin ang quantity at presyo para lumabas ang subtotal."}
                </Text>
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: theme.typography.display,
                    fontSize: 18,
                    fontWeight: "600",
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
          <Text style={microLabelStyle}>Gastos sa Biyahe</Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.display,
              fontSize: 20,
              fontWeight: "600",
            }}
          >
            Pamasahe at Iba Pa
          </Text>
        </View>

        <InputField
          keyboardType="decimal-pad"
          label="Pamasahe"
          onChangeText={setPamasaheInput}
          placeholder="0.00"
          value={pamasaheInput}
        />
        <InputField
          keyboardType="decimal-pad"
          label="Gasolina"
          onChangeText={setGasolinaInput}
          placeholder="0.00"
          value={gasolinaInput}
        />
        <InputField
          keyboardType="decimal-pad"
          label="Iba Pang Gastos sa Biyahe"
          onChangeText={setOtherTravelInput}
          placeholder="Pagkain, bayad sa tao, atbp."
          value={otherTravelInput}
        />
      </SurfaceCard>

      <InputField
        label="Mga Tala"
        multiline
        onChangeText={setNotesInput}
        placeholder="Opsyonal na tala tungkol sa biyaheng ito"
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
            Kinukuha ang detalye ng biyahe...
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
              <StatusBadge label={getPaymentMethodLabel(detailTrip.paymentMethod)} tone={getPaymentMethodTone(detailTrip.paymentMethod)} />
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
                { label: "Mga Item", value: formatCurrencyFromCents(detailTrip.totalItemsCents) },
                { label: "Biyahe", value: formatCurrencyFromCents(detailTrip.totalTravelCents) },
                { label: "Kabuuan", value: formatCurrencyFromCents(detailTrip.grandTotalCents) },
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
                      color: entry.label === "Kabuuan" ? theme.colors.primary : theme.colors.text,
                      fontFamily: theme.typography.display,
                      fontSize: 18,
                      fontWeight: "600",
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
              <Text style={microLabelStyle}>Listahan ng Mga Binili</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 20,
                  fontWeight: "600",
                }}
              >
                {`${detailTrip.items.length} item na binili`}
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
                      fontFamily: theme.typography.display,
                      fontSize: 18,
                      fontWeight: "600",
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
              <Text style={microLabelStyle}>Gastos sa Biyahe</Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 20,
                  fontWeight: "600",
                }}
              >
                Pamasahe at Iba Pa
              </Text>
            </View>

            {[
              { label: "Pamasahe", value: detailTrip.pamasaheCents },
              { label: "Gasolina", value: detailTrip.gasolinaCents },
              { label: "Iba Pa", value: detailTrip.otherTravelCents },
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
              <Text style={microLabelStyle}>Mga Tala</Text>
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
          message="Hindi makita ang detalye ng biyahe na ito."
          title="Walang Detalye"
        />
      )}
    </>
  );

  return (
    <>
      <Screen
        rightSlot={
          <Pressable
            accessibilityLabel="Mag-log ng biyahe"
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
        subtitle="I-log ang buong biyahe sa restock kasama ang mga item at gastos sa biyahe."
        title="Biyahe sa Restock"
      >
        {renderHistoryContent()}
      </Screen>

      <ModalSheet
        contentContainerStyle={{ paddingBottom: theme.spacing.md }}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={saving}
              label={saving ? "Sine-save ang biyahe..." : "I-save ang Biyahe"}
              onPress={() => void handleSaveTrip()}
            />
          </View>
        }
        fullHeight
        onClose={closeNewTripModal}
        subtitle="Mga item, pamasahe, at tala para sa isang biyahe sa restock"
        title="Bagong Biyahe"
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
                label={deleting ? "Binubura ang biyahe..." : "Burahin ang Biyahe"}
                onPress={handleDeleteTrip}
                variant="danger"
              />
            </View>
          ) : undefined
        }
        fullHeight
        onClose={closeTripDetail}
        subtitle={detailTrip ? formatTripDate(detailTrip.tripDate, { day: "numeric", month: "long", year: "numeric" }) : "Detalye"}
        title={detailTrip?.marketName ?? "Detalye ng Biyahe"}
        visible={detailTripId !== null}
      >
        {renderDetailContent()}
      </ModalSheet>
    </>
  );
}
