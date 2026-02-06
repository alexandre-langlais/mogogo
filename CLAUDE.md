# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Mogogo est un assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par un LLM (Claude API). La mascotte est Mogogo, un hibou magicien.

## Stack technique

- **Frontend** : React Native (Expo SDK 54) + TypeScript + expo-router v6
- **Backend** : Supabase (Auth, PostgreSQL, Edge Functions Deno)
- **IA** : LLM via API OpenAI-compatible (configurable via env vars)
- **Cartographie** : Google Maps via deep link (MVP)
- **Auth** : Google OAuth / Apple Sign-In (obligatoire) + mode dev bypass en `__DEV__`
- **Session** : expo-secure-store (natif) / localStorage (web)

## Architecture

L'app mobile communique uniquement avec les Supabase Edge Functions. Les cles API (Anthropic, Google) sont stockees en variables d'environnement cote Supabase et ne sont jamais exposees au client.

### Flux principal
1. L'utilisateur arrive sur l'accueil → login (ou mode dev)
2. Il renseigne son contexte (social, energie, budget, environnement, localisation GPS)
3. Le LLM propose des choix binaires (A/B) pour affiner la recommandation
4. Apres convergence, le resultat est affiche avec un lien Google Maps
5. Backtracking possible a tout moment (pile d'etats locale, sans rappel LLM)

### Mecanismes cles
- **Pivot dynamique** : sur "Aucune des deux", le LLM pivote lateralement ou radicalement
- **Breakout** : apres 3 pivots consecutifs, le LLM renvoie un Top 3 d'activites variees
- **Quotas** : 500 req/mois (gratuit), 5000 req/mois (premium), verifies cote serveur
- **Navigation gardee** : `AuthGuard` dans `_layout.tsx` redirige automatiquement selon l'etat de session

## Commandes de developpement

```bash
# Lancer l'app en mode dev
npx expo start

# Lancer sur Android/iOS/Web
npm run android
npm run ios
npm run web

# Verifier les types TypeScript
npx tsc --noEmit

# Deployer l'Edge Function
supabase functions deploy llm-gateway
```

## Structure du projet

```
app/                          # Expo Router (pages)
├── _layout.tsx               # Root layout + AuthGuard
├── index.tsx                 # Accueil
├── (auth)/
│   ├── _layout.tsx           # Layout auth (sans header)
│   └── login.tsx             # Google OAuth + mode dev bypass
└── (main)/
    ├── _layout.tsx           # Layout principal + FunnelProvider
    ├── context.tsx           # Saisie contexte + geolocalisation
    ├── funnel.tsx            # Entonnoir A/B (coeur de l'app)
    └── result.tsx            # Resultat final + lien Maps

src/
├── components/
│   ├── ChoiceButton.tsx      # Bouton A/B (variantes primary/secondary)
│   ├── MogogoMascot.tsx      # Bulle mascotte avec emoji hibou
│   └── LoadingMogogo.tsx     # Spinner avec message Mogogo
├── contexts/
│   └── FunnelContext.tsx     # State management central (useReducer) ⭐
├── hooks/
│   ├── useAuth.ts            # Auth Supabase (session, signIn, signOut)
│   └── useLocation.ts       # Geolocalisation (expo-location)
├── services/
│   ├── supabase.ts           # Client Supabase + SecureStore adapter
│   ├── llm.ts                # callLLMGateway + validation + retry
│   └── places.ts             # openGoogleMapsSearch (deep link)
├── types/
│   └── index.ts              # LLMResponse, UserContext, Profile, FunnelChoice
└── constants/
    └── index.ts              # COLORS, SEARCH_RADIUS, PLACES_MIN_RATING

supabase/
├── migrations/
│   └── 001_create_profiles.sql
└── functions/
    └── llm-gateway/
        └── index.ts          # Edge Function (Deno) : auth + quotas + LLM
```

## Fichiers cles et patterns

### FunnelContext (`src/contexts/FunnelContext.tsx`)
Piece maitresse de l'app. `useReducer` avec :
- **State** : `context`, `history` (pile), `currentResponse`, `loading`, `error`, `pivotCount`, `lastChoice`
- **Actions** : `SET_CONTEXT`, `SET_LOADING`, `SET_ERROR`, `PUSH_RESPONSE`, `POP_RESPONSE`, `RESET`
- **Hook** : `useFunnel()` expose `state`, `setContext()`, `makeChoice()`, `goBack()`, `reset()`
- Le `FunnelProvider` est monte dans `app/(main)/_layout.tsx`

### Service LLM (`src/services/llm.ts`)
- `callLLMGateway(params)` : appelle l'Edge Function via `supabase.functions.invoke`
- `validateLLMResponse(data)` : validation stricte de la structure JSON
- Timeout 30s (`LLM_TIMEOUT_MS`), retry 1x apres 1s (`MAX_RETRIES`, `RETRY_DELAY_MS`)
- Erreurs retryables : 502, timeout, network

### Auth (`src/hooks/useAuth.ts`)
- `useAuth()` expose : `user`, `session`, `loading`, `signInWithGoogle()`, `signOut()`, `devSignIn()`
- `devSignIn()` tente un `signInWithPassword` puis fallback vers navigation directe
- Session persistee via `ExpoSecureStoreAdapter` dans `supabase.ts`

### Types (`src/types/index.ts`)
- `LLMResponse` : contrat JSON strict (statut, phase, mogogo_message, question, options, recommandation_finale, metadata)
- `UserContext` : social, energy, budget, environment, location?
- `FunnelChoice` : `"A" | "B" | "neither" | "any"`
- `Profile` : id, full_name, plan, requests_count, last_reset_date

### Composants UI
- `ChoiceButton` : variantes `primary` (fond violet) / `secondary` (bordure)
- `MogogoMascot` : emoji hibou + bulle de message
- `LoadingMogogo` : hibou + spinner + message
- Toutes les couleurs via `COLORS` de `@/constants`

## Specifications

Le fichier `specs.md` a la racine contient les specifications fonctionnelles et techniques completes, incluant le contrat JSON strict du LLM et le schema SQL.

## Notes techniques

- `tsconfig.json` exclut `supabase/functions/**` (runtime Deno, pas Node)
- Variables env Expo : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Alias path `@/*` → `src/*` dans tsconfig
- Scheme URL `mogogo://` configure dans `app.json` pour le deep link OAuth
- L'Edge Function utilise `response_format: { type: "json_object" }` pour forcer le JSON
- Edge Function env vars : `LLM_API_URL`, `LLM_MODEL`, `LLM_API_KEY`

## Langue

Toujours repondre en francais. Les termes techniques et identifiants de code restent en anglais.
