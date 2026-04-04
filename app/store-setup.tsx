import Storage from "expo-sqlite/kv-store";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { InputField } from "@/components/InputField";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getStoreName, saveStoreName } from "@/db/repositories";
import { STORE_NAME_KEY } from "@/app/onboarding";

export default function StoreSetupScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { createStore, user } = useAuth();
  const [storeName, setStoreName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [dbStoreName, legacyStoreName] = await Promise.all([
        getStoreName(db),
        Storage.getItem(STORE_NAME_KEY),
      ]);

      if (mounted) {
        setStoreName((dbStoreName ?? legacyStoreName ?? "").trim());
      }
    })();

    return () => {
      mounted = false;
    };
  }, [db]);

  const handleCreateStore = async () => {
    setSaving(true);
    setError(null);

    try {
      const normalizedStoreName = storeName.trim();
      const store = await createStore(normalizedStoreName);

      await Promise.all([
        saveStoreName(db, store.name),
        Storage.setItem(STORE_NAME_KEY, store.name),
      ]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create the store.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 48 }}
      subtitle={user?.email ? `Signed in as ${user.email}` : "Create the first store for this account."}
      title="Create Store"
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        }}
      >
        <InputField
          label="Store name"
          onChangeText={setStoreName}
          placeholder="Example: Aling Nena Sari-Sari Store"
          value={storeName}
        />

        {error ? (
          <Text
            style={{
              color: theme.colors.danger,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {error}
          </Text>
        ) : null}

        <ActionButton
          disabled={storeName.trim().length < 2 || saving}
          label={saving ? "Creating store..." : "Create store"}
          onPress={() => {
            void handleCreateStore();
          }}
        />
      </View>
    </Screen>
  );
}
