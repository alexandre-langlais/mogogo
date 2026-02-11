/**
 * DiscoveryState — Mode "aiguilleur" pour le tier "explicit" (petits modèles).
 *
 * Au lieu de donner au petit modèle toute la complexité du prompt standard,
 * le serveur pré-digère l'état de la session et donne une instruction unique et claire.
 * Le serveur décide, le modèle exécute.
 *
 * NOTE: Ce fichier est auto-contenu (aucun import) pour compatibilité Deno + Node/tsx.
 * Les dépendances (describeContext, LANGUAGE_INSTRUCTIONS) sont passées en paramètres.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiscoveryState {
  constraints: string;
  decisions: string;
  branch: string;
  depth: number;
  pivotCount: number;
  instruction: string;
}

// ── Q1 pré-construite ──────────────────────────────────────────────────────

type SocialGroup = "solo_couple" | "friends" | "family";

interface AngleTemplate {
  id: string;
  question: Record<string, string>;
  optionA: Record<string, string>;
  optionB: Record<string, string>;
}

interface GroupData {
  angles: AngleTemplate[];
  mogogo_messages: Record<string, string[]>;
}

const FIRST_QUESTIONS: Record<SocialGroup, GroupData> = {
  solo_couple: {
    angles: [
      {
        id: "solo_create_consume",
        question: {
          fr: "Plutôt créer quelque chose ou profiter d'un contenu ?",
          en: "Would you rather create something or enjoy some content?",
          es: "¿Prefieres crear algo o disfrutar de un contenido?",
        },
        optionA: {
          fr: "Créer (cuisine, DIY, dessin)",
          en: "Create (cooking, DIY, drawing)",
          es: "Crear (cocina, DIY, dibujo)",
        },
        optionB: {
          fr: "Consommer (film, jeu, spectacle)",
          en: "Enjoy (movie, game, show)",
          es: "Consumir (peli, juego, espectáculo)",
        },
      },
      {
        id: "solo_challenge_cocoon",
        question: {
          fr: "Plutôt se challenger ou se cocooner ?",
          en: "Would you rather challenge yourself or cozy up?",
          es: "¿Prefieres un reto o algo relajado?",
        },
        optionA: {
          fr: "Se challenger (sport, escape, quiz)",
          en: "Challenge (sport, escape, quiz)",
          es: "Reto (deporte, escape, quiz)",
        },
        optionB: {
          fr: "Se cocooner (bain, lecture, série)",
          en: "Cozy up (bath, reading, series)",
          es: "Relax (baño, lectura, serie)",
        },
      },
      {
        id: "solo_learn_unwind",
        question: {
          fr: "Plutôt apprendre un truc ou se vider la tête ?",
          en: "Would you rather learn something or clear your mind?",
          es: "¿Prefieres aprender algo o desconectar?",
        },
        optionA: {
          fr: "Apprendre (tuto, atelier, docu)",
          en: "Learn (tutorial, workshop, docu)",
          es: "Aprender (tuto, taller, docu)",
        },
        optionB: {
          fr: "Se vider la tête (jeu, balade, musique)",
          en: "Clear your mind (game, walk, music)",
          es: "Desconectar (juego, paseo, música)",
        },
      },
    ],
    mogogo_messages: {
      fr: [
        "Salut ! Rien que toi et moi !",
        "Chouette, voyons ce qui te ferait plaisir !",
        "Hou hou ! C'est parti !",
        "Hello ! Trouvons ton activité idéale !",
      ],
      en: [
        "Hi there! Just you and me!",
        "Great, let's find what you'd enjoy!",
        "Hoo hoo! Let's go!",
        "Hello! Let's find your ideal activity!",
      ],
      es: [
        "¡Hola! ¡Solo tú y yo!",
        "¡Genial, veamos qué te gustaría!",
        "¡Uh uh! ¡Vamos!",
        "¡Hola! ¡Encontremos tu actividad ideal!",
      ],
    },
  },
  friends: {
    angles: [
      {
        id: "friends_cocoon_adventure",
        question: {
          fr: "Plutôt se retrouver dans un cocon ou partir à l'aventure ?",
          en: "Would you rather hang out cozy or go on an adventure?",
          es: "¿Prefieres un plan tranquilo o lanzarte a la aventura?",
        },
        optionA: {
          fr: "Cocon (film, cuisine, jeu de société)",
          en: "Cozy (movie, cooking, board game)",
          es: "Tranquilo (peli, cocina, juego de mesa)",
        },
        optionB: {
          fr: "Aventure (sortie, balade, lieu inédit)",
          en: "Adventure (outing, walk, new spot)",
          es: "Aventura (salida, paseo, lugar nuevo)",
        },
      },
      {
        id: "friends_compete_cooperate",
        question: {
          fr: "Plutôt se défier ou coopérer ensemble ?",
          en: "Would you rather compete or cooperate together?",
          es: "¿Prefieres competir o cooperar juntos?",
        },
        optionA: {
          fr: "Se défier (quiz, sport, jeu compétitif)",
          en: "Compete (quiz, sport, competitive game)",
          es: "Competir (quiz, deporte, juego competitivo)",
        },
        optionB: {
          fr: "Coopérer (escape game, cuisine, projet)",
          en: "Cooperate (escape room, cooking, project)",
          es: "Cooperar (escape room, cocina, proyecto)",
        },
      },
      {
        id: "friends_discover_revisit",
        question: {
          fr: "Plutôt découvrir un truc nouveau ou revisiter un classique ?",
          en: "Would you rather discover something new or revisit a classic?",
          es: "¿Prefieres descubrir algo nuevo o repetir un clásico?",
        },
        optionA: {
          fr: "Découvrir (lieu inédit, activité insolite)",
          en: "Discover (new spot, unusual activity)",
          es: "Descubrir (lugar nuevo, actividad inusual)",
        },
        optionB: {
          fr: "Revisiter (resto favori, jeu culte, spot habituel)",
          en: "Revisit (favorite restaurant, classic game)",
          es: "Repetir (restaurante favorito, juego clásico)",
        },
      },
    ],
    mogogo_messages: {
      fr: [
        "Salut la bande ! Explorons ensemble !",
        "Chouette, une sortie entre potes !",
        "Hou hou ! C'est parti les amis !",
        "Hello ! Trouvons votre plan idéal !",
      ],
      en: [
        "Hey gang! Let's explore together!",
        "Awesome, a hangout with friends!",
        "Hoo hoo! Let's go, friends!",
        "Hello! Let's find your perfect plan!",
      ],
      es: [
        "¡Hola grupo! ¡Exploremos juntos!",
        "¡Genial, plan con amigos!",
        "¡Uh uh! ¡Vamos, amigos!",
        "¡Hola! ¡Encontremos el plan perfecto!",
      ],
    },
  },
  family: {
    angles: [
      {
        id: "family_calm_energetic",
        question: {
          fr: "Plutôt une activité calme ou un bon défoulement ?",
          en: "Would you rather a calm activity or something energetic?",
          es: "¿Prefieres una actividad tranquila o algo movido?",
        },
        optionA: {
          fr: "Calme (lecture, balade zen, atelier)",
          en: "Calm (reading, gentle walk, workshop)",
          es: "Tranquilo (lectura, paseo, taller)",
        },
        optionB: {
          fr: "Défoulement (sport, escape game, karaoké)",
          en: "Energetic (sports, escape room, karaoke)",
          es: "Movido (deporte, escape room, karaoke)",
        },
      },
      {
        id: "family_learn_play",
        question: {
          fr: "Plutôt apprendre ensemble ou jouer ensemble ?",
          en: "Would you rather learn together or play together?",
          es: "¿Prefieres aprender juntos o jugar juntos?",
        },
        optionA: {
          fr: "Apprendre (musée, atelier, documentaire)",
          en: "Learn (museum, workshop, documentary)",
          es: "Aprender (museo, taller, documental)",
        },
        optionB: {
          fr: "Jouer (jeu de société, parc, console)",
          en: "Play (board game, park, video game)",
          es: "Jugar (juego de mesa, parque, consola)",
        },
      },
      {
        id: "family_home_outing",
        question: {
          fr: "Plutôt rester au nid ou explorer dehors ?",
          en: "Would you rather stay home or go explore?",
          es: "¿Prefieres quedarse en casa o explorar fuera?",
        },
        optionA: {
          fr: "Au nid (film, cuisine, jeu maison)",
          en: "Stay in (movie, cooking, home game)",
          es: "En casa (peli, cocina, juego casero)",
        },
        optionB: {
          fr: "Explorer (balade, parc, sortie culturelle)",
          en: "Explore (walk, park, cultural outing)",
          es: "Explorar (paseo, parque, salida cultural)",
        },
      },
    ],
    mogogo_messages: {
      fr: [
        "Salut la famille ! Explorons ensemble !",
        "Chouette, une sortie en famille !",
        "Hou hou ! C'est parti tout le monde !",
        "Hello ! Trouvons une activité pour tous !",
      ],
      en: [
        "Hey family! Let's explore together!",
        "Great, a family outing!",
        "Hoo hoo! Let's go everyone!",
        "Hello! Let's find something for everyone!",
      ],
      es: [
        "¡Hola familia! ¡Exploremos juntos!",
        "¡Genial, salida en familia!",
        "¡Uh uh! ¡Vamos todos!",
        "¡Hola! ¡Encontremos algo para todos!",
      ],
    },
  },
};

// ── Angles contextuels (variables extrêmes) ──────────────────────────────

const CONTEXT_ANGLES: AngleTemplate[] = [
  {
    id: "energy_high",
    question: {
      fr: "Plutôt un défi physique ou des sensations fortes ?",
      en: "Would you rather a physical challenge or a thrill?",
      es: "¿Prefieres un reto físico o emociones fuertes?",
    },
    optionA: {
      fr: "Défi physique (sport, rando, escalade)",
      en: "Physical challenge (sport, hike, climbing)",
      es: "Reto físico (deporte, senderismo, escalada)",
    },
    optionB: {
      fr: "Sensations (karting, VR, parc à thème)",
      en: "Thrills (karting, VR, theme park)",
      es: "Emociones (karting, VR, parque temático)",
    },
  },
  {
    id: "energy_low",
    question: {
      fr: "Plutôt détendre l'esprit ou se faire plaisir sans bouger ?",
      en: "Would you rather relax your mind or treat yourself without moving?",
      es: "¿Prefieres relajar la mente o darte un gusto sin moverte?",
    },
    optionA: {
      fr: "Détendre l'esprit (méditation, lecture, nature)",
      en: "Relax your mind (meditation, reading, nature)",
      es: "Relajar la mente (meditación, lectura, naturaleza)",
    },
    optionB: {
      fr: "Se faire plaisir (film, commande, jeu chill)",
      en: "Treat yourself (movie, delivery, chill game)",
      es: "Darte un gusto (peli, delivery, juego chill)",
    },
  },
  {
    id: "budget_luxury",
    question: {
      fr: "Plutôt une expérience exclusive ou un moment d'exception ?",
      en: "Would you rather an exclusive experience or an exceptional moment?",
      es: "¿Prefieres una experiencia exclusiva o un momento excepcional?",
    },
    optionA: {
      fr: "Expérience exclusive (spa, dégustation, loge VIP)",
      en: "Exclusive experience (spa, tasting, VIP lounge)",
      es: "Experiencia exclusiva (spa, degustación, palco VIP)",
    },
    optionB: {
      fr: "Moment d'exception (gastronomie, spectacle, hôtel)",
      en: "Exceptional moment (fine dining, show, hotel)",
      es: "Momento excepcional (gastronomía, espectáculo, hotel)",
    },
  },
  {
    id: "budget_free",
    question: {
      fr: "Plutôt profiter du gratuit ou créer avec ce qu'on a ?",
      en: "Would you rather enjoy free stuff or create with what you have?",
      es: "¿Prefieres aprovechar lo gratuito o crear con lo que tienes?",
    },
    optionA: {
      fr: "Profiter du gratuit (parc, expo libre, balade)",
      en: "Enjoy free stuff (park, free exhibit, walk)",
      es: "Aprovechar lo gratuito (parque, expo libre, paseo)",
    },
    optionB: {
      fr: "Créer avec ce qu'on a (DIY, cuisine, musique)",
      en: "Create with what you have (DIY, cooking, music)",
      es: "Crear con lo que tienes (DIY, cocina, música)",
    },
  },
];

// ── Angle grimoire (basé sur les préférences utilisateur) ────────────────

const TAG_LABELS: Record<string, Record<string, string>> = {
  sport:        { fr: "le sport", en: "sports", es: "el deporte" },
  culture:      { fr: "la culture", en: "culture", es: "la cultura" },
  gastronomie:  { fr: "la gastronomie", en: "gastronomy", es: "la gastronomía" },
  nature:       { fr: "la nature", en: "nature", es: "la naturaleza" },
  detente:      { fr: "la détente", en: "relaxation", es: "la relajación" },
  fete:         { fr: "la fête", en: "partying", es: "la fiesta" },
  creatif:      { fr: "la créativité", en: "creativity", es: "la creatividad" },
  jeux:         { fr: "les jeux", en: "games", es: "los juegos" },
  musique:      { fr: "la musique", en: "music", es: "la música" },
  cinema:       { fr: "le cinéma", en: "cinema", es: "el cine" },
  voyage:       { fr: "le voyage", en: "travel", es: "el viaje" },
  tech:         { fr: "la tech", en: "tech", es: "la tecnología" },
  insolite:     { fr: "l'insolite", en: "the unusual", es: "lo insólito" },
};

function buildGrimoireAngle(tagSlug: string, lang: string): AngleTemplate {
  const l = TAG_LABELS[tagSlug] ? lang : "fr";
  const label = TAG_LABELS[tagSlug]?.[l] ?? TAG_LABELS[tagSlug]?.fr ?? tagSlug;

  const questions: Record<string, string> = {
    fr: `Plutôt rester dans ton élément (${label}) ou te laisser surprendre ?`,
    en: `Would you rather stay in your element (${label}) or be surprised?`,
    es: `¿Prefieres quedarte en tu elemento (${label}) o dejarte sorprender?`,
  };
  const optionsA: Record<string, string> = {
    fr: `Mon élément (${label})`,
    en: `My element (${label})`,
    es: `Mi elemento (${label})`,
  };
  const optionsB: Record<string, string> = {
    fr: "Me laisser surprendre",
    en: "Surprise me",
    es: "Sorpréndeme",
  };

  return {
    id: `grimoire_${tagSlug}`,
    question: questions,
    optionA: optionsA,
    optionB: optionsB,
  };
}

/** Extrait les tags avec score >= minScore depuis le texte preferences du grimoire. */
function parseTopTags(preferences?: string, minScore = 60): Array<{ slug: string; score: number }> {
  if (!preferences) return [];
  const tags: Array<{ slug: string; score: number }> = [];
  // Match patterns like "sport (85%)" or "sport: 85" or "sport 85%"
  const regex = /\b(\w+)\s*[:(]?\s*(\d{1,3})\s*%?\)?/g;
  let match;
  while ((match = regex.exec(preferences)) !== null) {
    const slug = match[1].toLowerCase();
    const score = parseInt(match[2], 10);
    if (score >= minScore && TAG_LABELS[slug]) {
      tags.push({ slug, score });
    }
  }
  return tags.sort((a, b) => b.score - a.score);
}

