import { useFocusEffect } from "expo-router";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { ActionButton } from "@/components/ActionButton";
import { InputField } from "@/components/InputField";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Screen } from "@/components/Screen";
import { SurfaceCard } from "@/components/SurfaceCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { seedStoreData } from "@/scripts/seed-store";
import { isSupabaseReady } from "@/utils/supabase";
import { getLastSyncTime, restoreFromCloud, syncToCloud } from "@/utils/sync";

const STORE_NAME_KEY = "tindahan.store-name";

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const supabaseReady = isSupabaseReady();
  const [storeName, setStoreName] = useState("");
  const [storeNameDraft, setStoreNameDraft] = useState("");
  const [savingStoreName, setSavingStoreName] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const normalizedStoreName = storeName.trim().replace(/\s+/g, " ");
  const normalizedStoreNameDraft = storeNameDraft.trim().replace(/\s+/g, " ");
  const canSaveStoreName =
    normalizedStoreNameDraft.length >= 2 && normalizedStoreNameDraft.toLocaleLowerCase() !== normalizedStoreName.toLocaleLowerCase();

  useFocusEffect(
    useCallback(() => {
      void Storage.getItem(STORE_NAME_KEY).then((name) => {
        const nextStoreName = name ?? "";
        setStoreName(nextStoreName);
        setStoreNameDraft(nextStoreName);
      });
      void getLastSyncTime().then(setLastSync);
    }, []),
  );

  const handleSaveStoreName = useCallback(async () => {
    if (normalizedStoreNameDraft.length < 2) {
      Alert.alert(t("home.settings.store.invalidTitle"), t("home.settings.store.invalidMessage"));
      return;
    }

    setSavingStoreName(true);

    try {
      await Storage.setItem(STORE_NAME_KEY, normalizedStoreNameDraft);
      setStoreName(normalizedStoreNameDraft);
      setStoreNameDraft(normalizedStoreNameDraft);
      Alert.alert(t("home.settings.store.savedTitle"), t("home.settings.store.savedMessage"));
    } catch (error) {
      Alert.alert(
        t("home.settings.store.failedTitle"),
        error instanceof Error ? error.message : t("home.settings.store.failedMessage"),
      );
    } finally {
      setSavingStoreName(false);
    }
  }, [normalizedStoreNameDraft, t]);

  return (
    <Screen
      contentContainerStyle={{
        gap: theme.spacing.md,
        paddingBottom: 120,
        paddingTop: theme.spacing.md,
      }}
      title={t("home.settings.title")}
    >
      <SurfaceCard style={{ gap: theme.spacing.md, padding: theme.spacing.md }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <LanguageToggle />
          <ThemeToggle />
        </View>

        <View
          style={{
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.md,
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}
        >
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              {t("home.settings.store.title")}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {t("home.settings.store.subtitle")}
            </Text>
          </View>

          <InputField
            label={t("home.settings.store.fieldLabel")}
            onChangeText={setStoreNameDraft}
            placeholder={t("onboarding.storeName.placeholder")}
            value={storeNameDraft}
          />

          <ActionButton
            disabled={!canSaveStoreName || savingStoreName}
            label={savingStoreName ? t("home.settings.store.saving") : t("home.settings.store.save")}
            onPress={() => void handleSaveStoreName()}
            variant="secondary"
          />
        </View>

        {supabaseReady ? (
          <View
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
            }}
          >
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                {t("home.cloud.title")}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {lastSync ? t("home.cloud.lastBackup", { time: lastSync }) : t("home.cloud.none")}
              </Text>
            </View>

            <ActionButton
              disabled={syncing}
              label={syncing ? "Syncing..." : t("home.cloud.backupNow")}
              onPress={async () => {
                setSyncing(true);
                try {
                  const msg = await syncToCloud(db);
                  Alert.alert(t("home.cloud.backupTitle"), msg);
                  setLastSync(await getLastSyncTime());
                } catch (error) {
                  Alert.alert(t("home.cloud.backupFailed"), String(error));
                } finally {
                  setSyncing(false);
                }
              }}
            />

            <ActionButton
              disabled={syncing}
              label={t("home.cloud.restore")}
              onPress={() => {
                Alert.alert(
                  t("home.cloud.restoreTitle"),
                  t("home.cloud.restoreMessage"),
                  [
                    { text: t("home.cloud.cancel"), style: "cancel" },
                    {
                      text: t("home.cloud.confirmRestore"),
                      style: "destructive",
                      onPress: async () => {
                        setSyncing(true);
                        try {
                          const msg = await restoreFromCloud(db);
                          Alert.alert(t("home.cloud.restoreResult"), msg);
                          setLastSync(await getLastSyncTime());
                        } catch (error) {
                          Alert.alert(t("home.cloud.restoreFailed"), String(error));
                        } finally {
                          setSyncing(false);
                        }
                      },
                    },
                  ],
                );
              }}
              variant="secondary"
            />
          </View>
        ) : null}

        {__DEV__ ? (
          <View
            style={{
              backgroundColor: theme.colors.warningMuted,
              borderColor: theme.colors.warning,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
            }}
          >
            <View style={{ gap: 4 }}>
              <Text
                style={{
                  color: theme.colors.warning,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                {t("home.dev.title")}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {t("home.shortcuts.dev.subtitle")}
              </Text>
            </View>

            <ActionButton
              disabled={seeding}
              label={seeding ? "Seeding..." : t("home.dev.seed")}
              onPress={async () => {
                setSeeding(true);
                try {
                  const result = await seedStoreData(db);
                  Alert.alert(result.skipped ? t("home.dev.skipped") : t("home.dev.done"), result.message);
                } catch (error) {
                  Alert.alert(t("home.dev.error"), String(error));
                } finally {
                  setSeeding(false);
                }
              }}
              variant="secondary"
            />
          </View>
        ) : null}
      </SurfaceCard>
    </Screen>
  );
}
