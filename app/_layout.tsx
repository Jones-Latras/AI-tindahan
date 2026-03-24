import Storage from "expo-sqlite/kv-store";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguageProvider, useAppLanguage } from "@/contexts/LanguageContext";
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { DATABASE_NAME, migrateDbIfNeeded } from "@/db/database";
import { ONBOARDED_KEY } from "@/app/onboarding";

function AppShell() {
  const { isReady, mode, theme } = useAppTheme();
  const { isReady: isLanguageReady, t } = useAppLanguage();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkOnboarded() {
      const value = await Storage.getItem(ONBOARDED_KEY);
      if (mounted) {
        setHasOnboarded(value === "true");
      }
    }

    checkOnboarded();
    return () => { mounted = false; };
  }, []);

  if (!isReady || !isLanguageReady || hasOnboarded === null) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.background,
          flex: 1,
          gap: theme.spacing.md,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 15,
          }}
        >
          {t("app.preparing")}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: theme.colors.background },
            headerShown: false,
          }}
        >
          {hasOnboarded ? (
            <Stack.Screen name="(tabs)" />
          ) : (
            <Stack.Screen name="onboarding" />
          )}
        </Stack>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppShell />
      </LanguageProvider>
    </ThemeProvider>
  );
}
