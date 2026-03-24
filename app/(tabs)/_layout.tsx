import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

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
          height: 72,
          paddingTop: 8,
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
        name="benta"
        options={{
          title: t("tabs.benta"),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons color={color} name="cash-register" size={size} />
          ),
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
        name="palista"
        options={{
          title: t("tabs.palista"),
          tabBarIcon: ({ color, size }) => <Feather color={color} name="users" size={size} />,
        }}
      />
    </Tabs>
  );
}
