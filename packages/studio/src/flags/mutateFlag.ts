// mutateFlag — the single global flag gating the spec-014 `mutate()` IR write path.
//
// Contract: flag-and-validator.contract.md F1/F3 + plan.md (spec-014).
//   - F1 (single global): ONE build/deploy-time global gates `mutate()`.
//        On  ⇒ `mutate()` is the IR write path for in-scope surfaces.
//        Off ⇒ the P4b declared-only seam runs; NO `mutate()` executes.
//   - F2 (byte-identical-to-P4b): with the flag OFF, produced IR + observable
//        survey behavior are byte-identical to P4b. OFF is therefore the
//        conservative DEFAULT — turning the feature on is an explicit opt-in
//        during rollout (the defined rollback is "leave it off").
//   - F3 (no live toggle): this is read at build/deploy time. Mid-session
//        flipping is out of scope — callers read `isMutateSeamEnabled()` at the
//        reducer apply site / re-propagation trigger, not via a live store.
//
// Mirrors the established studio env-flag convention (lib/services.ts
// `VITE_USE_REAL_ENGINE`, stores/debugPinsStore.ts `VITE_KM_DEBUG`) via the
// shared `readEnvFlag` helper (lib/envFlag.ts): a single `import.meta.env`
// read, guarded so it is SSR/Node-CI safe. The flag is OFF unless
// `VITE_KM_MUTATE_SEAM` is explicitly set to "1". Unlike the other two
// call sites, this flag has no `?param` URL override — see readEnvFlag's
// doc comment for why that means no `window` guard is needed here either.

import { readEnvFlag } from "../lib/envFlag.ts";

/**
 * Whether the spec-014 `mutate()` seam is the executed IR write path.
 *
 * Reads the build/deploy-time global `VITE_KM_MUTATE_SEAM`. Returns `true`
 * ONLY when it is exactly `"1"`; every other value (unset, "0", "false", …)
 * yields `false` — the conservative P4b-equivalent default (F2/SC-008).
 *
 * Read at the reducer apply site (`steps/reducer.ts`) and, in later user
 * stories, the re-propagation trigger. Not a live in-session toggle (F3).
 */
export function isMutateSeamEnabled(): boolean {
  return readEnvFlag("VITE_KM_MUTATE_SEAM");
}
