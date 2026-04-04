import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import type { TranslationKey } from "@/constants/translations";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  archiveRestockList,
  createRestockListFromThresholds,
  getRestockListById,
  listLowStockProducts,
  listRestockLists,
  toggleRestockListItem,
  updateRestockListItemNote,
} from "@/db/repositories";
import type { RestockList, RestockListItem, RestockListStatus, RestockListSummary } from "@/types/models";
import { formatWeightKg } from "@/utils/pricing";

function getRestockStatusTone(status: RestockListStatus) {
  if (status === "completed") {
    return "success" as const;
  }

  if (status === "archived") {
    return "neutral" as const;
  }

  return "primary" as const;
}

function resolveSelectedListId(
  lists: RestockListSummary[],
  preferredListId?: number | null,
  currentListId?: number | null,
) {
  if (preferredListId && lists.some((list) => list.id === preferredListId)) {
    return preferredListId;
  }

  if (currentListId && lists.some((list) => list.id === currentListId)) {
    return currentListId;
  }

  return lists[0]?.id ?? null;
}

function buildNoteDrafts(items: RestockListItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.note ?? ""]));
}

function formatRestockQuantity(quantity: number, isWeightBased: boolean) {
  return isWeightBased ? `${formatWeightKg(quantity)} kg` : `${Math.round(quantity)} pcs`;
}

