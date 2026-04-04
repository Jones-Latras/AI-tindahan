import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Animated, Pressable, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { FLOATING_TAB_BAR_HEIGHT, getFloatingTabBarBottomOffset } from "@/constants/navigation";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [tabWidth, setTabWidth] = useState(0);
  const tabBarBottomOffset = getFloatingTabBarBottomOffset(insets.bottom);

  const bentaRouteIndex = state.routes.findIndex((route: any) => route.name === "benta");
  const bentaRoute = state.routes[bentaRouteIndex];

  const pillRoutes = state.routes.filter((route: any) =>
    ["index", "produkto", "palista", "gastos"].includes(route.name)
  );

  const activePillIndex = pillRoutes.findIndex((r: any) => r.key === state.routes[state.index]?.key);
  const slideAnim = useRef(new Animated.Value(Math.max(0, activePillIndex))).current;

  useEffect(() => {
    if (activePillIndex >= 0) {
      Animated.spring(slideAnim, {
        toValue: activePillIndex,
        useNativeDriver: true,
        bounciness: 0,
        speed: 16,
      }).start();
    }
  }, [activePillIndex, slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: [0, tabWidth, tabWidth * 2, tabWidth * 3]
  });

  return (
    <View
      style={{
        position: "absolute",
        bottom: tabBarBottomOffset,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        flexDirection: "row",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: theme.spacing.sm,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.card,
          borderRadius: 36,
          elevation: 16,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 36,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 10,
            overflow: "hidden",
          }}
        >
          <View
            onLayout={(e) => setTabWidth(e.nativeEvent.layout.width / 4)}
            style={{ flex: 1, flexDirection: "row", position: "relative", alignItems: "center", justifyContent: "space-between" }}
          >
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                width: "25%",
                height: 54,
                alignItems: "center",
                justifyContent: "center",
                zIndex: 0,
                transform: [{ translateX }],
              }}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  backgroundColor: theme.colors.primaryMuted,
                  borderRadius: 16,
                }}
              />
            </Animated.View>

            {pillRoutes.map((route: any, index: number) => {
              const { options } = descriptors[route.key];
              const isFocused = state.index === state.routes.findIndex((r: any) => r.key === route.key);
              const iconColor = isFocused ? theme.colors.primary : theme.colors.textSoft;

              let iconName: keyof typeof Feather.glyphMap = "home";
              if (route.name === "produkto") iconName = "package";
              if (route.name === "palista") iconName = "users";
              if (route.name === "gastos") iconName = "minus-circle";

              const onPress = () => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              };

              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                    zIndex: 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 54,
                      height: 54,
                      gap: 4,
                    }}
                  >
                    <Feather name={iconName} size={isFocused ? 18 : 20} color={iconColor} />
                    <Text
                      numberOfLines={1}
                      style={{
                        color: isFocused ? theme.colors.primary : theme.colors.textSoft,
                        fontFamily: theme.typography.label,
                        fontSize: 10,
                        fontWeight: "600",
                      }}
                    >
                      {options.title}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {bentaRoute ? (
        <View>
          <Pressable
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: bentaRoute.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) {
                navigation.navigate(bentaRoute.name, bentaRoute.params);
              }
            }}
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <LinearGradient
              colors={[theme.colors.primary, theme.colors.success]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                alignItems: "center",
                justifyContent: "center",
                width: FLOATING_TAB_BAR_HEIGHT,
                height: FLOATING_TAB_BAR_HEIGHT,
                borderRadius: 36,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.15)",
                elevation: 16,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.2,
                shadowRadius: 24,
              }}
            >
              <Feather color="#ffffff" name="plus" size={32} />
            </LinearGradient>
          </Pressable>
        </View>) : null}
    </View>
  );
}

export default function TabLayout() {
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();

  return (
    <Tabs
      detachInactiveScreens={false}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        animation: "fade",
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("tabs.home") }}
      />
      <Tabs.Screen
        name="produkto"
        options={{ title: t("tabs.produkto") }}
      />
      <Tabs.Screen
        name="benta"
        options={{ title: t("tabs.benta") }}
      />
      <Tabs.Screen
        name="palista"
        options={{ title: t("tabs.palista") }}
      />
      <Tabs.Screen
        name="gastos"
        options={{ title: t("tabs.gastos") }}
      />
      <Tabs.Screen
        name="restock"
        options={{ href: null, title: t("restock.title") }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null, title: t("tabs.settings") }}
      />
    </Tabs>
  );
}

