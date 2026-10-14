# Phase 0 Research: specRef anchors + spec-trace impacted-steps join

All unknowns resolved against the live tree (2026-08-19). No `NEEDS CLARIFICATION` remain.

## R1 — `Step`/`QuestionModule` field addition point confirmed

**Decision**: Add `specRef?: string | readonly string[]` to `StepBase` in `packages/studio/src/steps/types.ts` (not `QuestionStep`/`EditorStep` individually — `StepBase` is the shared shape both extend, at line 24, alongside `inputs`/`writes`/`flowRefs`). Add the equivalent optional field to `QuestionModule` in `packages/studio/src/survey/types.ts`.

**Rationale**: `StepBase` already carries the analogous `flowRefs?: readonly string[]` field in the exact same optional-array shape this feature needs — a precedent for both the type shape and its "annotate the base, not each variant" placement.

## R2 — Manifest population surface: two files, ~20 step definitions total

**Decision**: Step definitions live in two places: named constants in `packages/studio/src/steps/registerEditorSteps.ts` (most steps — `identityStep`, `chooseBaseStep`, `trackStep`, `projectNameStep`, `carveStep`, etc.) and a handful inlined directly in `packages/studio/src/steps/manifest.ts`'s `export const manifest: readonly Step[] = [...]` array (e.g. the `marks` step, built as a literal `{ kind: "editor-step", id: "marks", ... } satisfies Step`). FR-003 requires populating `specRef` at both sites — wherever a step is actually *defined*, not re-declared at its point of inclusion in the manifest array (the `{ ...projectNameStep, spine: false, joinTarget: "characters" }` spread pattern for side-trail overrides would otherwise need `specRef` re-stated per override, which `...projectNameStep` already avoids for other fields).

**Rationale**: Confirmed via direct read of both files — `registerEditorSteps.ts` defines the named step consts; `manifest.ts` assembles them by reference (plus a few inline literals) into spine order.

## R3 — `docs/spec-trace.json` unit-id vocabulary confirmed current

**Decision**: The spec's own Assumptions section cites `utilities/spec-trace/index.js` lines 58-71 for the vocabulary — confirmed still accurate (file has grown to 694 lines total, but the unit-collection logic — `§N` from `spec.md` `## N. Title` headings, `specs/<slug>` from `specs/*/spec.md` directory names, plus `EXTRA_DOCS` entries `docs/architecture.md` and `docs/lens-model.md`) is unchanged in shape, just relocated slightly further down the file as it grew. `docs/spec-trace.json`'s live shape: `{ specVersion, lastUpdated, specFile, sections: { "§N": { title, hash, status, implements, decisions, notes } }, ... }` (confirmed by direct read).

**Rationale**: No drift from the spec's own citation — safe to proceed without a line-number correction (the *content* it describes, not the exact line numbers, is what this feature depends on).

## R4 — FR-008's exact hook point: `buildDriftIssueBody(d)`

**Decision**: `utilities/spec-trace/index.js`'s `buildDriftIssueBody(d)` function (confirmed present, ~line 477) is the single function that constructs the auto-filed GitHub issue body from a drifted unit `d`. This is the precise, minimal hook point for FR-008's "Impacted steps" section — read `manifest.specref.json` (FR-006's artifact), filter entries whose `specRef` array includes `d.id`, and append a formatted list to the body array `buildDriftIssueBody` already returns.

**Rationale**: Confirmed by direct read — the function is a pure `d -> string[]` (array of body lines) builder called from `createMissingIssues` inside `syncDriftIssues`; extending it is additive and does not touch the GitHub API call sites, the drift-detection logic (`computeDrift`), or the close/reconcile paths (FR-012's continue-on-error CI posture is unaffected).

## R5 — FR-009's hook point: `report()`

**Decision**: The `report()` function (line 286) already computes `byStatus` (a coverage-by-status tally) by iterating `trace.sections`. FR-009's "Steps covered" section is a parallel tally: for each unit id in `trace.sections` (plus `specs/<slug>` and `EXTRA_DOCS` ids), count matching entries in `manifest.specref.json`, printed alongside the existing status summary.

**Rationale**: Confirmed by direct read — `report()`'s existing structure (load trace, compute a per-unit tally, print) is the exact shape to extend, not replace.

## R6 — FR-006/FR-007's artifact generation: a vitest-run hook, not a build step

**Decision**: Per FR-007 ("MUST NOT require studio code to import CJS modules... emitted by a studio test or build step"), generate `packages/studio/src/steps/manifest.specref.json` from a small script invoked as part of `pnpm test` (mirroring how other generated-artifact-from-test-run patterns work in this repo, e.g. facet-index's own build step) rather than a Vite/webpack build plugin — the artifact is pure data (a flat `{ [id]: string[] }` map derived from the manifest + registries, both already plain TS objects importable by a Node script using `tsx`), so no bundler is needed to produce it.

**Rationale**: Satisfies FR-007's module-boundary constraint (`utilities/spec-trace` stays CJS-only, reads the JSON artifact, never imports `packages/studio` TS directly) while keeping the artifact's freshness tied to the same commands (`pnpm test`) CI already runs, rather than adding a new pipeline stage.

**Alternatives considered**: A Vite build plugin emitting the artifact during `pnpm build` — rejected: `pnpm test` runs on every PR (via CI) while `pnpm build` is a separate, heavier step; tying artifact freshness to the lighter, always-run command better satisfies FR-010's "if missing or stale, warn and continue" fallback posture (the artifact should be fresh far more often than it's stale).

## R7 — Completeness check placement: `checkSpecRef`, mirroring `checkInputsSatisfiableFromManifest`

**Decision**: `packages/studio/src/dashboard/completeness.ts` already hosts pure, manifest-consuming check functions in the exact shape FR-005 wants: `checkInputsSatisfiableFromManifest(manifest: readonly Step[]): OrphanInput[]` (line 444) takes the manifest and returns a violations array, with no store/stateful dependency. `checkSpecRef(manifest: readonly Step[], trace: SpecTraceUnits): SpecRefViolation[]` follows the identical shape.

**Rationale**: Confirmed by direct read — this file's existing checks (`checkRejoin`, `checkSpinePrefixShippability`, `checkInputsSatisfiable`, `checkInputsSatisfiableFromManifest`) are all pure functions over `readonly Step[]`; the new check slots in as a sibling, wired into the same vitest suite that already exercises the others (no new test infrastructure).
