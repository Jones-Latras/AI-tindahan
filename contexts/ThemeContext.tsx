import Storage from "expo-sqlite/kv-store";
import * as SystemUI from "expo-system-ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { themes, type AppTheme } from "@/constants/theme";
import type { ThemeMode } from "@/types/models";

const STORAGE_KEY = "tindahan.theme-mode";

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  isReady: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>("light");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadThemeMode() {
      try {
        const stored = await Storage.getItem(STORAGE_KEY);
        if (mounted && (stored === "light" || stored === "dark")) {
          setModeState(stored);
        }
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    }

    loadThemeMode();

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((currentMode) => (currentMode === "light" ? "dark" : "light"));
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void Storage.setItem(STORAGE_KEY, mode);
    void SystemUI.setBackgroundColorAsync(themes[mode].colors.background);
  }, [isReady, mode]);

  const value = useMemo(
    () => ({
      theme: themes[mode],
      mode,
      isReady,
      setMode,
      toggleMode,
    }),
    [isReady, mode, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within ThemeProvider.");
  }

  return context;
}

