// Authoring cache for the generated normalization step (spec 086 FR-016).
//
// The step is derived from the source alone, so it is computed once per
// (source content + generator version) and reused until either changes. Lookup
// order: in-memory map, then the working-copy snapshot field, then the
// generator. A stored entry is used only when its `cacheKey` equals the
// current source's key, so a stale snapshot is ignored and replaced.
//
// The caller persists the returned `stored` entry (when non-null) through
// `useWorkingCopyStore.setContextNormalizationStep`.

import type { KeyboardIR, NormalizationStepResult, StoredNormalizationStep } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";
import { normalizationStepCacheKey, proposeNormalizationStep } from "@keyboard-studio/engine/context-tolerance";

const memory = new Map<string, NormalizationStepResult>();

export interface NormalizationStepLookup {
  result: NormalizationStepResult;
  cacheKey: string;
  /** The entry to persist in the snapshot (`contextNormalizationStep`); null when it must not be cached. */
  stored: StoredNormalizationStep | null;
  source: "memory" | "snapshot" | "generated";
}

export async function getOrProposeNormalizationStep(
  ir: KeyboardIR,
  snapshot: StoredNormalizationStep | null | undefined,
): Promise<NormalizationStepLookup> {
  const cacheKey = await normalizationStepCacheKey(ir);

  const inMemory = memory.get(cacheKey);
  if (inMemory !== undefined) {
    devLog.info("[OK] normalization step cache hit (memory)");
    return { result: inMemory, cacheKey, stored: { cacheKey, result: inMemory }, source: "memory" };
  }
  if (snapshot != null && snapshot.cacheKey === cacheKey) {
    memory.set(cacheKey, snapshot.result);
    devLog.info("[OK] normalization step cache hit (snapshot)");
    return { result: snapshot.result, cacheKey, stored: snapshot, source: "snapshot" };
  }

  const result = await proposeNormalizationStep(ir);
  // A time-bound refusal is a property of this run's budget, not of the source,
  // so it is cached neither in memory nor in the snapshot: a later request may succeed.
  if (result.kind === "refused" && result.reason === "time-bound") {
    return { result, cacheKey, stored: null, source: "generated" };
  }
  memory.set(cacheKey, result);
  return { result, cacheKey, stored: { cacheKey, result }, source: "generated" };
}

/** Test-only: clear the in-memory map. */
export function resetNormalizationStepCacheForTests(): void {
  memory.clear();
}
