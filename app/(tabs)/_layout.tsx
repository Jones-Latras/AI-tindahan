import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  // The primary action route we want to extract
  const bentaRouteIndex = state.routes.findIndex((route: any) => route.name === "benta");
  const bentaRoute = state.routes[bentaRouteIndex];
  
  // The normal tab routes we want in the pill
  const pillRoutes = state.routes.filter((route: any) => 
    ["index", "produkto", "palista", "gastos"].includes(route.name)
  );

  return (
    <View
      style={{
        position: "absolute",
        bottom: Math.max(insets.bottom, 16) + 8,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing.md,
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
            flexDirection: "row",
            borderRadius: 36,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 10,
            justifyContent: "space-between",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
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
              })}
            >
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 54,
                  height: 54,
                  borderRadius: 16,
                  gap: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: theme.colors.primaryMuted,
                    opacity: isFocused ? 1 : 0,
                  }}
                />
                <Feather name={iconName} size={isFocused ? 18 : 20} color={iconColor} />
                <Text
                  numberOfLines={1}
                  style={{
                    color: isFocused ? theme.colors.primary : theme.colors.textSoft,
                    fontFamily: theme.typography.body,
                    fontSize: 10,
                    fontWeight: "700",
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

      {bentaRoute ? (
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
              width: 58,
              height: 58,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.15)",
              elevation: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
            }}
          >
            <Feather color={theme.colors.primaryText} name="plus" size={28} />
          </LinearGradient>
        </Pressable>
      ) : null}
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
