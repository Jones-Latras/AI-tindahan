import Storage from "expo-sqlite/kv-store";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguageProvider, useAppLanguage } from "@/contexts/LanguageContext";
import { ThemeProvider, useAppTheme } from "@/contexts/ThemeContext";
import { DATABASE_NAME, migrateDbIfNeeded } from "@/db/database";
import { ONBOARDED_KEY } from "@/app/onboarding";

function AppShell() {
  const { isReady, mode, theme } = useAppTheme();
  const { isReady: isLanguageReady, t } = useAppLanguage();
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [showIntroOverlay, setShowIntroOverlay] = useState(false);
  const hasPlayedIntro = useRef(false);
  const appOpacity = useRef(new Animated.Value(0)).current;
  const appTranslateY = useRef(new Animated.Value(18)).current;
  const appScale = useRef(new Animated.Value(0.985)).current;
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashTranslateY = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.18)).current;
  const sheenTranslateX = useRef(new Animated.Value(-56)).current;
  const isAppReady = isReady && isLanguageReady && hasOnboarded !== null;

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

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.12,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.3,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.18,
            duration: 900,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [pulseOpacity, pulseScale]);

  useEffect(() => {
    const sheenLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(420),
        Animated.timing(sheenTranslateX, {
          toValue: 56,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheenTranslateX, {
          toValue: -56,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(560),
      ]),
    );

    sheenLoop.start();

    return () => {
      sheenLoop.stop();
    };
  }, [sheenTranslateX]);

  useEffect(() => {

    if (!isAppReady) {
      hasPlayedIntro.current = false;
      setShowIntroOverlay(false);
      appOpacity.setValue(0);
      appTranslateY.setValue(18);
      appScale.setValue(0.985);
      splashOpacity.setValue(1);
      splashTranslateY.setValue(0);
      splashScale.setValue(1);
      return;
    }

    if (hasPlayedIntro.current) {
      return;
    }

    hasPlayedIntro.current = true;
    setShowIntroOverlay(true);

    Animated.parallel([
      Animated.timing(appOpacity, {
        toValue: 1,
        delay: 120,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(appTranslateY, {
        toValue: 0,
        delay: 120,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(appScale, {
        toValue: 1,
        delay: 120,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(splashOpacity, {
        toValue: 0,
        delay: 90,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(splashTranslateY, {
        toValue: -14,
        delay: 90,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(splashScale, {
        toValue: 1.05,
        delay: 90,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowIntroOverlay(false);
    });
  }, [
    appOpacity,
    appScale,
    appTranslateY,
    isAppReady,
    splashOpacity,
    splashScale,
    splashTranslateY,
  ]);

  const splashCard = (
    <View
      style={{
        alignItems: "center",
        gap: theme.spacing.md,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          height: 152,
          width: 152,
        }}
      >
        <Animated.View
          style={{
            backgroundColor: theme.colors.primaryMuted,
            borderRadius: 999,
            height: 116,
            opacity: pulseOpacity,
            position: "absolute",
            transform: [{ scale: pulseScale }],
            width: 116,
          }}
        />
        <View
          style={{
            alignItems: "flex-start",
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: 30,
            borderWidth: 1,
            gap: theme.spacing.sm,
            justifyContent: "center",
            minWidth: 216,
            paddingHorizontal: 22,
            paddingVertical: 20,
            shadowColor: theme.colors.shadow,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 1,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              gap: theme.spacing.md,
              justifyContent: "flex-start",
            }}
          >
            <View
              style={{
                alignItems: "center",
                borderRadius: 22,
                height: 64,
                justifyContent: "center",
                width: 64,
                transform: [{ translateY: -2 }],
              }}
            >
              <LinearGradient
                colors={[theme.colors.primary, theme.colors.success, theme.colors.accent]}
                end={{ x: 1, y: 1 }}
                style={{
                  alignItems: "center",
                  borderRadius: 22,
                  height: 64,
                  justifyContent: "center",
                  width: 64,
                }}
                start={{ x: 0, y: 0 }}
              >
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: mode === "dark" ? "#081510" : theme.colors.surface,
                    borderColor: "rgba(255,255,255,0.22)",
                    borderRadius: 19,
                    borderWidth: 1,
                    height: 58,
                    justifyContent: "center",
                    overflow: "hidden",
                    width: 58,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: theme.colors.primaryMuted,
                      borderRadius: 999,
                      height: 32,
                      left: 13,
                      opacity: 0.4,
                      position: "absolute",
                      top: 7,
                      width: 32,
                    }}
                  />
                  <Animated.View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.16)",
                      borderRadius: 999,
                      height: 84,
                      position: "absolute",
                      transform: [{ translateX: sheenTranslateX }, { rotate: "24deg" }],
                      width: 14,
                    }}
                  />
                  <View
                    style={{
                      height: 34,
                      position: "relative",
                      width: 34,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.display,
                        fontSize: 26,
                        fontWeight: "700",
                        left: 1,
                        letterSpacing: -0.8,
                        position: "absolute",
                        top: -2,
                      }}
                    >
                      T
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.primary,
                        fontFamily: theme.typography.display,
                        fontSize: 25,
                        fontWeight: "700",
                        letterSpacing: -0.8,
                        opacity: 0.98,
                        position: "absolute",
                        right: 0,
                        top: 6,
                      }}
                    >
                      H
                    </Text>
                    <View
                      style={{
                        backgroundColor: theme.colors.accent,
                        borderRadius: 999,
                        height: 2,
                        left: 7,
                        opacity: 0.9,
                        position: "absolute",
                        top: 16,
                        width: 18,
                      }}
                    />
                  </View>
                  <View
                    style={{
                      backgroundColor: "rgba(255,255,255,0.34)",
                      borderRadius: 999,
                      height: 9,
                      position: "absolute",
                      right: 9,
                      top: 9,
                      width: 9,
                    }}
                  />
                </View>
              </LinearGradient>
            </View>

            <View style={{ alignItems: "flex-start", flex: 1, gap: 1 }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                }}
              >
                TINDAHAN
              </Text>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 24,
                  fontWeight: "700",
                  letterSpacing: 0.1,
                }}
              >
                AI
              </Text>
              <View
                style={{
                  backgroundColor: theme.colors.accent,
                  borderRadius: 999,
                  height: 2,
                  marginTop: 4,
                  opacity: 0.75,
                  width: 42,
                }}
              />
            </View>
          </View>

          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "600",
              letterSpacing: 1.2,
              paddingLeft: 4,
              textTransform: "uppercase",
            }}
          >
            Smart Store Companion
          </Text>
        </View>
        <View
          style={{
            backgroundColor: theme.colors.primaryMuted,
            borderRadius: 999,
            height: 8,
            opacity: 0.75,
            position: "absolute",
            right: -4,
            top: 18,
            width: 8,
          }}
        />
      </View>

      <View style={{ alignItems: "center", gap: theme.spacing.xs }}>
        <ActivityIndicator color={theme.colors.primary} size="small" />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 14,
          }}
        >
          {t("app.preparing")}
        </Text>
      </View>
    </View>
  );

  if (!isAppReady) {
    return (
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.background,
          flex: 1,
          justifyContent: "center",
        }}
      >
        {splashCard}
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <Animated.View
        style={{
          flex: 1,
          opacity: appOpacity,
          transform: [{ translateY: appTranslateY }, { scale: appScale }],
        }}
      >
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
      </Animated.View>

      {showIntroOverlay ? (
        <Animated.View
          pointerEvents="none"
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.background,
            bottom: 0,
            justifyContent: "center",
            left: 0,
            opacity: splashOpacity,
            position: "absolute",
            right: 0,
            top: 0,
            transform: [{ translateY: splashTranslateY }, { scale: splashScale }],
          }}
        >
          {splashCard}
        </Animated.View>
      ) : null}
    </View>
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
