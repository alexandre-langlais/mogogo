#!/usr/bin/env npx tsx
/**
 * CLI Mogogo — Joue des sessions complètes sans passer par l'app mobile ni Supabase.
 *
 * Usage :
 *   npx tsx scripts/cli-session.ts --batch --context '{"social":"Amis","energy":4,"budget":"Standard","environment":"Extérieur"}' --choices "A,B,A" --json
 *   npx tsx scripts/cli-session.ts --social "Amis" --energy 4 --budget "Standard" --env "Extérieur"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Charger .env.cli
// ---------------------------------------------------------------------------
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../.env.cli");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.cli absent → on compte sur les env vars déjà définies
}

// ---------------------------------------------------------------------------
// Types (copiés depuis src/types/index.ts — pas d'import alias @/ avec tsx)
// ---------------------------------------------------------------------------
type ActionType = "maps" | "web" | "steam" | "app_store" | "play_store" | "youtube" | "streaming" | "spotify";
interface Action { type: ActionType; label: string; query: string; }

interface LLMResponse {
  statut: "en_cours" | "finalisé";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  options?: { A: string; B: string };
  recommandation_finale?: {
    titre: string;
    explication: string;
    google_maps_query?: string;
    actions: Action[];
    tags?: string[];
  };
  metadata: { pivot_count: number; current_branch: string; depth?: number };
}

interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: { latitude: number; longitude: number };
  timing?: string;
  language?: string;
  children_ages?: { min: number; max: number };
}

type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine" | "finalize";

interface HistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
  choiceLabel?: string;
}

interface SessionStep {
  step: number;
  response: LLMResponse;
  choice?: FunnelChoice;
  latencyMs: number;
}

interface SessionResult {
  steps: SessionStep[];
  totalDurationMs: number;
  finalResponse?: LLMResponse;
  pivotCount: number;
}

// ---------------------------------------------------------------------------
// SYSTEM_PROMPT (copie exacte de supabase/functions/llm-gateway/index.ts)
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `Tu es Mogogo, hibou magicien bienveillant. Réponds TOUJOURS en JSON strict :
{"statut":"en_cours|finalisé","phase":"questionnement|pivot|breakout|resultat","mogogo_message":"≤100 chars","question":"≤80 chars","options":{"A":"≤50 chars","B":"≤50 chars"},"recommandation_finale":{"titre":"Nom","explication":"2-3 phrases max","actions":[{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte","query":"≤60 chars"}],"tags":["slug"]},"metadata":{"pivot_count":0,"current_branch":"Cat > Sous-cat","depth":1}}

ANGLE Q1 (varier obligatoirement) :
- Seul/Couple → Finalité : "Créer (cuisine, DIY, dessin...)" vs "Consommer (film, jeu, spectacle...)"
- Amis → Logistique : "Cocon (film, cuisine, jeu...)" vs "Aventure (sortie, balade, lieu inédit...)"
- Famille → Vibe : "Calme (lecture, spa, balade zen...)" vs "Défoulement (sport, escape game, karaoké...)"
Pivot depth==1 : CHANGE d'angle. Depth>=2 : même angle, sous-options différentes. Chaque option = 3-4 exemples concrets entre parenthèses.

ENVIRONNEMENT :
- "Intérieur" ≠ maison. = lieu couvert. Mixer domicile + lieu public couvert (cinéma, café, musée, bowling, escape game). JAMAIS 2 options "à la maison".
- "Extérieur" = plein air. "Peu importe" = libre.

INSOLITE (obligatoire 1x/session) : géocaching, bar à jeux, atelier DIY, expo immersive, karaoké, impro, murder party, astronomie, float tank, lancer de hache, VR, silent disco, food tour...

BRANCHE : metadata.current_branch = chemin hiérarchique complet, depth = niveau (1=racine). Choix A/B → ajouter au chemin, depth++.

CONVERGENCE : 3-5 questions max. Chaque Q sous-divise TOUTES les sous-catégories de l'option choisie. Options A/B courtes, contrastées, concrètes.

LONGUEURS (STRICT, jamais dépasser) : mogogo_message ≤100 chars, question ≤80 chars, options A/B ≤50 chars chacune. Les exemples concrets vont dans la question, PAS dans les options. Options = libellé court uniquement.

NEITHER (pivot, incrémente pivot_count) :
- depth>=2 : RESTE dans catégorie parente, alternatives RADICALEMENT DIFFÉRENTES dans le même thème.
- depth==1 : pivot latéral complet, CHANGE d'angle.

REROLL : même thématique/branche, activité DIFFÉRENTE. REFINE : au minimum 2 questions ciblées sur l'activité (durée, ambiance, format...), puis finalisé avec une recommandation affinée.
pivot_count>=3 → breakout Top 3 (catégories DIFFÉRENTES).

FINALISÉ : titre précis, 2-3 phrases, 1-3 actions pertinentes :
- Lieu → "maps", Jeu PC → "steam"+"youtube", Jeu mobile → "app_store"+"play_store", Film/série → "streaming"+"youtube", Musique → "spotify", Cours → "youtube"+"web", Autre → "web"
Tags : 1-3 parmi [sport,culture,gastronomie,nature,detente,fete,creatif,jeux,musique,cinema,voyage,tech,social,insolite]

ENFANTS : si children_ages, adapter STRICTEMENT à la tranche d'âge.
TIMING : "now"/absent = immédiat. Date ISO = adapter à saison/jour.

FIABILITÉ (CRITIQUE, pas d'accès Internet) :
- Lieux locaux : JAMAIS de nom spécifique sauf icônes nationales (Tour Eiffel) ou grandes chaînes (Pathé, UGC). Recommande une CATÉGORIE ("un restaurant de ramen"). Query maps générique ("bowling Nantes").
- Événements : JAMAIS de spectacle/expo spécifique avec date. Recommande le TYPE + action "web" pour programmation.
- Contenu numérique : titres CONNUS et ÉTABLIS uniquement.

FORMAT (CRITIQUE — non-respect = erreur) :
- Ta réponse DOIT être un JSON COMPLET et VALIDE. Rien avant ni après.
- TOUJOURS fermer toutes les accolades et crochets. JAMAIS de JSON tronqué.
- mogogo_message : TOUJOURS présent, 1 phrase courte ≤ 100 chars, texte brut sans formatage.
- question : texte brut ≤ 80 chars, JAMAIS de **gras**, *italique* ou markdown.
- options A/B : texte brut court ≤ 50 chars, JAMAIS vides, JAMAIS de markdown.
- query d'action : ≤ 60 chars, JAMAIS de "site:" ou opérateurs de recherche. Mots-clés simples uniquement.
- explication : ≤ 200 chars.`;

// ---------------------------------------------------------------------------
// Language instructions for non-French LLM responses
// ---------------------------------------------------------------------------
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "IMPORTANT: You MUST respond entirely in English. All fields (mogogo_message, question, options, recommandation_finale) must be in English. Keep the JSON keys in French as specified in the schema.",
  es: "IMPORTANT: You MUST respond entirely in Spanish. All fields (mogogo_message, question, options, recommandation_finale) must be in Spanish. Keep the JSON keys in French as specified in the schema.",
};

// Machine key → human-readable descriptions per language
const CONTEXT_DESCRIPTIONS: Record<string, Record<string, Record<string, string>>> = {
  social: {
    solo:    { fr: "Seul", en: "Alone", es: "Solo/a" },
    friends: { fr: "Amis", en: "Friends", es: "Amigos" },
    couple:  { fr: "Couple", en: "Couple", es: "Pareja" },
    family:  { fr: "Famille", en: "Family", es: "Familia" },
  },
  budget: {
    free:     { fr: "Gratuit", en: "Free", es: "Gratis" },
    budget:   { fr: "Économique", en: "Budget", es: "Económico" },
    standard: { fr: "Standard", en: "Standard", es: "Estándar" },
    luxury:   { fr: "Luxe", en: "Luxury", es: "Lujo" },
  },
  environment: {
    indoor:  { fr: "Intérieur", en: "Indoor", es: "Interior" },
    outdoor: { fr: "Extérieur", en: "Outdoor", es: "Exterior" },
    any_env: { fr: "Peu importe", en: "No preference", es: "Da igual" },
  },
};

function describeContext(context: UserContext, lang: string): Record<string, unknown> {
  const described = { ...context } as Record<string, unknown>;
  for (const field of ["social", "budget", "environment"] as const) {
    const key = context[field] as string;
    const mapping = CONTEXT_DESCRIPTIONS[field]?.[key];
    if (mapping) {
      described[field] = mapping[lang] ?? mapping.en ?? key;
    }
  }
  // Enrich children_ages with a human-readable description
  const ages = context.children_ages;
  if (ages && typeof ages.min === "number" && typeof ages.max === "number") {
    const templates: Record<string, string> = {
      fr: `Enfants de ${ages.min} à ${ages.max} ans`,
      en: `Children aged ${ages.min} to ${ages.max}`,
      es: `Niños de ${ages.min} a ${ages.max} años`,
    };
    described.children_ages = templates[lang] ?? templates.en;
  }
  return described;
}

// ---------------------------------------------------------------------------
// Configuration LLM
// ---------------------------------------------------------------------------
const LLM_API_URL = process.env.LLM_API_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? "0.7");
const LLM_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Sanitisation — strip markdown et nettoyer les textes
// ---------------------------------------------------------------------------
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1")       // *italic* → italic
    .replace(/__([^_]+)__/g, "$1")       // __bold__ → bold
    .replace(/_([^_]+)_/g, "$1")         // _italic_ → italic
    .replace(/`([^`]+)`/g, "$1")         // `code` → code
    .trim();
}

function truncate(t: string, maxLen: number): string {
  if (t.length <= maxLen) return t;
  const cut = t.lastIndexOf(" ", maxLen - 1);
  return (cut > maxLen * 0.4 ? t.slice(0, cut) : t.slice(0, maxLen - 1)) + "…";
}

function sanitizeResponse(d: Record<string, unknown>): void {
  // Strip markdown + tronquer mogogo_message
  if (typeof d.mogogo_message === "string") {
    d.mogogo_message = truncate(stripMarkdown(d.mogogo_message), 120);
  }
  // Strip markdown + tronquer question
  if (typeof d.question === "string") {
    d.question = truncate(stripMarkdown(d.question), 100);
  }
  // Strip markdown, tronquer et valider options non-vides
  if (d.options && typeof d.options === "object") {
    const opts = d.options as Record<string, unknown>;
    if (typeof opts.A === "string") opts.A = truncate(stripMarkdown(opts.A), 60);
    if (typeof opts.B === "string") opts.B = truncate(stripMarkdown(opts.B), 60);
    if (!opts.A || (typeof opts.A === "string" && opts.A.trim() === "")) {
      console.error("  ⚠️  Option A vide détectée, fallback");
      opts.A = "Option A";
    }
    if (!opts.B || (typeof opts.B === "string" && opts.B.trim() === "")) {
      console.error("  ⚠️  Option B vide détectée, fallback");
      opts.B = "Option B";
    }
  }
  // Strip markdown de recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (typeof rec.titre === "string") rec.titre = stripMarkdown(rec.titre);
    if (typeof rec.explication === "string") rec.explication = stripMarkdown(rec.explication);
  }
}

// ---------------------------------------------------------------------------
// Validation (synchronisée avec src/services/llm.ts)
// ---------------------------------------------------------------------------
function validateLLMResponse(data: unknown): LLMResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Réponse LLM invalide : objet attendu");
  }
  const d = data as Record<string, unknown>;

  // Le LLM copie parfois le format compressé de l'historique (q/A/B au lieu du format complet)
  // Tenter de reconstruire une réponse valide
  if (!d.statut && d.q && (d.A || d.B)) {
    d.statut = "en_cours";
    d.phase = d.phase ?? "questionnement";
    d.question = d.q as string;
    d.options = { A: (d.A as string) ?? "", B: (d.B as string) ?? "" };
    if (!d.mogogo_message) d.mogogo_message = "Hmm, voyons...";
    if (!d.metadata) {
      d.metadata = {
        pivot_count: 0,
        current_branch: (d.branch as string) ?? "Racine",
        depth: (d.depth as number) ?? 1,
      };
    }
    console.error("  ⚠️  Réponse compressée détectée, reconstruction");
  }

  if (!["en_cours", "finalisé"].includes(d.statut as string)) {
    throw new Error("Réponse LLM invalide : statut manquant ou incorrect");
  }
  if (
    !["questionnement", "pivot", "breakout", "resultat"].includes(
      d.phase as string,
    )
  ) {
    throw new Error("Réponse LLM invalide : phase manquante ou incorrecte");
  }
  // Récupérer mogogo_message si manquant
  if (typeof d.mogogo_message !== "string" || !d.mogogo_message.trim()) {
    // Tenter de récupérer depuis d'autres champs ou fournir un fallback
    if (typeof d.message === "string" && d.message.trim()) {
      d.mogogo_message = d.message;
      console.error("  ⚠️  mogogo_message absent, récupéré depuis 'message'");
    } else if (typeof d.question === "string" && d.question.trim()) {
      d.mogogo_message = "Hmm, laisse-moi réfléchir...";
      console.error("  ⚠️  mogogo_message absent, fallback utilisé");
    } else {
      throw new Error("Réponse LLM invalide : mogogo_message manquant");
    }
  }

  // Sanitiser les textes (strip markdown, valider options non-vides)
  sanitizeResponse(d);

  // Normaliser les breakouts : le LLM renvoie parfois statut "en_cours" avec
  // un champ "breakout"/"breakout_options" au lieu de "finalisé" + "recommandation_finale"
  if (d.phase === "breakout" && !d.recommandation_finale) {
    const breakoutArray = (d as any).breakout ?? (d as any).breakout_options;
    if (Array.isArray(breakoutArray) && breakoutArray.length > 0) {
      const items = breakoutArray as Array<{
        titre?: string; explication?: string; actions?: unknown[];
      }>;
      d.statut = "finalisé";
      d.recommandation_finale = {
        titre: items.map(b => b.titre ?? "").filter(Boolean).join(" / "),
        explication: items.map(b => b.explication ?? "").filter(Boolean).join(" "),
        actions: items.flatMap(b => Array.isArray(b.actions) ? b.actions : []),
        tags: [],
      };
    }
  }

  // Le LLM met parfois statut "en_cours" sur un breakout qui a déjà une recommandation_finale
  if (d.phase === "breakout" && d.statut === "en_cours" && d.recommandation_finale) {
    d.statut = "finalisé";
  }

  // Si en_cours sans question mais avec recommandation_finale → flip vers finalisé
  if (d.statut === "en_cours" && !d.question && d.recommandation_finale) {
    d.statut = "finalisé";
    d.phase = "resultat";
    console.error("  ⚠️  en_cours sans question mais avec reco → flip vers finalisé");
  }
  if (d.statut === "en_cours" && !d.question) {
    throw new Error(
      "Réponse LLM invalide : question manquante en phase en_cours",
    );
  }
  // Fallback options si manquantes en en_cours (JSON tronqué avant les options)
  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
    console.error("  ⚠️  Options manquantes, fallback utilisé");
  }
  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error(
      "Réponse LLM invalide : recommandation_finale manquante en phase finalisé",
    );
  }
  // Normaliser : garantir que actions et tags existent toujours dans recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: "Voir sur Maps", query: rec.google_maps_query }];
      }
    }
    // Fallback : si titre présent mais actions vides, ajouter une action web générique
    if (Array.isArray(rec.actions) && rec.actions.length === 0 && typeof rec.titre === "string" && rec.titre.trim()) {
      rec.actions = [{ type: "web", label: "Rechercher", query: rec.titre }];
      console.error("  ⚠️  Actions vides, fallback web ajouté");
    }
    // Fallback : si explication manquante
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = rec.titre ?? "Activité recommandée par Mogogo";
      console.error("  ⚠️  Explication manquante, fallback utilisé");
    }
    if (!Array.isArray(rec.tags)) {
      rec.tags = [];
    } else {
      rec.tags = (rec.tags as unknown[]).filter((t: unknown) => typeof t === "string");
    }
  }
  // Garantir metadata
  if (!d.metadata || typeof d.metadata !== "object") {
    d.metadata = { pivot_count: 0, current_branch: "Racine", depth: 1 };
  }
  return data as LLMResponse;
}

// ---------------------------------------------------------------------------
// Appel LLM
// ---------------------------------------------------------------------------
async function callLLM(
  context: UserContext,
  history: HistoryEntry[],
  choice?: FunnelChoice,
  systemPrompt?: string,
): Promise<{ response: LLMResponse; latencyMs: number }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  // Inject language instruction for non-French languages
  const lang = context.language ?? "fr";
  if (LANGUAGE_INSTRUCTIONS[lang]) {
    messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
  }

  // Translate machine keys to human-readable descriptions for the LLM
  const describedContext = describeContext(context, lang);
  messages.push({
    role: "user",
    content: `Contexte utilisateur : ${JSON.stringify(describedContext)}`,
  });

  // Enrichissement temporel pour les dates précises
  if (context.timing && context.timing !== "now") {
    const date = new Date(context.timing + "T12:00:00");
    if (!isNaN(date.getTime())) {
      const lang = context.language ?? "fr";
      const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES" };
      const locale = localeMap[lang] ?? "en-US";
      const dayName = date.toLocaleDateString(locale, { weekday: "long" });
      const dayNum = date.getDate();
      const month = date.toLocaleDateString(locale, { month: "long" });
      const year = date.getFullYear();
      const m = date.getMonth();
      const seasonNames: Record<string, Record<string, string>> = {
        fr: { spring: "printemps", summer: "été", autumn: "automne", winter: "hiver" },
        en: { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" },
        es: { spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" },
      };
      const seasonKey = m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
      const season = seasonNames[lang]?.[seasonKey] ?? seasonNames.en[seasonKey];
      const templates: Record<string, string> = {
        fr: `Info temporelle : l'activité est prévue pour le ${dayName} ${dayNum} ${month} ${year} (saison : ${season}).`,
        en: `Temporal info: the activity is planned for ${dayName} ${dayNum} ${month} ${year} (season: ${season}).`,
        es: `Info temporal: la actividad está prevista para el ${dayName} ${dayNum} de ${month} de ${year} (temporada: ${season}).`,
      };
      messages.push({
        role: "user",
        content: templates[lang] ?? templates.en,
      });
    }
  }

  // Helper: compute depth (consecutive A/B choices) at a given position in history
  function computeDepthAt(hist: HistoryEntry[], endIdx: number): { depth: number; chosenPath: string[] } {
    let depth = 1;
    const chosenPath: string[] = [];
    for (let i = endIdx; i >= 0; i--) {
      const c = hist[i]?.choice;
      if (c === "A" || c === "B") {
        depth++;
        const opts = hist[i]?.response?.options;
        if (opts && opts[c]) {
          chosenPath.unshift(opts[c]);
        }
      } else {
        break;
      }
    }
    return { depth, chosenPath };
  }

  // Historique compressé (comme l'Edge Function) pour économiser des tokens
  for (let idx = 0; idx < history.length; idx++) {
    const entry = history[idx];
    const r = entry.response;
    const compressed: Record<string, unknown> = {
      q: r.question,
      A: r.options?.A,
      B: r.options?.B,
      phase: r.phase,
    };
    if (r.metadata?.current_branch) compressed.branch = r.metadata.current_branch;
    if (r.metadata?.depth) compressed.depth = r.metadata.depth;
    messages.push({ role: "assistant", content: JSON.stringify(compressed) });
    if (entry.choice) {
      messages.push({ role: "user", content: `Choix : ${entry.choice}` });
    }
  }

  // Post-refine enforcement: si un "refine" a été fait récemment dans l'historique
  // et que moins de 2 questions ont été posées depuis, forcer le LLM à continuer
  if (history.length > 0 && choice && choice !== "refine") {
    let refineIdx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].choice === "refine") { refineIdx = i; break; }
    }
    if (refineIdx >= 0) {
      const questionsSinceRefine = history.length - 1 - refineIdx;
      if (questionsSinceRefine < 2) {
        const remaining = 2 - questionsSinceRefine;
        messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : Affinage en cours (${questionsSinceRefine}/2 questions posées). Tu DOIS poser encore au minimum ${remaining} question(s) ciblée(s) sur l'activité (durée, ambiance, format, lieu...) avant de finaliser. Réponds OBLIGATOIREMENT avec statut "en_cours" et phase "questionnement".` });
      }
    }
  }

  if (choice) {
    if (choice === "neither" && history.length > 0) {
      const { depth, chosenPath } = computeDepthAt(history, history.length - 1);
      if (depth >= 2) {
        const parentTheme = chosenPath[chosenPath.length - 1] ?? chosenPath[0] ?? "ce thème";
        messages.push({
          role: "system",
          content: `DIRECTIVE SYSTÈME : L'utilisateur a rejeté ces deux sous-options PRÉCISES, mais il aime toujours la catégorie parente "${parentTheme}". Tu DOIS rester dans ce thème et proposer deux alternatives RADICALEMENT DIFFÉRENTES au sein de "${parentTheme}". NE CHANGE PAS de catégorie. Profondeur = ${depth}, chemin = "${chosenPath.join(" > ")}".`,
        });
      } else {
        messages.push({
          role: "system",
          content: `DIRECTIVE SYSTÈME : Pivot complet. L'utilisateur rejette dès la racine. Change totalement d'angle d'attaque.`,
        });
      }
      messages.push({ role: "user", content: `Choix : neither` });
    } else if (choice === "finalize") {
      messages.push({
        role: "system",
        content: `DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale concrète basée sur les choix déjà faits dans l'historique. Ne pose AUCUNE question supplémentaire.`,
      });
      messages.push({ role: "user", content: `Choix : finalize` });
    } else if (choice === "refine") {
      messages.push({
        role: "system",
        content: `DIRECTIVE SYSTÈME : L'utilisateur veut AFFINER sa recommandation. Tu DOIS poser au minimum 2 questions ciblées sur l'activité recommandée (durée, ambiance, format, lieu précis...) AVANT de finaliser. Réponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.`,
      });
      messages.push({ role: "user", content: `Choix : refine` });
    } else {
      messages.push({ role: "user", content: `Choix : ${choice}` });
    }
  }

  // max_tokens adaptatif : steps intermédiaires = concis, finalize/breakout = plus de place
  const isFinalStep = choice === "finalize" || choice === "reroll";
  const maxTokens = isFinalStep ? 3000 : 2000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  const start = Date.now();
  try {
    const res = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: LLM_TEMPERATURE,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LLM API ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Réponse LLM vide");
    }

    const parsed = JSON.parse(content);
    const response = validateLLMResponse(parsed);
    return { response, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
function printBreadcrumb(history: HistoryEntry[]) {
  const labels = history
    .filter((h): h is HistoryEntry & { choice: "A" | "B" } => h.choice === "A" || h.choice === "B")
    .map(h => h.response.options?.[h.choice] ?? h.choice);
  if (labels.length > 0) {
    console.error(`  📍 ${labels.join(" > ")}`);
  }
}

function printStep(
  step: number,
  response: LLMResponse,
  latencyMs: number,
  choice?: FunnelChoice,
  jsonMode = false,
) {
  if (jsonMode) {
    const obj: SessionStep = { step, response, latencyMs, ...(choice !== undefined ? { choice } : {}) };
    process.stdout.write(JSON.stringify(obj) + "\n");
    return;
  }

  const phaseTag = `[${response.phase}]`.padEnd(18);
  console.error(`\n── Step ${step} ${phaseTag} (${latencyMs}ms) ──`);
  console.error(`🦉 ${response.mogogo_message}`);

  if (response.statut === "en_cours" && response.question) {
    console.error(`\n❓ ${response.question}`);
    if (response.options) {
      console.error(`   A) ${response.options.A}`);
      console.error(`   B) ${response.options.B}`);
    }
  }

  if (response.recommandation_finale?.titre) {
    const rec = response.recommandation_finale;
    console.error(`\n🎯 ${rec.titre}`);
    console.error(`   ${rec.explication}`);
    const ACTION_ICONS: Record<string, string> = {
      maps: "📍", steam: "🎮", web: "🌐", youtube: "▶️",
      app_store: "🍎", play_store: "📱", streaming: "🎬", spotify: "🎵",
    };
    if (rec.actions?.length) {
      for (const a of rec.actions) {
        console.error(`   ${ACTION_ICONS[a.type] ?? "🔗"} [${a.type}] ${a.label} → ${a.query}`);
      }
    }
    if (rec.tags?.length) {
      console.error(`   🏷️  ${rec.tags.join(", ")}`);
    }
  }

  if (response.metadata) {
    console.error(
      `   pivot_count=${response.metadata.pivot_count}  branch=${response.metadata.current_branch}`,
    );
  }

  if (choice !== undefined) {
    console.error(`   → Choix : ${choice}`);
  }
}

// ---------------------------------------------------------------------------
// Providers de choix
// ---------------------------------------------------------------------------
type ChoiceProvider = (currentResponse: LLMResponse) => Promise<FunnelChoice>;

function batchProvider(choices: FunnelChoice[]): ChoiceProvider {
  let idx = 0;
  return async (_response: LLMResponse) => {
    if (idx < choices.length) return choices[idx++];
    return "A"; // défaut si épuisé
  };
}

function interactiveProvider(): ChoiceProvider {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return (response: LLMResponse) =>
    new Promise<FunnelChoice>((resolve) => {
      const prompt = response.statut === "finalisé"
        ? "\nReroll ? (reroll / n) : "
        : "\nChoix (A / B / neither / any / /back [N]) : ";
      rl.question(
        prompt,
        (answer: string) => {
          const cleaned = answer.trim();
          const backMatch = cleaned.match(/^\/back\s*(\d*)$/i);
          if (backMatch) {
            const idx = backMatch[1] ? parseInt(backMatch[1], 10) : undefined;
            resolve(`__back:${idx ?? "last"}` as FunnelChoice);
            return;
          }
          const lower = cleaned.toLowerCase();
          if (["a", "b", "neither", "any", "reroll"].includes(lower)) {
            resolve(lower === "a" ? "A" : lower === "b" ? "B" : (lower as FunnelChoice));
          } else if (response.statut === "finalisé") {
            resolve("A"); // pas de reroll → fin
          } else {
            console.error(`  Choix invalide "${answer}", défaut → A`);
            resolve("A");
          }
        },
      );
    });
}

function parseAutoChoice(raw: string): FunnelChoice {
  const result = parseAutoChoiceInner(raw);
  console.error(`   [auto] → ${result}`);
  return result;
}

function parseAutoChoiceInner(raw: string): FunnelChoice {
  if (!raw) return "A";

  // 1. Priorité absolue : dernière ligne non-vide (format attendu du prompt)
  const lines = raw.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const lastLine = (lines.at(-1) ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (lastLine === "A" || lastLine === "B") return lastLine as FunnelChoice;
  if (lastLine === "NEITHER" || lastLine === "AUCUNE" || lastLine === "AUCUNEDESDEUX") return "neither";
  if (lastLine === "ANY") return "any";

  // 2. Dernières lignes courtes (≤ 30 chars) — le LLM met parfois un résumé avant la lettre
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const short = lines[i].toUpperCase().replace(/[^A-Z]/g, "");
    if (short === "A" || short === "B") return short as FunnelChoice;
    if (lines[i].length <= 30) {
      if (short.includes("NEITHER") || short.includes("AUCUNE")) return "neither";
      if (short.includes("ANY") || short.includes("INDIFFEREN")) return "any";
    }
  }

  // 3. Pattern explicite dans tout le texte ("choix B", "option A", "réponse : B")
  const upper = raw.toUpperCase();
  const explicitMatches = [...upper.matchAll(/(?:CHOIX|OPTION|RÉPONSE|ANSWER|FINAL|CONCLUS)[^A-Z]{0,5}([AB])\b/g)];
  if (explicitMatches.length > 0) return explicitMatches.at(-1)![1] as FunnelChoice;

  // 4. Dernier recours : dernière lettre A ou B isolée
  const isolated = [...upper.matchAll(/(?:^|[^A-Z])([AB])(?:[^A-Z]|$)/g)];
  if (isolated.length > 0) return isolated.at(-1)![1] as FunnelChoice;

  return "A";
}

function autoProvider(persona: string): ChoiceProvider {
  return async (currentResponse: LLMResponse) => {
    const prompt = `Tu es un utilisateur avec cette intention précise : "${persona}"

On te propose cette question :
"${currentResponse.question}"
  A) ${currentResponse.options?.A}
  B) ${currentResponse.options?.B}

Analyse chaque option par rapport à ton intention, puis donne ta réponse finale.
Format strict — dernière ligne = uniquement la lettre choisie : A ou B (ou neither si aucune ne correspond, any si les deux conviennent).`;

    const res = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.error(`⚠️  Auto-provider LLM error ${res.status}, fallback → A`);
      return "A";
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    // Le contenu peut être dans content (modèle classique) ou reasoning (modèle raisonnement)
    const content = (msg?.content ?? "").trim();
    const reasoning = (msg?.reasoning ?? "").trim();
    const raw = content || reasoning;

    return parseAutoChoice(raw);
  };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
async function runSession(
  context: UserContext,
  choiceProvider: ChoiceProvider,
  options: { systemPrompt?: string; maxSteps?: number; jsonMode?: boolean } = {},
): Promise<SessionResult> {
  const maxSteps = options.maxSteps ?? 20;
  const history: HistoryEntry[] = [];
  const steps: SessionStep[] = [];
  const sessionStart = Date.now();

  // Appel initial (pas de choix)
  const initial = await callLLM(context, history, undefined, options.systemPrompt);
  steps.push({ step: 1, response: initial.response, latencyMs: initial.latencyMs });
  printStep(1, initial.response, initial.latencyMs, undefined, options.jsonMode);

  if (initial.response.statut === "finalisé") {
    return {
      steps,
      totalDurationMs: Date.now() - sessionStart,
      finalResponse: initial.response,
      pivotCount: initial.response.metadata?.pivot_count ?? 0,
    };
  }

  let currentResponse = initial.response;

  for (let i = 2; i <= maxSteps; i++) {
    const choice = await choiceProvider(currentResponse);

    // Time travel via /back [N]
    if (typeof choice === "string" && choice.startsWith("__back:")) {
      const rawIdx = choice.replace("__back:", "");
      const targetIdx = rawIdx === "last"
        ? history.length - 1
        : parseInt(rawIdx, 10);

      if (targetIdx < 0 || targetIdx >= history.length) {
        console.error(`  Index invalide: ${targetIdx} (0-${history.length - 1})`);
        i--;
        continue;
      }

      const truncated = history.slice(0, targetIdx);
      const target = history[targetIdx].response;
      const llmHistory: HistoryEntry[] = [...truncated, { response: target, choice: "neither" as FunnelChoice }];

      history.length = 0;
      history.push(...truncated);

      console.error(`\n  [time-travel] Retour au step ${targetIdx}`);
      printBreadcrumb(history);

      const result = await callLLM(context, llmHistory, "neither", options.systemPrompt);
      history.push({ response: target, choice: "neither" as FunnelChoice });
      currentResponse = result.response;

      steps.push({ step: i, response: result.response, choice: "neither" as FunnelChoice, latencyMs: result.latencyMs });
      printStep(i, result.response, result.latencyMs, "neither" as FunnelChoice, options.jsonMode);
      printBreadcrumb(history);
      continue;
    }

    history.push({ response: currentResponse, choice });

    const result = await callLLM(context, history, undefined, options.systemPrompt);
    steps.push({ step: i, response: result.response, choice, latencyMs: result.latencyMs });
    printStep(i, result.response, result.latencyMs, choice, options.jsonMode);
    printBreadcrumb(history);

    currentResponse = result.response;

    if (currentResponse.statut === "finalisé") {
      // En batch/interactif : vérifier si le prochain choix est "reroll"
      const nextChoice = await choiceProvider(currentResponse);
      if (nextChoice === "reroll") {
        // Continuer la boucle — le reroll sera traité au prochain tour
        history.push({ response: currentResponse, choice: nextChoice });
        const rerollResult = await callLLM(context, history, undefined, options.systemPrompt);
        i++;
        steps.push({ step: i, response: rerollResult.response, choice: nextChoice, latencyMs: rerollResult.latencyMs });
        printStep(i, rerollResult.response, rerollResult.latencyMs, nextChoice, options.jsonMode);
        currentResponse = rerollResult.response;
        continue;
      }
      return {
        steps,
        totalDurationMs: Date.now() - sessionStart,
        finalResponse: currentResponse,
        pivotCount: currentResponse.metadata?.pivot_count ?? 0,
      };
    }
  }

  console.error(`\n⚠️  Max steps (${maxSteps}) atteint sans finalisation.`);
  return {
    steps,
    totalDurationMs: Date.now() - sessionStart,
    pivotCount: currentResponse.metadata?.pivot_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Parsing CLI
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--batch") {
      opts.batch = true;
    } else if (arg === "--auto") {
      opts.auto = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (
      ["--context", "--choices", "--prompt-file", "--transcript", "--max-steps",
        "--social", "--energy", "--budget", "--env", "--persona", "--timing", "--lang",
        "--children-ages"].includes(arg)
    ) {
      opts[arg.replace(/^--/, "")] = args[++i] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printUsage() {
  console.error(`Usage: npx tsx scripts/cli-session.ts [options]

Options:
  --batch                  Mode non-interactif
  --auto                   Mode auto (un LLM joue le rôle de l'utilisateur)
  --persona "..."          Intention de l'utilisateur simulé (mode auto)
  --json                   Sortie JSON (une ligne par step sur stdout)
  --context '{...}'        Contexte utilisateur en JSON
  --social, --energy, --budget, --env   Contexte par champs séparés
  --children-ages "min,max"    Tranche d'âge enfants (ex: "3,10") — implique social=family
  --timing "now"|"YYYY-MM-DD"  Quand faire l'activité (défaut: now)
  --lang fr|en|es          Langue des réponses LLM (défaut: fr)
  --choices "A,B,..."      Choix prédéfinis (mode batch)
  --prompt-file <path>     System prompt alternatif depuis un fichier
  --transcript <path>      Sauvegarder la session complète en JSON
  --max-steps N            Limite de steps (défaut 20)
  -h, --help               Afficher cette aide`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  // Construire le contexte
  let context: UserContext;
  if (opts.context) {
    try {
      context = JSON.parse(opts.context as string);
    } catch {
      console.error("Erreur : --context doit être un JSON valide.");
      process.exit(1);
    }
  } else if (opts.social || opts.energy || opts.budget || opts.env) {
    context = {
      social: (opts.social as string) ?? "Seul",
      energy: parseInt((opts.energy as string) ?? "3", 10),
      budget: (opts.budget as string) ?? "Standard",
      environment: (opts.env as string) ?? "Peu importe",
    };
  } else {
    console.error("Erreur : contexte requis. Utilisez --context ou --social/--energy/--budget/--env.");
    printUsage();
    process.exit(1);
  }

  // Ajouter timing si spécifié via --timing (fonctionne avec --context et champs séparés)
  if (opts.timing) {
    context.timing = opts.timing as string;
  }

  // Ajouter la langue si spécifiée via --lang
  if (opts.lang) {
    context.language = opts.lang as string;
  }

  // Ajouter children_ages si spécifié via --children-ages "min,max"
  if (opts["children-ages"]) {
    const parts = (opts["children-ages"] as string).split(",").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      context.children_ages = { min: parts[0], max: parts[1] };
    } else {
      console.error("Erreur : --children-ages doit être au format \"min,max\" (ex: \"3,10\").");
      process.exit(1);
    }
  }

  // System prompt
  let systemPrompt: string | undefined;
  if (opts["prompt-file"]) {
    try {
      systemPrompt = readFileSync(opts["prompt-file"] as string, "utf-8");
    } catch (e: any) {
      console.error(`Erreur lecture prompt-file : ${e.message}`);
      process.exit(1);
    }
  }

  // Choix provider
  const jsonMode = Boolean(opts.json);
  let choiceProvider: ChoiceProvider;
  if (opts.auto) {
    const persona = (opts.persona as string) ?? "Je cherche une activité sympa";
    choiceProvider = autoProvider(persona);
  } else if (opts.batch) {
    const choices = opts.choices
      ? (opts.choices as string).split(",").map((c) => c.trim() as FunnelChoice)
      : [];
    choiceProvider = batchProvider(choices);
  } else {
    choiceProvider = interactiveProvider();
  }

  const maxSteps = opts["max-steps"] ? parseInt(opts["max-steps"] as string, 10) : 20;

  if (!jsonMode) {
    const mode = opts.auto ? "auto" : opts.batch ? "batch" : "interactif";
    console.error(`\n🦉 Mogogo CLI — ${mode}`);
    console.error(`   Model: ${LLM_MODEL} @ ${LLM_API_URL}`);
    console.error(`   Contexte: ${JSON.stringify(context)}`);
    if (opts.lang) console.error(`   Langue: ${opts.lang}`);
    if (opts.auto) console.error(`   Persona: ${opts.persona ?? "Je cherche une activité sympa"}`);
    if (systemPrompt) console.error(`   Prompt file: ${opts["prompt-file"]}`);
    console.error("");
  }

  try {
    const result = await runSession(context, choiceProvider, {
      systemPrompt,
      maxSteps,
      jsonMode,
    });

    if (!jsonMode) {
      console.error(`\n── Session terminée ──`);
      console.error(`   Steps: ${result.steps.length}`);
      console.error(`   Durée totale: ${result.totalDurationMs}ms`);
      console.error(`   Pivot count: ${result.pivotCount}`);
      if (result.finalResponse?.recommandation_finale) {
        console.error(
          `   Résultat: ${result.finalResponse.recommandation_finale.titre}`,
        );
      }
    }

    // Transcript
    if (opts.transcript) {
      writeFileSync(
        opts.transcript as string,
        JSON.stringify(result, null, 2),
        "utf-8",
      );
      if (!jsonMode) {
        console.error(`   Transcript sauvegardé: ${opts.transcript}`);
      }
    }
  } catch (e: any) {
    console.error(`\n❌ Erreur : ${e.message}`);
    process.exit(1);
  }
}

main();
