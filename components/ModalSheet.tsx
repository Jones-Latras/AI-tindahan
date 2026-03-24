import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";

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

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View
        style={{
          backgroundColor: theme.colors.overlay,
          flex: 1,
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            gap: theme.spacing.lg,
            maxHeight: fullHeight ? "96%" : "88%",
            paddingBottom: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
          }}
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
                  fontSize: 26,
                  fontWeight: "700",
                }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    lineHeight: 20,
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
            contentContainerStyle={[
              { gap: theme.spacing.md },
              contentContainerStyle,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}
