import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";
import { formatCurrencyFromCents } from "@/utils/money";

type ProductCardProps = {
  name: string;
  category?: string | null;
  priceCents: number;
  stock: number;
  minStock: number;
  marginPercent: string;
  imageUri?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onPress?: () => void;
};

export function ProductCard({
  name,
  category,
  priceCents,
  stock,
  minStock,
  marginPercent,
  imageUri,
  disabled = false,
  compact = false,
  onPress,
}: ProductCardProps) {
  const { theme } = useAppTheme();
  const isLowStock = stock <= minStock;
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(imageUri && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.card,
        borderColor: isLowStock ? theme.colors.warning : theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flex: 1,
        gap: compact ? theme.spacing.sm : theme.spacing.md,
        minWidth: "47%",
        opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
        padding: compact ? theme.spacing.md : theme.spacing.lg,
      })}
    >
      {hasImage ? (
        <View
          style={{
            borderRadius: theme.radius.sm,
            overflow: "hidden",
          }}
        >
          <Image
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: imageUri ?? undefined }}
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              height: compact ? 88 : 116,
              width: "100%",
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View
          style={{
            backgroundColor: theme.colors.primaryMuted,
            borderRadius: theme.radius.pill,
            paddingHorizontal: compact ? 8 : 10,
            paddingVertical: compact ? 5 : 6,
          }}
        >
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.typography.body,
              fontSize: compact ? 11 : 12,
              fontWeight: "700",
            }}
          >
            {category || "General"}
          </Text>
        </View>
        <Feather color={theme.colors.textSoft} name="plus-circle" size={compact ? 16 : 18} />
      </View>

      <View style={{ gap: compact ? 6 : 8 }}>
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.display,
            fontSize: compact ? 18 : 20,
            fontWeight: "700",
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: compact ? 13 : 14,
            fontWeight: "600",
          }}
        >
          {formatCurrencyFromCents(priceCents)}
        </Text>
      </View>

      <View style={{ gap: compact ? 8 : 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
            }}
          >
            Stock
          </Text>
          <Text
            style={{
              color: isLowStock ? theme.colors.warning : theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {stock} left
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
            }}
          >
            Margin
          </Text>
          <Text
            style={{
              color: theme.colors.success,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {marginPercent}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
