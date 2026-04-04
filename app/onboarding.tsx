import Storage from "expo-sqlite/kv-store";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  Text,
  View,
  type ViewToken,
} from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { InputField } from "@/components/InputField";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import { saveStoreName } from "@/db/repositories";
import { isSupabaseReady } from "@/utils/supabase";

export const ONBOARDED_KEY = "tindahan.has-onboarded";
export const STORE_NAME_KEY = "tindahan.store-name";
export const OWNER_NAME_KEY = "tindahan.owner-name";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type SlideData = {
  id: string;
  emoji: string;
  title: string;
  body: string;
};

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const slides: SlideData[] = [
    {
      id: "welcome",
      emoji: "🇵🇭",
      title: t("onboarding.slide.welcome.title"),
      body: t("onboarding.slide.welcome.body"),
    },
    {
      id: "setup",
      emoji: "🏪",
      title: t("onboarding.slide.setup.title"),
      body: t("onboarding.slide.setup.body"),
    },
    {
      id: "start",
      emoji: "🚀",
      title: t("onboarding.slide.start.title"),
      body: t("onboarding.slide.start.body"),
    },
  ];

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const goNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  }, [currentIndex, slides.length]);

  const finishOnboarding = useCallback(async () => {
    const normalizedStoreName = storeName.trim();

    if (normalizedStoreName.length >= 2) {
      await Promise.all([
        Storage.setItem(STORE_NAME_KEY, normalizedStoreName),
        saveStoreName(db, normalizedStoreName),
      ]);
    }
    if (ownerName.trim()) {
      await Storage.setItem(OWNER_NAME_KEY, ownerName.trim());
    }
    await Storage.setItem(ONBOARDED_KEY, "true");
    router.replace(isSupabaseReady() ? "/sign-in" : "/(tabs)");
  }, [db, ownerName, router, storeName]);

  const handleSkip = useCallback(async () => {
    await Storage.setItem(ONBOARDED_KEY, "true");
    router.replace(isSupabaseReady() ? "/sign-in" : "/(tabs)");
  }, [router]);

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 56,
        }}
      >
        <LanguageToggle />
        <Pressable
          onPress={() => void handleSkip()}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            paddingHorizontal: 14,
            paddingVertical: 8,
          })}
        >
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            {t("onboarding.skip")}
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View
            style={{
              alignItems: "center",
              flex: 1,
              gap: 24,
              justifyContent: "center",
              paddingHorizontal: 32,
              width: SCREEN_WIDTH,
            }}
          >
            <Text style={{ fontSize: 64 }}>{item.emoji}</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 28,
                fontWeight: "700",
                lineHeight: 36,
                textAlign: "center",
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 16,
                lineHeight: 24,
                textAlign: "center",
              }}
            >
              {item.body}
            </Text>

            {item.id === "setup" ? (
              <View style={{ gap: 14, width: "100%" }}>
                <InputField
                  label={t("onboarding.storeName")}
                  onChangeText={setStoreName}
                  placeholder={t("onboarding.storeName.placeholder")}
                  value={storeName}
                />
                <InputField
                  label={t("onboarding.ownerName")}
                  onChangeText={setOwnerName}
                  placeholder={t("onboarding.ownerName.placeholder")}
                  value={ownerName}
                />
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={{ alignItems: "center", gap: 20, paddingBottom: 48, paddingHorizontal: 32 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {slides.map((slide, index) => (
            <View
              key={slide.id}
              style={{
                backgroundColor:
                  index === currentIndex ? theme.colors.primary : theme.colors.border,
                borderRadius: 999,
                height: 8,
                width: index === currentIndex ? 24 : 8,
              }}
            />
          ))}
        </View>

        {currentIndex < slides.length - 1 ? (
          <ActionButton label={t("onboarding.next")} onPress={goNext} style={{ width: "100%" }} />
        ) : (
          <ActionButton
            label={t("onboarding.start")}
            onPress={() => void finishOnboarding()}
            style={{ width: "100%" }}
          />
        )}
      </View>
    </View>
  );
}
