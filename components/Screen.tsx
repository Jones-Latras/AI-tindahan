import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "expo-router";
import { PanResponder, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

type ScreenProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

const TAB_ROUTES = ["/", "/produkto", "/benta", "/palista", "/settings"] as const;
const HORIZONTAL_SWIPE_DISTANCE = 72;
const HORIZONTAL_SWIPE_RATIO = 1.15;
const HORIZONTAL_SWIPE_TRIGGER = 18;
const HORIZONTAL_SWIPE_VELOCITY = 0.12;

function normalizeTabPathname(pathname: string) {
  const normalizedPathname = pathname.replace("/(tabs)", "");

  if (!normalizedPathname || normalizedPathname === "/index") {
    return "/";
  }

  if (normalizedPathname.length > 1 && normalizedPathname.endsWith("/")) {
    return normalizedPathname.slice(0, -1);
  }

  return normalizedPathname;
}

function LiveDateTime() {
  const { theme } = useAppTheme();
  const { language } = useAppLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const locale = language === "english" ? "en-PH" : "fil-PH";
  const weekdayLocale = "en-PH";
  const dateLabel = useMemo(
    () => {
      const weekdayLabel = new Intl.DateTimeFormat(weekdayLocale, {
        weekday: "short",
      }).format(now);
      const dateValueLabel = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(now);

      return `${weekdayLabel}, ${dateValueLabel}`;
    },
    [locale, now],
  );
  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(now),
    [locale, now],
  );

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        gap: 4,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.display,
          fontSize: 18,
          fontWeight: "700",
        }}
      >
        {timeLabel}
      </Text>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.typography.body,
          fontSize: 12,
        }}
      >
        {dateLabel}
      </Text>
    </View>
  );
}

export function Screen({
  title,
  subtitle,
  rightSlot,
  overlay,
  children,
  contentContainerStyle,
}: ScreenProps) {
  const { theme } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const activeTabIndex = useMemo(
    () => TAB_ROUTES.findIndex((route) => route === normalizeTabPathname(pathname)),
    [pathname],
  );
  const navigateToAdjacentTab = useCallback(
    (direction: -1 | 1) => {
      if (activeTabIndex < 0) {
        return;
      }

      const nextIndex = activeTabIndex + direction;

      if (nextIndex < 0 || nextIndex >= TAB_ROUTES.length) {
        return;
      }

      router.navigate(TAB_ROUTES[nextIndex]);
    },
    [activeTabIndex, router],
  );
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          Math.abs(gestureState.dx) > HORIZONTAL_SWIPE_TRIGGER &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * HORIZONTAL_SWIPE_RATIO,
        onPanResponderRelease: (_, gestureState) => {
          if (
            Math.abs(gestureState.dx) < HORIZONTAL_SWIPE_DISTANCE ||
            Math.abs(gestureState.vx) < HORIZONTAL_SWIPE_VELOCITY
          ) {
            return;
          }

          if (gestureState.dx < 0) {
            navigateToAdjacentTab(1);
            return;
          }

          navigateToAdjacentTab(-1);
        },
      }),
    [navigateToAdjacentTab],
  );

  return (
    <SafeAreaView style={{ backgroundColor: theme.colors.background, flex: 1 }} {...swipeResponder.panHandlers}>
      <ScrollView
        contentContainerStyle={[
          {
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
          },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View
          style={{
            alignItems: "flex-start",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 30,
                fontWeight: "700",
                letterSpacing: 0.3,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              alignSelf: "stretch",
              backgroundColor: theme.colors.border,
              marginRight: theme.spacing.md,
              opacity: 0.45,
              width: 1,
            }}
          />
          <View style={{ alignItems: "flex-end", gap: theme.spacing.sm }}>
            <LiveDateTime />
            {rightSlot}
          </View>
        </View>
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}