export default function RestockScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { language, t } = useAppLanguage();
  const [lists, setLists] = useState<RestockListSummary[]>([]);
  const [selectedList, setSelectedList] = useState<RestockList | null>(null);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<number | null>(null);
  const locale = language === "english" ? "en-PH" : "fil-PH";

  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;

  const formatListDate = useCallback(
    (dateIso: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
      }).format(new Date(dateIso)),
    [locale],
  );

  const getStatusLabel = useCallback(
    (status: RestockListStatus) => t(`restock.status.${status}` as TranslationKey),
    [t],
  );

  const getItemCountLabel = useCallback(
    (count: number) => (count === 1 ? t("restock.count.single") : t("restock.count.plural", { count })),
    [t],
  );

  const loadRestockData = useCallback(
    async (preferredListId?: number | null) => {
      setLoading(true);

      try {
        const [nextLists, lowStockProducts] = await Promise.all([listRestockLists(db), listLowStockProducts(db)]);
        const nextSelectedId = resolveSelectedListId(nextLists, preferredListId, selectedListId);
        const nextSelectedList = nextSelectedId ? await getRestockListById(db, nextSelectedId) : null;

        setLists(nextLists);
        setCandidateCount(lowStockProducts.length);
        setSelectedList(nextSelectedList);
        setSelectedListId(nextSelectedList?.id ?? null);
        setNoteDrafts(nextSelectedList ? buildNoteDrafts(nextSelectedList.items) : {});
      } finally {
        setLoading(false);
      }
    },
    [db, selectedListId],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRestockData(selectedListId);
    }, [loadRestockData, selectedListId]),
  );

  const handleGenerateList = useCallback(async () => {
    setGenerating(true);

    try {
      const nextList = await createRestockListFromThresholds(db);
      await loadRestockData(nextList.id);
    } catch (error) {
      Alert.alert(
        t("restock.alert.generateFailedTitle"),
        error instanceof Error ? error.message : t("restock.alert.generateFailedMessage"),
      );
    } finally {
      setGenerating(false);
    }
  }, [db, loadRestockData, t]);

  const handleSelectList = useCallback(
    async (restockListId: number) => {
      setSelectedListId(restockListId);
      await loadRestockData(restockListId);
    },
    [loadRestockData],
  );

  const handleToggleItem = useCallback(
    async (itemId: number) => {
      setBusyItemId(itemId);

      try {
        const nextList = await toggleRestockListItem(db, itemId);
        const nextLists = await listRestockLists(db);

        setLists(nextLists);
        setSelectedListId(nextList.id);
        setSelectedList(nextList);
        setNoteDrafts(buildNoteDrafts(nextList.items));
      } catch (error) {
        Alert.alert(
          t("restock.alert.toggleFailedTitle"),
          error instanceof Error ? error.message : t("restock.alert.toggleFailedMessage"),
        );
      } finally {
        setBusyItemId(null);
      }
    },
    [db, t],
  );

  const handleSaveNote = useCallback(
    async (item: RestockListItem) => {
      const draftValue = noteDrafts[item.id] ?? "";
      const normalizedDraft = draftValue.trim();
      const normalizedCurrent = (item.note ?? "").trim();

      if (normalizedDraft === normalizedCurrent) {
        return;
      }

      setSavingNoteId(item.id);

      try {
        await updateRestockListItemNote(db, item.id, draftValue);
        if (selectedListId) {
          await loadRestockData(selectedListId);
        }
      } catch (error) {
        Alert.alert(
          t("restock.alert.noteFailedTitle"),
          error instanceof Error ? error.message : t("restock.alert.noteFailedMessage"),
        );
      } finally {
        setSavingNoteId(null);
      }
    },
    [db, loadRestockData, noteDrafts, selectedListId, t],
  );

  const handleArchiveList = useCallback(() => {
    if (!selectedList) {
      return;
    }

    Alert.alert(t("restock.alert.archiveTitle"), t("restock.alert.archiveMessage"), [
      { text: t("home.cloud.cancel"), style: "cancel" },
      {
        text: t("restock.alert.archiveConfirm"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            setArchiving(true);

            try {
              await archiveRestockList(db, selectedList.id);
              await loadRestockData();
            } catch (error) {
              Alert.alert(
                t("restock.alert.archiveFailedTitle"),
                error instanceof Error ? error.message : t("restock.alert.archiveFailedMessage"),
              );
            } finally {
              setArchiving(false);
            }
          })();
        },
      },
    ]);
  }, [db, loadRestockData, selectedList, t]);

  const emptyState = useMemo(
    () =>
      candidateCount > 0
        ? {
            message: t("restock.emptyMessage"),
            title: t("restock.emptyTitle"),
          }
        : {
            message: t("restock.noneNeededMessage"),
            title: t("restock.noneNeededTitle"),
          },
    [candidateCount, t],
  );

  return (
    <Screen
      contentContainerStyle={{
        gap: theme.spacing.md,
        paddingBottom: 120,
        paddingTop: theme.spacing.md,
      }}
      title={t("restock.title")}
      subtitle={t("restock.subtitle")}
    >
      <SurfaceCard style={compactCardStyle}>
        <ActionButton
          disabled={generating}
          label={generating ? t("restock.generating") : t("restock.generate")}
          onPress={() => void handleGenerateList()}
        />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {candidateCount > 0 ? getItemCountLabel(candidateCount) : t("restock.noneNeededMessage")}
        </Text>
      </SurfaceCard>

      {lists.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {t("restock.currentLists")}
          </Text>
          <ScrollView
            contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {lists.map((list) => {
              const isActive = list.id === selectedListId;

              return (
                <Pressable
                  key={list.id}
                  onPress={() => {
                    void handleSelectList(list.id);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: isActive ? theme.colors.primaryMuted : theme.colors.card,
                    borderColor: isActive ? theme.colors.primary : theme.colors.border,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    gap: theme.spacing.xs,
                    minWidth: 188,
                    opacity: pressed ? 0.9 : 1,
                    padding: theme.spacing.md,
                  })}
                >
                  <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.sm, justifyContent: "space-between" }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.colors.text,
                        flex: 1,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {list.title}
                    </Text>
                    <StatusBadge label={getStatusLabel(list.status)} tone={getRestockStatusTone(list.status)} />
                  </View>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                    }}
                  >
                    {t("restock.progress", { checked: list.checkedItems, total: list.totalItems })}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textSoft,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                    }}
                  >
                    {list.status === "completed" && list.completedAt
                      ? t("restock.completedAt", { date: formatListDate(list.completedAt) })
                      : t("restock.createdAt", { date: formatListDate(list.createdAt) })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {loading ? (
        <SurfaceCard style={[compactCardStyle, { alignItems: "center" }]}>
          <ActivityIndicator color={theme.colors.primary} />
        </SurfaceCard>
      ) : selectedList ? (
        <>
          <SurfaceCard style={compactCardStyle}>
            <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.sm, justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: 22,
                    fontWeight: "600",
                  }}
                >
                  {selectedList.title}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                  }}
                >
                  {selectedList.status === "completed" && selectedList.completedAt
                    ? t("restock.completedAt", { date: formatListDate(selectedList.completedAt) })
                    : t("restock.createdAt", { date: formatListDate(selectedList.createdAt) })}
                </Text>
              </View>
              <StatusBadge
                label={getStatusLabel(selectedList.status)}
                tone={getRestockStatusTone(selectedList.status)}
              />
            </View>

            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
              }}
            >
              {t("restock.progress", {
                checked: selectedList.checkedItems,
                total: selectedList.totalItems,
              })}{" "}
              | {getItemCountLabel(selectedList.totalItems)}
            </Text>

            {selectedList.status !== "archived" ? (
              <ActionButton
                disabled={archiving}
                label={archiving ? t("restock.archiving") : t("restock.archive")}
                onPress={handleArchiveList}
                variant="ghost"
              />
            ) : null}
          </SurfaceCard>

          <View style={{ gap: theme.spacing.sm }}>
            {selectedList.items.map((item) => (
              <SurfaceCard key={item.id} style={compactCardStyle}>
                <View style={{ alignItems: "flex-start", flexDirection: "row", gap: theme.spacing.sm }}>
                  <Pressable
                    disabled={selectedList.status === "archived"}
                    onPress={() => {
                      void handleToggleItem(item.id);
                    }}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      backgroundColor: item.isChecked ? theme.colors.primary : theme.colors.surface,
                      borderColor: item.isChecked ? theme.colors.primary : theme.colors.borderStrong,
                      borderRadius: theme.radius.pill,
                      borderWidth: 1,
                      height: 28,
                      justifyContent: "center",
                      marginTop: 2,
                      opacity: pressed ? 0.9 : 1,
                      width: 28,
                    })}
                  >
                    {busyItemId === item.id ? (
                      <ActivityIndicator color={item.isChecked ? theme.colors.primaryText : theme.colors.primary} size="small" />
                    ) : (
                      <Feather
                        color={item.isChecked ? theme.colors.primaryText : theme.colors.textSoft}
                        name={item.isChecked ? "check" : "circle"}
                        size={14}
                      />
                    )}
                  </Pressable>

                  <View style={{ flex: 1, gap: theme.spacing.sm }}>
                    <View style={{ alignItems: "flex-start", flexDirection: "row", gap: theme.spacing.sm, justifyContent: "space-between" }}>
                      <View style={{ flex: 1, gap: theme.spacing.xs }}>
                        <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                          <Text
                            style={{
                              color: theme.colors.text,
                              fontFamily: theme.typography.body,
                              fontSize: 15,
                              fontWeight: "600",
                              textDecorationLine: item.isChecked ? "line-through" : "none",
                            }}
                          >
                            {item.productNameSnapshot}
                          </Text>
                          {item.categorySnapshot ? (
                            <StatusBadge label={item.categorySnapshot} tone="neutral" />
                          ) : null}
                          {item.isWeightBasedSnapshot ? <StatusBadge label={t("productCard.value.byWeight")} tone="primary" /> : null}
                        </View>

                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs }}>
                          <StatusBadge
                            label={t("restock.item.current", {
                              quantity: formatRestockQuantity(item.currentStockSnapshot, item.isWeightBasedSnapshot),
                            })}
                            tone="neutral"
                          />
                          <StatusBadge
                            label={t("restock.item.minimum", {
                              quantity: formatRestockQuantity(item.minStockSnapshot, item.isWeightBasedSnapshot),
                            })}
                            tone="warning"
                          />
                          <StatusBadge
                            label={t("restock.item.buy", {
                              quantity: formatRestockQuantity(item.suggestedQuantity, item.isWeightBasedSnapshot),
                            })}
                            tone="success"
                          />
                        </View>
                      </View>
                    </View>

                    <View style={{ gap: theme.spacing.xs }}>
                      <TextInput
                        editable={selectedList.status !== "archived" && savingNoteId !== item.id}
                        onBlur={() => {
                          void handleSaveNote(item);
                        }}
                        onChangeText={(value) =>
                          setNoteDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [item.id]: value,
                          }))
                        }
                        placeholder={t("restock.item.notePlaceholder")}
                        placeholderTextColor={theme.colors.textSoft}
                        style={{
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.border,
                          borderRadius: theme.radius.sm,
                          borderWidth: 1,
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 14,
                          minHeight: 46,
                          paddingHorizontal: theme.spacing.md,
                        }}
                        value={noteDrafts[item.id] ?? ""}
                      />
                      {savingNoteId === item.id ? (
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                          }}
                        >
                          {t("restock.item.noteSaving")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </SurfaceCard>
            ))}
          </View>
        </>
      ) : lists.length > 0 ? (
        <SurfaceCard style={compactCardStyle}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
            }}
          >
            {t("restock.noSelection")}
          </Text>
        </SurfaceCard>
      ) : (
        <EmptyState icon="shopping-bag" message={emptyState.message} title={emptyState.title} />
      )}
    </Screen>
  );
}

