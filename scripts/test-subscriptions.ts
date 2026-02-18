#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour la logique subscriptions (services d'abonnement).
 *
 * Couvre :
 *   - Toggle on/off
 *   - Doublons impossibles
 *   - Slug invalide → erreur
 *   - Liste vide
 *   - Formatage LLM (vide → "", rempli → texte structuré)
 *   - Isolation par user
 *
 * Usage :
 *   npx tsx scripts/test-subscriptions.ts
 */

import {
  SubscriptionsEngine,
  SERVICES_CATALOG,
  VALID_SLUGS,
  InvalidSlugError,
  MaxServicesError,
  MAX_SERVICES_PER_CATEGORY,
  getCategoryForSlug,
  formatSubscriptionsForLLM,
  expandStreamingActions,
} from "./lib/subscriptions-engine.js";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`  ✗ ${msg}`);
    failed++;
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function runTests() {
  console.log("\n═══ Tests Subscriptions — Logique Métier ═══\n");

  const engine = new SubscriptionsEngine();

  // ── 1. Catalogue valide ────────────────────────────────────────────────
  console.log("  — 1. Catalogue —");
  {
    assert(SERVICES_CATALOG.video.length > 0, "Catalogue vidéo non vide");
    assert(SERVICES_CATALOG.music.length > 0, "Catalogue musique non vide");
    assert(VALID_SLUGS.has("netflix"), "netflix dans les slugs valides");
    assert(VALID_SLUGS.has("spotify"), "spotify dans les slugs valides");
    assert(!VALID_SLUGS.has("hbo_max"), "hbo_max absent des slugs valides");
  }

  // ── 2. Liste vide par défaut ───────────────────────────────────────────
  console.log("\n  — 2. Liste vide —");
  {
    const services = engine.getServices("user-001");
    assert(services.length === 0, "Nouvel utilisateur → 0 services", `obtenu: ${services.length}`);
  }

  // ── 3. Toggle on ──────────────────────────────────────────────────────
  console.log("\n  — 3. Toggle on —");
  {
    const result = engine.toggleService("user-001", "netflix");
    assert(result.includes("netflix"), "Toggle on netflix → inclus dans la liste");
    assert(result.length === 1, "Toggle on → 1 service", `obtenu: ${result.length}`);
  }

  // ── 4. Toggle on deuxième service ─────────────────────────────────────
  console.log("\n  — 4. Toggle on 2e service —");
  {
    const result = engine.toggleService("user-001", "spotify");
    assert(result.includes("netflix"), "netflix toujours présent");
    assert(result.includes("spotify"), "spotify ajouté");
    assert(result.length === 2, "2 services après 2 toggles on", `obtenu: ${result.length}`);
  }

  // ── 5. Toggle off ─────────────────────────────────────────────────────
  console.log("\n  — 5. Toggle off —");
  {
    const result = engine.toggleService("user-001", "netflix");
    assert(!result.includes("netflix"), "Toggle off netflix → retiré");
    assert(result.includes("spotify"), "spotify toujours présent");
    assert(result.length === 1, "1 service après toggle off", `obtenu: ${result.length}`);
  }

  // ── 6. Pas de doublons ────────────────────────────────────────────────
  console.log("\n  — 6. Pas de doublons —");
  {
    // Toggle on spotify → le retire (car déjà présent)
    engine.toggleService("user-001", "spotify"); // off
    engine.toggleService("user-001", "spotify"); // on
    const services = engine.getServices("user-001");
    const spotifyCount = services.filter(s => s === "spotify").length;
    assert(spotifyCount <= 1, "Pas de doublon spotify", `count: ${spotifyCount}`);
  }

  // ── 7. Slug invalide ──────────────────────────────────────────────────
  console.log("\n  — 7. Slug invalide —");
  {
    let thrown = false;
    try {
      engine.toggleService("user-001", "hbo_max_inexistant");
    } catch (e) {
      thrown = e instanceof InvalidSlugError;
    }
    assert(thrown, "Slug invalide → InvalidSlugError");
  }

  // ── 8. Isolation par user ─────────────────────────────────────────────
  console.log("\n  — 8. Isolation par user —");
  {
    engine.reset();
    engine.toggleService("alice", "netflix");
    engine.toggleService("bob", "disney_plus");

    const alice = engine.getServices("alice");
    const bob = engine.getServices("bob");

    assert(alice.includes("netflix") && !alice.includes("disney_plus"), "Alice → seulement netflix");
    assert(bob.includes("disney_plus") && !bob.includes("netflix"), "Bob → seulement disney_plus");
  }

  // ── 9. Formatage LLM — vide ──────────────────────────────────────────
  console.log("\n  — 9. Formatage LLM vide —");
  {
    const result = formatSubscriptionsForLLM([]);
    assert(result === "", "Liste vide → chaîne vide", `obtenu: "${result}"`);
  }

  {
    const result = formatSubscriptionsForLLM(undefined as any);
    assert(result === "", "undefined → chaîne vide", `obtenu: "${result}"`);
  }

  // ── 10. Formatage LLM — rempli ────────────────────────────────────────
  console.log("\n  — 10. Formatage LLM rempli —");
  {
    const result = formatSubscriptionsForLLM(["netflix", "spotify"]);
    assert(result.includes("abonnements suivants"), "Contient 'abonnements suivants'", `obtenu: "${result.slice(0, 80)}"`);
    assert(result.includes("Netflix"), "Contient 'Netflix'");
    assert(result.includes("Spotify"), "Contient 'Spotify'");
    assert(result.includes("🎬"), "Contient l'emoji Netflix");
    assert(result.includes("🎵"), "Contient l'emoji Spotify");
  }

  // ── 11. Formatage LLM — slug inconnu ignoré ──────────────────────────
  console.log("\n  — 11. Formatage LLM slug inconnu ignoré —");
  {
    const result = formatSubscriptionsForLLM(["netflix", "inconnu_service"]);
    assert(result.includes("Netflix"), "Netflix présent");
    assert(!result.includes("inconnu_service"), "Slug inconnu ignoré");
  }

  // ── 12. Formatage LLM — tous des slugs inconnus ──────────────────────
  console.log("\n  — 12. Formatage LLM — tous inconnus —");
  {
    const result = formatSubscriptionsForLLM(["x", "y"]);
    assert(result === "", "Que des inconnus → chaîne vide");
  }

  // ── 13. Constante MAX_SERVICES_PER_CATEGORY ──────────────────────────
  console.log("\n  — 13. Constante MAX_SERVICES_PER_CATEGORY —");
  {
    assert(MAX_SERVICES_PER_CATEGORY === 3, "MAX_SERVICES_PER_CATEGORY vaut 3", `obtenu: ${MAX_SERVICES_PER_CATEGORY}`);
  }

  // ── 14. getCategoryForSlug ──────────────────────────────────────────
  console.log("\n  — 14. getCategoryForSlug —");
  {
    assert(getCategoryForSlug("netflix") === "video", "netflix → video");
    assert(getCategoryForSlug("disney_plus") === "video", "disney_plus → video");
    assert(getCategoryForSlug("spotify") === "music", "spotify → music");
    assert(getCategoryForSlug("deezer") === "music", "deezer → music");
    assert(getCategoryForSlug("inconnu") === null, "inconnu → null");
  }

  // ── 15. Limite 3 services vidéo ─────────────────────────────────────
  console.log("\n  — 15. Limite 3 services vidéo —");
  {
    engine.reset();
    engine.toggleService("limit-user", "netflix");
    engine.toggleService("limit-user", "disney_plus");
    engine.toggleService("limit-user", "prime_video");
    // 4e service vidéo → MaxServicesError
    let thrown = false;
    try {
      engine.toggleService("limit-user", "canal_plus");
    } catch (e) {
      thrown = e instanceof MaxServicesError;
    }
    assert(thrown, "4e service vidéo → MaxServicesError");
    const services = engine.getServices("limit-user");
    assert(services.length === 3, "Toujours 3 services après refus", `obtenu: ${services.length}`);
    assert(!services.includes("canal_plus"), "canal_plus non ajouté");
  }

  // ── 16. Limite : toggle off puis re-toggle on ──────────────────────
  console.log("\n  — 16. Toggle off libère une place —");
  {
    // limit-user a déjà 3 vidéo : netflix, disney_plus, prime_video
    engine.toggleService("limit-user", "netflix"); // off → 2 vidéo
    const result = engine.toggleService("limit-user", "canal_plus"); // on → 3 vidéo
    assert(result.includes("canal_plus"), "canal_plus ajouté après libération d'une place");
    assert(!result.includes("netflix"), "netflix retiré");
    assert(result.length === 3, "3 services total", `obtenu: ${result.length}`);
  }

  // ── 17. Limite : musique indépendante de vidéo ──────────────────────
  console.log("\n  — 17. Limite musique indépendante —");
  {
    // limit-user a 3 vidéo, on peut encore ajouter de la musique
    const result = engine.toggleService("limit-user", "spotify");
    assert(result.includes("spotify"), "spotify ajouté malgré 3 vidéo");
    engine.toggleService("limit-user", "deezer");
    engine.toggleService("limit-user", "apple_music");
    // 4e musique → MaxServicesError
    let thrown = false;
    try {
      engine.toggleService("limit-user", "tidal");
    } catch (e) {
      thrown = e instanceof MaxServicesError;
    }
    assert(thrown, "4e service musique → MaxServicesError");
  }

  // ── 18. Limite : toggle off existant ne lève pas d'erreur ──────────
  console.log("\n  — 18. Toggle off n'est pas limité —");
  {
    // limit-user a 3 vidéo + 3 musique, toggle off doit marcher
    const result = engine.toggleService("limit-user", "disney_plus"); // off
    assert(!result.includes("disney_plus"), "disney_plus retiré sans erreur");
  }

  // ── 19. expandStreamingActions — aucune action ──────────────────────
  console.log("\n  — 19. expandStreamingActions — aucune action —");
  {
    const result = expandStreamingActions([], ["netflix", "prime_video"]);
    assert(result.length === 0, "Aucune action → aucune expansion");
  }

  // ── 20. expandStreamingActions — pas d'action streaming ─────────────
  console.log("\n  — 20. expandStreamingActions — pas d'action streaming —");
  {
    const actions = [{ type: "maps", label: "Google Maps", query: "cinema" }];
    const result = expandStreamingActions(actions, ["netflix", "prime_video"]);
    assert(result.length === 1, "Pas d'action streaming → pas d'expansion", `obtenu: ${result.length}`);
  }

  // ── 21. expandStreamingActions — 1 vidéo + 2 abonnements ───────────
  console.log("\n  — 21. expandStreamingActions — expansion vidéo —");
  {
    const actions = [
      { type: "netflix", label: "Voir sur Netflix", query: "The Matrix" },
      { type: "maps", label: "Google Maps", query: "cinema" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "prime_video", "disney_plus"]);
    assert(result.length === 4, "1 netflix + 2 expansions + 1 maps = 4", `obtenu: ${result.length}`);
    assert(result.some(a => a.type === "prime_video"), "prime_video ajouté");
    assert(result.some(a => a.type === "disney_plus"), "disney_plus ajouté");
    const primeAction = result.find(a => a.type === "prime_video")!;
    assert(primeAction.query === "The Matrix", "query copié de l'action source", `obtenu: "${primeAction.query}"`);
  }

  // ── 22. expandStreamingActions — pas de doublon ─────────────────────
  console.log("\n  — 22. expandStreamingActions — pas de doublon —");
  {
    const actions = [
      { type: "netflix", label: "Voir sur Netflix", query: "The Matrix" },
      { type: "prime_video", label: "Voir sur Prime Video", query: "The Matrix" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "prime_video"]);
    assert(result.length === 2, "Déjà présents → pas d'ajout", `obtenu: ${result.length}`);
  }

  // ── 23. expandStreamingActions — musique ────────────────────────────
  console.log("\n  — 23. expandStreamingActions — expansion musique —");
  {
    const actions = [
      { type: "spotify", label: "Écouter sur Spotify", query: "Daft Punk" },
    ];
    const result = expandStreamingActions(actions, ["spotify", "deezer", "netflix"]);
    assert(result.length === 2, "1 spotify + 1 deezer = 2 (netflix ignoré car pas musique)", `obtenu: ${result.length}`);
    assert(result.some(a => a.type === "deezer"), "deezer ajouté");
    assert(!result.some(a => a.type === "netflix"), "netflix PAS ajouté (vidéo, pas musique)");
  }

  // ── 24. expandStreamingActions — services vides ─────────────────────
  console.log("\n  — 24. expandStreamingActions — services vides —");
  {
    const actions = [{ type: "netflix", label: "Netflix", query: "film" }];
    const result = expandStreamingActions(actions, []);
    assert(result.length === 1, "Pas d'abonnements → pas d'expansion", `obtenu: ${result.length}`);
  }

  // ── 25. expandStreamingActions — vidéo+musique mixte ────────────────
  console.log("\n  — 25. expandStreamingActions — mixte vidéo+musique —");
  {
    const actions = [
      { type: "netflix", label: "Netflix", query: "film" },
      { type: "spotify", label: "Spotify", query: "soundtrack" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "disney_plus", "spotify", "deezer"]);
    assert(result.length === 4, "2 originaux + disney_plus + deezer = 4", `obtenu: ${result.length}`);
    assert(result.some(a => a.type === "disney_plus"), "disney_plus ajouté");
    assert(result.some(a => a.type === "deezer"), "deezer ajouté");
  }

  // ── 26. expandStreamingActions — action streaming générique ─────────
  console.log("\n  — 26. expandStreamingActions — type 'streaming' générique —");
  {
    const actions = [
      { type: "streaming", label: "Voir en streaming", query: "Interstellar" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "prime_video"]);
    // 'streaming' générique est considéré comme vidéo → expanse vers netflix + prime_video
    assert(result.some(a => a.type === "netflix"), "netflix ajouté depuis streaming générique");
    assert(result.some(a => a.type === "prime_video"), "prime_video ajouté depuis streaming générique");
  }

  // ── 27. Ordre des actions expansées ─────────────────────────────────
  console.log("\n  — 27. Ordre des actions expansées —");
  {
    const actions = [
      { type: "netflix", label: "Netflix", query: "film" },
      { type: "maps", label: "Maps", query: "cinema" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "disney_plus"]);
    // Les actions streaming doivent être regroupées, maps à la fin
    const netflixIdx = result.findIndex(a => a.type === "netflix");
    const disneyIdx = result.findIndex(a => a.type === "disney_plus");
    const mapsIdx = result.findIndex(a => a.type === "maps");
    assert(disneyIdx < mapsIdx, "disney_plus inséré avant maps", `disney:${disneyIdx} maps:${mapsIdx}`);
    assert(netflixIdx < disneyIdx, "netflix avant disney_plus (ordre original)", `netflix:${netflixIdx} disney:${disneyIdx}`);
  }

  // ── 28. expandStreamingActions — streaming générique = toujours vidéo ──
  console.log("\n  — 28. Streaming générique = toujours vidéo —");
  {
    const actions = [
      { type: "streaming", label: "Voir en streaming", query: "Interstellar" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "spotify", "deezer"]);
    assert(result.some(a => a.type === "netflix"), "netflix ajouté (streaming = vidéo)");
    assert(!result.some(a => a.type === "spotify"), "spotify PAS ajouté (streaming = vidéo, pas musique)");
    assert(!result.some(a => a.type === "deezer"), "deezer PAS ajouté (streaming = vidéo, pas musique)");
  }

  // ── 29. expandStreamingActions — vidéo + musique indépendants ──────────
  console.log("\n  — 29. Vidéo et musique expansés indépendamment —");
  {
    const actions = [
      { type: "netflix", label: "Netflix", query: "Inception" },
    ];
    const result = expandStreamingActions(actions, ["netflix", "prime_video", "spotify"]);
    assert(result.some(a => a.type === "prime_video"), "prime_video ajouté");
    assert(!result.some(a => a.type === "spotify"), "spotify PAS ajouté (pas d'action musique)");
  }

  // ── 30. expandStreamingActions — action musique explicite → expansion musique ─
  console.log("\n  — 30. Action musique explicite → expansion musique OK —");
  {
    const actions = [
      { type: "spotify", label: "Spotify", query: "Daft Punk" },
    ];
    const result = expandStreamingActions(actions, ["spotify", "deezer", "netflix"]);
    assert(result.some(a => a.type === "deezer"), "deezer ajouté");
    assert(!result.some(a => a.type === "netflix"), "netflix PAS ajouté (pas d'action vidéo)");
    assert(result.length === 2, "1 spotify + 1 deezer = 2", `obtenu: ${result.length}`);
  }

  // ── Résumé ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  Subscriptions : ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Échecs :");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
