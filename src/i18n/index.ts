import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import fr from "./locales/fr.json";
import en from "./locales/en.json";
import es from "./locales/es.json";

const LANGUAGE_STORAGE_KEY = "mogogo_language";
const SUPPORTED_LANGUAGES = ["fr", "en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function getDeviceLanguage(): SupportedLanguage {
  const locales = getLocales();
  const deviceLang = locales[0]?.languageCode ?? "en";
  if (SUPPORTED_LANGUAGES.includes(deviceLang as SupportedLanguage)) {
    return deviceLang as SupportedLanguage;
  }
  return "en";
}

const languageDetector = {
  type: "languageDetector" as const,
  async: true,
  detect: (callback: (lang: string) => void) => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((storedLang) => {
        if (storedLang && SUPPORTED_LANGUAGES.includes(storedLang as SupportedLanguage)) {
          callback(storedLang);
        } else {
          callback(getDeviceLanguage());
        }
      })
      .catch(() => {
        callback(getDeviceLanguage());
      });
  },
  init: () => {},
  cacheUserLanguage: (lang: string) => {
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => {});
  },
};

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export async function changeLanguage(lang: SupportedLanguage) {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export function getCurrentLanguage(): SupportedLanguage {
  const lang = i18n.language?.substring(0, 2);
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
  }
  return "en";
}

export default i18n;
