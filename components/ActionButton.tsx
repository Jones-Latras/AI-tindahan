import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({
  label,
  onPress,
  icon,
  variant = "primary",
  disabled = false,
  style,
}: ActionButtonProps) {
  const { theme } = useAppTheme();

  const palette =
    variant === "primary"
      ? {
          backgroundColor: theme.colors.primary,
          borderColor: theme.colors.primary,
          textColor: theme.colors.primaryText,
        }
      : variant === "secondary"
        ? {
            backgroundColor: theme.colors.primaryMuted,
            borderColor: theme.colors.primaryMuted,
            textColor: theme.colors.primary,
          }
        : variant === "danger"
          ? {
              backgroundColor: theme.colors.dangerMuted,
              borderColor: theme.colors.dangerMuted,
              textColor: theme.colors.danger,
            }
          : variant === "outline"
            ? {
                backgroundColor: "transparent",
                borderColor: theme.colors.primary,
                textColor: theme.colors.primary,
              }
            : {
                backgroundColor: "transparent",
                borderColor: theme.colors.border,
                textColor: theme.colors.text,
              };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          alignItems: "center",
          alignSelf: "stretch",
          backgroundColor: disabled ? theme.colors.surfaceMuted : palette.backgroundColor,
          borderColor: disabled ? theme.colors.border : palette.borderColor,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          flexDirection: "row",
          gap: theme.spacing.sm,
          justifyContent: "center",
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 14,
        },
        style,
      ]}
    >
      {icon ? <View>{icon}</View> : null}
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.88}
        numberOfLines={1}
        style={{
          color: disabled ? theme.colors.textSoft : palette.textColor,
          flexShrink: 1,
          fontFamily: theme.typography.label,
          fontSize: theme.typography.scale.label.fontSize,
          lineHeight: theme.typography.scale.label.lineHeight,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
