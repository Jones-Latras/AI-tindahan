import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ComponentProps } from "react";
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
  priceLabel?: string;
  stock: number;
  stockLabel?: string;
  minStock: number;
  minStockLabel?: string;
  marginPercent: string;
  isWeightBased?: boolean;
  imageUri?: string | null;
  barcode?: string | null;
  disabled?: boolean;
  compact?: boolean;
  useRegularImageSizing?: boolean;
  useRegularTextSizing?: boolean;
  showInfoFlip?: boolean;
  actionLabel?: string;
  actionIconName?: ComponentProps<typeof Feather>["name"];
  cardPressEnabled?: boolean;
  onActionPress?: () => void;
  showStockAndMargin?: boolean;
  onPress?: () => void;
};

export function ProductCard({
  name,
  category,
  priceCents,
  priceLabel,
  stock,
  stockLabel,
  minStock,
  minStockLabel,
  marginPercent,
  isWeightBased = false,
  imageUri,
  barcode,
  disabled = false,
  compact = false,
  useRegularImageSizing = false,
  useRegularTextSizing = false,
  showInfoFlip = false,
  actionLabel,
  actionIconName,
  cardPressEnabled = true,
  onActionPress,
  showStockAndMargin = true,
  onPress,
}: ProductCardProps) {
  const { theme } = useAppTheme();
  const resolvedActionPress = onActionPress ?? onPress;
  const resolvedActionLabel = actionLabel ?? "Add to cart";
  const shouldRenderFrontAction = Boolean(actionLabel && resolvedActionPress);
  const isLowStock = stock <= minStock;
  const stockStatus =
    stock <= 0
      ? { label: "Out of stock", tone: "danger" as const }
      : isLowStock
        ? { label: "Low stock", tone: "warning" as const }
        : null;
  const [imageFailed, setImageFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const hasImage = Boolean(imageUri && !imageFailed);
  const usesRegularImageSizing = !compact || useRegularImageSizing;
  const usesRegularTextSizing = !compact || useRegularTextSizing;
  const faceGap = compact ? theme.spacing.sm : theme.spacing.md;
  const facePadding = compact ? theme.spacing.md : theme.spacing.lg;
  const frontImageHeight = showInfoFlip
    ? usesRegularImageSizing
      ? 138
      : 110
    : usesRegularImageSizing
      ? 116
      : 88;
  const baseCardHeight = compact
    ? hasImage
      ? showInfoFlip
        ? 300
        : 320
      : 264
    : hasImage
      ? showInfoFlip
        ? 344
        : 360
      : 292;
  const extraFrontActionHeight = shouldRenderFrontAction ? (compact ? (usesRegularTextSizing ? 44 : 40) : 48) : 0;
  const extraCompactImageHeight = compact && usesRegularImageSizing && hasImage ? 28 : 0;
  const extraCompactTypographyHeight = compact && usesRegularTextSizing ? 18 : 0;
  const extraCompactBadgeWrapHeight = compact && isWeightBased && stockStatus ? 30 : 0;
  const estimatedBackNameLines = Math.max(2, Math.ceil(name.trim().length / (compact ? 16 : 20)));
  const extraBackNameHeight = Math.max(0, estimatedBackNameLines - 2) * (usesRegularTextSizing ? 22 : 18);
  const fallbackCardHeight =
    baseCardHeight +
    extraBackNameHeight +
    extraFrontActionHeight +
    extraCompactImageHeight +
    extraCompactTypographyHeight +
    extraCompactBadgeWrapHeight;

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
    flexBasis: "47%" as const,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "47%" as const,
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
    { label: "Price", value: priceLabel ?? formatCurrencyFromCents(priceCents), tone: theme.colors.text },
    ...(showStockAndMargin
      ? [{ label: "Stock", value: stockLabel ?? `${stock} left`, tone: isLowStock ? theme.colors.warning : theme.colors.text }]
      : []),
    { label: "Min stock", value: minStockLabel ?? `${minStock} target`, tone: theme.colors.textMuted },
    ...(isWeightBased ? [{ label: "Pricing", value: "Sold by weight", tone: theme.colors.primary }] : []),
    ...(showStockAndMargin ? [{ label: "Margin", value: marginPercent, tone: theme.colors.success }] : []),
    { label: "Barcode", value: barcode || "No barcode", tone: barcode ? theme.colors.text : theme.colors.textSoft },
  ];
  const handleToggleDetails = (event: GestureResponderEvent) => {
    event.stopPropagation();
    setShowDetails((current) => !current);
  };

  const handleActionPress = (event: GestureResponderEvent) => {
    event.stopPropagation();

    if (disabled || !resolvedActionPress) {
      return;
    }

    resolvedActionPress();
  };

  const renderActionButton = () => {
    return (
      <Pressable
        disabled={disabled || !resolvedActionPress}
        onPress={handleActionPress}
        style={({ pressed }) => ({
          alignItems: "center",
          alignSelf: "stretch",
          backgroundColor: disabled ? theme.colors.surfaceMuted : theme.colors.primary,
          borderRadius: theme.radius.pill,
          flexDirection: "row",
          gap: theme.spacing.xs,
          justifyContent: "center",
          opacity: pressed ? 0.88 : 1,
          paddingHorizontal: compact ? 10 : 14,
          paddingVertical: compact ? 7 : 9,
        })}
      >
        <Feather
          color={disabled ? theme.colors.textSoft : theme.colors.primaryText}
          name={actionIconName ?? "shopping-cart"}
          size={compact ? 13 : 14}
        />
        <Text
          numberOfLines={1}
          style={{
            color: disabled ? theme.colors.textSoft : theme.colors.primaryText,
            flexShrink: 1,
            fontFamily: theme.typography.body,
            fontSize: usesRegularTextSizing ? 12 : 11,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {disabled ? "Out of stock" : resolvedActionLabel}
        </Text>
      </Pressable>
    );
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
              backgroundColor: theme.colors.card,
              height: frontImageHeight,
              width: "100%",
            }}
          />
        </View>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View
          style={{
            flex: 1,
            gap: theme.spacing.xs,
            paddingRight: showInfoFlip ? (compact ? 38 : 42) : 0,
          }}
        >
          <View
            style={{
              alignItems: "flex-start",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: theme.spacing.xs,
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.primaryMuted,
                borderRadius: theme.radius.pill,
                paddingHorizontal: compact ? 8 : 10,
                paddingVertical: compact ? 5 : 6,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.body,
                  fontSize: usesRegularTextSizing ? 12 : 11,
                  fontWeight: "700",
                }}
              >
                {category || "General"}
              </Text>
            </View>
            {isWeightBased ? (
              <View
                style={{
                  backgroundColor: theme.colors.accentMuted,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: compact ? 8 : 10,
                  paddingVertical: compact ? 5 : 6,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.typography.body,
                    fontSize: usesRegularTextSizing ? 12 : 11,
                    fontWeight: "700",
                  }}
                >
                  By kg
                </Text>
              </View>
            ) : null}
            {stockStatus ? (
              <View
                style={{
                  alignItems: "center",
                  alignSelf: "flex-start",
                  backgroundColor:
                    stockStatus.tone === "danger" ? theme.colors.dangerMuted : theme.colors.warningMuted,
                  borderRadius: theme.radius.pill,
                  maxWidth: "100%",
                  paddingHorizontal: compact ? 8 : 10,
                  paddingVertical: compact ? 5 : 6,
                }}
              >
                <Text
                  style={{
                    color: stockStatus.tone === "danger" ? theme.colors.danger : theme.colors.warning,
                    flexShrink: 1,
                    fontFamily: theme.typography.body,
                    fontSize: usesRegularTextSizing ? 12 : 11,
                    fontWeight: "700",
                  }}
                >
                  {stockStatus.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {!stockStatus && !showInfoFlip ? (
          <Feather color={theme.colors.textSoft} name="plus-circle" size={compact ? 16 : 18} />
        ) : null}
      </View>

      <View style={{ gap: compact ? 6 : 8 }}>
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.text,
            fontFamily: theme.typography.display,
            fontSize: usesRegularTextSizing ? 20 : 18,
            fontWeight: "700",
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            color: showInfoFlip ? theme.colors.primary : theme.colors.textMuted,
            fontFamily: showInfoFlip ? theme.typography.display : theme.typography.body,
            fontSize: showInfoFlip
              ? usesRegularTextSizing
                ? 24
                : 22
              : usesRegularTextSizing
                ? 14
                : 13,
            fontWeight: "700",
          }}
        >
          {priceLabel ?? formatCurrencyFromCents(priceCents)}
        </Text>
      </View>

      {!showInfoFlip && showStockAndMargin ? (
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
              {stockLabel ?? `${stock} left`}
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

      {shouldRenderFrontAction ? renderActionButton() : null}
    </>
  );

  if (!showInfoFlip) {
    if (!cardPressEnabled || !onPress) {
      return (
        <View
          style={{
            ...cardShellStyle,
            gap: faceGap,
            opacity: disabled ? 0.55 : 1,
            padding: facePadding,
          }}
        >
          {renderFrontContent()}
        </View>
      );
    }

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
        {cardPressEnabled && onPress ? (
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
        ) : (
          <View
            style={{
              flex: 1,
              gap: faceGap,
              padding: facePadding,
            }}
          >
            {renderFrontContent()}
          </View>
        )}

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
        <View style={{ flex: 1, paddingTop: compact ? 6 : 10 }}>
          <View style={{ gap: compact ? theme.spacing.sm : faceGap }}>
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
                  fontSize: usesRegularTextSizing ? 20 : 16,
                  fontWeight: "700",
                  lineHeight: usesRegularTextSizing ? 24 : 20,
                }}
              >
                {name}
              </Text>
            </View>

            <View style={{ gap: compact ? 6 : 10 }}>
              {detailRows.map((detail) => (
                <View
                  key={detail.label}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}
                >
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: usesRegularTextSizing ? 12 : 11,
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
                      fontSize: usesRegularTextSizing ? 12 : 11,
                      fontWeight: "700",
                      textAlign: "right",
                    }}
                  >
                    {detail.value}
                  </Text>
                </View>
              ))}
            </View>

            {resolvedActionPress ? (
              <View style={{ marginTop: compact ? 0 : 2 }}>{renderActionButton()}</View>
            ) : null}
          </View>
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
