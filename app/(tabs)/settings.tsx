import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { languageDisplayNames } from "@/constants/translations";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { clearAllLocalStoreData, getStoreName, saveStoreName } from "@/db/repositories";
import { seedStoreData } from "@/scripts/seed-store";
import { isSupabaseReady } from "@/utils/supabase";
import { getLastSyncTime, restoreFromCloud, syncToCloud } from "@/utils/sync";

const STORE_NAME_KEY = "tindahan.store-name";
const OWNER_NAME_KEY = "tindahan.owner-name";
const PRODUCT_CATEGORIES_KEY = "tindahan.product-categories";
const LAST_SYNC_KEY_PREFIX = "tindahan.last-sync.";
const MILESTONES_KEY_PREFIX = "tindahan.milestones.";
const HOME_BRIEF_KEY_PREFIX = "ai.home-brief.v6.";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

type SettingsRowProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
  tone?: "neutral" | "primary" | "warning";
};

type SettingsActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: "primary" | "secondary";
};

function SettingsSection({ title, children }: SettingsSectionProps) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 14,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsValuePill({ icon, label }: { icon?: keyof typeof Feather.glyphMap; label: string }) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: "row",
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      {icon ? <Feather color={theme.colors.textSoft} name={icon} size={14} /> : null}
    </View>
  );
}

