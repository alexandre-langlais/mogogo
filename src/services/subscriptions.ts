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

  const allEntries = [...SERVICES_CATALOG.video, ...SERVICES_CATALOG.music];
  const labels = services
    .map((slug) => allEntries.find((e) => e.slug === slug))
    .filter((e): e is ServiceEntry => e != null)
    .map((e) => `${e.emoji} ${e.label}`);

  if (labels.length === 0) return "";

  return `L'utilisateur dispose des abonnements suivants : ${labels.join(", ")}. Tiens-en compte dans tes recommandations (ex: suggérer du contenu disponible sur ces plateformes quand c'est pertinent).`;
}
