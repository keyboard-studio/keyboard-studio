// see spec.md section 11 — criteria.md compliance; loader for the triaged catalog
// Closes #116 — the criteria.json data file is now reachable via a typed
// loader and the package's `./criteria` subpath export.

import type { Criterion } from "./criteria";
import data from "../data/criteria.json" with { type: "json" };

/**
 * The full triaged Criterion catalog — 148 entries derived from the
 * `criteria.md` review-process source per the §11 four-band model
 * (Decision 4, §14); includes the 7.7a split row from the flagged-criteria re-review;
 * section 19 (import output, 2 entries: 19.1 PR-body attribution block,
 * 19.2 HISTORY.md attribution bullet per D14) — enforced by the scaffolder/output service.
 *
 * Loaded statically from `packages/contracts/data/criteria.json`. The
 * `readonly Criterion[]` cast asserts conformance against the
 * {@link Criterion} discriminated union; a per-record schema test in
 * `types.test.ts` verifies the assertion holds at test time (#116 +
 * #71 coverage path).
 *
 * Consumers reach this catalog via the package barrel
 * (`@keyboard-studio/contracts`) or via the dedicated subpath export
 * (`@keyboard-studio/contracts/criteria`) for tree-shake-friendly loading
 * when only the data — not the full type surface — is needed.
 *
 * @see spec.md §11
 * @see spec.md §14 Decision 4
 * @see packages/contracts/data/criteria-summary.md
 */
export const ALL_CRITERIA: readonly Criterion[] = data as readonly Criterion[];

/**
 * Per-band index built from {@link ALL_CRITERIA}. Useful for the Layer C
 * lint engine (band "layer-c-enforce") and the survey-question engine
 * (band "yellow-survey"), each of which consumes only its own band.
 */
export const CRITERIA_BY_BAND: Readonly<
  Record<Criterion["band"], readonly Criterion[]>
> = {
  "scaffolder-bake": ALL_CRITERIA.filter((c) => c.band === "scaffolder-bake"),
  "layer-c-enforce": ALL_CRITERIA.filter((c) => c.band === "layer-c-enforce"),
  "yellow-survey": ALL_CRITERIA.filter((c) => c.band === "yellow-survey"),
  "red-checklist": ALL_CRITERIA.filter((c) => c.band === "red-checklist"),
};
