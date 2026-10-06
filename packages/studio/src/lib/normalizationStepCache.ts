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

/** Small LRU: an author edits one keyboard, so only the latest few sources are worth holding. */
export const NORMALIZATION_STEP_MEMORY_LIMIT = 4;

const memory = new Map<string, NormalizationStepResult>();
/** Generator runs in flight, so concurrent requests on one key share a single run. */
const inFlight = new Map<string, Promise<NormalizationStepResult>>();
/**
 * Time-bound refusals, per session. The refusal reflects this run's budget, not the
 * source, so it is never persisted; remembering it here stops a pathological keyboard
 * from re-running the generator for its full budget after every unrelated request.
 * Any edit changes the key, which lifts the refusal.
 */
const timeBoundRefusals = new Map<string, NormalizationStepResult>();

function remember(key: string, result: NormalizationStepResult): void {
  memory.delete(key);
  memory.set(key, result);
  while (memory.size > NORMALIZATION_STEP_MEMORY_LIMIT) {
    const oldest = memory.keys().next();
    if (oldest.done === true) break;
    memory.delete(oldest.value);
  }
}

function recall(key: string): NormalizationStepResult | undefined {
  const hit = memory.get(key);
  if (hit !== undefined) remember(key, hit);
  return hit;
}

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

  const inMemory = recall(cacheKey);
  if (inMemory !== undefined) {
    devLog.info("[OK] normalization step cache hit (memory)");
    return { result: inMemory, cacheKey, stored: { cacheKey, result: inMemory }, source: "memory" };
  }
  if (snapshot != null && snapshot.cacheKey === cacheKey) {
    remember(cacheKey, snapshot.result);
    devLog.info("[OK] normalization step cache hit (snapshot)");
    return { result: snapshot.result, cacheKey, stored: snapshot, source: "snapshot" };
  }

  const refused = timeBoundRefusals.get(cacheKey);
  if (refused !== undefined) {
    return { result: refused, cacheKey, stored: null, source: "memory" };
  }

  let pending = inFlight.get(cacheKey);
  if (pending === undefined) {
    pending = proposeNormalizationStep(ir).finally(() => {
      inFlight.delete(cacheKey);
    });
    inFlight.set(cacheKey, pending);
  }
  const result = await pending;
  // A time-bound refusal is a property of this run's budget, not of the source,
  // so it is never persisted in the snapshot; it is held for the session only.
  if (result.kind === "refused" && result.reason === "time-bound") {
    timeBoundRefusals.set(cacheKey, result);
    return { result, cacheKey, stored: null, source: "generated" };
  }
  remember(cacheKey, result);
  return { result, cacheKey, stored: { cacheKey, result }, source: "generated" };
}

/** Test-only: number of entries in the memory LRU. */
export function normalizationStepMemorySizeForTests(): number {
  return memory.size;
}

/** Test-only: clear every in-memory structure. */
export function resetNormalizationStepCacheForTests(): void {
  memory.clear();
  inFlight.clear();
  timeBoundRefusals.clear();
}
