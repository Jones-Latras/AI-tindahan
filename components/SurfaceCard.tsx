import { View, type StyleProp, type ViewStyle } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type SurfaceCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SurfaceCard({ children, style }: SurfaceCardProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          padding: theme.spacing.lg,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 4,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
