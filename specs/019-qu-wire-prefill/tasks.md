# Tasks: Wire prefill — Prefill resolves as a read-only registry drill-down under the opaque characters node (writes: [])

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Phase**: 1, spec #5 · **Branch**: `speckit/question-unification-phase1-specs`

Phase-1 invariants in force for every task: **no new write routing**, **no contracts bump**, **behavior byte-identical**, **`prefill` appears as a read-only drill-down map node under `characters`**, **read-only / declare-consuming (017 owns the `prefill` contract and the cross-graph C5 decision; the render + confirm stay in code; `prefill` stays a drill-down, NOT a manifest entry)**.

## A. Dependencies & grounding (read-only verification — do before any change)

- [x] **T001** Confirm dependency specs have landed: spec 015 (map projection — `prefill` gets a rendered drill-down node from the `questionRegistry`-keyed drill-down layer), spec 016 (drift guardrail), and spec 017 (`prefill`'s drill-down `inputs`/`writes` declared with `writes: []` **and** the cross-graph C5 decision D1 resolved or carried). This spec **consumes** 017's declaration and C5 resolution; it does NOT declare `prefill` and does NOT resolve C5. If 017 has not landed, this spec is **blocked** and inherits the [NEEDS DECISION — D1].
- [x] **T002** Confirm `prefill` has **no manifest entry** today and is declared (by spec 017) as a **registry-keyed drill-down under the opaque `characters` node** (`charactersStep`, `manifest.ts:47-56`). Confirm this spec must NOT add a manifest entry or partially decompose the `characters` placeholder (that is Phase 2 spec #11).
- [x] **T003** Confirm the hand-built render + confirm in `StudioShell`: `stepId === "characters" && charactersSub === "prefill"` hand-places `<Prefill>` (`StudioShell.tsx:930-940`); `handlePrefillConfirm()` sets `charactersSub` "prefill" → "B" (`StudioShell.tsx:632-634`); `handlePrefillBack()` (`StudioShell.tsx:721`) unchanged. Record this as the byte-identical baseline.
- [x] **T004** Confirm the SPA render path: `Prefill` is hand-placed as a `characters` sub-stage; there is no `SurveyView` / manifest- or registry-resolved render of `Prefill`. Confirm this spec must NOT change it.
- [x] **T005** Confirm the declared `prefill` contract (from spec 017): `writes: []` (read-only confirm); `inputs` = `header.bcp47` (array, session-derived) + the session-level `ScriptPrefill`; **no** `irPath('header','script')` (it does not exist — `keyboard-ir.ts:348-359`). Confirm the `header.bcp47` writer is `iso_code` (`iso_code.ts:80`) inside the opaque `charactersStep`, i.e. the cross-graph boundary the 017 D1 decision resolves.

## B. Branch/read-only oracle (§2.5, FR-010) — the one new artifact; write it FIRST to pin the baseline

- [x] **T006** Add the flow-routing snapshot test (`packages/studio/src/.../prefillRouting.test.ts`, or in the mirrored survey tree per §2.5). Drive the confirm: assert `handlePrefillConfirm()` advances `charactersSub` from `"prefill"` to `"B"` (advance into Phase B) (FR-008/SC-003).
- [x] **T007** Assert the back action (`handlePrefillBack`, `StudioShell.tsx:721`) is unchanged (byte-identical baseline) (FR-008).
- [x] **T008** Capture the resolved next sub-stage (`charactersSub` "prefill" → "B") as the snapshot baseline; assert it is **unchanged** (the §2.5 branch/read-only oracle — no IR or `SurveyPhaseResult` to compare since `prefill` writes `[]`) (FR-010/SC-003).

## C. Map-node confirmation (additive assertions — do NOT repurpose spec-015/016 tests)

- [x] **T009** Assert the `prefill` node resolves on the rendered Flow Map as a **registry-keyed drill-down UNDER the opaque `characters` node** (sourced from the `questionRegistry`-keyed drill-down layer of the spec-015 projection), and that it is **NOT** a top-level manifest entry (FR-001/SC-001).
- [x] **T010** Assert the `prefill` node is marked / projected **read-only** with `writes: []`, and carries its declared `inputs` (from spec 017): `header.bcp47` (array, session-derived) + the session-level `ScriptPrefill` (FR-002/FR-003/SC-001/SC-002).
- [x] **T011** Assert **no** declaration on the `prefill` node references `irPath('header','script')` (the path does not exist); the script signal is the session-level `ScriptPrefill` (FR-004/FR-012/SC-002). Keep additive — do not duplicate spec 017's authority over the declaration.

## D. Input satisfiability (consumed from spec 017 — do NOT re-resolve C5)

- [x] **T012** Assert `prefill`'s declared inputs are **satisfiable** subject to the **017 C5 decision (D1)** — Option B's separate question-writer C5 resolving `iso_code (iso_code.ts:80) → header.bcp47` in the question graph, or Option A's subsuming-step write. Confirm manifest-level C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) returns **no spurious orphan** for `prefill` once D1 is applied (FR-005/FR-006/SC-006).
- [x] **T013** Confirm this spec opens **no new decision** on the cross-graph C5 mechanism — it is surfaced only as **[NEEDS DECISION — inherited from 017]** and consumed; nothing here re-resolves it (FR-005/FR-013).

## E. Invariant guards (confirm nothing moved into Phase-2 territory)

- [x] **T014** Confirm **no promotion to a manifest entry**: `prefill` stays a drill-down under `characters`; no new manifest entry was added and the `charactersStep` placeholder was not decomposed. The promotion is **Phase 2 spec #11 (`qu-mutate-prefill`)** (FR-001/FR-009/FR-013/SC-007).
- [x] **T015** Confirm **no new write routing / no `mutate()`** for the `prefill` surface (`writes: []`), and **no `@keyboard-studio/contracts` bump** (FR-009/FR-013/SC-007).
- [x] **T016** Confirm the **SPA render path is unchanged** — `StudioShell` hand-places `Prefill` as a `characters` sub-stage via `activeStepId` / `charactersSub` (`StudioShell.tsx:930-940`); there is no manifest/registry-resolved render; the `Prefill` render is byte-identical (FR-007/SC-004).
- [x] **T017** Confirm **no re-declaration of `prefill`** — spec 017 owns the drill-down declaration; this spec added none (FR-009/FR-013).

## F. Verification gate (run last)

- [x] **T018** Run the spec-016 **drift guardrail** with `prefill` resolving as a question-graph drill-down node; confirm **green** — `prefill` is a reached registry id with a rendered drill-down node (no orphan, no uncovered id); reachability per-graph (question graph, §2.2(b)) (FR-011/SC-005).
- [x] **T019** `pnpm typecheck` — green (SC-007).
- [x] **T020** Studio + contracts `vitest` — green, including the new §2.5 branch/read-only oracle (T006–T008); the spec-015 map-projection and spec-016 drift-guardrail tests still pass (FR-010/FR-012/SC-003/SC-007).
- [x] **T021** `pnpm depcruise` — green; assert **no new `dashboard → stores` or `dashboard → editors` edge** (FR-012/SC-007).
- [x] **T022** Flag-off / byte-identical check — with `SHOW_FLOWMAP` off, `FlowMapView` does not mount; the SPA still hand-places `Prefill` as a `characters` sub-stage and the confirm advances `charactersSub` "prefill" → "B" identically; confirm no behavior change in any flag state (FR-007/SC-004).
- [x] **T023** Manual dev-build smoke (flag on): open the Flow Map → Survey flow tab; drill into the `characters` node; confirm the `prefill` node renders as a read-only drill-down (`writes: []`) with its declared `inputs` (`header.bcp47` array + session `ScriptPrefill`) and no `irPath('header','script')`; then run the confirm in the SPA and confirm it advances into Phase B (`charactersSub` "prefill" → "B") (SC-001/SC-003). — Covered by automation in this headless environment: the read-only drill-down placement under `characters` (`writes: []`, declared `inputs` = `header.bcp47` + session `ScriptPrefill`, no `irPath('header','script')`) is locked by `prefillRouting.test.ts` (T009–T011) additively to `tests/survey/questions/a/prefill.test.ts`; the confirm advancing `charactersSub` "prefill" → "B" is locked by the `prefillRouting.test.ts` branch/read-only oracle (T006–T008) and exercised render-driven in `StudioShell.test.tsx`. All green.
