# Specifications Fonctionnelles & Techniques : Application Mogogo

## 1. Vision du Produit

* **Nom de l'application** : Mogogo
* **Mascotte** : **Mogogo**, un hibou magicien avec un chapeau de magicien.
* **Ton de la mascotte** : Sympathique, amical et bienveillant. Elle agit comme un guide magique qui parle avec enthousiasme.
* **Concept** : Un assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par une IA.

## 2. Variables de Contexte (Inputs)

Le LLM utilise ces donnees pour filtrer les propositions initiales :

| Variable | Valeurs (cles machine) | Affichage |
| :--- | :--- | :--- |
| **Social** | `solo`, `friends`, `couple`, `family` | Seul, Amis, Couple, Famille |
| **Energie** | `1` a `5` (nombre) | Niveau 1 (epuise) a 5 (survolte) |
| **Budget** | `free`, `budget`, `standard`, `luxury` | Gratuit, Economique, Standard, Luxe |
| **Environnement** | `indoor`, `outdoor`, `any_env` | Interieur, Exterieur, Peu importe |
| **Timing** | `"now"` ou `"YYYY-MM-DD"` (ISO) | Maintenant ou date precise |
| **Localisation** | `{ latitude, longitude }` (GPS) | Detection automatique |
| **Langue** | `"fr"`, `"en"`, `"es"` | Francais, Anglais, Espagnol |

### Validation
Le bouton "C'est parti" est desactive tant que **social**, **budget** et **environment** ne sont pas renseignes. L'energie a une valeur par defaut (3). Le timing vaut `"now"` par defaut.

### Timing : enrichissement cote serveur
Quand `timing !== "now"`, l'Edge Function enrichit le contexte LLM avec :
- Jour de la semaine, jour, mois, annee
- Saison (printemps/ete/automne/hiver)
- Message traduit selon la langue active

## 3. Le Grimoire : Preferences Thematiques Utilisateur

Le Grimoire est un systeme de memoire a long terme sous forme de **tags thematiques scores**. Il oriente les suggestions du LLM sans overrider le contexte immediat de la session.

### Principe
Chaque utilisateur dispose d'un ensemble de tags (ex: `nature:80`, `jeux:50`) qui refletent ses gouts. Ces scores sont injectes dans le prompt LLM comme contexte supplementaire, et mis a jour automatiquement a chaque activite validee.

### Catalogue de tags (14 tags)

| Slug | Emoji | Description |
| :--- | :--- | :--- |
| `sport` | ⚽ | Sport |
| `culture` | 🎭 | Culture |
| `gastronomie` | 🍽️ | Gastronomie |
| `nature` | 🌿 | Nature |
| `detente` | 🧘 | Detente |
| `fete` | 🎉 | Fete |
| `creatif` | 🎨 | Creatif |
| `jeux` | 🎮 | Jeux |
| `musique` | 🎵 | Musique |
| `cinema` | 🎬 | Cinema |
| `voyage` | ✈️ | Voyage |
| `tech` | 💻 | Tech |
| `social` | 🤝 | Social |
| `insolite` | ✨ | Insolite |

### Scoring
- **Score initial** (ajout manuel) : 10
- **Score initial** (auto-init) : 5
- **Boost** : +10 a chaque validation d'activite correspondante (cap 100)
- **Plage** : 0 a 100

### Initialisation automatique
A la premiere ouverture du Grimoire (aucune preference), les 6 tags par defaut sont crees avec un score de 5 : `sport`, `culture`, `gastronomie`, `nature`, `detente`, `fete`.

### Injection LLM
Les preferences sont formatees en texte lisible et injectees comme message `system` dans le prompt, entre le contexte utilisateur et l'historique de conversation :
```
Preferences thematiques de l'utilisateur (oriente tes suggestions sans overrider le contexte) :
⚽ sport: 80/100, 🌿 nature: 60/100, 🎮 jeux: 50/100
```

