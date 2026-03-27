import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";

type AutoSwipeSuggestionCarouselProps = {
  suggestions: string[];
};

type SuggestionSlide = {
  id: string;
  text: string;
};

const AUTO_ADVANCE_MS = 3200;

export function AutoSwipeSuggestionCarousel({ suggestions }: AutoSwipeSuggestionCarouselProps) {
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const visibleSuggestions = useMemo<SuggestionSlide[]>(
    () =>
      suggestions
        .map((text, index) => ({ id: `${index}-${text}`, text }))
        .filter((suggestion) => !dismissedIds.includes(suggestion.id)),
    [dismissedIds, suggestions],
  );

  useEffect(() => {
    setDismissedIds([]);
  }, [suggestions]);

  useEffect(() => {
    indexRef.current = 0;
    setActiveIndex(0);

    if (carouselWidth > 0) {
      scrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
    }
  }, [carouselWidth, visibleSuggestions]);

  useEffect(() => {
    if (!carouselWidth || visibleSuggestions.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      const nextIndex = indexRef.current >= visibleSuggestions.length - 1 ? 0 : indexRef.current + 1;

      indexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      scrollRef.current?.scrollTo({
        animated: nextIndex !== 0,
        x: carouselWidth * nextIndex,
        y: 0,
      });
    }, AUTO_ADVANCE_MS);

    return () => clearInterval(interval);
  }, [carouselWidth, visibleSuggestions.length]);

  if (suggestions.length === 0) {
    return null;
  }

  if (visibleSuggestions.length === 0) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.typography.body,
            fontSize: 13,
            lineHeight: 17,
          }}
        >
          {t("home.brief.restockCleared")}
        </Text>
      </View>
    );
  }

  const handleDismiss = (suggestionId: string) => {
    setDismissedIds((current) => [...current, suggestionId]);
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(visibleSuggestions.length - 1, Math.round(event.nativeEvent.contentOffset.x / carouselWidth)));
    indexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  const renderSuggestionCard = (suggestion: SuggestionSlide) => (
    <View
      style={{
        alignItems: "flex-start",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderStrong,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        minHeight: 68,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          flex: 1,
          fontFamily: theme.typography.body,
          fontSize: 13,
          lineHeight: 18,
        }}
      >
        {suggestion.text}
      </Text>

      <Pressable
        accessibilityLabel={`${t("home.brief.restockDone")}: ${suggestion.text}`}
        onPress={() => handleDismiss(suggestion.id)}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: theme.colors.primaryMuted,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          height: 24,
          justifyContent: "center",
          marginLeft: "auto",
          marginTop: 1,
          opacity: pressed ? 0.88 : 1,
          width: 24,
        })}
      >
        <Feather color={theme.colors.primary} name="check" size={12} />
      </Pressable>
    </View>
  );

  const fallbackCard = renderSuggestionCard(visibleSuggestions[0]);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          if (nextWidth > 0 && nextWidth !== carouselWidth) {
            setCarouselWidth(nextWidth);
          }
        }}
      >
        {carouselWidth > 0 ? (
          <ScrollView
            ref={scrollRef}
            bounces={false}
            horizontal
            onMomentumScrollEnd={handleMomentumScrollEnd}
            pagingEnabled
            scrollEnabled={visibleSuggestions.length > 1}
            showsHorizontalScrollIndicator={false}
          >
            {visibleSuggestions.map((suggestion) => (
              <View key={suggestion.id} style={{ width: carouselWidth }}>
                {renderSuggestionCard(suggestion)}
              </View>
            ))}
          </ScrollView>
        ) : (
          fallbackCard
        )}
      </View>

      {visibleSuggestions.length > 1 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          {visibleSuggestions.map((suggestion, index) => (
            <View
              key={suggestion.id}
              style={{
                backgroundColor: index === activeIndex ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radius.pill,
                height: 6,
                width: index === activeIndex ? 18 : 6,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
