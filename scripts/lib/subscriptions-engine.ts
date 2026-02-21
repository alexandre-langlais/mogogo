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

// ── Constantes ───────────────────────────────────────────────────────────

export const MAX_SERVICES_PER_CATEGORY = 3;

// ── Helpers ──────────────────────────────────────────────────────────────

const VIDEO_SLUGS = new Set(SERVICES_CATALOG.video.map((s) => s.slug));
const MUSIC_SLUGS = new Set(SERVICES_CATALOG.music.map((s) => s.slug));
const ALL_ENTRIES = [...SERVICES_CATALOG.video, ...SERVICES_CATALOG.music];

/** Retourne la catégorie d'un slug de service, ou null si inconnu */
export function getCategoryForSlug(slug: string): "video" | "music" | null {
  if (VIDEO_SLUGS.has(slug)) return "video";
  if (MUSIC_SLUGS.has(slug)) return "music";
  return null;
}

// ── Errors ───────────────────────────────────────────────────────────────

export class InvalidSlugError extends Error {
  constructor(slug: string) {
    super(`Slug de service inconnu : "${slug}"`);
    this.name = "InvalidSlugError";
  }
}

export class MaxServicesError extends Error {
  constructor(category: "video" | "music") {
    super(`Limite de ${MAX_SERVICES_PER_CATEGORY} services ${category} atteinte`);
    this.name = "MaxServicesError";
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
      // Retirer — toujours permis
      current.splice(idx, 1);
    } else {
      // Ajouter — vérifier la limite par catégorie
      const category = getCategoryForSlug(slug);
      if (category) {
        const slugsInCategory = category === "video" ? VIDEO_SLUGS : MUSIC_SLUGS;
        const countInCategory = current.filter((s) => slugsInCategory.has(s)).length;
        if (countInCategory >= MAX_SERVICES_PER_CATEGORY) {
          throw new MaxServicesError(category);
        }
      }
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

  const labels = services
    .map((slug) => ALL_ENTRIES.find((e) => e.slug === slug))
    .filter((e): e is ServiceEntry => e != null)
    .map((e) => `${e.emoji} ${e.label}`);

  if (labels.length === 0) return "";

  return `L'utilisateur dispose des abonnements suivants : ${labels.join(", ")}. Tiens-en compte dans tes recommandations (ex: suggérer du contenu disponible sur ces plateformes quand c'est pertinent).`;
}

// ── Filtrage des actions streaming ───────────────────────────────────────

interface SimpleAction {
  type: string;
  label: string;
  query: string;
}

/**
 * Filtre les actions streaming pour des plateformes auxquelles l'utilisateur
 * n'est pas abonné. Le type "streaming" générique est conservé.
 * Les types non-streaming (maps, web, steam, youtube, play_store) sont conservés.
 */
export function filterUnsubscribedStreamingActions(
  actions: SimpleAction[],
  subscribedServices: string[],
): SimpleAction[] {
  if (!actions || actions.length === 0) return actions;
  const subscribedSet = new Set(subscribedServices);
  return actions.filter((a) => {
    if (!VALID_SLUGS.has(a.type)) return true; // pas un service streaming → garder
    return subscribedSet.has(a.type);           // service streaming → garder ssi abonné
  });
}

// ── Expansion des actions streaming ──────────────────────────────────────

/**
 * Expanse les actions d'une recommandation finalisée pour inclure un lien
 * par service abonné pertinent.
 *
 * Le type "streaming" générique est toujours traité comme vidéo.
 * Les actions avec un slug musique explicite (spotify, deezer...) sont expansées
 * correctement via MUSIC_SLUGS.
 * Les actions non-streaming (maps, web) ne sont pas dupliquées.
 * Les actions expansées sont insérées juste après le groupe streaming, avant les autres.
 */
export function expandStreamingActions(
  actions: SimpleAction[],
  subscribedServices: string[],
): SimpleAction[] {
  if (!actions || actions.length === 0) return actions;
  if (!subscribedServices || subscribedServices.length === 0) return actions;

  const existingTypes = new Set(actions.map((a) => a.type));

  const videoRef = actions.find((a) => VIDEO_SLUGS.has(a.type) || a.type === "streaming");
  const musicRef = actions.find((a) => MUSIC_SLUGS.has(a.type));

  if (!videoRef && !musicRef) return actions;

  const videoExpansions: SimpleAction[] = [];
  const musicExpansions: SimpleAction[] = [];

  for (const slug of subscribedServices) {
    if (existingTypes.has(slug)) continue;
    const entry = ALL_ENTRIES.find((e) => e.slug === slug);
    if (!entry) continue;

    const cat = getCategoryForSlug(slug);
    if (cat === "video" && videoRef) {
      videoExpansions.push({
        type: slug,
        label: entry.label,
        query: videoRef.query,
      });
    } else if (cat === "music" && musicRef) {
      musicExpansions.push({
        type: slug,
        label: entry.label,
        query: musicRef.query,
      });
    }
  }

  if (videoExpansions.length === 0 && musicExpansions.length === 0) return actions;

  const result: SimpleAction[] = [];
  const inserted = { video: false, music: false };

  for (const action of actions) {
    result.push(action);
    const cat = getCategoryForSlug(action.type);
    const isStreamingGeneric = action.type === "streaming";

    if ((cat === "video" || isStreamingGeneric) && !inserted.video) {
      result.push(...videoExpansions);
      inserted.video = true;
    }
    if (cat === "music" && !inserted.music) {
      result.push(...musicExpansions);
      inserted.music = true;
    }
  }

  if (!inserted.video) result.push(...videoExpansions);
  if (!inserted.music) result.push(...musicExpansions);

  return result;
}
