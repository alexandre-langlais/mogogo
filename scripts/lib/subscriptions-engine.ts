/**
 * SubscriptionsEngine — Implémentation pure TypeScript de la logique subscriptions.
 *
 * Simule le stockage profiles.subscribed_services en mémoire pour permettre
 * des tests unitaires instantanés sans Supabase.
 */

// ── Catalogue de services ────────────────────────────────────────────────

export interface ServiceEntry {
  slug: string;
  label: string;
  emoji: string;
}

export interface ServiceCatalog {
  video: ServiceEntry[];
  music: ServiceEntry[];
}

export const SERVICES_CATALOG: ServiceCatalog = {
  video: [
    { slug: "netflix", label: "Netflix", emoji: "🎬" },
    { slug: "disney_plus", label: "Disney+", emoji: "🏰" },
    { slug: "prime_video", label: "Prime Video", emoji: "📦" },
    { slug: "canal_plus", label: "Canal+", emoji: "📺" },
    { slug: "apple_tv", label: "Apple TV+", emoji: "🍎" },
    { slug: "crunchyroll", label: "Crunchyroll", emoji: "🍥" },
    { slug: "max", label: "Max", emoji: "🎥" },
    { slug: "paramount_plus", label: "Paramount+", emoji: "⭐" },
  ],
  music: [
    { slug: "spotify", label: "Spotify", emoji: "🎵" },
    { slug: "apple_music", label: "Apple Music", emoji: "🎧" },
    { slug: "deezer", label: "Deezer", emoji: "🎶" },
    { slug: "youtube_music", label: "YouTube Music", emoji: "▶️" },
    { slug: "amazon_music", label: "Amazon Music", emoji: "📦" },
    { slug: "tidal", label: "Tidal", emoji: "🌊" },
  ],
};

export const VALID_SLUGS = new Set<string>(
  [...SERVICES_CATALOG.video, ...SERVICES_CATALOG.music].map((s) => s.slug),
);

// ── Errors ───────────────────────────────────────────────────────────────

export class InvalidSlugError extends Error {
  constructor(slug: string) {
    super(`Slug de service inconnu : "${slug}"`);
    this.name = "InvalidSlugError";
  }
}

// ── Engine ────────────────────────────────────────────────────────────────

export class SubscriptionsEngine {
  private userServices = new Map<string, string[]>();

  /** Retourne les services d'un utilisateur */
  getServices(userId: string): string[] {
    return [...(this.userServices.get(userId) ?? [])];
  }

  /** Ajoute ou retire un service (toggle) */
  toggleService(userId: string, slug: string): string[] {
    if (!VALID_SLUGS.has(slug)) {
      throw new InvalidSlugError(slug);
    }

    const current = this.userServices.get(userId) ?? [];
    const idx = current.indexOf(slug);

    if (idx >= 0) {
      // Retirer
      current.splice(idx, 1);
    } else {
      // Ajouter
      current.push(slug);
    }

    this.userServices.set(userId, current);
    return [...current];
  }

  /** Reset complet (pour tests) */
  reset(): void {
    this.userServices.clear();
  }
}

// ── Formatage LLM ────────────────────────────────────────────────────────

/**
 * Formatte les services souscrits pour injection dans le prompt LLM.
 * Retourne "" si la liste est vide.
 */
export function formatSubscriptionsForLLM(services: string[]): string {
  if (!services || services.length === 0) return "";

  const allEntries = [...SERVICES_CATALOG.video, ...SERVICES_CATALOG.music];
  const labels = services
    .map((slug) => allEntries.find((e) => e.slug === slug))
    .filter((e): e is ServiceEntry => e != null)
    .map((e) => `${e.emoji} ${e.label}`);

  if (labels.length === 0) return "";

  return `L'utilisateur dispose des abonnements suivants : ${labels.join(", ")}. Tiens-en compte dans tes recommandations (ex: suggérer du contenu disponible sur ces plateformes quand c'est pertinent).`;
}
