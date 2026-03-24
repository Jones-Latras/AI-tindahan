import Storage from "expo-sqlite/kv-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { translate, type TranslationKey } from "@/constants/translations";
import type { AppLanguage } from "@/types/models";

const STORAGE_KEY = "tindahan.app-language";

type LanguageContextValue = {
  language: AppLanguage;
  isReady: boolean;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, number | string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>("taglish");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadLanguage() {
      try {
        const stored = await Storage.getItem(STORAGE_KEY);
        if (mounted && (stored === "english" || stored === "taglish")) {
          setLanguageState(stored);
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    void loadLanguage();

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((currentLanguage) => (currentLanguage === "taglish" ? "english" : "taglish"));
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void Storage.setItem(STORAGE_KEY, language);
  }, [isReady, language]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, number | string>) => translate(language, key, params),
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      isReady,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [isReady, language, setLanguage, t, toggleLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useAppLanguage must be used within LanguageProvider.");
  }

  return context;
}
