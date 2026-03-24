import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type AutoSwipeSuggestionCarouselProps = {
  suggestions: string[];
};

const AUTO_ADVANCE_MS = 3200;
const RESET_DELAY_MS = 360;

export function AutoSwipeSuggestionCarousel({ suggestions }: AutoSwipeSuggestionCarouselProps) {
  const { theme } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  if (suggestions.length === 0) {
    return null;
  }

  const slides = suggestions.length > 1 ? [...suggestions, suggestions[0]] : suggestions;

  useEffect(() => {
    if (!carouselWidth || suggestions.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      const nextIndex = indexRef.current + 1;
      const displayIndex = nextIndex === suggestions.length ? 0 : nextIndex;

      indexRef.current = nextIndex;
      setActiveIndex(displayIndex);
      scrollRef.current?.scrollTo({
        animated: true,
        x: carouselWidth * nextIndex,
        y: 0,
      });

      if (nextIndex === suggestions.length) {
        if (resetTimeoutRef.current) {
          clearTimeout(resetTimeoutRef.current);
        }

        resetTimeoutRef.current = setTimeout(() => {
          indexRef.current = 0;
          scrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
        }, RESET_DELAY_MS);
      }
    }, AUTO_ADVANCE_MS);

    return () => {
      clearInterval(interval);
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
    };
  }, [carouselWidth, suggestions.length]);

  useEffect(() => {
    indexRef.current = 0;
    setActiveIndex(0);

    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    if (carouselWidth > 0) {
      scrollRef.current?.scrollTo({ animated: false, x: 0, y: 0 });
    }
  }, [carouselWidth, suggestions]);

  const card = (
    <View
      style={{
        backgroundColor: theme.colors.primaryMuted,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        minHeight: 76,
        justifyContent: "center",
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.primary,
          fontFamily: theme.typography.body,
          fontSize: 14,
          fontWeight: "700",
          lineHeight: 20,
        }}
      >
        {suggestions[0]}
      </Text>
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.sm }}>
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
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
          >
            {slides.map((suggestion, index) => (
              <View key={`${suggestion}-${index}`} style={{ width: carouselWidth }}>
                <View
                  style={{
                    backgroundColor: theme.colors.primaryMuted,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    minHeight: 76,
                    justifyContent: "center",
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <Text
                    numberOfLines={2}
                    style={{
                      color: theme.colors.primary,
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "700",
                      lineHeight: 20,
                    }}
                  >
                    {suggestion}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          card
        )}
      </View>

      {suggestions.length > 1 ? (
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          {suggestions.map((suggestion, index) => (
            <View
              key={`${suggestion}-dot`}
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
