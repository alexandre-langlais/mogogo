import { supabase } from "./supabase";

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
    { slug: "youtube", label: "YouTube", emoji: "▶️" },
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

// ── CRUD ─────────────────────────────────────────────────────────────────

export async function fetchSubscribedServices(): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("subscribed_services")
    .eq("id", user.id)
    .single();

  if (error || !data) return [];
  return (data.subscribed_services as string[]) ?? [];
}

export async function updateSubscribedServices(services: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ subscribed_services: services })
    .eq("id", user.id);

  if (error) throw error;
}

// ── Formatage LLM ────────────────────────────────────────────────────────

export function formatSubscriptionsForLLM(services: string[]): string {
  if (!services || services.length === 0) return "";

  const labels = services
    .map((slug) => ALL_ENTRIES.find((e) => e.slug === slug))
    .filter((e): e is ServiceEntry => e != null)
    .map((e) => `${e.emoji} ${e.label}`);

  if (labels.length === 0) return "";

  return `L'utilisateur dispose UNIQUEMENT des abonnements suivants : ${labels.join(", ")}. Utilise UNIQUEMENT ces plateformes dans tes actions streaming. Ne propose JAMAIS d'action pour une plateforme à laquelle l'utilisateur n'est pas abonné.`;
}

// ── Expansion des actions streaming ──────────────────────────────────────

import type { Action } from "@/types";

/**
 * Filtre les actions streaming pour des plateformes auxquelles l'utilisateur
 * n'est pas abonné. Le type "streaming" générique est conservé.
 * Les types non-streaming (maps, web, steam, youtube, play_store) sont conservés.
 */
export function filterUnsubscribedStreamingActions(
  actions: Action[],
  subscribedServices: string[],
): Action[] {
  if (!actions || actions.length === 0) return actions;
  const subscribedSet = new Set(subscribedServices);
  return actions.filter((a) => {
    if (!VALID_SLUGS.has(a.type)) return true; // pas un service streaming → garder
    return subscribedSet.has(a.type);           // service streaming → garder ssi abonné
  });
}

/**
 * Expanse les actions d'une recommandation finalisée pour inclure un lien
 * par service abonné pertinent.
 *
 * Le type "streaming" générique est toujours traité comme vidéo.
 * Les actions avec un slug musique explicite (spotify, deezer...) sont expansées
 * correctement via MUSIC_SLUGS.
 * Les actions non-streaming (maps, web) ne sont pas dupliquées.
 * Les expansions sont insérées juste après l'action source.
 */
export function expandStreamingActions(
  actions: Action[],
  subscribedServices: string[],
): Action[] {
  if (!actions || actions.length === 0) return actions;
  if (!subscribedServices || subscribedServices.length === 0) return actions;

  const existingTypes = new Set<string>(actions.map((a) => a.type));

  const videoRef = actions.find((a) => VIDEO_SLUGS.has(a.type) || a.type === "streaming");
  const musicRef = actions.find((a) => MUSIC_SLUGS.has(a.type));

  if (!videoRef && !musicRef) return actions;

  const videoExpansions: Action[] = [];
  const musicExpansions: Action[] = [];

  for (const slug of subscribedServices) {
    if (existingTypes.has(slug)) continue;
    const entry = ALL_ENTRIES.find((e) => e.slug === slug);
    if (!entry) continue;

    const cat = getCategoryForSlug(slug);
    if (cat === "video" && videoRef) {
      videoExpansions.push({
        type: slug as Action["type"],
        label: entry.label,
        query: videoRef.query,
      });
    } else if (cat === "music" && musicRef) {
      musicExpansions.push({
        type: slug as Action["type"],
        label: entry.label,
        query: musicRef.query,
      });
    }
  }

  if (videoExpansions.length === 0 && musicExpansions.length === 0) return actions;

  const result: Action[] = [];
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
