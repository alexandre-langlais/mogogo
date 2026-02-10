# Benchmark LLM Mogogo — OpenRouter (2026-02-10)

Benchmark de 39 modèles LLM via OpenRouter pour évaluer la compatibilité avec le format JSON strict de Mogogo.

**Méthodologie** : 6 scénarios par modèle (1er appel, step intermédiaire, pivot/neither, finalisation, reroll, refine), timeout 60s, 1 round par scénario, langue FR.

---

## Modèles payants (9 modèles)

| # | Modèle | Score | Latence moy. | Notes |
|---|--------|-------|-------------|-------|
| 1 | **google/gemini-2.5-flash-lite** | **100%** | **1.1s** | Ultra-rapide, 0 erreur, 1 réparation mineure |
| 2 | **meta-llama/llama-3.3-70b-instruct** | **100%** | **3.7s** | Rapide, réponses concises |
| 3 | **deepseek/deepseek-chat-v3.1** | **100%** | **4.8s** | Excellent, messages bien formés |
| 4 | **deepseek/deepseek-v3.2** | **100%** | **14.0s** | Bon mais plus lent |
| 5 | **deepseek/deepseek-chat-v3-0324** | **100%** | **14.6s** | Bon mais plus lent |
| 6 | minimax/minimax-m2.1 | 83% | 8.5s | Échoue sur Step (structure) |
| 7 | openai/gpt-4o-mini | 50% | 3.0s | Rapide mais structure JSON instable |
| 8 | meta-llama/llama-4-maverick | 50% | 2.7s | Rapide mais recommandation_finale.titre manquant |
| 9 | x-ai/grok-4.1-fast | 33% | 18.6s | Lent + recommandation_finale.titre manquant sur en_cours |

### Détails des modèles payants à 100%

| Modèle | 1er appel | Step | Pivot | Final | Reroll | Refine |
|--------|-----------|------|-------|-------|--------|--------|
| gemini-2.5-flash-lite | 1.1s | 1.2s | 1.0s | 1.3s | 1.4s | 0.8s |
| llama-3.3-70b-instruct | 1.1s | 4.4s | 2.3s | 2.8s | 10.2s | 1.3s |
| deepseek-chat-v3.1 | 4.9s | 2.4s | 4.8s | 6.9s | 4.2s | 5.8s |
| deepseek-v3.2 | 6.7s | 19.6s | 4.7s | 30.3s | 18.7s | 4.1s |
| deepseek-chat-v3-0324 | 13.5s | 11.4s | 11.5s | 19.0s | 20.0s | 12.1s |

---

## Modèles gratuits (30 modèles)

| # | Modèle | Score | Latence moy. | Notes |
|---|--------|-------|-------------|-------|
| 1 | **meta-llama/llama-3.3-70b-instruct:free** | **100%** | **2.7s** | Ultra-rapide, réponses concises |
| 2 | **openrouter/pony-alpha** | **100%** | **13.4s** | Fiable mais plus lent |
| 3 | **tngtech/deepseek-r1t-chimera:free** | **100%** | **14.4s** | Bon, rapide |
| 4 | arcee-ai/trinity-mini:free | 83% | 3.8s | Rapide, 1 erreur sur 1er appel |
| 5 | tngtech/tng-r1t-chimera:free | 67% | 33.9s | Lent + rate-limited |
| 6 | openai/gpt-oss-20b:free | 50% | 11.9s | Structure parfois incomplète |
| 7 | liquid/lfm-2.5-1.2b-instruct:free | 50% | 0.8s | Ultra-rapide mais qualité faible |
| 8 | openai/gpt-oss-120b:free | 33% | 29.2s | Lent + structure incomplète |
| 9 | nvidia/nemotron-nano-12b-v2-vl:free | 33% | 26.9s | Timeouts fréquents |
| 10 | nvidia/nemotron-nano-9b-v2:free | 33% | 19.1s | Structure instable |
| 11 | z-ai/glm-4.5-air:free | 17% | 24.5s | Écrit "finalise" au lieu de "finalisé" |
| 12 | deepseek/deepseek-r1-0528:free | 17% | 49.7s | Reasoning model, timeouts, JSON dans `<think>` |
| 13 | tngtech/deepseek-r1t2-chimera:free | 17% | 10.3s | Reasoning model, content vide |
| 14 | nvidia/nemotron-3-nano-30b-a3b:free | 17% | 2.7s | Reasoning model, content vide |
| 15 | openrouter/aurora-alpha | 17% | 5.1s | Réponses vides (Empty LLM response) |

