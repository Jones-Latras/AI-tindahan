import { useCallback, useMemo } from "react";
import { usePathname, useRouter } from "expo-router";
import { PanResponder, ScrollView, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { useAppTheme } from "@/contexts/ThemeContext";

type ScreenProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
};

const TAB_ROUTES = ["/", "/produkto", "/benta", "/palista", "/gastos"] as const;
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

export function Screen({
  title,
  subtitle,
  rightSlot,
  overlay,
  children,
  contentContainerStyle,
  titleStyle,
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
      <LinearGradient
        colors={[theme.colors.primaryMuted, theme.colors.background]}
        locations={[0, 0.25]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 400 }}
      />
      <ScrollView
        contentContainerStyle={[
          {
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            paddingHorizontal: 22,
            paddingTop: 24,
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
            gap: theme.spacing.md,
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: theme.spacing.xs, minWidth: 0 }}>
            <Text
              style={[
                {
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 30,
                  fontWeight: "700",
                  letterSpacing: 0.3,
                },
                titleStyle,
              ]}
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
          {rightSlot ? <View style={{ alignItems: "flex-end", flexShrink: 0 }}>{rightSlot}</View> : null}
        </View>
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}