/** Mapping social labels (FR/EN/ES) → social group */
const SOCIAL_LABELS: Record<string, SocialGroup> = {
  // Machine keys
  solo: "solo_couple", couple: "solo_couple", friends: "friends", family: "family",
  // FR
  seul: "solo_couple", amis: "friends", famille: "family",
  // EN
  alone: "solo_couple",
  // ES
  "solo/a": "solo_couple", amigos: "friends", pareja: "solo_couple", familia: "family",
};

function getSocialGroup(context: Record<string, unknown>): SocialGroup {
  const social = (context.social as string ?? "").toLowerCase();
  return SOCIAL_LABELS[social] ?? "solo_couple";
}

/**
 * Retourne une Q1 pré-construite (sans appel LLM) basée sur le contexte social,
 * les variables extrêmes (énergie, budget) et les préférences grimoire.
 * Latence zéro, format garanti.
 */
export function buildFirstQuestion(
  context: Record<string, unknown>,
  lang: string,
  preferences?: string,
): Record<string, unknown> {
  const group = getSocialGroup(context);
  const groupData = FIRST_QUESTIONS[group];
  const l = groupData.mogogo_messages[lang] ? lang : "fr";

  // Sélection de l'angle
  let angle: AngleTemplate;
  let angleId: string;

  const energy = typeof context.energy === "number" ? context.energy : undefined;
  const budget = typeof context.budget === "string" ? context.budget.toLowerCase() : undefined;

  // 1. Context extrême → 70% chance
  let contextAngle: AngleTemplate | undefined;
  if (energy !== undefined && energy >= 5) {
    contextAngle = CONTEXT_ANGLES.find(a => a.id === "energy_high");
  } else if (energy !== undefined && energy <= 1) {
    contextAngle = CONTEXT_ANGLES.find(a => a.id === "energy_low");
  } else if (budget === "luxury" || budget === "luxe") {
    contextAngle = CONTEXT_ANGLES.find(a => a.id === "budget_luxury");
  } else if (budget === "free" || budget === "gratuit" || budget === "gratis") {
    contextAngle = CONTEXT_ANGLES.find(a => a.id === "budget_free");
  }

  if (contextAngle && Math.random() < 0.7) {
    angle = contextAngle;
    angleId = contextAngle.id;
  }
  // 2. Grimoire → 35% chance, rotation parmi les top 2 tags
  else {
    const topTags = parseTopTags(preferences, 60);
    const grimoireCandidates = topTags.slice(0, 2);

    if (grimoireCandidates.length > 0 && Math.random() < 0.35) {
      const picked = grimoireCandidates[Math.floor(Math.random() * grimoireCandidates.length)];
      angle = buildGrimoireAngle(picked.slug, l);
      angleId = angle.id;
    }
    // 3. Random parmi les angles du groupe social
    else {
      angle = groupData.angles[Math.floor(Math.random() * groupData.angles.length)];
      angleId = angle.id;
    }
  }

  const msgPool = groupData.mogogo_messages[l];
  const mogogo_message = msgPool[Math.floor(Math.random() * msgPool.length)];

  return {
    statut: "en_cours",
    phase: "questionnement",
    mogogo_message,
    question: angle.question[l] ?? angle.question.fr,
    options: {
      A: angle.optionA[l] ?? angle.optionA.fr,
      B: angle.optionB[l] ?? angle.optionB.fr,
    },
    metadata: {
      pivot_count: 0,
      current_branch: "Racine",
      depth: 1,
      angle_id: angleId,
    },
  };
}

