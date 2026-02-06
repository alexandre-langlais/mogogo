# Mogogo

Assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par un LLM. La mascotte est Mogogo, un hibou magicien.

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React Native (Expo SDK 54) + TypeScript + expo-router v6 |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions Deno) |
| IA | LLM via API OpenAI-compatible (configurable : Ollama, Claude, etc.) |
| Cartographie | Google Maps (ouverture via deep link pour le MVP) |
| Auth | Google OAuth / Apple Sign-In (+ mode dev sans auth) |
| Stockage session | expo-secure-store (natif) / localStorage (web) |

## Prerequis

- Node.js >= 18
- npm ou yarn
- Expo CLI (`npx expo`)
- Un projet Supabase avec :
  - Google OAuth configure dans Authentication > Providers
  - La migration SQL appliquee (voir `supabase/migrations/`)
  - L'Edge Function `llm-gateway` deployee
- (Optionnel) Expo Go sur mobile pour le dev

## Installation

```bash
# Cloner le repo
git clone <repo-url> && cd mogogo

# Installer les dependances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
```

### Variables d'environnement

Creer un fichier `.env.local` a la racine :

```env
EXPO_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...votre-anon-key
```

Cote Supabase (secrets de l'Edge Function) :

```env
LLM_API_URL=http://localhost:11434/v1    # ou https://api.anthropic.com/v1
LLM_MODEL=gpt-oss:120b-cloud            # ou le modele de votre choix
LLM_API_KEY=sk-...                       # cle API du LLM
```

## Commandes de developpement

```bash
# Lancer l'app en mode dev (Expo Go / navigateur)
npx expo start

# Lancer directement sur une plateforme
npm run android
npm run ios
npm run web

# Verifier les types TypeScript
npx tsc --noEmit

# Deployer l'Edge Function Supabase
supabase functions deploy llm-gateway
```

## Structure du projet

```
app/                          # Expo Router — pages et navigation
├── _layout.tsx               # Root layout + AuthGuard (redirection auto)
├── index.tsx                 # Ecran d'accueil
├── (auth)/
│   ├── _layout.tsx           # Layout auth (sans header)
│   └── login.tsx             # Login Google/Apple + mode dev
└── (main)/
    ├── _layout.tsx           # Layout principal + FunnelProvider
    ├── context.tsx           # Saisie du contexte utilisateur
    ├── funnel.tsx            # Entonnoir A/B (coeur de l'app)
    └── result.tsx            # Resultat final + lien Maps

src/
├── components/
│   ├── ChoiceButton.tsx      # Bouton A/B (variantes primary/secondary)
│   ├── MogogoMascot.tsx      # Bulle mascotte avec emoji hibou
│   └── LoadingMogogo.tsx     # Spinner avec message Mogogo
├── contexts/
│   └── FunnelContext.tsx     # State management central (useReducer)
├── hooks/
│   ├── useAuth.ts            # Auth Supabase + session reactive
│   └── useLocation.ts       # Geolocalisation (expo-location)
├── services/
│   ├── supabase.ts           # Client Supabase + SecureStore adapter
│   ├── llm.ts                # Appel Edge Function + validation + retry
│   └── places.ts             # Ouverture Google Maps via deep link
├── types/
│   └── index.ts              # LLMResponse, UserContext, Profile, FunnelChoice
└── constants/
    └── index.ts              # COLORS, SEARCH_RADIUS, PLACES_MIN_RATING

supabase/
├── migrations/
│   └── 001_create_profiles.sql   # Table profiles + RLS + trigger auto
└── functions/
    └── llm-gateway/
        └── index.ts              # Edge Function : auth + quotas + appel LLM
```

## Architecture

### Flux principal

```
Accueil → Login → Contexte → Funnel A/B → Resultat → Google Maps
```

1. **Accueil** (`index.tsx`) — Splash avec mascotte, bouton "Commencer"
2. **Login** (`login.tsx`) — Google OAuth via Supabase. En `__DEV__`, un bouton "Mode dev" permet de bypasser l'auth
3. **Contexte** (`context.tsx`) — L'utilisateur selectionne : social, energie, budget, environnement. La geolocalisation est demandee automatiquement
4. **Funnel** (`funnel.tsx`) — Le LLM propose des choix binaires A/B. L'utilisateur peut aussi choisir "Peu importe" ou "Aucune des deux" (pivot). Apres 3 pivots : breakout (Top 3)
5. **Resultat** (`result.tsx`) — Affiche la recommandation finale avec un bouton "Voir sur Maps"

### Navigation gardee

Le composant `AuthGuard` dans `app/_layout.tsx` gere la redirection automatique :
- Pas de session + acces a `/(main)/*` → redirige vers `/(auth)/login`
- Session active + acces a `/(auth)/*` → redirige vers `/(main)/context`

### State management — FunnelContext

Le coeur de l'app est le `FunnelContext` (`src/contexts/FunnelContext.tsx`), un `useReducer` qui gere :

| Champ | Type | Description |
|-------|------|-------------|
| `context` | `UserContext` | Contexte utilisateur (social, energie, budget, etc.) |
| `history` | `FunnelHistoryEntry[]` | Pile des reponses precedentes (pour backtracking) |
| `currentResponse` | `LLMResponse` | Reponse LLM en cours d'affichage |
| `loading` | `boolean` | Appel LLM en cours |
| `error` | `string` | Message d'erreur |
| `pivotCount` | `number` | Nombre de pivots consecutifs |

Actions disponibles via le hook `useFunnel()` :

- **`setContext(ctx)`** — Definit le contexte utilisateur
- **`makeChoice(choice?)`** — Appelle le LLM avec le choix (`"A"`, `"B"`, `"neither"`, `"any"`, ou `undefined` pour le premier appel)
- **`goBack()`** — Depile l'historique pour revenir a la question precedente (sans rappeler le LLM)
- **`reset()`** — Reinitialise tout l'etat

### Communication avec le LLM

```
App mobile → supabase.functions.invoke("llm-gateway") → Edge Function → API LLM
```

Le client n'a jamais acces aux cles API. L'Edge Function `llm-gateway` :
1. Verifie le JWT Supabase
2. Lit le profil utilisateur et verifie le quota mensuel
3. Reset automatique du compteur en debut de mois
4. Construit les messages (system prompt + contexte + historique + choix)
5. Appelle l'API LLM (format OpenAI-compatible)
6. Retourne la reponse JSON

### Contrat JSON du LLM

```json
{
  "statut": "en_cours | finalise",
  "phase": "questionnement | pivot | breakout | resultat",
  "mogogo_message": "Phrase sympathique du hibou",
  "question": "Question courte (max 80 chars)",
  "options": { "A": "Label A", "B": "Label B" },
  "recommandation_finale": {
    "titre": "Nom de l'activite",
    "explication": "Pourquoi Mogogo a choisi cela",
    "google_maps_query": "Requete optimisee pour Maps"
  },
  "metadata": { "pivot_count": 0, "current_branch": "Urbain/Culture" }
}
```

### Robustesse du client LLM

Le service `src/services/llm.ts` inclut :

- **Validation stricte** : `validateLLMResponse()` verifie la structure JSON (statut, phase, mogogo_message, question/recommandation_finale selon le statut)
- **Timeout** : 30 secondes par requete via `AbortController`
- **Retry automatique** : 1 retry apres 1s pour les erreurs reseau (502, timeout)
- **Gestion quota** : erreur 429 detectee et affichee avec un message Mogogo specifique

### Quotas

| Plan | Limite mensuelle |
|------|-----------------|
| Gratuit | 500 requetes/mois |
| Premium | 5000 requetes/mois |

Le controle est effectue cote serveur dans l'Edge Function. Reset automatique le 1er du mois.

## Tester le flux complet

### Mode dev (sans Supabase)

1. Lancer `npx expo start`
2. Sur l'ecran de login, cliquer **"Mode dev (sans auth)"**
3. Cela redirige directement vers l'ecran de contexte

> Note : sans Supabase configure, l'appel LLM echouera. Le message d'erreur s'affichera avec un bouton "Reessayer".

### Avec Supabase

1. Configurer les variables d'environnement (`.env.local` + secrets Supabase)
2. Appliquer la migration : `supabase db push`
3. Deployer l'Edge Function : `supabase functions deploy llm-gateway`
4. Lancer `npx expo start`
5. Se connecter via Google OAuth
6. Parcourir le flux : Contexte → Funnel → Resultat → Maps

### Points de verification

- **Auth gardee** : acceder a `/(main)/context` sans session → doit rediriger vers login
- **Backtracking** : dans le funnel, faire des choix puis cliquer "Revenir" → l'etat precedent est restaure sans rappel LLM
- **Pivot/Breakout** : cliquer 3x "Aucune des deux" → le LLM passe en breakout
- **Erreurs reseau** : couper le reseau → message d'erreur + bouton "Reessayer"
- **Quota depasse** : message Mogogo specifique sans bouton "Reessayer"

## Notes techniques

- `tsconfig.json` exclut `supabase/functions/**` (runtime Deno, pas Node)
- Alias path `@/*` → `src/*` configure dans tsconfig
- Le scheme URL `mogogo://` est configure dans `app.json` pour le deep link OAuth
- expo-secure-store est utilise sur natif, localStorage sur web (fallback dans `supabase.ts`)
- L'Edge Function utilise `response_format: { type: "json_object" }` pour forcer le JSON du LLM
