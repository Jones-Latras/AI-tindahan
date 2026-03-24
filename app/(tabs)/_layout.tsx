import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { useAppTheme } from "@/contexts/ThemeContext";

export default function TabLayout() {
  const { theme } = useAppTheme();

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
          title: "Home",
          tabBarIcon: ({ color, size }) => <Feather color={color} name="home" size={size} />,
        }}
      />
      <Tabs.Screen
        name="benta"
        options={{
          title: "Benta",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons color={color} name="cash-register" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="produkto"
        options={{
          title: "Produkto",
          tabBarIcon: ({ color, size }) => <Feather color={color} name="package" size={size} />,
        }}
      />
      <Tabs.Screen
        name="palista"
        options={{
          title: "Palista",
          tabBarIcon: ({ color, size }) => <Feather color={color} name="users" size={size} />,
        }}
      />
    </Tabs>
  );
}
