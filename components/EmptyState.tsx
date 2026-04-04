import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type EmptyStateProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  message: string;
};

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.xl,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.primaryMuted,
          borderRadius: theme.radius.pill,
          height: 56,
          justifyContent: "center",
          width: 56,
        }}
      >
        <Feather color={theme.colors.primary} name={icon} size={24} />
      </View>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.display,
          fontSize: 22,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.typography.body,
          fontSize: 14,
          lineHeight: 22,
          textAlign: "center",
        }}
      >
        {message}
      </Text>
    </View>
  );
}