// ── Prompt simplifié (~800 chars) ──────────────────────────────────────────

export const EXPLICIT_DISCOVERY_PROMPT = `Tu es Mogogo, hibou magicien. Réponds UNIQUEMENT en JSON strict.
{"statut":"en_cours|finalisé","phase":"questionnement|pivot|breakout|resultat","mogogo_message":"≤100c","question":"≤80c","options":{"A":"≤50c","B":"≤50c"},"recommandation_finale":{"titre":"Nom","explication":"2-3 phrases","justification":"≤60c POURQUOI pour cet utilisateur","actions":[{"type":"maps|web|steam|play_store|youtube|streaming|spotify","label":"Texte","query":"≤60c"}],"tags":["slug"]},"metadata":{"pivot_count":N,"current_branch":"Chemin","depth":N}}

Exemple en_cours :
{"statut":"en_cours","phase":"questionnement","mogogo_message":"Voyons ça !","question":"Sport d'équipe ou individuel ?","options":{"A":"Équipe (foot, volley)","B":"Solo (escalade, running)"},"metadata":{"pivot_count":0,"current_branch":"Sport","depth":2}}

Exemple finalisé :
{"statut":"finalisé","phase":"resultat","mogogo_message":"Voilà !","recommandation_finale":{"titre":"Bowling entre amis","explication":"Une soirée bowling conviviale.","justification":"Idéal pour se défouler entre potes !","actions":[{"type":"maps","label":"Trouver un bowling","query":"bowling"}],"tags":["jeux"]},"metadata":{"pivot_count":0,"current_branch":"Sortie > Bowling","depth":4}}

Règles :
- JSON pur, commence par {, termine par }. JAMAIS de texte autour.
- Texte brut sans markdown. Champs JAMAIS vides.
- JAMAIS de lieu/événement spécifique (sauf icônes nationales ou grandes chaînes).
- App Android : "play_store" uniquement, JAMAIS "app_store".
- Suis l'INSTRUCTION du message utilisateur à la lettre.`;

