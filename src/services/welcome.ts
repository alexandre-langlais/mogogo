import type { TFunction } from "i18next";

export type TimePeriod = "morning" | "afternoon" | "evening" | "night";

/** Determine la periode de la journee selon l'heure courante */
export function getTimePeriod(hour: number = new Date().getHours()): TimePeriod {
  if (hour >= 6 && hour < 13) return "morning";
  if (hour >= 13 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

/** Choisit un header de salutation aleatoire adapte a l'heure */
export function getHelloHeader(t: TFunction): string {
  const period = getTimePeriod();
  const variants = t(`dashboard.hello.${period}`, { returnObjects: true }) as string[];
  return variants[Math.floor(Math.random() * variants.length)];
}

/** Choisit un message de bienvenue aleatoire adapte a l'heure */
export function getWelcomeMessage(t: TFunction, name: string): string {
  const period = getTimePeriod();
  const messages = t(`dashboard.greetings.${period}`, { returnObjects: true }) as string[];
  const idx = Math.floor(Math.random() * messages.length);
  return messages[idx].replace("{{name}}", name);
}
