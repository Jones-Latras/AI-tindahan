import { useEffect, useRef } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type Props = {
  amountCents: number;
  visible: boolean;
  onDismiss: () => void;
};

const CONFETTI_EMOJIS = ["🎉", "🎊", "✨", "💰", "🌟", "🥳"];

function ConfettiPiece({ delay, emoji, x }: { delay: number; emoji: string; x: number }) {
  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 400, duration: 2200, useNativeDriver: true }),
        Animated.timing(rotation, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ]),
    ]);

    sequence.start();

    return () => sequence.stop();
  }, [delay, opacity, rotation, translateY]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${180 + Math.random() * 360}deg`],
  });

  return (
    <Animated.Text
      style={{
        fontSize: 22,
        left: `${x}%`,
        opacity,
        position: "absolute",
        top: 60,
        transform: [{ translateY }, { rotate }],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

export function MilestoneCelebration({ amountCents, onDismiss, visible }: Props) {
  const { theme } = useAppTheme();
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.6);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [opacity, scale, visible]);

  if (!visible) {
    return null;
  }

  const pesoAmount = `₱${(amountCents / 100).toLocaleString("en-PH")}`;

  const MESSAGES: Record<string, string> = {
    "50000": `Grabe! ${pesoAmount} na kita mo ngayon! 🏆`,
    "200000": `Ayos! ${pesoAmount} na! Basta sipag, kaya yan! 💪`,
    "100000": `Wow, ${pesoAmount} na! Tuloy-tuloy lang! 🔥`,
    "500000": `Nakaka-proud! ${pesoAmount} na benta ngayon! 🌟`,
  };

  const message = MESSAGES[String(amountCents)] ?? `${pesoAmount} na ang benta mo ngayon!`;

  const confettiPieces = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
    delay: i * 80,
    x: 5 + (i * 8) % 90,
  }));

  return (
    <Modal animationType="fade" onRequestClose={onDismiss} transparent visible>
      <Pressable onPress={onDismiss} style={styles.backdrop}>
        <View style={StyleSheet.absoluteFill}>
          {confettiPieces.map((piece) => (
            <ConfettiPiece
              delay={piece.delay}
              emoji={piece.emoji}
              key={piece.id}
              x={piece.x}
            />
          ))}
        </View>

        <Animated.View
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.primary,
            borderRadius: theme.radius.lg,
            borderWidth: 2,
            gap: 16,
            marginHorizontal: 32,
            opacity,
            paddingHorizontal: 32,
            paddingVertical: 40,
            transform: [{ scale }],
          }}
        >
          <Text style={{ fontSize: 56 }}>🎉</Text>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.strong,
              fontSize: theme.typography.scale.h2.fontSize,
              fontWeight: theme.typography.weight.semibold,
              lineHeight: 30,
              textAlign: "center",
            }}
          >
            {message}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Tap anywhere to dismiss
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    justifyContent: "center",
  },
});