// ── DiscoveryState builder ─────────────────────────────────────────────────

interface HistoryEntry {
  choice?: string;
  response?: {
    question?: string;
    options?: Record<string, string>;
    metadata?: Record<string, unknown>;
    recommandation_finale?: {
      titre?: string;
      explication?: string;
    };
  };
}

/**
 * Construit l'état de la session à partir du contexte décrit, de l'historique et du choix courant.
 * Le serveur décide de l'action (question, pivot, finalize, breakout), le modèle exécute.
 *
 * @param describedContext - contexte déjà traduit via describeContext()
 */
export function buildDiscoveryState(
  describedContext: Record<string, unknown>,
  history: HistoryEntry[],
  choice: string | undefined,
  _lang: string,
  minDepth = 4,
  excludedTags?: string[],
): DiscoveryState {
  // Constraints line
  const parts: string[] = [];
  if (describedContext.social) parts.push(String(describedContext.social));
  if (describedContext.energy !== undefined) parts.push(`Énergie ${describedContext.energy}`);
  if (describedContext.budget) parts.push(String(describedContext.budget));
  if (describedContext.environment) parts.push(String(describedContext.environment));
  if (describedContext.children_ages) parts.push(String(describedContext.children_ages));
  if (excludedTags?.length) parts.push(`EXCLUSIONS: ${excludedTags.join(", ")}`);
  const constraints = parts.join(" | ");

  // Total pivot count (all "neither" choices in history)
  let pivotCount = 0;
  for (const entry of history) {
    if (entry.choice === "neither") pivotCount++;
  }

  // Depth = 1 + nombre de choix A/B/any dans l'historique.
  // "neither" est transparent (pivot latéral, pas de changement de profondeur).
  let depth = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    const c = history[i].choice;
    if (c === "A" || c === "B" || c === "any") depth++;
    else if (c === "neither") continue;
    else break;
  }

  // Branch path : tous les choix A/B/any en sautant les "neither"
  let runStart = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const c = history[i].choice;
    if (c === "A" || c === "B" || c === "any") runStart = i;
    else if (c === "neither") continue;
    else break;
  }

  const branchParts: string[] = ["Racine"];
  const decisions: string[] = [];
  for (let i = runStart; i < history.length; i++) {
    const c = history[i].choice;
    const opts = history[i].response?.options;
    if ((c === "A" || c === "B") && opts) {
      const chosen = opts[c] ?? c;
      const rejected = opts[c === "A" ? "B" : "A"] ?? "";
      branchParts.push(chosen);
      decisions.push(`"${chosen}"${rejected ? ` (rejeté: "${rejected}")` : ""}`);
    } else if (c === "any" && opts) {
      const pick = Math.random() < 0.5 ? "A" : "B";
      branchParts.push(opts[pick] ?? "any");
      decisions.push(`"${opts[pick] ?? "au choix"}"`);
    }
    // "neither" entries are skipped (no branch contribution)
  }

  // Get label of the current choice (from last history entry's options)
  // "any" = l'utilisateur accepte les deux → le serveur choisit aléatoirement une branche
  const lastEntry = history[history.length - 1];
  const lastOpts = lastEntry?.response?.options;
  let lastChosenLabel = choice ?? "";
  if (lastOpts && (choice === "A" || choice === "B")) {
    lastChosenLabel = lastOpts[choice] ?? choice;
  } else if (lastOpts && choice === "any") {
    const pick = Math.random() < 0.5 ? "A" : "B";
    lastChosenLabel = lastOpts[pick] ?? pick;
  }

  // Detect post-refine flow: count questions since last "refine" in history
  // + récupérer le titre de la recommandation qui est affinée
  let refineIdx = -1;
  let refinedTitle = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].choice === "refine") { refineIdx = i; break; }
  }
  if (refineIdx >= 0) {
    // La recommandation est dans la réponse juste avant le choix "refine"
    const rec = history[refineIdx]?.response?.recommandation_finale;
    if (rec?.titre) refinedTitle = rec.titre;
  }
  const questionsSinceRefine = refineIdx >= 0 ? history.length - 1 - refineIdx : -1;

  // Build instruction based on state + current choice
  let instruction: string;

  if (pivotCount >= 3) {
    instruction = `Trop de pivots (${pivotCount}). Propose un Top 3 d'activités VARIÉES. Statut "finalisé", phase "breakout", recommandation_finale combinant les 3 options.`;
  } else if (choice === "neither") {
    if (depth >= 2) {
      const parentTheme = branchParts[branchParts.length - 1] ?? "ce thème";
      instruction = `L'utilisateur a rejeté les deux options. RESTE dans "${parentTheme}" et propose deux alternatives RADICALEMENT DIFFÉRENTES. Phase "pivot".`;
    } else {
      instruction = `L'utilisateur rejette dès la racine. Change totalement d'angle. Phase "pivot".`;
    }
  } else if (questionsSinceRefine >= 3) {
    const ctx = refinedTitle ? ` L'activité de base est "${refinedTitle}".` : "";
    instruction = `L'utilisateur a choisi "${lastChosenLabel}".${ctx} Affinage terminé. Tu DOIS maintenant finaliser avec une version affinée de cette activité : statut "finalisé", phase "resultat", recommandation_finale concrète. Ne pose AUCUNE question supplémentaire.`;
  } else if (questionsSinceRefine >= 0 && questionsSinceRefine < 2) {
    const remaining = 2 - questionsSinceRefine;
    const ctx = refinedTitle ? ` L'activité à affiner est "${refinedTitle}".` : "";
    instruction = `L'utilisateur a choisi "${lastChosenLabel}".${ctx} Affinage en cours (${questionsSinceRefine}/2). Pose encore ${remaining} question(s) UNIQUEMENT sur cette activité précise (durée, format, lieu, niveau...). RESTE dans le sujet "${refinedTitle || "l'activité recommandée"}". Statut "en_cours", phase "questionnement".`;
  } else if (questionsSinceRefine === 2) {
    const ctx = refinedTitle ? ` L'activité à affiner est "${refinedTitle}".` : "";
    instruction = `L'utilisateur a choisi "${lastChosenLabel}".${ctx} Affinage presque terminé (2/3). Pose une DERNIÈRE question ciblée sur "${refinedTitle || "l'activité"}", puis finalise au prochain tour.`;
  } else if (depth >= minDepth) {
    instruction = `L'utilisateur a choisi "${lastChosenLabel}". C'est assez précis. Finalise avec une activité concrète : statut "finalisé", phase "resultat", recommandation_finale complète avec titre, explication et actions.`;
  } else if (depth === minDepth - 1) {
    instruction = `L'utilisateur a choisi "${lastChosenLabel}". Pose une DERNIÈRE question A/B pour affiner avant de finaliser au prochain tour.`;
  } else {
    instruction = `L'utilisateur a choisi "${lastChosenLabel}". Pose une question A/B pour subdiviser en deux sous-types contrastés avec exemples concrets.`;
  }

  return {
    constraints,
    decisions: decisions.join(" → "),
    branch: branchParts.join(" > "),
    depth,
    pivotCount,
    instruction,
  };
}

