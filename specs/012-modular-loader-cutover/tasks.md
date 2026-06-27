---

description: "Task list for Modular-loader cutover + legacy YAML retirement"
---

# Tasks: Modular-loader cutover + legacy YAML retirement

**Input**: Design documents from `specs/012-modular-loader-cutover/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/flow-output-parity.md](contracts/flow-output-parity.md), [quickstart.md](quickstart.md)

**Tests**: INCLUDED — this feature is test-gated by design (flow-output parity, the P2 CI count/mirror/orphan gates, and the #410 AC#3 Playwright lanes). Test tasks are first-class here, not optional.

**Organization**: Tasks are grouped by user story. Note the one real cross-story dependency: the identity-lite leg of US1 depends on US2's new modules + manifest. The A/F legs of US1 are independent of US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US4 per spec.md; Setup/Foundational/Polish carry no story label
- All paths are repo-relative from `d:\Github\_Projects\_KM\keyboard-studio`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch and baseline capture before any edit.

- [ ] T001 Create feature branch `km/modular-loader-cutover` off `main` (one branch for part (a); part (b) deletion lands as a separate commit/PR on the same or a follow-up branch per FR-013)
- [ ] T002 [P] Confirm pre-cutover baseline is green: run `pnpm --filter @keyboard-studio/studio test` and record that Phase A/F/identity-lite currently render via `parseFlow` (the legacy baseline the parity harness will compare against)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The flow-output-parity test harness — the safety baseline every cutover task is verified against (contracts/flow-output-parity.md). MUST exist before cutover so regressions are caught immediately.

**⚠️ CRITICAL**: No cutover (US1) task should be considered done without this harness asserting parity.

- [ ] T003 Create the parity harness `packages/studio/tests/survey/flow-parity.test.ts`: a helper that projects a `FlowDef` to author-visible fields (`id`, `prompt`, `help_text`, `type`, `options`, `required`, `next`) for `questions` and `provenance_questions`, plus per-phase `parseFlow` vs `loadModularFlow` deep-equality assertions for **phase_a_identity** and **phase_f_helpdocs** (the identity-lite assertion is added in T017 once its modules exist). Import the existing `phase_*.yaml?raw` and `phase_*.modular.yaml?raw`.

**Checkpoint**: Harness proves A and F modular manifests already match their legacy YAML — the A/F cutover is then a verified swap.

---

## Phase 3: User Story 2 - identity-lite gains its missing modular manifest (Priority: P1) 🎯 ENABLER

**Goal**: Author + register the 5 `il_*` question modules (ported verbatim from `identity_lite.yaml`) and create the thin manifest, so identity-lite can resolve through `loadModularFlow` at all.

**Independent Test**: `loadModularFlow(identity_lite.modular.yaml?raw)` resolves with no throw; resolved id set + order equals the legacy `identity_lite.yaml` set; the three P2 gates (count=98, mirror-coverage, orphan-input) pass.

> Sequenced before US1 because US1's identity-lite leg depends on these artifacts. Both are P1.

### Implementation for User Story 2

- [ ] T004 [P] [US2] Author `packages/studio/src/survey/questions/a/il_language_autonym.ts` — `QuestionModule` ported verbatim from `identity_lite.yaml` (text, required, `next: "il_language_english"`); declare `inputs: []`, `writes: []`; `mutate` omitted (stub); include `fixtures`
- [ ] T005 [P] [US2] Author `packages/studio/src/survey/questions/a/il_language_english.ts` (text, required, `next: "il_language_code"`); empty `inputs`/`writes`; fixtures. (The autonym→English seed stays in `IdentityLite.tsx` `getSeedValue` — do NOT add it to the module)
- [ ] T006 [P] [US2] Author `packages/studio/src/survey/questions/a/il_language_code.ts` (text, optional, `next: "il_target_script"`); empty `inputs`/`writes`; fixtures
- [ ] T007 [P] [US2] Author `packages/studio/src/survey/questions/a/il_target_script.ts` (select, required; **conditional `next` as `FlowGotoRule[]`**: `value ∈ {Ethi,Hani,Hang} → il_script_not_supported`, else `default: null`); options list (14 values incl. `other`) ported verbatim; empty `inputs`/`writes`; fixtures
- [ ] T008 [P] [US2] Author `packages/studio/src/survey/questions/a/il_script_not_supported.ts` (notice, optional, `next: null`) — preserves the Article VII "not yet supported" honest stub; empty `inputs`/`writes`; fixtures
- [ ] T009 [US2] Register all 5 modules in `packages/studio/src/survey/questions/registry.a.ts` (one import + one entry each; key === `definition.id`; preserve explicit `.ts` extensions) — sequential, single shared file (depends on T004–T008)
- [ ] T010 [US2] Create `content/flows/identity_lite.modular.yaml` (`flow_id: identity_lite`, `phase: "A"`, `questions:` the 5 `il_*` ids in legacy order; no `provenance_questions`)
- [ ] T011 [US2] Bump the module-count floor `93` → `98` in `packages/studio/tests/survey/inputs-writes-coverage.test.ts`
- [ ] T012 [P] [US2] Add 5 mirrored unit tests `packages/studio/tests/survey/questions/a/il_*.test.ts` (one per module): `validate` accepts each `fixtures` entry / rejects malformed; declared `inputs`/`writes` parse under `IRPath` (empty)
- [ ] T013 [US2] Run the three gates green: `inputs-writes-coverage` (98), `mirror-coverage`, `orphan-input-lint` (now scopes `identity_lite.modular.yaml`; passes via empty `inputs`)

**Checkpoint**: identity-lite resolves modularly; registry at 98; all P2 gates green.

---

## Phase 4: User Story 1 - A/F/identity-lite render identically on the modular loader (Priority: P1) 🎯 MVP

**Goal**: Swap the three phase components from `parseFlow` to `loadModularFlow`, remove `TODO(#410)`, and prove author-visible output is identical per phase.

**Independent Test**: Parity harness (T003 + T017) deep-equal for A, F, and identity-lite; SPA smoke shows identical questions/order/defaults/branching; zero `TODO(#410)` markers; typecheck + build clean.

### Implementation for User Story 1

- [ ] T014 [P] [US1] `packages/studio/src/survey/PhaseA.tsx`: replace `import { parseFlow } from "./loadFlow.ts"` with `import { loadModularFlow } from "./loadModularFlow.ts"`; swap `?raw` import to `../../../../content/flows/phase_a_identity.modular.yaml?raw`; `useMemo(() => loadModularFlow(raw))`; remove the `TODO(#410)` line (preserve `.ts`/`.tsx` extensions)
- [ ] T015 [P] [US1] `packages/studio/src/survey/PhaseF.tsx`: same cutover against `phase_f_helpdocs.modular.yaml?raw`; remove `TODO(#410)`
- [ ] T016 [US1] `packages/studio/src/survey/IdentityLite.tsx`: same cutover against `identity_lite.modular.yaml?raw`; remove `TODO(#410)`; **keep `getSeedValue` / `autonymRef` autonym→English seam unchanged** (depends on US2: T009, T010)
- [ ] T017 [US1] Extend `flow-parity.test.ts` (T003) with the **identity_lite** `parseFlow` vs `loadModularFlow` deep-equality assertion; run the full parity suite green for A, F, identity-lite (this is the deletion baseline for US4 — FR-006)
- [ ] T018 [US1] Assert no markers remain: `grep -rn "TODO(#410)" packages/studio/src/` returns nothing
- [ ] T019 [US1] `pnpm --filter @keyboard-studio/studio typecheck` and `pnpm build` clean (catches any dropped import extension)

**Checkpoint**: All four survey flows run on the single modular loader; parity proven; #410 ACs 1–2 of AC#3 substantively satisfied (E2E in US3). **This is the shippable MVP for part (a).**

---

## Phase 5: User Story 3 - Both Playwright E2E lanes pass (Priority: P2)

**Goal**: Stand up the Playwright config (global CLI, no devDependency) and unblock the two #410 AC#3 lanes.

**Independent Test**: `npx playwright test copy-edit` passes (lane 1); lane 2 passes if Track 2 import is confirmed live, else documented as blocked.

### Implementation for User Story 3

- [ ] T020 [US3] Create `packages/studio/playwright.config.ts`: `testDir: "e2e"`, `use.baseURL: "http://localhost:5273"`, a `webServer` entry running `pnpm dev` (reuse existing server); driven by the global Playwright CLI (`npx playwright`, v1.61.1) — do NOT add `@playwright/test` as a devDependency (research R5). Run `npx playwright install` once for browser binaries
- [ ] T021 [US3] Unblock **lane 1** — remove `.skip` in `packages/studio/e2e/copy-edit.spec.ts`; run `cd packages/studio && npx playwright test copy-edit`; confirm green (identity-lite → base picker → project-name → Phase A/B → emit)
- [ ] T022 [US3] **Lane 2 (Track 2)** — confirm with km-frontend whether Track 2 import is live (`packages/studio/e2e/import-improve.spec.ts` header blocker). If live: remove inner `.skip`, run green. If not: leave `.skip`, document in the PR that lane 2 is blocked on Track 2 import and close #410 AC#3 as `refs #410` (lane 1 only), NOT by stubbing lane 2 green (FR-007 scenario 2)

**Checkpoint**: Lane 1 green; lane 2 green-or-documented-blocked. Part (a) / #410 closure decision made (`closes` if both green, else `refs`).

---

## Phase 6: User Story 4 - Legacy loader + full flows retired (Priority: P3) — SEPARATE PR

**Goal**: Delete the legacy delivery forms only, after parity is proven. Must revert independently of part (a).

**Independent Test**: nothing imports `loadFlow`/`parseFlow`; full suite green (every module still compiles, including unreferenced library modules); reverting only this change restores the YAML without touching the cut-over components.

> **Gate**: Do NOT start until US1 parity (T017) is green and merged. Land as a distinct commit/PR (FR-013).

### Implementation for User Story 4

- [ ] T023 [US4] Delete `packages/studio/src/survey/loadFlow.ts` and `packages/studio/src/survey/loadFlow.test.ts`
- [ ] T024 [P] [US4] Delete the four legacy full-flow YAMLs: `content/flows/phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml` (retain all `*.modular.yaml` and `_examples/*`)
- [ ] T025 [US4] In `flow-parity.test.ts`, remove the now-baseline-less `parseFlow`-vs-`loadModularFlow` assertions (the legacy side no longer exists) and replace with a **snapshot** pin of each surviving modular `FlowDef` (contracts/flow-output-parity.md "Post-deletion")
- [ ] T026 [US4] Verify retirement: `grep -rn "loadFlow\|parseFlow" packages/studio/src/` is clean; `pnpm --filter @keyboard-studio/studio test` full suite green; confirm **no question module file was deleted** (§3.8 no-delete) — spot-check that non-Roman-script research modules still exist and their tests pass
- [ ] T027 [US4] Confirm independent revertability: reverting only the part-(b) commit restores `loadFlow.ts` + the four YAMLs and leaves PhaseA/F/IdentityLite on `loadModularFlow` (the cutover stays intact)

**Checkpoint**: Single loader in the tree; redundant delivery forms gone; research preserved.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Update `docs/survey-modularity-cyoa-plan.md` P3 status line (mark P3 implemented / in-progress with branch) and the #410 AC#3 note
- [ ] T029 [P] Reconcile issue #410 acceptance-criteria checkboxes against what shipped (AC#1/#2 already done; AC#3 lane status per T021/T022); use `closes #410` only if both lanes green, else `refs #410`
- [ ] T030 Run the full `quickstart.md` validation (parts a and b) end-to-end as the final acceptance pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: after Setup. Blocks parity verification of US1.
- **US2 (Phase 3, P1)**: after Setup; independent of the harness. Enables the identity-lite leg of US1.
- **US1 (Phase 4, P1)**: A/F legs (T014/T015) depend only on Foundational; identity-lite leg (T016) depends on US2 (T009, T010). T017 depends on T016.
- **US3 (Phase 5, P2)**: after US1 (the flows it drives must be cut over). Lane 2 additionally gated on external Track 2 liveness.
- **US4 (Phase 6, P3)**: after US1 parity (T017) merged. Separate PR.
- **Polish (Phase 7)**: after the desired stories complete.

### Critical cross-story dependency

```
US2 (il_* modules + identity_lite.modular.yaml)  ──►  T016 (IdentityLite cutover)  ──►  T017 (identity-lite parity)  ──►  US4 deletion
A/F legs (T014/T015) depend only on T003, not on US2.
```

### Parallel Opportunities

- T004–T008 (the 5 `il_*` modules) are all `[P]` — different files, no interdeps.
- T012 (5 mirrored tests) `[P]` with each other.
- T014 and T015 (PhaseA / PhaseF cutover) are `[P]` — different files; T016 is not (depends on US2).
- T024 `[P]` (independent file deletes); T028/T029 `[P]`.

---

## Parallel Example: User Story 2 module authoring

```bash
# Author all 5 il_* modules together (different files):
Task: "Author il_language_autonym.ts"
Task: "Author il_language_english.ts"
Task: "Author il_language_code.ts"
Task: "Author il_target_script.ts"
Task: "Author il_script_not_supported.ts"
# Then T009 registers them (single shared file — sequential).
```

---

## Implementation Strategy

### MVP (part a)

1. Setup (T001–T002) → Foundational harness (T003).
2. US2 (T004–T013): the 5 modules + manifest + gates — the identity-lite enabler.
3. US1 (T014–T019): cut over all three components, prove parity. **STOP & VALIDATE** — this is the shippable #410 tail.
4. US3 (T020–T022): E2E lanes; decide `closes` vs `refs #410`.

### Follow-up (part b, separate PR)

5. US4 (T023–T027): retire legacy loader + YAML, snapshot-pin survivors, confirm independent revert.
6. Polish (T028–T030): docs, issue reconciliation, quickstart.

---

## Notes

- `[P]` = different files, no incomplete-task deps.
- Every edit MUST preserve explicit `.ts`/`.tsx` import extensions (bundler resolution; plan Constraints).
- Commit part (a) and part (b) separately (FR-013); part (b) must revert without disturbing the cutover.
- No `Pattern`/`KeyboardIR`/contract change; `mutate` stays a stub. New modules declare empty `inputs`/`writes`.
- §3.8 no-delete: part (b) deletes delivery forms only — never a question module.
