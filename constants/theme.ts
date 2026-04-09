import type { ThemeMode } from "@/types/models";

const displayFontFamily = "Inter_700Bold";
const bodyFontFamily = "Inter_400Regular";
const labelFontFamily = "Inter_500Medium";
const strongFontFamily = "Inter_600SemiBold";

const typography = {
  body: bodyFontFamily,
  display: displayFontFamily,
  label: labelFontFamily,
  money: strongFontFamily,
  scale: {
    body: { fontSize: 16, lineHeight: 24 },
    bodySm: { fontSize: 14, lineHeight: 20 },
    caption: { fontSize: 12, lineHeight: 16 },
    display: { fontSize: 34, lineHeight: 38 },
    h1: { fontSize: 26, lineHeight: 30 },
    h2: { fontSize: 22, lineHeight: 26 },
    label: { fontSize: 12, lineHeight: 14 },
    micro: { fontSize: 12, lineHeight: 14 },
  },
  strong: strongFontFamily,
  weight: {
    bold: "700" as const,
    medium: "500" as const,
    regular: "400" as const,
    semibold: "600" as const,
  },
} as const;

export const lightTheme = {
  mode: "light" as ThemeMode,
  colors: {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceMuted: "#F3F4F6",
    card: "#FFFFFF",
    border: "#E2E8F0",
    borderStrong: "#CBD5E1",
    text: "#151A18",
    textMuted: "#5F6B66",
    textSoft: "#8A9490",
    primary: "#0D6A54",
    primaryMuted: "#D8F0E7",
    primaryText: "#F6FFFB",
    accent: "#B8793D",
    accentMuted: "#F2E3D2",
    danger: "#B44B39",
    dangerMuted: "#F7DDD8",
    warning: "#9D6718",
    warningMuted: "#F8E8D0",
    success: "#2A8B66",
    successMuted: "#DDF4EA",
    overlay: "rgba(18, 24, 21, 0.38)",
    shadow: "rgba(19, 24, 22, 0.12)"
  },
  typography,
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
};

export const darkTheme = {
  mode: "dark" as ThemeMode,
  colors: {
    background: "#000000",
    surface: "#050505",
    surfaceMuted: "#0B0B0B",
    card: "#101010",
    border: "#232323",
    borderStrong: "#363636",
    text: "#F5F5F5",
    textMuted: "#BCBCBC",
    textSoft: "#A6A6A6",
    primary: "#4FC49F",
    primaryMuted: "#12362C",
    primaryText: "#081510",
    accent: "#D5A168",
    accentMuted: "#34281A",
    danger: "#DF7C68",
    dangerMuted: "#351B17",
    warning: "#E3B463",
    warningMuted: "#372A15",
    success: "#65D3A5",
    successMuted: "#112F24",
    overlay: "rgba(0, 0, 0, 0.76)",
    shadow: "rgba(0, 0, 0, 0.55)"
  },
  typography,
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    pill: 999,
  },
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
};

export type AppTheme = typeof lightTheme;