// ── Message builder ────────────────────────────────────────────────────────

/**
 * Construit les messages LLM pour le mode DiscoveryState.
 * 2-4 messages au lieu de 2+2N dans le mode classique.
 *
 * @param languageInstruction - instruction de langue (ex: LANGUAGE_INSTRUCTIONS[lang]), optionnelle
 */
export function buildExplicitMessages(
  state: DiscoveryState,
  lang: string,
  languageInstruction?: string,
  preferences?: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: EXPLICIT_DISCOVERY_PROMPT },
  ];

  if (languageInstruction) {
    messages.push({ role: "system", content: languageInstruction });
  }

  if (preferences && preferences.length > 0) {
    messages.push({ role: "system", content: preferences });
  }

  const stateLines = [
    `=== ÉTAT DE LA SESSION ===`,
    `Contraintes : ${state.constraints}`,
  ];
  if (state.decisions) {
    stateLines.push(`Décisions : ${state.decisions}`);
  }
  stateLines.push(`Branche : ${state.branch} (depth=${state.depth}, pivots=${state.pivotCount})`);
  stateLines.push(``);
  stateLines.push(`=== INSTRUCTION ===`);
  stateLines.push(state.instruction);

  messages.push({ role: "user", content: stateLines.join("\n") });

  return messages;
}
