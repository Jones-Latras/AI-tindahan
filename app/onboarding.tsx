import Storage from "expo-sqlite/kv-store";
import { useRouter } from "expo-router";
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
import { useAppTheme } from "@/contexts/ThemeContext";

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

const SLIDES: SlideData[] = [
  {
    id: "welcome",
    emoji: "🇵🇭",
    title: "Maligayang pagdating\nsa TindaHan AI!",
    body: "Ang iyong smart POS para sa sari-sari store. Offline-first, AI-powered, at designed para sa mga tindero at tindera ng Pilipinas.",
  },
  {
    id: "setup",
    emoji: "🏪",
    title: "I-setup ang iyong\ntindahan",
    body: "Ilagay ang pangalan ng store mo at ang pangalan mo para mas personal ang experience.",
  },
  {
    id: "start",
    emoji: "🚀",
    title: "Mag-dagdag ng\nprodukto",
    body: "Pagkatapos ng setup, pumunta sa Produkto tab at i-add ang mga items sa iyong store. Kaya na natin 'to!",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const goNext = useCallback(() => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  }, [currentIndex]);

  const finishOnboarding = useCallback(async () => {
    if (storeName.trim()) {
      await Storage.setItem(STORE_NAME_KEY, storeName.trim());
    }
    if (ownerName.trim()) {
      await Storage.setItem(OWNER_NAME_KEY, ownerName.trim());
    }
    await Storage.setItem(ONBOARDED_KEY, "true");
    router.replace("/(tabs)");
  }, [ownerName, router, storeName]);

  const handleSkip = useCallback(async () => {
    await Storage.setItem(ONBOARDED_KEY, "true");
    router.replace("/(tabs)");
  }, [router]);

  return (
    <View style={{ backgroundColor: theme.colors.background, flex: 1 }}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 20, paddingTop: 56 }}>
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
            Skip
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
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
                  label="Store name"
                  onChangeText={setStoreName}
                  placeholder="e.g. Tindahan ni Aling Rosa"
                  value={storeName}
                />
                <InputField
                  label="Owner name"
                  onChangeText={setOwnerName}
                  placeholder="e.g. Rosa Garcia"
                  value={ownerName}
                />
              </View>
            ) : null}
          </View>
        )}
      />

      <View style={{ alignItems: "center", gap: 20, paddingBottom: 48, paddingHorizontal: 32 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {SLIDES.map((slide, index) => (
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

        {currentIndex < SLIDES.length - 1 ? (
          <ActionButton label="Susunod" onPress={goNext} style={{ width: "100%" }} />
        ) : (
          <ActionButton
            label="Simulan na!"
            onPress={() => void finishOnboarding()}
            style={{ width: "100%" }}
          />
        )}
      </View>
    </View>
  );
}