### Tags en reponse finalisee
Quand le LLM repond en `statut: "finalise"`, il inclut un champ `tags` dans `recommandation_finale` : liste de 1 a 3 slugs thematiques correspondant a l'activite recommandee. Ces tags sont utilises pour le boost automatique.

## 4. Logique du Moteur de Decision (LLM)

L'application ne possede pas de base de donnees d'activites. Elle delegue la logique au LLM.

### Gestion des interactions

| Action Utilisateur | Choix envoye | Comportement du LLM |
| :--- | :--- | :--- |
| **Option A ou B** | `"A"` / `"B"` | Avance dans la branche logique pour affiner le choix. |
| **Peu importe** | `"any"` | Neutralise le critere actuel et passe a une autre dimension de choix. |
| **Aucune des deux** | `"neither"` | **Pivot Dynamique** : Le LLM analyse l'historique et decide d'un pivot lateral ou radical. |
| **Autre suggestion** | `"reroll"` | Le LLM renvoie immediatement une nouvelle recommandation finale differente de toutes les precedentes. |
| **Affiner** | `"refine"` | Le LLM pose exactement 3 questions ciblees pour affiner la recommandation, puis renvoie un resultat ajuste. |

### Regle du "Breakout" (Sortie de secours)
* **Declencheur** : Apres **3 pivots consecutifs** (3 clics sur "Aucune des deux").
* **Action** : Le LLM abandonne le mode binaire et renvoie un **Top 3** d'activites variees basees sur le contexte global.

### Convergence
Le LLM doit converger vers une recommandation finale en **3 a 5 questions** maximum.

### Regles de fiabilite
Le LLM ne doit **jamais** :
- Inventer des noms d'etablissements locaux (sauf enseignes iconiques/chaines connues)
- Mentionner des evenements specifiques avec des dates
- Inventer des titres d'oeuvres ; il peut mentionner des titres connus
- En cas de doute, il doit preferer une description generique

## 5. Actions Riches & Grounding

Le LLM peut renvoyer un tableau d'**actions** dans la recommandation finale. Chaque action ouvre un lien vers le service adapte.

### Types d'actions

| Type | Service | URL generee |
| :--- | :--- | :--- |
| `maps` | Google Maps | `https://www.google.com/maps/search/{query}/@{lat},{lng},14z` |
| `steam` | Steam Store | `https://store.steampowered.com/search/?term={query}` |
| `app_store` | Apple App Store | `https://apps.apple.com/search?term={query}` |
| `play_store` | Google Play Store | `https://play.google.com/store/search?q={query}` |
| `youtube` | YouTube | `https://www.youtube.com/results?search_query={query}` |
| `streaming` | Google (streaming) | `https://www.google.com/search?q={query}+streaming` |
| `spotify` | Spotify | `https://open.spotify.com/search/{query}` |
| `web` | Google Search | `https://www.google.com/search?q={query}` |

### Migration legacy
Si le LLM renvoie un `google_maps_query` sans `actions`, le client cree automatiquement une action `maps` a partir de ce champ.

## 6. Architecture Technique & Securite

* **Frontend** : React Native (Expo SDK 54) + TypeScript + expo-router v6
* **Backend** : Supabase (Auth, PostgreSQL, Edge Functions Deno)
* **IA** : LLM via API OpenAI-compatible (configurable via env vars)
* **Cartographie** : Google Maps via deep link
* **Authentification** : Google OAuth (obligatoire). Apple Sign-In prevu (placeholder "Coming soon").
* **Securite** : Les cles API (LLM, Google) sont stockees en variables d'environnement sur Supabase. L'app mobile ne parle qu'a l'Edge Function.
* **Session** : expo-secure-store (natif) / localStorage (web)

