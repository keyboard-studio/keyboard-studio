// guardAnalysis — studio-side entry point for the kmAssist guard-coverage
// analysis (spec 082 FR-020 / FR-022).
//
// The analysis itself lives in the engine (`analyzeDiacriticGuards` in
// `@keyboard-studio/engine/kmAssist`): deterministic, no LLM, pure. This
// module keeps the rules step's historical contract — the `(rules,
// orthography)` signature and the `GuardAnalysisResult` shape — and adds the
// studio-side null-orthography guard: when character discovery hasn't run
// yet, the section stays hidden instead of analysing nothing.
//
// The analysis runs in TWO directions over the working-copy rules plus the
// confirmed orthography model (see orthographyModel.ts):
//   A. missing — marks with no guard that a guard family should cover
//      ("3 more diacritic keys have no guard — add them to the family?").
//   B. over-broad — a guard that blocks a combination the orthography says
//      is real ("You block the acute key after 'e', but your orthography
//      says acute combines with e. Intentional?").
//
// Both directions are intent-gated (see guardIntentStore.ts): they surface
// only after the author opens the family card, edits in the family, or
// installs a block-behaviour bundle — never on step entry, never
// auto-applied. Some workflows intentionally permit floating marks.

import type { IRRule, KeyboardIR, StoreItem } from "@keyboard-studio/contracts";
import {
  analyzeDiacriticGuards,
  type DiacriticGuardAnalysis,
  type MissingGuard,
  type MissingGuardGroup,
  type OrthographyModel,
  type OverBroadGuard,
} from "@keyboard-studio/engine/kmAssist";

// Studio contract names (historical); the shapes are the engine's.
export type { MissingGuardGroup, OrthographyModel, OverBroadGuard };
/** One mark key the analysis thinks a guard family should also cover. */
export type MissingGuardEntry = MissingGuard;
/** Both analysis directions in one result. */
export type GuardAnalysisResult = DiacriticGuardAnalysis;

/**
 * Store name → character values, from the IR's store table (char items
 * only). The over-broad direction needs this to know which characters a
 * guard actually blocks; guards whose store is absent are skipped, never
 * guessed at.
 */
export function storeCharsOf(ir: KeyboardIR): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const store of ir.stores) {
    map.set(
      store.name,
      store.items
        .filter(
          (i): i is Extract<StoreItem, { kind: "char" }> => i.kind === "char",
        )
        .map((i) => i.value),
    );
  }
  return map;
}

/**
 * Guard-coverage analysis over the working-copy rules.
 *
 * @param rules all rules of the keyboard.
 * @param orthography confirmed orthography model, or null when character
 *   discovery hasn't run (returns no suggestions; the section stays hidden).
 * @param stores store name → characters, for the over-broad direction.
 */
export function analyzeGuardCoverage(
  rules: IRRule[],
  orthography: OrthographyModel | null,
  stores: ReadonlyMap<string, string[]> = new Map(),
): GuardAnalysisResult {
  if (orthography === null) return { missing: [], overBroad: [] };
  return analyzeDiacriticGuards(rules, orthography, stores);
}
