/**
 * Pool Logic — Fonctions pures pour le pool de sous-catégories (Phase 3).
 *
 * Le LLM retourne un pool complet de sous-catégories en un appel.
 * Le client présente par paires et "neither" avance localement (0 appel LLM).
 */

import type { LLMResponse } from "../../src/types/index.ts";

export interface PoolSnapshot {
  pool: string[];
  poolIndex: number;
  response: LLMResponse;
}

export interface DrillDownNodeWithPool {
  question: string;
  optionA: string;
  optionB: string;
  choice: "A" | "B" | "neither";
  poolSnapshot?: PoolSnapshot;
}

/**
 * Retourne la paire [A, B] à l'index donné.
 * - Paire normale : [pool[idx], pool[idx+1]]
 * - Solo (impair restant) : [pool[idx], null]
 * - Épuisé : [null, null]
 */
export function getPairFromPool(pool: string[], poolIndex: number): [string | null, string | null] {
  if (poolIndex >= pool.length) return [null, null];
  const a = pool[poolIndex];
  const b = poolIndex + 1 < pool.length ? pool[poolIndex + 1] : null;
  return [a, b];
}

/**
 * Vérifie si le pool est épuisé à l'index donné.
 */
export function isPoolExhausted(pool: string[], poolIndex: number): boolean {
  return poolIndex >= pool.length;
}

/**
 * Retire les poolSnapshot des nodes avant envoi au serveur.
 */
export function stripPoolSnapshots(nodes: DrillDownNodeWithPool[]): Array<Omit<DrillDownNodeWithPool, "poolSnapshot">> {
  return nodes.map(({ poolSnapshot, ...rest }) => rest);
}

/**
 * Construit un DrillDownNode avec poolSnapshot.
 */
export function buildNodeWithSnapshot(
  optA: string,
  optB: string,
  choice: "A" | "B",
  pool: string[],
  poolIndex: number,
  response: LLMResponse,
  question: string,
): DrillDownNodeWithPool {
  return {
    question,
    optionA: optA,
    optionB: optB,
    choice,
    poolSnapshot: { pool, poolIndex, response },
  };
}

/**
 * Restaure le pool/index/response depuis un node avec snapshot.
 */
export function restoreFromSnapshot(node: DrillDownNodeWithPool): PoolSnapshot | null {
  return node.poolSnapshot ?? null;
}
