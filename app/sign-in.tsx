import { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { InputField } from "@/components/InputField";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useAppTheme } from "@/contexts/ThemeContext";

export default function SignInScreen() {
  const { theme } = useAppTheme();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = mode === "sign-up";

  const canSubmit = useMemo(() => {
    if (!email.trim() || password.length < 6) {
      return false;
    }

    if (isSignUp && password !== confirmPassword) {
      return false;
    }

    return true;
  }, [confirmPassword, email, isSignUp, password]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(isSignUp ? "Check your password fields before continuing." : "Enter a valid email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 48 }}
      subtitle="Sign in so every device syncs only the rows that belong to your store."
      title="Secure Access"
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        }}
      >
        <InputField
          label="Email"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <InputField
          label="Password"
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          value={password}
        />
        {isSignUp ? (
          <InputField
            error={confirmPassword.length > 0 && confirmPassword !== password ? "Passwords do not match." : null}
            label="Confirm password"
            onChangeText={setConfirmPassword}
            placeholder="Repeat your password"
            secureTextEntry
            value={confirmPassword}
          />
        ) : null}

        {error ? (
          <Text
            style={{
              color: theme.colors.danger,
              fontFamily: theme.typography.body,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {error}
          </Text>
        ) : null}

        <ActionButton
          disabled={!canSubmit || submitting}
          label={
            submitting
              ? isSignUp
                ? "Creating account..."
                : "Signing in..."
              : isSignUp
                ? "Create account"
                : "Sign in"
          }
          onPress={() => {
            void handleSubmit();
          }}
        />
        <ActionButton
          label={isSignUp ? "I already have an account" : "Create a new account"}
          onPress={() => {
            setMode((currentMode) => (currentMode === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
          }}
          style={{ width: "100%" }}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}
