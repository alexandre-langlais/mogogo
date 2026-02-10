import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: "Mogogo",
  slug: "mogogo",
  version: "1.0.0",
  scheme: "mogogo",
  orientation: "portrait",
  icon: "./assets/images/mogogo-waiting.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.mogogo.app",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/mogogo-waiting.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    package: "com.mogogo.app",
    permissions: [
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
  },
  web: {
    favicon: "./assets/images/mogogo-waiting.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Mogogo a besoin de votre position pour vous dénicher les meilleures sorties à proximité.",
      },
    ],
    "expo-web-browser",
    "@react-native-community/datetimepicker",
    "expo-localization",
  ],
  extra: {
    router: {},
    eas: {
      projectId: "30b001ee-8c8a-4795-896f-2ee6d909f58a",
    },
  },
  owner: "alanglaiss-organization",
});
