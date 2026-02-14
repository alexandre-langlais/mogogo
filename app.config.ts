import { ExpoConfig, ConfigContext } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === 'development';
const TIMESTAMP_VERSION = Math.floor(Date.now() / 1000);

export default ({ config }: ConfigContext): ExpoConfig => ({
  name: process.env.APP_VARIANT === 'development' ? "Mogogo (Dev)" : "Mogogo",
  slug: "mogogo",
  version: "1.0.0",
  scheme: "mogogo",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.mogogo.ios",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    versionCode: process.env.APP_VARIANT === 'development' ? TIMESTAMP_VERSION : 1,
    package: process.env.APP_VARIANT === 'development' ? "app.mogogo.dev" : "app.mogogo.android",
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
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || "ca-app-pub-3940256099942544~3347511713",
        iosAppId: process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID || "ca-app-pub-3940256099942544~1458002511",
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: "30b001ee-8c8a-4795-896f-2ee6d909f58a",
    },
  },
  owner: "alanglaiss-organization",
});
