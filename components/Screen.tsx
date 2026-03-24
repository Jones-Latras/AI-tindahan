import { ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "@/contexts/ThemeContext";

type ScreenProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  title,
  subtitle,
  rightSlot,
  overlay,
  children,
  contentContainerStyle,
}: ScreenProps) {
  const { theme } = useAppTheme();

  return (
    <SafeAreaView style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <ScrollView
        contentContainerStyle={[
          {
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
          },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View
          style={{
            alignItems: "flex-start",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, gap: theme.spacing.xs, paddingRight: theme.spacing.md }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 30,
                fontWeight: "700",
                letterSpacing: 0.3,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  lineHeight: 22,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightSlot}
        </View>
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}
