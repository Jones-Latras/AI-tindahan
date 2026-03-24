import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { languageDisplayNames } from "@/constants/translations";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

export function LanguageToggle() {
  const { language, toggleLanguage } = useAppLanguage();
  const { theme } = useAppTheme();

  return (
    <Pressable
      onPress={toggleLanguage}
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
          backgroundColor: theme.colors.primaryMuted,
          borderRadius: theme.radius.pill,
          height: 28,
          justifyContent: "center",
          width: 28,
        }}
      >
        <Feather color={theme.colors.primary} name="globe" size={14} />
      </View>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {languageDisplayNames[language]}
      </Text>
    </Pressable>
  );
}