### Modèles à 0% (non viables)

| Modèle | Raison |
|--------|--------|
| arcee-ai/trinity-large-preview:free | Timeout systématique (60s) |
| stepfun/step-3.5-flash:free | `response_format: json_object` non supporté |
| qwen/qwen3-coder:free | Rate-limited (429) |
| qwen/qwen3-next-80b-a3b-instruct:free | Rate-limited (429) |
| nousresearch/hermes-3-llama-3.1-405b:free | Rate-limited (429) |
| mistralai/mistral-small-3.1-24b-instruct:free | Rate-limited (429) |
| cognitivecomputations/dolphin-mistral-24b-venice-edition:free | Rate-limited (429) |
| meta-llama/llama-3.2-3b-instruct:free | Rate-limited (429) |
| qwen/qwen3-4b:free | Rate-limited (429) |
| google/gemma-3-27b-it:free | Rate-limited (429) |
| google/gemma-3-12b-it:free | Rate-limited (429) |
| google/gemma-3n-e2b-it:free | Rate-limited (429) |
| google/gemma-3-4b-it:free | `Developer instruction not enabled` (400) |
| google/gemma-3n-e4b-it:free | `Developer instruction not enabled` (400) |
| liquid/lfm-2.5-1.2b-thinking:free | JSON invalide, thinking model |

---

## Classement global (tous modèles confondus, score 100%)

| # | Modèle | Gratuit | Latence moy. | Prix/1M tokens (in/out) |
|---|--------|---------|-------------|------------------------|
| 1 | **google/gemini-2.5-flash-lite** | Non | **1.1s** | $0.01 / $0.04 |
| 2 | **meta-llama/llama-3.3-70b-instruct:free** | Oui | **2.7s** | Gratuit |
| 3 | **meta-llama/llama-3.3-70b-instruct** | Non | **3.7s** | $0.039 / $0.049 |
| 4 | **deepseek/deepseek-chat-v3.1** | Non | **4.8s** | $0.30 / $0.88 |
| 5 | **openrouter/pony-alpha** | Oui | **13.4s** | Gratuit |
| 6 | **deepseek/deepseek-v3.2** | Non | **14.0s** | $0.30 / $0.88 |
| 7 | **tngtech/deepseek-r1t-chimera:free** | Oui | **14.4s** | Gratuit |
| 8 | **deepseek/deepseek-chat-v3-0324** | Non | **14.6s** | $0.07 / $0.28 |

---

## Recommandations

### Pour la production (fiabilité + vitesse)
- **gemini-2.5-flash-lite** : Le meilleur rapport qualité/prix/vitesse. 1.1s de latence moyenne, 100% de succès, et quasi-gratuit ($0.01/1M tokens input).
- **llama-3.3-70b-instruct** : Excellent second choix, disponible en version gratuite et payante.

### Pour le développement / tests (gratuit)
- **meta-llama/llama-3.3-70b-instruct:free** : 100% fiable et rapide (2.7s). Meilleur modèle gratuit de loin.
- **openrouter/pony-alpha** : Alternative fiable si llama est rate-limited.

### À éviter
- Les modèles "reasoning" (deepseek-r1, nemotron-nano) : le contenu est dans le champ `reasoning`, pas `content`.
- Les petits modèles (< 12B) : structure JSON trop instable pour Mogogo.
- grok-4.1-fast : cher et mauvais score (33%).
- gpt-4o-mini : score décevant (50%) pour le prix.

---

## Notes sur les limites du benchmark

- **Rate-limiting OpenRouter** : Les modèles gratuits sont limités à ~20 req/min et 50 req/jour (sans crédits). Environ 15 modèles n'ont pas pu être testés correctement à cause de rate-limiting (429).
- **Modèles Google Gemma (petits)** : `gemma-3-4b-it` et `gemma-3n-e4b-it` ne supportent pas les "developer instructions" (system prompt).
- **stepfun/step-3.5-flash** : ne supporte pas `response_format: json_object`.
- Les latences peuvent varier selon la charge des providers.
