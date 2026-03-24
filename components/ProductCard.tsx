import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";

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
  barcode?: string | null;
  disabled?: boolean;
  compact?: boolean;
  showInfoFlip?: boolean;
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
  barcode,
  disabled = false,
  compact = false,
  showInfoFlip = false,
  onPress,
}: ProductCardProps) {
  const { theme } = useAppTheme();
  const isLowStock = stock <= minStock;
  const [imageFailed, setImageFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const hasImage = Boolean(imageUri && !imageFailed);
  const faceGap = compact ? theme.spacing.sm : theme.spacing.md;
  const facePadding = compact ? theme.spacing.md : theme.spacing.lg;
  const fallbackCardHeight = compact ? (hasImage ? 268 : 224) : hasImage ? 328 : 268;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  useEffect(() => {
    if (!showInfoFlip && showDetails) {
      setShowDetails(false);
    }
  }, [showDetails, showInfoFlip]);

  useEffect(() => {
    Animated.timing(flipAnimation, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
      toValue: showDetails ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [flipAnimation, showDetails]);

  const cardShellStyle = {
    backgroundColor: theme.colors.card,
    borderColor: isLowStock ? theme.colors.warning : theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flex: 1,
    minWidth: "47%" as const,
    overflow: "hidden" as const,
  };

  const frontRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  const backRotation = flipAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const detailRows = [
    { label: "Category", value: category || "General", tone: theme.colors.text },
    { label: "Price", value: formatCurrencyFromCents(priceCents), tone: theme.colors.text },
    { label: "Stock", value: `${stock} left`, tone: isLowStock ? theme.colors.warning : theme.colors.text },
    { label: "Min stock", value: `${minStock} target`, tone: theme.colors.textMuted },
    { label: "Margin", value: marginPercent, tone: theme.colors.success },
    { label: "Barcode", value: barcode || "No barcode", tone: barcode ? theme.colors.text : theme.colors.textSoft },
  ];

  const handleToggleDetails = (event: GestureResponderEvent) => {
    event.stopPropagation();
    setShowDetails((current) => !current);
  };

  const handleBackAddToCart = (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (disabled || !onPress) {
      return;
    }

    onPress();
  };

  const renderFrontContent = () => (
    <>
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
        {showInfoFlip ? null : (
          <Feather color={theme.colors.textSoft} name="plus-circle" size={compact ? 16 : 18} />
        )}
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

      {!showInfoFlip ? (
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
      ) : null}

      {showInfoFlip ? (
        <Text
          style={{
            color: theme.colors.textSoft,
            fontFamily: theme.typography.body,
            fontSize: 11,
            lineHeight: 16,
          }}
        >
          Tap card to add. Use the info button for full details.
        </Text>
      ) : null}
    </>
  );

  if (!showInfoFlip) {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          ...cardShellStyle,
          gap: faceGap,
          opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
          padding: facePadding,
        })}
      >
        {renderFrontContent()}
      </Pressable>
    );
  }

  return (
    <View
      style={{
        ...cardShellStyle,
        minHeight: fallbackCardHeight,
        opacity: disabled ? 0.55 : 1,
        position: "relative",
      }}
    >
      <Animated.View
        pointerEvents={showDetails ? "none" : "auto"}
        style={{
          backfaceVisibility: "hidden",
          inset: 0,
          position: "absolute",
          transform: [{ perspective: 1200 }, { rotateY: frontRotation }],
        }}
      >
        <Pressable
          disabled={disabled || showDetails}
          onPress={onPress}
          style={({ pressed }) => ({
            flex: 1,
            gap: faceGap,
            opacity: pressed ? 0.92 : 1,
            padding: facePadding,
          })}
        >
          {renderFrontContent()}
        </Pressable>

        <Pressable
          accessibilityLabel={showDetails ? "Hide product details" : "Show product details"}
          hitSlop={10}
          onPress={handleToggleDetails}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            height: compact ? 32 : 36,
            justifyContent: "center",
            opacity: pressed ? 0.88 : 1,
            position: "absolute",
            right: facePadding,
            top: facePadding,
            width: compact ? 32 : 36,
          })}
        >
          <Feather color={theme.colors.primary} name="info" size={compact ? 15 : 16} />
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents={showDetails ? "auto" : "none"}
        style={{
          backfaceVisibility: "hidden",
          inset: 0,
          padding: facePadding,
          position: "absolute",
          transform: [{ perspective: 1200 }, { rotateY: backRotation }],
        }}
      >
        <View style={{ flex: 1, gap: faceGap, paddingTop: compact ? 10 : 14 }}>
          <View style={{ gap: theme.spacing.xs, paddingRight: compact ? 34 : 40 }}>
            <Text
              style={{
                color: theme.colors.textSoft,
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
            >
              Product Info
            </Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: compact ? 18 : 20,
                fontWeight: "700",
              }}
            >
              {name}
            </Text>
          </View>

          <View style={{ gap: compact ? 8 : 10 }}>
            {detailRows.map((detail) => (
              <View
                key={detail.label}
                style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}
              >
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                  }}
                >
                  {detail.label}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    color: detail.tone,
                    flex: 1,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "700",
                    textAlign: "right",
                  }}
                >
                  {detail.value}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            disabled={disabled || !onPress}
            onPress={handleBackAddToCart}
            style={({ pressed }) => ({
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: disabled ? theme.colors.surfaceMuted : theme.colors.primary,
              borderRadius: theme.radius.pill,
              flexDirection: "row",
              gap: theme.spacing.xs,
              opacity: pressed ? 0.88 : 1,
              paddingHorizontal: compact ? 12 : 14,
              paddingVertical: compact ? 8 : 9,
            })}
          >
            <Feather
              color={disabled ? theme.colors.textSoft : theme.colors.primaryText}
              name="shopping-cart"
              size={compact ? 13 : 14}
            />
            <Text
              style={{
                color: disabled ? theme.colors.textSoft : theme.colors.primaryText,
                fontFamily: theme.typography.body,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {disabled ? "Out of stock" : "Add to cart"}
            </Text>
          </Pressable>

          <Text
            style={{
              color: theme.colors.textSoft,
              fontFamily: theme.typography.body,
              fontSize: 11,
              lineHeight: 16,
            }}
          >
            Tap the info button again to flip back, then tap the front side to add this product to cart.
          </Text>
        </View>

        <Pressable
          accessibilityLabel={showDetails ? "Hide product details" : "Show product details"}
          hitSlop={10}
          onPress={handleToggleDetails}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            borderWidth: 1,
            height: compact ? 32 : 36,
            justifyContent: "center",
            opacity: pressed ? 0.88 : 1,
            position: "absolute",
            right: facePadding,
            top: facePadding,
            width: compact ? 32 : 36,
          })}
        >
          <Feather color={theme.colors.primary} name="info" size={compact ? 15 : 16} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