### Systeme de Quotas (Anti-Derive)
Le controle est effectue **cote serveur** (Edge Function) avant chaque appel au LLM :
* **Utilisateur Gratuit** : Limite a **500 requetes** / mois.
* **Utilisateur Premium** : Limite a **5000 requetes** / mois.
* **Reset automatique** : mensuel (comparaison mois/annee de `last_reset_date`).
* **Gestion** : Si quota atteint, l'Edge Function renvoie une erreur **429** avec un message i18n. L'app affiche un message amical.

### Variables d'environnement

| Cote | Variable | Description |
| :--- | :--- | :--- |
| Expo | `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| Expo | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |
| Edge Function | `LLM_API_URL` | URL de l'API LLM (ex: `https://api.anthropic.com/v1`) |
| Edge Function | `LLM_MODEL` | Modele LLM (ex: `claude-sonnet-4-5-20250929`) |
| Edge Function | `LLM_API_KEY` | Cle API LLM |

## 7. Modele de Donnees (SQL Supabase)

```sql
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  requests_count int DEFAULT 0,
  last_reset_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
```

**Trigger** : `handle_new_user()` insere automatiquement une ligne dans `profiles` apres creation d'un utilisateur (recupere `full_name` depuis `raw_user_meta_data`).

### Table `user_preferences` (Grimoire)

```sql
CREATE TABLE public.user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tag_slug text NOT NULL,
  score integer DEFAULT 1 CHECK (score >= 0 AND score <= 100),
  updated_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (user_id, tag_slug)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
```

Le CRUD s'effectue cote client via la anon key + RLS (pas besoin de passer par l'Edge Function).

## 8. Contrat d'Interface (JSON Strict)

Le LLM doit repondre exclusivement dans ce format :

```json
{
  "statut": "en_cours | finalise",
  "phase": "questionnement | pivot | breakout | resultat",
  "mogogo_message": "Phrase sympathique du hibou magicien",
  "question": "Texte court (max 80 chars)",
  "options": {
    "A": "Label A",
    "B": "Label B"
  },
  "recommandation_finale": {
    "titre": "Nom de l'activite",
    "explication": "Pourquoi Mogogo a choisi cela",
    "actions": [
      {
        "type": "maps | steam | app_store | play_store | youtube | streaming | spotify | web",
        "label": "Texte du bouton",
        "query": "Requete optimisee pour le service cible"
      }
    ],
    "tags": ["nature", "sport"]
  },
  "metadata": {
    "pivot_count": 0,
    "current_branch": "Urbain/Culture"
  }
}
```

### Regles de validation
- `statut` : `"en_cours"` ou `"finalise"` (requis)
- `phase` : `"questionnement"`, `"pivot"`, `"breakout"` ou `"resultat"` (requis)
- `mogogo_message` : string (requis)
- Si `statut = "en_cours"` : `question` et `options` requis
- Si `statut = "finalise"` : `recommandation_finale` requis avec `titre`, `explication`, `actions[]` et `tags[]` (1-3 slugs parmi le catalogue)
- `metadata` : `pivot_count` (number) et `current_branch` (string) requis

## 9. Types TypeScript

### Types principaux (`src/types/index.ts`)

```typescript
type ActionType = "maps" | "web" | "steam" | "app_store" | "play_store" | "youtube" | "streaming" | "spotify";

interface Action {
  type: ActionType;
  label: string;
  query: string;
}

interface LLMResponse {
  statut: "en_cours" | "finalise";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  options?: { A: string; B: string };
  recommandation_finale?: {
    titre: string;
    explication: string;
    google_maps_query?: string;  // Legacy
    actions: Action[];
    tags?: string[];             // Slugs thematiques (Grimoire)
  };
  metadata: {
    pivot_count: number;
    current_branch: string;
  };
}

interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: { latitude: number; longitude: number };
  timing?: string;    // "now" ou "YYYY-MM-DD"
  language?: string;  // "fr" | "en" | "es"
}

type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine";

interface Profile {
  id: string;
  full_name: string | null;
  plan: "free" | "premium";
  requests_count: number;
  last_reset_date: string;
  updated_at: string;
}

interface UserPreference {
  id: string;
  user_id: string;
  tag_slug: string;
  score: number;        // 0–100
  updated_at: string;
}

interface TagDisplay {
  slug: string;
  emoji: string;
  labelKey: string;     // Cle i18n
}
```

