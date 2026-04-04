import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type StatusBadgeProps = {
  label: string;
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  const { theme } = useAppTheme();

  const palette =
    tone === "primary"
      ? { backgroundColor: theme.colors.primaryMuted, color: theme.colors.primary }
      : tone === "success"
        ? { backgroundColor: theme.colors.successMuted, color: theme.colors.success }
        : tone === "warning"
          ? { backgroundColor: theme.colors.warningMuted, color: theme.colors.warning }
          : tone === "danger"
            ? { backgroundColor: theme.colors.dangerMuted, color: theme.colors.danger }
            : { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted };

  return (
    <View
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: palette.backgroundColor,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text
        style={{
          color: palette.color,
          fontFamily: theme.typography.label,
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
