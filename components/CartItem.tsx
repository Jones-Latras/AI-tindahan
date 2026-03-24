import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";
import { formatCurrencyFromCents } from "@/utils/money";
import { formatWeightKg } from "@/utils/pricing";

type CartItemProps = {
  name: string;
  priceCents: number;
  quantity: number;
  maxQuantity: number;
  lineTotalCents?: number;
  isWeightBased?: boolean;
  compact?: boolean;
  onDecrease?: () => void;
  onIncrease?: () => void;
  onEdit?: () => void;
  onRemove: () => void;
};

export function CartItem({
  name,
  priceCents,
  quantity,
  maxQuantity,
  lineTotalCents,
  isWeightBased = false,
  compact = false,
  onDecrease,
  onIncrease,
  onEdit,
  onRemove,
}: CartItemProps) {
  const { theme } = useAppTheme();
  const totalCents = lineTotalCents ?? Math.round(priceCents * quantity);
  const unitPriceLabel = isWeightBased ? `${formatCurrencyFromCents(priceCents)}/kg` : `${formatCurrencyFromCents(priceCents)} each`;
  const quantityLabel = isWeightBased ? `${formatWeightKg(quantity)} kg` : `${quantity}`;

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        flexDirection: "row",
        gap: compact ? theme.spacing.sm : theme.spacing.md,
        justifyContent: "space-between",
        padding: compact ? theme.spacing.sm : theme.spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.body,
            fontSize: compact ? 14 : 15,
            fontWeight: "700",
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: compact ? 12 : 13,
          }}
        >
          {isWeightBased ? `${quantityLabel} x ${unitPriceLabel}` : unitPriceLabel}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.body,
            fontSize: compact ? 12 : 13,
            fontWeight: "700",
          }}
        >
          {formatCurrencyFromCents(totalCents)}
        </Text>
      </View>

      {isWeightBased ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: compact ? 8 : 10 }}>
          {onEdit ? (
            <Pressable
              onPress={onEdit}
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.primaryMuted,
                borderRadius: theme.radius.pill,
                justifyContent: "center",
                paddingHorizontal: compact ? 12 : 14,
                paddingVertical: compact ? 8 : 10,
              }}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.body,
                  fontSize: compact ? 12 : 13,
                  fontWeight: "700",
                }}
              >
                Edit kg
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onRemove} style={{ padding: 6 }}>
            <Feather color={theme.colors.danger} name="trash-2" size={16} />
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ alignItems: "center", flexDirection: "row", gap: compact ? 8 : 10 }}>
            <Pressable
              disabled={!onDecrease}
              onPress={onDecrease}
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.surfaceMuted,
                borderRadius: theme.radius.pill,
                height: compact ? 30 : 34,
                justifyContent: "center",
                opacity: onDecrease ? 1 : 0.5,
                width: compact ? 30 : 34,
              }}
            >
              <Feather color={theme.colors.text} name="minus" size={14} />
            </Pressable>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: compact ? 14 : 15,
                fontWeight: "700",
                minWidth: 24,
                textAlign: "center",
              }}
            >
              {quantityLabel}
            </Text>
            <Pressable
              disabled={!onIncrease || quantity >= maxQuantity}
              onPress={onIncrease}
              style={{
                alignItems: "center",
                backgroundColor:
                  !onIncrease || quantity >= maxQuantity ? theme.colors.surfaceMuted : theme.colors.primaryMuted,
                borderRadius: theme.radius.pill,
                height: compact ? 30 : 34,
                justifyContent: "center",
                width: compact ? 30 : 34,
              }}
            >
              <Feather
                color={!onIncrease || quantity >= maxQuantity ? theme.colors.textSoft : theme.colors.primary}
                name="plus"
                size={14}
              />
            </Pressable>
          </View>

          <Pressable onPress={onRemove} style={{ padding: 6 }}>
            <Feather color={theme.colors.danger} name="trash-2" size={16} />
          </Pressable>
        </>
      )}
    </View>
  );
}
