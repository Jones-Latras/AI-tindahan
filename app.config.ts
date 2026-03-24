import type { ExpoConfig } from "expo/config";

const appJson = require("./app.json");
const baseConfig = appJson.expo as ExpoConfig;

export default (): ExpoConfig => ({
  ...baseConfig,
  extra: {
    ...(baseConfig.extra ?? {}),
    geminiKey: process.env.EXPO_PUBLIC_GEMINI_KEY?.trim() ?? "",
  },
});
