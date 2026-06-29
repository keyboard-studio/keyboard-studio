# Tasks: Wire track — TrackStep resolves as its first-class manifest node (fork preserved)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #4 · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing**, **no contracts bump**, **behavior byte-identical**, **`track` appears as a map node**, **read-only / declare-consuming (017 owns the `track` contract; the fork stays in code)**.

## A. Dependencies & grounding (read-only verification — do before any change)

- [ ] **T001** Confirm dependency specs have landed: spec 015 (map projection — `track` gets a rendered node automatically), spec 016 (drift guardrail), and spec 017 (`track`'s `inputs`/`writes` declared). This spec **consumes** 017's declaration; it does NOT declare `track`. If 017 has not declared `track`, this spec is **blocked**.
- [ ] **T002** Confirm `track` is **already** a declared manifest editor-step: `trackStep` at `registerEditorSteps.ts:71-79` (`id:"track"`, `spine:true`, `component:TrackStepAdapter`) and the manifest entry at `manifest.ts:77` (after `choose_base`, before the `project_name` side-trail). Confirm this spec must NOT add a second declaration or change the entry.
- [ ] **T003** Confirm the hand-coded fork in `handleTrackSelected` (`StudioShell.tsx:602-614`): copy → `setActiveStepId("project_name")`; adapt → `setScaffoldSpec(null)`, `setActiveStepId(nextSpineStepAfter("track"))`, `setCharactersSub("prefill")`. Record this as the byte-identical baseline.
- [ ] **T004** Confirm the SPA render path: `StudioShell` hand-places `<TrackStep>` via the `activeStepId` switch (`StudioShell.tsx:908-916`); `manifest[].component` (`TrackStepAdapter`) is unrendered (no `SurveyView`). Confirm this spec must NOT change it.
- [ ] **T005** Confirm the `project_name` side-trail is `spine:false`, `joinTarget:"characters"` (`manifest.ts:82-86`) — the copy-track fork target the adapt track bypasses.

## B. Branch/read-only oracle (§2.5, FR-008) — the one new artifact; write it FIRST to pin the baseline

- [ ] **T006** Add the flow-routing snapshot test (`packages/studio/src/.../trackRouting.test.ts`, or in the mirrored survey tree per §2.5). Drive the copy track: assert `handleTrackSelected("copy")` resolves the active step to `project_name` (FR-004/FR-007/SC-003).
- [ ] **T007** Drive the adapt track: assert `handleTrackSelected("adapt")` clears `scaffoldSpec`, resolves the active step to `nextSpineStepAfter("track")` (`characters`), and sets `charactersSub:"prefill"` — exactly as today (FR-004/FR-007/SC-003/SC-004).
- [ ] **T008** Capture the resolved next-step id / branch selection for both tracks as the snapshot baseline; assert it is **unchanged** (the §2.5 branch/read-only oracle — no IR or `SurveyPhaseResult` to compare since `track` writes `[]`) (FR-008/SC-003).

## C. Map-node confirmation (additive assertions — do NOT repurpose spec-015/016 tests)

- [ ] **T009** Assert the `track` node resolves on the rendered Flow Map: exactly one `track` node on the manifest spine after `choose_base`, sourced from `buildManifestStepGraph()` via the spec-015 adapter (no new declaration) (FR-001/SC-001).
- [ ] **T010** Assert the `track` node carries its declared `inputs`/`writes` (from spec 017): `writes` is `[]` (branch selection only, no IR leaf in Phase 1); `inputs` cover the resolved base IR (`base.displayName`) + session-derived `header.bcp47` array (§2.1) (FR-002/SC-002).
- [ ] **T011** Assert the `track` node is projected as **branch-defining**: a fork edge to the `project_name` side-trail (`spine:false`, `joinTarget:"characters"`) on the copy track and the spine continuation to `characters` on the adapt track (FR-003/SC-001).

## D. Invariant guards (confirm nothing moved into Phase-2 territory)

- [ ] **T012** Confirm **no fork-in-YAML change**: `handleTrackSelected` (`StudioShell.tsx:602-614`) is byte-identical; no YAML `next` rule was added for `track`. The modular-gate move is **Phase 2 spec #10 (`qu-mutate-track`)** (FR-005/FR-011/SC-007).
- [ ] **T013** Confirm **no new write routing / no `mutate()`** for the `track` surface, and **no `@keyboard-studio/contracts` bump** (FR-005/FR-011/SC-007).
- [ ] **T014** Confirm the **SPA render path is unchanged** — `StudioShell` hand-places `TrackStep`; `manifest[].component` stays unrendered; the `TrackStep` render is byte-identical (FR-006/SC-005).
- [ ] **T015** Confirm **no re-declaration of `track`** — exactly one `trackStep` declaration (`registerEditorSteps.ts:71-79`) and one manifest entry (`manifest.ts:77`); this spec added neither (FR-001/FR-011).

## E. Verification gate (run last)

- [ ] **T016** Run the spec-016 **drift guardrail** with `track` resolving as its node; confirm **green** — `track` is a reached manifest step with a rendered node (no orphan, no uncovered step) (FR-009/SC-006).
- [ ] **T017** `pnpm typecheck` — green (SC-007).
- [ ] **T018** Studio + contracts `vitest` — green, including the new §2.5 branch/read-only oracle (T006–T008); the spec-015 map-projection and spec-016 drift-guardrail tests still pass (FR-008/FR-010/SC-003/SC-007).
- [ ] **T019** `pnpm depcruise` — green; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-010/SC-007).
- [ ] **T020** Flag-off / byte-identical check — with `SHOW_FLOWMAP` off, `FlowMapView` does not mount; the SPA still hand-places `TrackStep` and the fork resolves identically; confirm no behavior change in any flag state (FR-006/SC-005).
- [ ] **T021** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; confirm the `track` node renders as branch-defining (fork to `project_name`, spine to `characters`) with its declared `inputs`/`writes`; then run the copy and adapt tracks in the SPA and confirm copy reaches `project_name` and adapt skips to `characters` (SC-001/SC-004).
