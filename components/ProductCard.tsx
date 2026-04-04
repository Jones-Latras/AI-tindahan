import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  Text,
  Vibration,
  View,
  type GestureResponderEvent,
} from "react-native";

import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { formatCurrencyFromCents } from "@/utils/money";
import { formatWeightKg } from "@/utils/pricing";

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
  quantityBadgeCount?: number;
  enablePrimaryTapFeedback?: boolean;
  cardPressEnabled?: boolean;
  showStockAndMargin?: boolean;
  onLongPress?: () => void;
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
  quantityBadgeCount = 0,
  enablePrimaryTapFeedback = false,
  cardPressEnabled = true,
  showStockAndMargin = true,
  onLongPress,
  onPress,
}: ProductCardProps) {
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const [imageFailed, setImageFailed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const flipAnimation = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const hasImage = Boolean(imageUri && !imageFailed);
  const usesRegularImageSizing = !compact || useRegularImageSizing;
  const usesRegularTextSizing = !compact || useRegularTextSizing;
  const faceGap = compact ? theme.spacing.sm : theme.spacing.md;
  const facePadding = compact ? theme.spacing.md : theme.spacing.lg;
  const infoButtonSize = compact ? 28 : 30;
  const frontImageHeight = showInfoFlip
    ? usesRegularImageSizing
      ? 138
      : 110
    : usesRegularImageSizing
      ? 116
      : 88;
  const namePriceBlockMinHeight = showInfoFlip
    ? usesRegularTextSizing
      ? compact
        ? 82
        : 84
      : compact
        ? 74
        : 78
    : usesRegularTextSizing
      ? compact
        ? 58
        : 62
      : compact
        ? 54
        : 58;
  const fallbackCardHeight = showInfoFlip ? (compact ? 336 : 368) : compact ? 280 : 320;
  const normalizedBadgeCount = Number.isFinite(quantityBadgeCount) ? Math.max(0, Math.trunc(quantityBadgeCount)) : 0;
  const quantityBadgeLabel = normalizedBadgeCount > 99 ? "99+" : String(normalizedBadgeCount);
  const resolvedCategory = category || t("productCard.value.general");
  const resolvedPriceLabel = priceLabel ?? formatCurrencyFromCents(priceCents);
  const quantityLabel = (value: number) => (isWeightBased ? `${formatWeightKg(value)} kg` : `${value}`);
  const resolvedStockLabel = stockLabel ?? t("productCard.value.stockLeft", { count: quantityLabel(stock) });
  const resolvedMinStockLabel =
    minStockLabel ?? t("productCard.value.minStockTarget", { count: quantityLabel(minStock) });
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && stock <= minStock;
  const hasPrimaryAction = Boolean(onPress) && cardPressEnabled && !showDetails && !disabled;
  const imageOpacity = isOutOfStock ? 0.5 : 1;
  const priceTone = isOutOfStock ? theme.colors.textSoft : theme.colors.success;
  const warningBadge = {
    backgroundColor: theme.mode === "dark" ? "#E0A748" : "#F1B453",
    textColor: "#2F1A04",
  };
  const dangerBadge = {
    backgroundColor: theme.mode === "dark" ? "#C45D5D" : "#C95858",
    textColor: "#FFFFFF",
  };
  const stockStatus = isOutOfStock
    ? {
        backgroundColor: dangerBadge.backgroundColor,
        label: t("productCard.status.outOfStock"),
        textColor: dangerBadge.textColor,
      }
    : isLowStock
      ? {
          backgroundColor: warningBadge.backgroundColor,
          label: t("productCard.status.lowStock"),
          textColor: warningBadge.textColor,
        }
      : null;

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

  const handlePrimaryPressIn = () => {
    if (!enablePrimaryTapFeedback || !hasPrimaryAction) {
      return;
    }

    Animated.spring(pressScale, {
      bounciness: 0,
      speed: 36,
      toValue: 0.975,
      useNativeDriver: true,
    }).start();
  };

  const handlePrimaryPressOut = () => {
    if (!enablePrimaryTapFeedback) {
      return;
    }

    Animated.spring(pressScale, {
      bounciness: 10,
      speed: 20,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePrimaryPress = () => {
    if (!hasPrimaryAction || !onPress) {
      return;
    }

    if (enablePrimaryTapFeedback && Platform.OS !== "web") {
      Vibration.vibrate(10);
    }

    onPress();
  };

  const handleToggleDetails = (event: GestureResponderEvent) => {
    event.stopPropagation();
    setShowDetails((current) => !current);
  };

  const cardShellStyle = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    flexBasis: "47%" as const,
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "47%" as const,
    minHeight: fallbackCardHeight,
    minWidth: "47%" as const,
    overflow: "hidden" as const,
    transform: [{ scale: pressScale }],
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
    { label: t("productCard.detail.category"), value: resolvedCategory, tone: theme.colors.text },
    { label: t("productCard.detail.price"), value: resolvedPriceLabel, tone: priceTone },
    ...(showStockAndMargin
      ? [
          {
            label: t("productCard.detail.stock"),
            tone: isLowStock ? warningBadge.backgroundColor : isOutOfStock ? theme.colors.textSoft : theme.colors.text,
            value: resolvedStockLabel,
          },
        ]
      : []),
    { label: t("productCard.detail.minStock"), value: resolvedMinStockLabel, tone: theme.colors.textMuted },
    ...(isWeightBased
      ? [{ label: t("productCard.detail.pricing"), value: t("productCard.value.soldByWeight"), tone: theme.colors.primary }]
      : []),
    ...(showStockAndMargin
      ? [{ label: t("productCard.detail.margin"), value: marginPercent, tone: isOutOfStock ? theme.colors.textSoft : theme.colors.success }]
      : []),
    {
      label: t("productCard.detail.barcode"),
      value: barcode || t("productCard.value.noBarcode"),
      tone: barcode ? theme.colors.text : theme.colors.textSoft,
    },
  ];

  const renderInfoButton = (absolute = false) => (
    <Pressable
      accessibilityLabel={
        showDetails ? t("productCard.accessibility.hideDetails") : t("productCard.accessibility.showDetails")
      }
      onPress={handleToggleDetails}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        height: infoButtonSize,
        justifyContent: "center",
        opacity: pressed ? 0.88 : 1,
        ...(absolute
          ? {
              position: "absolute" as const,
              right: facePadding,
              top: facePadding,
            }
          : {}),
        width: infoButtonSize,
      })}
    >
      <Feather color={theme.colors.primary} name="info" size={compact ? 14 : 15} />
    </Pressable>
  );

  const renderImageBlock = () => (
    <View
      style={{
        borderRadius: theme.radius.sm,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {hasImage ? (
        <Image
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={{ uri: imageUri ?? undefined }}
          style={{
            backgroundColor: theme.colors.card,
            height: frontImageHeight,
            opacity: imageOpacity,
            width: "100%",
          }}
        />
      ) : (
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.surfaceMuted,
            height: frontImageHeight,
            justifyContent: "center",
            opacity: imageOpacity,
            width: "100%",
          }}
        >
          <Feather color={theme.colors.textSoft} name="package" size={compact ? 18 : 22} />
        </View>
      )}

      {stockStatus ? (
        <View
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: stockStatus.backgroundColor,
            borderRadius: 10,
            left: compact ? 8 : 10,
            paddingHorizontal: compact ? 8 : 10,
            paddingVertical: compact ? 5 : 6,
            position: "absolute",
            top: compact ? 8 : 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: stockStatus.textColor,
              fontFamily: theme.typography.body,
              fontSize: usesRegularTextSizing ? 12 : 11,
              fontWeight: "600",
            }}
          >
            {stockStatus.label}
          </Text>
        </View>
      ) : null}

      {normalizedBadgeCount > 0 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            borderColor: theme.colors.card,
            borderRadius: theme.radius.pill,
            borderWidth: 2,
            height: compact ? 28 : 30,
            justifyContent: "center",
            minWidth: compact ? 28 : 30,
            paddingHorizontal: normalizedBadgeCount > 9 ? 8 : 0,
            position: "absolute",
            right: compact ? 8 : 10,
            top: compact ? 8 : 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.primaryText,
              fontFamily: theme.typography.body,
              fontSize: usesRegularTextSizing ? 12 : 11,
              fontWeight: "600",
            }}
          >
            {quantityBadgeLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderFrontContent = () => (
    <View style={{ flex: 1 }}>
      {showInfoFlip ? (
        <View style={{ alignItems: "flex-end", marginBottom: faceGap, minHeight: infoButtonSize }}>
          {renderInfoButton()}
        </View>
      ) : null}

      <View style={{ flex: 1, gap: faceGap }}>
        {renderImageBlock()}

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.xs,
            minHeight: compact ? 30 : 32,
          }}
        >
          <View
            style={{
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.pill,
              paddingHorizontal: compact ? 8 : 10,
              paddingVertical: compact ? 5 : 6,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: usesRegularTextSizing ? 12 : 11,
                fontWeight: "600",
              }}
            >
              {resolvedCategory}
            </Text>
          </View>
          {isWeightBased ? (
            <View
              style={{
                alignItems: "center",
                alignSelf: "flex-start",
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
                  fontWeight: "600",
                }}
              >
                {t("productCard.value.byWeight")}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            gap: compact ? 6 : 8,
            minHeight: namePriceBlockMinHeight,
          }}
        >
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.display,
              fontSize: usesRegularTextSizing ? 20 : 18,
              fontWeight: "600",
              lineHeight: usesRegularTextSizing ? 24 : 22,
            }}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: priceTone,
              flexShrink: 0,
              fontFamily: showInfoFlip ? theme.typography.display : theme.typography.body,
              fontSize: showInfoFlip
                ? usesRegularTextSizing
                  ? 24
                  : 22
                : usesRegularTextSizing
                  ? 14
                  : 13,
              fontWeight: "600",
            }}
          >
            {resolvedPriceLabel}
          </Text>
        </View>

        {!showInfoFlip && showStockAndMargin ? (
          <View style={{ gap: compact ? 8 : 10, marginTop: "auto" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {t("productCard.detail.stock")}
              </Text>
              <Text
                style={{
                  color: isLowStock ? warningBadge.backgroundColor : isOutOfStock ? theme.colors.textSoft : theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {resolvedStockLabel}
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
                {t("productCard.detail.margin")}
              </Text>
              <Text
                style={{
                  color: isOutOfStock ? theme.colors.textSoft : theme.colors.success,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {marginPercent}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  const renderPressableFace = () => (
    <Pressable
      disabled={!hasPrimaryAction}
      onLongPress={onLongPress}
      onPress={handlePrimaryPress}
      onPressIn={handlePrimaryPressIn}
      onPressOut={handlePrimaryPressOut}
      style={({ pressed }) => ({
        flex: 1,
        opacity: pressed && !enablePrimaryTapFeedback ? 0.92 : 1,
        padding: facePadding,
      })}
    >
      {renderFrontContent()}
    </Pressable>
  );

  if (!showInfoFlip) {
    return (
      <Animated.View style={cardShellStyle}>
        {hasPrimaryAction ? renderPressableFace() : <View style={{ flex: 1, padding: facePadding }}>{renderFrontContent()}</View>}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={{
        ...cardShellStyle,
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
        {hasPrimaryAction ? renderPressableFace() : <View style={{ flex: 1, padding: facePadding }}>{renderFrontContent()}</View>}
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
          <View style={{ flex: 1, gap: compact ? theme.spacing.sm : faceGap }}>
            <View style={{ gap: theme.spacing.xs, paddingRight: compact ? 34 : 40 }}>
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontFamily: theme.typography.body,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {t("productCard.detail.productInfo")}
              </Text>
              <Text
                numberOfLines={2}
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: usesRegularTextSizing ? 20 : 16,
                  fontWeight: "600",
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
                  style={{ flexDirection: "row", gap: theme.spacing.md, justifyContent: "space-between" }}
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
                      fontWeight: "600",
                      textAlign: "right",
                    }}
                  >
                    {detail.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {renderInfoButton(true)}
      </Animated.View>
    </Animated.View>
  );
}

