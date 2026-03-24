import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";
import { formatCurrencyFromCents } from "@/utils/money";

type CartItemProps = {
  name: string;
  priceCents: number;
  quantity: number;
  maxQuantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
};

export function CartItem({
  name,
  priceCents,
  quantity,
  maxQuantity,
  onDecrease,
  onIncrease,
  onRemove,
}: CartItemProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        flexDirection: "row",
        gap: theme.spacing.md,
        justifyContent: "space-between",
        padding: theme.spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.body,
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 13,
          }}
        >
          {formatCurrencyFromCents(priceCents)} each
        </Text>
      </View>

      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onDecrease}
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.surfaceMuted,
            borderRadius: theme.radius.pill,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather color={theme.colors.text} name="minus" size={14} />
        </Pressable>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.body,
            fontSize: 15,
            fontWeight: "700",
            minWidth: 24,
            textAlign: "center",
          }}
        >
          {quantity}
        </Text>
        <Pressable
          disabled={quantity >= maxQuantity}
          onPress={onIncrease}
          style={{
            alignItems: "center",
            backgroundColor: quantity >= maxQuantity ? theme.colors.surfaceMuted : theme.colors.primaryMuted,
            borderRadius: theme.radius.pill,
            height: 34,
            justifyContent: "center",
            width: 34,
          }}
        >
          <Feather
            color={quantity >= maxQuantity ? theme.colors.textSoft : theme.colors.primary}
            name="plus"
            size={14}
          />
        </Pressable>
      </View>

      <Pressable onPress={onRemove} style={{ padding: 6 }}>
        <Feather color={theme.colors.danger} name="trash-2" size={16} />
      </Pressable>
    </View>
  );
}
