import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { mode, theme, toggleMode } = useAppTheme();

  return (
    <Pressable
      onPress={toggleMode}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: "row",
        gap: theme.spacing.sm,
        opacity: pressed ? 0.9 : 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 10,
      })}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: mode === "dark" ? theme.colors.primaryMuted : theme.colors.accentMuted,
          borderRadius: theme.radius.pill,
          height: 28,
          justifyContent: "center",
          width: 28,
        }}
      >
        <Feather
          color={mode === "dark" ? theme.colors.primary : theme.colors.accent}
          name={mode === "dark" ? "moon" : "sun"}
          size={14}
        />
      </View>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {mode === "dark" ? "Gabi" : "Umaga"}
      </Text>
    </Pressable>
  );
}

