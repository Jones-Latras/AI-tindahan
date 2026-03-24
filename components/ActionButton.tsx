import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
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
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          flexDirection: "row",
          gap: theme.spacing.sm,
          justifyContent: "center",
          opacity: pressed ? 0.88 : 1,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 14,
        },
        style,
      ]}
    >
      {icon ? <View>{icon}</View> : null}
      <Text
        style={{
          color: disabled ? theme.colors.textSoft : palette.textColor,
          fontFamily: theme.typography.body,
          fontSize: 15,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

