import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type ModalSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  fullHeight?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function ModalSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  fullHeight = false,
  contentContainerStyle,
}: ModalSheetProps) {
  const { theme } = useAppTheme();
  const [isMounted, setIsMounted] = useState(visible);
  const animation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const isAndroid = Platform.OS === "android";
  const supportsBlur = Platform.OS === "ios" || isAndroid;
  const blurIntensity = isAndroid ? (theme.mode === "dark" ? 18 : 14) : theme.mode === "dark" ? 36 : 24;
  const blurTint = theme.mode === "dark" ? "dark" : "light";
  const backdropColor = theme.mode === "dark" ? "rgba(0, 0, 0, 0.34)" : "rgba(18, 24, 21, 0.12)";
  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [56, 0],
  });
  const sheetStyle = useMemo<ViewStyle & { transform: { translateY: typeof translateY }[] }>(
    () => ({
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      gap: theme.spacing.lg,
      maxHeight: fullHeight ? ("96%" as const) : ("88%" as const),
      paddingBottom: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      transform: [{ translateY }],
    }),
    [fullHeight, theme, translateY],
  );
  const titleWrapStyle = useMemo(
    () => ({
      flex: 1,
      gap: theme.spacing.xs,
      paddingRight: theme.spacing.md,
    }),
    [theme],
  );
  const scrollContentStyle = useMemo(
    () => [
      { gap: theme.spacing.md },
      contentContainerStyle,
    ],
    [contentContainerStyle, theme.spacing.md],
  );

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    animation.stopAnimation();

    Animated.timing(animation, {
      duration: visible ? 240 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) {
        setIsMounted(false);
      }
    });
  }, [animation, isMounted, visible]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      hardwareAccelerated={isAndroid}
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={isMounted}
    >
      <View style={styles.backdrop}>
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid={isAndroid}
          shouldRasterizeIOS
          style={[styles.backdropLayer, { opacity: animation }]}
        >
          {supportsBlur ? (
            <BlurView
              experimentalBlurMethod={isAndroid ? "dimezisBlurView" : undefined}
              intensity={blurIntensity}
              style={styles.backdropLayer}
              tint={blurTint}
            />
          ) : null}
          <View pointerEvents="none" style={[styles.backdropLayer, { backgroundColor: backdropColor }]} />
        </Animated.View>
        <Animated.View
          renderToHardwareTextureAndroid={isAndroid}
          shouldRasterizeIOS
          style={sheetStyle}
        >
          <View
            style={{
              alignItems: "flex-start",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <View style={titleWrapStyle}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 26,
                  fontWeight: "600",
                }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.label,
                    fontSize: 11,
                    fontWeight: "600",
                    letterSpacing: 0.8,
                    lineHeight: 16,
                    textTransform: "uppercase",
                  }}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.pill,
                height: 36,
                justifyContent: "center",
                width: 36,
              }}
            >
              <Feather color={theme.colors.text} name="x" size={16} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={scrollContentStyle}
            removeClippedSubviews={isAndroid}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});

