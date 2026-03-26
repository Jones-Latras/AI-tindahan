import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Text, View } from "react-native";

import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

export default function TabLayout() {
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        animation: "fade",
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSoft,
        tabBarLabelStyle: {
          fontFamily: theme.typography.body,
          fontSize: 12,
          fontWeight: "700",
          marginBottom: 4,
        },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          height: 82,
          overflow: "visible",
          paddingBottom: 8,
          paddingTop: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="home" size={size} />,
        }}
      />
      <Tabs.Screen
        name="produkto"
        options={{
          title: t("tabs.produkto"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="package" size={size} />,
        }}
      />
      <Tabs.Screen
        name="benta"
        options={{
          title: t("tabs.benta"),
          tabBarIcon: () => (
            <View
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                elevation: 8,
                height: 62,
                justifyContent: "center",
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 1,
                shadowRadius: 20,
                transform: [{ translateY: -18 }],
                width: 62,
              }}
            >
              <MaterialCommunityIcons color={theme.colors.primaryText} name="cash-register" size={28} />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? theme.colors.primary : theme.colors.textSoft,
                fontFamily: theme.typography.body,
                fontSize: 12,
                fontWeight: "700",
                marginBottom: 2,
              }}
            >
              {t("tabs.benta")}
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="palista"
        options={{
          title: t("tabs.palista"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="users" size={size} />,
        }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: t("tabs.gastos"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="minus-circle" size={size} />,
        }}
      />
      <Tabs.Screen
        name="restock"
        options={{
          href: null,
          title: t("restock.title"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="shopping-bag" size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: t("tabs.settings"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="settings" size={size} />,
        }}
      />
    </Tabs>
  );
}