function SettingsAction({ label, onPress, disabled, busy, tone = "primary" }: SettingsActionProps) {
  const { theme } = useAppTheme();
  const primary = tone === "primary";

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: primary ? theme.colors.primary : theme.colors.surfaceMuted,
        borderColor: primary ? theme.colors.primary : theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: "row",
        gap: theme.spacing.xs,
        justifyContent: "center",
        minHeight: 36,
        minWidth: 88,
        opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
        paddingHorizontal: theme.spacing.md,
      })}
    >
      {busy ? (
        <ActivityIndicator color={primary ? theme.colors.primaryText : theme.colors.primary} size="small" />
      ) : null}
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.88}
        numberOfLines={1}
        style={{
          color: primary ? theme.colors.primaryText : theme.colors.text,
          flexShrink: 1,
          fontFamily: theme.typography.label,
          fontSize: 12,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  isLast = false,
  tone = "neutral",
}: SettingsRowProps) {
  const { theme } = useAppTheme();

  const iconColors =
    tone === "primary"
      ? { background: theme.colors.primaryMuted, foreground: theme.colors.primary }
      : tone === "warning"
        ? { background: theme.colors.warningMuted, foreground: theme.colors.warning }
        : { background: theme.colors.surfaceMuted, foreground: theme.colors.textMuted };

  const row = (
    <View
      style={{
        alignItems: "center",
        borderBottomColor: isLast ? "transparent" : theme.colors.border,
        borderBottomWidth: isLast ? 0 : 1,
        flexDirection: "row",
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: iconColors.background,
          borderRadius: theme.radius.pill,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Feather color={iconColors.foreground} name={icon} size={16} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.body,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );

  if (!onPress) {
    return row;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.95 : 1 })}>
      {row}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { activeStore, session, signOut, stores, user } = useAuth();
  const { theme, mode, toggleMode } = useAppTheme();
  const { language, toggleLanguage, t } = useAppLanguage();
  const supabaseReady = isSupabaseReady();
  const canUseCloudSync = supabaseReady && Boolean(session?.user) && Boolean(activeStore);
  const [storeName, setStoreName] = useState("");
  const [storeNameDraft, setStoreNameDraft] = useState("");
  const [savingStoreName, setSavingStoreName] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const normalizedStoreName = storeName.trim().replace(/\s+/g, " ");
  const normalizedStoreNameDraft = storeNameDraft.trim().replace(/\s+/g, " ");
  const canSaveStoreName =
    normalizedStoreNameDraft.length >= 2 && normalizedStoreNameDraft.toLocaleLowerCase() !== normalizedStoreName.toLocaleLowerCase();

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [dbStoreName, legacyStoreName] = await Promise.all([
          getStoreName(db),
          Storage.getItem(STORE_NAME_KEY),
        ]);
        const normalizedLegacyStoreName = legacyStoreName?.trim() ?? "";
        const nextStoreName = dbStoreName ?? normalizedLegacyStoreName;

        if (!dbStoreName && normalizedLegacyStoreName.length >= 2) {
          await saveStoreName(db, normalizedLegacyStoreName);
        }

        setStoreName(nextStoreName);
        setStoreNameDraft(nextStoreName);
      })();
      void getLastSyncTime(db).then(setLastSync);
    }, [db]),
  );

  const handleSaveStoreName = useCallback(async () => {
    if (normalizedStoreNameDraft.length < 2) {
      Alert.alert(t("home.settings.store.invalidTitle"), t("home.settings.store.invalidMessage"));
      return;
    }

    setSavingStoreName(true);

    try {
      await Promise.all([
        saveStoreName(db, normalizedStoreNameDraft),
        Storage.setItem(STORE_NAME_KEY, normalizedStoreNameDraft),
      ]);
      setStoreName(normalizedStoreNameDraft);
      setStoreNameDraft(normalizedStoreNameDraft);
    } catch (error) {
      Alert.alert(
        t("home.settings.store.failedTitle"),
        error instanceof Error ? error.message : t("home.settings.store.failedMessage"),
      );
    } finally {
      setSavingStoreName(false);
    }
  }, [db, normalizedStoreNameDraft, t]);

  const handleClearAllData = useCallback(() => {
    Alert.alert(
      "Clear all local data?",
      "This deletes products, sales, customers, expenses, restock lists, and local cache on this device. Cloud backups are not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear data",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setClearingData(true);

              try {
                await clearAllLocalStoreData(db);

                const storageKeys = await Storage.getAllKeys();
                const keysToRemove = storageKeys.filter(
                  (key) =>
                    key === STORE_NAME_KEY ||
                    key === OWNER_NAME_KEY ||
                    key === PRODUCT_CATEGORIES_KEY ||
                    key.startsWith(LAST_SYNC_KEY_PREFIX) ||
                    key.startsWith(MILESTONES_KEY_PREFIX) ||
                    key.startsWith(HOME_BRIEF_KEY_PREFIX),
                );

                await Promise.all(keysToRemove.map((key) => Storage.removeItem(key)));

                setStoreName("");
                setStoreNameDraft("");
                setLastSync(null);

                Alert.alert(
                  "Local data cleared",
                  "This device is now reset. Sign in and restore from cloud if you want your backed up data again.",
                );
                router.replace("/(tabs)");
              } catch (error) {
                Alert.alert(
                  "Could not clear local data",
                  error instanceof Error ? error.message : "Please try again.",
                );
              } finally {
                setClearingData(false);
              }
            })();
          },
        },
      ],
    );
  }, [db, router]);

  return (
    <Screen
      contentContainerStyle={{
        gap: theme.spacing.lg,
        paddingBottom: 120,
        paddingTop: theme.spacing.md,
      }}
      title={t("home.settings.title")}
    >
      <SettingsSection title={t("home.settings.preferences.title")}>
        <SettingsRow
          icon="globe"
          onPress={toggleLanguage}
          right={<SettingsValuePill label={languageDisplayNames[language]} />}
          title={t("home.settings.language.title")}
          tone="primary"
        />
        <SettingsRow
          icon={mode === "dark" ? "moon" : "sun"}
          isLast
          onPress={toggleMode}
          right={<SettingsValuePill label={mode === "dark" ? t("theme.dark") : t("theme.light")} />}
          title={t("home.settings.theme.title")}
          tone={mode === "dark" ? "primary" : "warning"}
        />
      </SettingsSection>

      {supabaseReady ? (
        <SettingsSection title="Account">
          <SettingsRow
            icon="user"
            subtitle={activeStore ? `Active store: ${activeStore.name}` : "Create a store before using cloud sync."}
            title={user?.email ?? "Signed in"}
            tone="primary"
          />
          <SettingsRow
            icon="shield"
            isLast={stores.length <= 1}
            subtitle={stores.length > 1 ? `${stores.length} stores available for this account.` : "Single-store access is active."}
            title={activeStore?.role ? `Role: ${activeStore.role}` : "No store membership yet"}
          />
          {stores.length > 1 ? (
            <SettingsRow
              icon="layers"
              isLast
              subtitle="Store switching UI is not added yet. The first linked store stays active."
              title="Multiple stores detected"
            />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection title={t("home.settings.store.title")}>
        <View style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {t("home.settings.store.fieldLabel")}
          </Text>

          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderColor:
                normalizedStoreNameDraft.length > 0 && normalizedStoreNameDraft.length < 2
                  ? theme.colors.danger
                  : theme.colors.border,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              flexDirection: "row",
              minHeight: 52,
              paddingLeft: theme.spacing.md,
              paddingRight: theme.spacing.xs,
            }}
          >
            <TextInput
              onChangeText={setStoreNameDraft}
              onSubmitEditing={() => {
                if (canSaveStoreName && !savingStoreName) {
                  void handleSaveStoreName();
                }
              }}
              placeholder={t("onboarding.storeName.placeholder")}
              placeholderTextColor={theme.colors.textSoft}
              returnKeyType="done"
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 15,
                minHeight: 50,
                paddingRight: theme.spacing.sm,
              }}
              value={storeNameDraft}
            />
            <Pressable
              accessibilityLabel={t("home.settings.store.save")}
              disabled={!canSaveStoreName || savingStoreName}
              hitSlop={6}
              onPress={() => void handleSaveStoreName()}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: canSaveStoreName ? theme.colors.primary : theme.colors.surfaceMuted,
                borderRadius: theme.radius.pill,
                height: 38,
                justifyContent: "center",
                opacity: !canSaveStoreName || savingStoreName ? 0.65 : pressed ? 0.9 : 1,
                width: 38,
              })}
            >
              {savingStoreName ? (
                <ActivityIndicator color={theme.colors.primaryText} size="small" />
              ) : (
                <Feather
                  color={canSaveStoreName ? theme.colors.primaryText : theme.colors.textSoft}
                  name="check"
                  size={16}
                />
              )}
            </Pressable>
          </View>

          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {t("home.settings.store.subtitle")}
          </Text>
        </View>
      </SettingsSection>

      {supabaseReady ? (
        <SettingsSection title={t("home.settings.data.title")}>
          <SettingsRow
            icon="cloud"
            right={
              <SettingsAction
                busy={syncing}
                disabled={syncing || !canUseCloudSync}
                label={syncing ? t("home.cloud.syncing") : t("home.cloud.backupNow")}
                onPress={() => {
                  void (async () => {
                    setSyncing(true);
                    try {
                      const msg = await syncToCloud(db);
                      Alert.alert(t("home.cloud.backupTitle"), msg);
                      setLastSync(await getLastSyncTime(db));
                    } catch (error) {
                      Alert.alert(t("home.cloud.backupFailed"), String(error));
                    } finally {
                      setSyncing(false);
                    }
                  })();
                }}
              />
            }
            subtitle={
              !session?.user
                ? "Sign in to enable cloud backup."
                : !activeStore
                  ? "Create a store before backing up."
                  : lastSync
                    ? t("home.cloud.lastBackup", { time: lastSync })
                    : t("home.cloud.none")
            }
            title={t("home.settings.backup.title")}
            tone="primary"
          />
          <SettingsRow
            icon="refresh-ccw"
            isLast={false}
            right={
              <SettingsAction
                disabled={syncing || clearingData || !canUseCloudSync}
                label={t("home.cloud.confirmRestore")}
                onPress={() => {
                  Alert.alert(
                    t("home.cloud.restoreTitle"),
                    t("home.cloud.restoreMessage"),
                    [
                      { text: t("home.cloud.cancel"), style: "cancel" },
                      {
                        text: t("home.cloud.confirmRestore"),
                        style: "destructive",
                        onPress: () => {
                          void (async () => {
                            setSyncing(true);
                            try {
                              const msg = await restoreFromCloud(db);
                              Alert.alert(t("home.cloud.restoreResult"), msg);
                              setLastSync(await getLastSyncTime(db));
                            } catch (error) {
                              Alert.alert(t("home.cloud.restoreFailed"), String(error));
                            } finally {
                              setSyncing(false);
                            }
                          })();
                        },
                      },
                    ],
                  );
                }}
                tone="secondary"
              />
            }
            title={t("home.cloud.restore")}
          />
          <SettingsRow
            icon="trash-2"
            isLast
            right={
              <SettingsAction
                busy={clearingData}
                disabled={syncing || clearingData}
                label={clearingData ? "Clearing..." : "Clear local data"}
                onPress={handleClearAllData}
                tone="secondary"
              />
            }
            subtitle="Delete all local store data on this device. Cloud backups stay untouched."
            title="Reset this device"
            tone="warning"
          />
        </SettingsSection>
      ) : null}

      {supabaseReady ? (
        <SettingsSection title="Session">
          <SettingsRow
            icon="log-out"
            isLast
            right={
              <SettingsAction
                label="Sign out"
                onPress={() => {
                  void (async () => {
                    await signOut();
                    router.replace("/sign-in");
                  })();
                }}
                tone="secondary"
              />
            }
            subtitle="This device will keep local data, but cloud actions will require sign-in again."
            title="End this session"
            tone="warning"
          />
        </SettingsSection>
      ) : null}

      {__DEV__ ? (
        <SettingsSection title={t("home.dev.title")}>
          <SettingsRow
            icon="tool"
            isLast
            right={
              <SettingsAction
                busy={seeding}
                disabled={seeding}
                label={seeding ? t("home.dev.seeding") : t("home.dev.seed")}
                onPress={() => {
                  void (async () => {
                    setSeeding(true);
                    try {
                      const result = await seedStoreData(db);
                      Alert.alert(result.skipped ? t("home.dev.skipped") : t("home.dev.done"), result.message);
                    } catch (error) {
                      Alert.alert(t("home.dev.error"), String(error));
                    } finally {
                      setSeeding(false);
                    }
                  })();
                }}
                tone="secondary"
              />
            }
            title={t("home.dev.seed")}
            tone="warning"
          />
        </SettingsSection>
      ) : null}
    </Screen>
  );
}

