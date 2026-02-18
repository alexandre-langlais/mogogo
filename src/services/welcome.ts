import type { TFunction } from "i18next";

type TimePeriod = "morning" | "afternoon" | "evening";

/** Determine la periode de la journee selon l'heure courante */
export function getTimePeriod(hour: number = new Date().getHours()): TimePeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** Choisit un message de bienvenue aleatoire adapte a l'heure */
export function getWelcomeMessage(t: TFunction, name: string): string {
  const period = getTimePeriod();
  const messages = t(`dashboard.greetings.${period}`, { returnObjects: true }) as string[];
  const idx = Math.floor(Math.random() * messages.length);
  return messages[idx].replace("{{name}}", name);
}
