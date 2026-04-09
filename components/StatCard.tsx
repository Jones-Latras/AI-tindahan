import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";
import { SurfaceCard } from "@/components/SurfaceCard";

type StatCardProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  tone?: "primary" | "accent" | "warning";
};

export function StatCard({ icon, label, value, tone = "primary" }: StatCardProps) {
  const { theme } = useAppTheme();

  const toneColors =
    tone === "accent"
      ? { bg: theme.colors.accentMuted, fg: theme.colors.accent }
      : tone === "warning"
        ? { bg: theme.colors.warningMuted, fg: theme.colors.warning }
        : { bg: theme.colors.primaryMuted, fg: theme.colors.primary };

  return (
    <SurfaceCard
      style={{
        flex: 1,
        gap: theme.spacing.sm,
        minWidth: "47%",
        padding: theme.spacing.md,
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: toneColors.bg,
          borderRadius: theme.radius.pill,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Feather color={toneColors.fg} name={icon} size={16} />
      </View>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.label,
            fontSize: theme.typography.scale.caption.fontSize,
            lineHeight: theme.typography.scale.caption.lineHeight,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.money,
            fontSize: theme.typography.scale.h1.fontSize,
            lineHeight: theme.typography.scale.h1.lineHeight,
          }}
        >
          {value}
        </Text>
      </View>
    </SurfaceCard>
  );
}


