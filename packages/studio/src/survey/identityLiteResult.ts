// IdentityLiteResult — the typed output of the identity-lite step.
//
// EXTRACTED FROM IdentityLite.tsx as a type-only LEAF so the survey-session
// store can name it without depending on the component that produces it.
//
// The cycle this breaks: `stores/surveySessionStore.ts` holds an
// `identityResult` slot, so it needs this type; `survey/IdentityLite.tsx`
// renders `SurveyRunner`; and `SurveyRunner` now reads `activeStepId` from that
// store to know which step's walk it is publishing (see lib/stepWalk.ts). Three
// legitimate edges, one loop — caught by `pnpm depcruise`'s `no-circular` rule,
// which follows type-only imports too (`tsPreCompilationDeps: true`).
//
// Note the store's own import comment already navigated an earlier version of
// this hazard, importing the leaf `IdentityLite.tsx` rather than the
// `survey/index.ts` barrel (which re-exports `PhaseB.tsx`, itself a store
// consumer). This module finishes that job: the type has no runtime dependencies
// at all, so nothing can close a loop through it.
//
// `IdentityLite.tsx` re-exports it, so every existing
// `import type { IdentityLiteResult } from "./IdentityLite.tsx"` keeps working
// and no call site moves.

import type { Attribution } from "@keyboard-studio/contracts";
import type { ScriptPrefill } from "../lib/scriptAxes.ts";

/** Typed result of the identity-lite step. */
export interface IdentityLiteResult {
  /** Language name in its own script (autonym). */
  autonym: string;
  /** Language name in English. */
  english: string;
  /**
   * ISO 639 language subtag entered by the author (e.g. "ha", "hi", "fr").
   * Empty string when the author left the field blank.
   * Region and variant refinement are deferred to the documentation stage (§8).
   */
  languageSubtag: string;
  /**
   * Region subtag chosen at `il_language_region` (spec 030 US3), e.g. "DJ".
   * Empty string when the language was unambiguous by region, the step was
   * skipped, or the entered value was not a shape-valid BCP47 region subtag
   * (normalized via `normalizeRegionSubtag`). Folded into `bcp47` at the
   * region position.
   */
  region: string;
  /** Raw `il_target_script` answer (e.g. "Latn", "romanization-Latn", "fonipa"). */
  targetScriptRaw: string;
  /**
   * Full BCP47 target tag combining language subtag + normalized script/variant,
   * e.g. "ha-Latn", "hi-Deva", "fr-Latn", "und-fonipa".
   * Empty string when `languageSubtag` was left blank — `suggestBases()` falls
   * back to script-match ranking in that case.
   */
  bcp47: string;
  /** Whether the chosen target script is supported in v1. */
  supported: boolean;
  /**
   * Who to attribute the keyboard to (spec 064 US1), or null when the flow
   * terminated before attribution — which is what a gated script does, since an
   * author who cannot make a keyboard is never asked who holds its copyright.
   */
  attribution: Attribution | null;
  /** Routing/A2 prefill confirmations derived from the target script (spec §5). */
  prefill: ScriptPrefill;
}
