// generateManifestSpecRef — pure builder for manifest.specref.json (spec 031
// FR-006/FR-007).
//
// This is the ONLY bridge `utilities/spec-trace` (a standalone CJS Node tool,
// FR-007) has into the studio's specRef annotations — it reads the emitted
// JSON file, never `packages/studio` TS directly.
//
// Output shape (FR-006): `{ [stepId | questionId]: readonly string[] }` — a
// flat map; a string specRef is normalized to a one-element array so
// spec-trace's join logic (utilities/spec-trace/index.js) does one
// `Array.includes()` check per unit, regardless of whether the source
// annotation was a single string or an array.
//
// Deliberately a PURE function with no `fs`/`node:*` I/O: `manifest.ts`
// (and, transitively, the question-module registries) import React editor
// components that reference Lingui `<Trans>` macros (spec 046) — those only
// resolve through a Babel-macro-aware transform pipeline (Vite's `lingui()`
// plugin), which a bare Node/`tsx` process does not provide. Generation
// therefore runs as an actual vitest test
// (`generateManifestSpecRef.test.ts`, research R6's "vitest-run hook"), where
// Vite's transform is already wired up; this module stays a plain,
// synchronously-importable builder that test can call and assert against.

import type { Step } from "./types.ts";
import type { QuestionModule } from "../survey/types.ts";

function toArray(specRef: string | readonly string[] | undefined): readonly string[] {
  if (specRef === undefined) return [];
  return typeof specRef === "string" ? [specRef] : specRef;
}

/**
 * Build the flat `{ [stepId | questionId]: specRef[] }` map (FR-006).
 *
 * Manifest steps: FR-003 requires >=1 specRef on every entry (enforced by
 * dashboard/completeness.ts's checkSpecRef, not here) — emit every step's
 * entry regardless, even if empty, so a completeness violation is visible in
 * the artifact rather than silently absent.
 *
 * Question modules: specRef is OPTIONAL (FR-002) — only emit an entry when
 * one is actually declared, so the artifact does not carry hundreds of empty
 * rows.
 */
export function buildManifestSpecRef(
  manifest: readonly Step[],
  questionRegistry: Readonly<Record<string, QuestionModule>>,
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};

  for (const step of manifest) {
    out[step.id] = toArray(step.specRef);
  }

  // Step ids and question ids are two separate, uncoordinated namespaces
  // (e.g. "characters"/"carve" vs. "il_language_code"/"pb_use_case") with
  // nothing elsewhere enforcing they stay disjoint. A silent overwrite here
  // would make spec-trace's impacted-steps join (utilities/spec-trace's
  // findImpactedSteps) report the wrong entity against a drifted section —
  // fail loudly instead, the same posture this repo uses for other
  // generated-artifact inconsistencies (e.g. codegen-ucd.mjs's pin mismatch).
  for (const [id, mod] of Object.entries(questionRegistry)) {
    const refs = toArray(mod.specRef);
    if (refs.length === 0) continue;
    if (id in out) {
      throw new Error(
        `generateManifestSpecRef: question module id "${id}" collides with a manifest step id — ` +
          `the two id namespaces must stay disjoint (rename one).`,
      );
    }
    out[id] = refs;
  }

  return out;
}
