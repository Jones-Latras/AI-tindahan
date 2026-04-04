import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as Linking from "expo-linking";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { completeAuthCallback, needsStoreSetup, session } = useAuth();
  const callbackUrl = Linking.useURL();
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function finishAuthCallback() {
      const currentUrl = callbackUrl ?? (await Linking.getInitialURL());

      if (!currentUrl) {
        if (!cancelled) {
          setIsCompleting(false);
          router.replace("/sign-in");
        }
        return;
      }

      try {
        await completeAuthCallback(currentUrl);

        if (cancelled) {
          return;
        }
        setIsCompleting(false);
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not finish authentication.");
          setIsCompleting(false);
        }
      }
    }

    void finishAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [callbackUrl, completeAuthCallback, router]);

  useEffect(() => {
    if (isCompleting || error) {
      return;
    }

    if (!session) {
      router.replace("/sign-in");
      return;
    }

    router.replace(needsStoreSetup ? "/store-setup" : "/(tabs)");
  }, [error, isCompleting, needsStoreSetup, router, session]);

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 48 }}
      subtitle="Finish the confirmation link and return to your store."
      title="Completing Sign In"
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
        <Text
          style={{
            color: error ? theme.colors.danger : theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {error ?? "Verifying your email and restoring your session..."}
        </Text>
      </View>
    </Screen>
  );
}
