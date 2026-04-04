import { Text, TextInput, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type InputFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "decimal-pad" | "phone-pad";
  multiline?: boolean;
  error?: string | null;
  secureTextEntry?: boolean;
};

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  error,
  secureTextEntry = false,
}: InputFieldProps) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontFamily: theme.typography.body,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <TextInput
        allowFontScaling={false}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSoft}
        secureTextEntry={secureTextEntry}
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: error ? theme.colors.danger : theme.colors.border,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          color: theme.colors.text,
          fontFamily: theme.typography.body,
          fontSize: 14,
          minHeight: multiline ? 96 : 52,
          paddingHorizontal: theme.spacing.md,
          paddingTop: multiline ? theme.spacing.md : 0,
        }}
        value={value}
      />
      {error ? (
        <Text
          style={{
            color: theme.colors.danger,
            fontFamily: theme.typography.body,
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