## 10. Internationalisation (i18n)

### Langues supportees
- **Francais** (`fr`) - langue par defaut
- **Anglais** (`en`)
- **Espagnol** (`es`)

### Detection automatique
1. Preference sauvegardee dans AsyncStorage (cle `mogogo_language`)
2. Fallback : langue de l'appareil (expo-localization)
3. Fallback final : `"en"`

### Portee
- **UI** : tous les textes de l'interface (i18next + react-i18next)
- **LLM** : instruction systeme forcant la langue de reponse (injection dans l'Edge Function)
- **Contexte** : traduction des cles machine vers texte lisible pour le LLM (ex: `solo` → "Alone" en anglais)

### Cles machine contexte (`src/i18n/contextKeys.ts`)
Mapping entre cles machine envoyees au LLM et chemins i18n pour l'affichage :
- `SOCIAL_KEYS` : `["solo", "friends", "couple", "family"]`
- `BUDGET_KEYS` : `["free", "budget", "standard", "luxury"]`
- `ENVIRONMENT_KEYS` : `["indoor", "outdoor", "any_env"]`

## 11. Theme (Mode sombre)

### Preferences
- `"system"` : suit le theme de l'appareil
- `"light"` : theme clair force
- `"dark"` : theme sombre force

### Stockage
Preference sauvegardee dans AsyncStorage (cle `mogogo_theme`).

### Couleurs

| Token | Light | Dark |
| :--- | :--- | :--- |
| `primary` | `#6C3FC5` | `#9B7ADB` |
| `background` | `#FFFFFF` | `#121212` |
| `surface` | `#F5F0FF` | `#1E1A2E` |
| `text` | `#333333` | `#E8E8E8` |
| `textSecondary` | `#666666` | `#A0A0A0` |
| `border` | `#DDDDDD` | `#333333` |

### Context (`src/contexts/ThemeContext.tsx`)
Expose `colors`, `preference`, `setPreference()`, `isDark` via `useTheme()`.

## 12. UX / UI Mobile

### Navigation (Expo Router)

```
app/
├── _layout.tsx          → AuthGuard + ThemeProvider + Stack
├── index.tsx            → Accueil (mascotte + bouton "Commencer")
├── (auth)/
│   ├── _layout.tsx      → Stack sans header
│   └── login.tsx        → Google OAuth + Apple (placeholder)
└── (main)/
    ├── _layout.tsx      → FunnelProvider + useGrimoire + Stack avec header (📖 + ⚙️)
    ├── context.tsx      → Saisie contexte (chips + date picker + GPS + bouton Grimoire)
    ├── funnel.tsx       → Entonnoir A/B (coeur de l'app)
    ├── result.tsx       → Resultat final (2 phases : validation → deep links)
    ├── grimoire.tsx     → Ecran Grimoire (gestion des tags thematiques)
    └── settings.tsx     → Langue + Theme + Deconnexion
```

### AuthGuard (`app/_layout.tsx`)
- Pas de session + dans `(main)` → redirection vers `/(auth)/login`
- Session active + dans `(auth)` → redirection vers `/(main)/context`
- Spinner pendant le chargement de la session

### Ecran Contexte
- **Chips** de selection pour social, budget, environment
- **Slider** ou chips pour energie (1-5)
- **Date picker** natif (inline iOS, calendar Android) pour le timing
- **Geolocalisation** automatique avec indicateur visuel

### Ecran Funnel
- Appel LLM initial au montage (sans choix)
- Animation **fade** (300ms) entre les questions
- Boutons A / B + "Peu importe" + "Aucune des deux"
- Footer : "Revenir" (si historique non vide) + "Recommencer"
- Detection quota (429) avec message dedie

### Ecran Resultat (2 phases)

**Phase 1 — Avant validation** :
- Mascotte avec `mogogo_message`
- Card : titre + explication
- CTA principal : **"C'est parti !"** (gros bouton primary)
- Ghost buttons discrets : "Affiner" (si pas deja fait) + "Autre suggestion"
- Pas d'actions de deep linking visibles

**Phase 2 — Apres tap "C'est parti !"** :
- Confettis lances (`react-native-confetti-cannon`)
- `boostTags(recommendation.tags)` appele en background (Grimoire)
- Mogogo dit : "Excellent choix ! Je le note dans mon grimoire pour la prochaine fois !"
- Actions de deep linking revelees (maps, steam, etc.)
- Bouton "Recommencer" en bas

### Ecran Grimoire
- Mascotte avec message de bienvenue
- **Tags actifs** : chips avec emoji + label + score, supprimables (tap → suppression)
- **Tags disponibles** : grille des tags non encore ajoutes, cliquables pour ajouter
- Accessible via : bouton 📖 dans le header (toutes les pages) ou bouton "Mon Grimoire" sur l'ecran contexte

### Ecran Settings
- Selection langue (fr/en/es) avec drapeaux
- Selection theme (system/light/dark)
- Bouton deconnexion

### Composants

| Composant | Role |
| :--- | :--- |
| `ChoiceButton` | Bouton A/B avec variantes `primary` (fond violet) / `secondary` (bordure) |
| `MogogoMascot` | Image mascotte (80x80) + bulle de message |
| `LoadingMogogo` | Animation rotative (4 WebP) + spinner + message |

### Mascotte : assets

| Fichier | Usage |
| :--- | :--- |
| `mogogo-waiting.png` | Accueil, bulle mascotte (statique) |
| `mogogo-writing.webp` | Loading (animation) |
| `mogogo-dancing.webp` | Loading (animation) |
| `mogogo-running.webp` | Loading (animation) |
| `mogogo-joy.webp` | Loading (animation) |

Les animations de chargement tournent cycliquement (index global incremente a chaque instanciation).

## 13. State Management : FunnelContext

### State (`src/contexts/FunnelContext.tsx`)

```typescript
interface FunnelState {
  context: UserContext | null;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse | null;
  loading: boolean;
  error: string | null;
  pivotCount: number;
  lastChoice?: FunnelChoice;
}
```

### Actions du reducer
- `SET_CONTEXT` : definit le contexte utilisateur
- `SET_LOADING` : active/desactive le chargement
- `SET_ERROR` : definit une erreur
- `PUSH_RESPONSE` : empile la reponse courante dans l'historique, remplace par la nouvelle
- `POP_RESPONSE` : depile la derniere reponse (backtracking local, sans appel LLM)
- `RESET` : reinitialise tout l'etat

### API exposee via `useFunnel()`

| Fonction | Description |
| :--- | :--- |
| `state` | Etat complet du funnel |
| `setContext(ctx)` | Definit le contexte et demarre le funnel |
| `makeChoice(choice)` | Envoie un choix au LLM (inclut les preferences Grimoire) |
| `reroll()` | Appelle `makeChoice("reroll")` |
| `refine()` | Appelle `makeChoice("refine")` |
| `goBack()` | Backtracking local (POP_RESPONSE) |
| `reset()` | Reinitialise le funnel |

### Logique pivot_count
- Incremente sur phase `"pivot"`
- Reinitialise a 0 sur phase `"questionnement"`
- Conserve la valeur sur les autres phases

### Prop `preferencesText`
Le `FunnelProvider` accepte une prop optionnelle `preferencesText?: string` injectee par le layout principal via `useGrimoire()` + `formatPreferencesForLLM()`. Cette chaine est passee a `callLLMGateway` a chaque appel.

## 14. Service LLM (`src/services/llm.ts`)

### Configuration
- Timeout : **30 000 ms**
- Max retries : **1**
- Retry delay : **1 000 ms**
- Erreurs retryables : 502, timeout, network

### Appel
```typescript
async function callLLMGateway(params: {
  context: UserContext;
  history?: FunnelHistoryEntry[];
  choice?: FunnelChoice;
  preferences?: string;     // Texte Grimoire formate
}): Promise<LLMResponse>
```

Appelle `supabase.functions.invoke("llm-gateway", ...)`.

### Validation (`validateLLMResponse`)
- Verification stricte de la structure JSON
- Migration automatique `google_maps_query` → `actions[]` si absent
- Normalisation `tags` : array de strings, fallback `[]`
- Erreur 429 → message quota traduit via i18n

## 15. Edge Function (`supabase/functions/llm-gateway/index.ts`)

### Pipeline de traitement
1. **Authentification** : verification du token Bearer via `supabase.auth.getUser()`
2. **Quotas** : lecture profile, reset mensuel si necessaire, verification limite
3. **Incrementation** : `requests_count++` avant l'appel LLM
4. **Construction du prompt** :
   - System prompt (regles + schema JSON + instruction tags)
   - Instruction de langue (si non-francais)
   - Contexte utilisateur traduit via `describeContext()`
   - Enrichissement temporel (si date precise)
   - **Preferences Grimoire** (message system, si presentes)
   - Historique (alternance assistant/user)
   - Choix courant
5. **Appel LLM** : `POST {LLM_API_URL}/chat/completions`
6. **Retour** : JSON parse + reponse au client

### Configuration LLM
- `temperature` : 0.7
- `max_tokens` : 800
- `response_format` : `{ type: "json_object" }`

### Traduction contexte pour le LLM
L'Edge Function contient des tables de traduction `CONTEXT_DESCRIPTIONS` pour convertir les cles machine (ex: `solo`) en texte lisible pour le LLM selon la langue (ex: "Seul" en FR, "Alone" en EN, "Solo/a" en ES).

## 16. CLI de Test (`scripts/cli-session.ts`)

Outil en ligne de commande pour jouer des sessions completes sans app mobile ni Supabase.

### Modes d'execution

| Mode | Flag | Description |
| :--- | :--- | :--- |
| Interactif | *(defaut)* | Prompt readline, saisie A/B/neither/any/reroll |
| Batch | `--batch` | Choix predetermines via `--choices "A,B,A"` |
| Auto | `--auto` | Un second LLM joue le role de l'utilisateur |

### Mode auto
- `--persona "..."` : decrit l'intention simulee de l'utilisateur fictif
- Un appel LLM separe (temperature 0.3) determine le choix a chaque etape
- Parsing multi-niveaux de la reponse (patterns explicites, lettres isolees, fallback "A")

### Options principales
```
--context '{...}'           Contexte JSON complet
--social, --energy, --budget, --env   Contexte par champs
--timing "now"|"YYYY-MM-DD" Timing
--lang fr|en|es            Langue LLM (defaut: fr)
--choices "A,B,..."        Choix predetermines (batch)
--json                     Sortie JSON sur stdout (logs sur stderr)
--transcript <path>        Sauvegarde session JSON
--prompt-file <path>       System prompt alternatif
--max-steps N              Limite steps (defaut 20)
```

### Configuration
Variables via `.env.cli` ou environnement :
- `LLM_API_URL` (defaut : `http://localhost:11434/v1`)
- `LLM_MODEL` (defaut : `gpt-oss:120b-cloud`)
- `LLM_API_KEY` (optionnel)
- `LLM_TEMPERATURE` (defaut : 0.8)

### Compatibilite
Support des modeles classiques (`content`) et des modeles a raisonnement (`reasoning`).
