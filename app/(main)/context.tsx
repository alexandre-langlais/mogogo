import { View, Text, Pressable, StyleSheet, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFunnel } from "@/contexts/FunnelContext";
import { useLocation } from "@/hooks/useLocation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCurrentLanguage } from "@/i18n";
import {
  SOCIAL_KEYS, SOCIAL_I18N,
  BUDGET_KEYS, BUDGET_I18N,
  ENVIRONMENT_KEYS, ENVIRONMENT_I18N,
} from "@/i18n/contextKeys";
import type { UserContext } from "@/types";
import type { ThemeColors } from "@/constants";

const energyLevels = [1, 2, 3, 4, 5] as const;

export default function ContextScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setContext } = useFunnel();
  const { location } = useLocation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [social, setSocial] = useState<string>("");
  const [energy, setEnergy] = useState<number>(3);
  const [budget, setBudget] = useState<string>("");
  const [environment, setEnvironment] = useState<string>("");
  const [timing, setTiming] = useState<string>("now");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const isValid = social && budget && environment;

  const formatDate = (date: Date) => {
    const lang = getCurrentLanguage();
    const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES" };
    return date.toLocaleDateString(localeMap[lang] ?? "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
      setTiming(date.toISOString().split("T")[0]);
    } else {
      // Annulation (Android)
      setTiming("now");
    }
  };

  const handleStart = () => {
    const ctx: UserContext = {
      social,
      energy,
      budget,
      environment,
      timing,
      language: getCurrentLanguage(),
      ...(location && { location }),
    };
    setContext(ctx);
    router.push("/(main)/funnel");
  };

  return (
    <ScrollView
      contentContainerStyle={s.container}
      style={{ backgroundColor: colors.background }}
    >
      <Text style={s.sectionTitle}>{t("context.withWho")}</Text>
      <View style={s.optionsRow}>
        {SOCIAL_KEYS.map((key) => (
          <Pressable
            key={key}
            style={[s.chip, social === key && s.chipActive]}
            onPress={() => setSocial(key)}
          >
            <Text
              style={[s.chipText, social === key && s.chipTextActive]}
            >
              {t(SOCIAL_I18N[key])}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>{t("context.energyLevel")}</Text>
      <View style={s.optionsRow}>
        {energyLevels.map((level) => (
          <Pressable
            key={level}
            style={[s.chip, energy === level && s.chipActive]}
            onPress={() => setEnergy(level)}
          >
            <Text
              style={[
                s.chipText,
                energy === level && s.chipTextActive,
              ]}
            >
              {level}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>{t("context.budget")}</Text>
      <View style={s.optionsRow}>
        {BUDGET_KEYS.map((key) => (
          <Pressable
            key={key}
            style={[s.chip, budget === key && s.chipActive]}
            onPress={() => setBudget(key)}
          >
            <Text
              style={[s.chipText, budget === key && s.chipTextActive]}
            >
              {t(BUDGET_I18N[key])}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>{t("context.environment")}</Text>
      <View style={s.optionsRow}>
        {ENVIRONMENT_KEYS.map((key) => (
          <Pressable
            key={key}
            style={[s.chip, environment === key && s.chipActive]}
            onPress={() => setEnvironment(key)}
          >
            <Text
              style={[
                s.chipText,
                environment === key && s.chipTextActive,
              ]}
            >
              {t(ENVIRONMENT_I18N[key])}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>{t("context.when")}</Text>
      <View style={s.optionsRow}>
        <Pressable
          style={[s.chip, timing === "now" && s.chipActive]}
          onPress={() => {
            setTiming("now");
            setShowDatePicker(false);
          }}
        >
          <Text
            style={[s.chipText, timing === "now" && s.chipTextActive]}
          >
            {t("context.now")}
          </Text>
        </Pressable>
        <Pressable
          style={[s.chip, timing !== "now" && s.chipActive]}
          onPress={() => {
            setTiming(selectedDate.toISOString().split("T")[0]);
            setShowDatePicker(true);
          }}
        >
          <Text
            style={[s.chipText, timing !== "now" && s.chipTextActive]}
          >
            {t("context.specificDate")}
          </Text>
        </Pressable>
      </View>

      {timing !== "now" && !showDatePicker && (
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Text style={s.selectedDate}>
            {formatDate(selectedDate)} ✎
          </Text>
        </Pressable>
      )}

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "calendar"}
          minimumDate={new Date()}
          onChange={handleDateChange}
        />
      )}

      {location && (
        <Text style={s.locationInfo}>
          {t("context.locationActive")}
        </Text>
      )}

      <Pressable
        style={[s.startButton, !isValid && s.startButtonDisabled]}
        onPress={handleStart}
        disabled={!isValid}
      >
        <Text style={s.startButtonText}>{t("context.letsGo")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      padding: 24,
      paddingBottom: 48,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginTop: 24,
      marginBottom: 12,
      color: colors.text,
    },
    optionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: colors.text,
    },
    chipTextActive: {
      color: colors.white,
    },
    selectedDate: {
      marginTop: 12,
      fontSize: 15,
      color: colors.primary,
      fontWeight: "500" as const,
    },
    locationInfo: {
      marginTop: 16,
      fontSize: 13,
      color: colors.primary,
      fontStyle: "italic" as const,
    },
    startButton: {
      marginTop: 40,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: "center",
    },
    startButtonDisabled: {
      opacity: 0.5,
    },
    startButtonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "600",
    },
  });
