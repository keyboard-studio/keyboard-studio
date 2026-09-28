# Tasks: carve suppression — carved key combinations get an explicit allow/block fate (issue #1802)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Branch**: `km/issue-1802-spec`

One user story (US6, P1). Organized Setup → Foundational → US6 → Polish, with explicit waves: tasks in one wave touch different files and are independent (`[P]`); a `⟶` join line marks where work must wait.

## Phase 1: Setup

- [ ] **T001** [US6] Confirm green baseline: monorepo builds and the engine + studio suites pass before changes · repo root (`pnpm -r build`, `pnpm vitest run` in `packages/engine`, `packages/studio`)

## Phase 2: Foundational — codec closure + shared types (BLOCKS all story work)

**Wave 1 — independent (different files):**

- [ ] **T002** [P] [US6] Codec parses typed `nul` / `context` / `context(N)` in output position and `context(N)` (N>1) in context position (FR-004) · `packages/engine/src/codec/parse.ts`
- [ ] **T003** [P] [US6] Add `ownedByBehaviour` (additive optional, mutually exclusive with `ownedByPattern`) to `IRRule` + zod schema drift guard (FR-002) · `packages/contracts/src/keyboard-ir.ts`
- [ ] **T004** [P] [US6] Add `CarveDisposition` type (`comboId`, `disposition: block | allow-host`, `provenance`) (FR-022) · `packages/contracts/src/carveDisposition.ts` (new)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — depends on Wave 1:**

- [ ] **T005** [US6] Codec emits typed `nul` / `context` canonically and models the `begin` entry-point set on the IR header (`NewContext`/`PostKeystroke` readonly, never reorder hooks) (FR-004) · `packages/engine/src/codec/emit.ts`
- [ ] **T006** [US6] FR-004 round-trip fixtures: every typed form plus a two-entry-group keyboard, parse→emit identity · `packages/engine/src/codec/` fixtures + tests
- [ ] **T007** [US6] Compiler error on `nul` with text-bearing context output (extends FR-009/FR-014) · existing output-position validation next to FR-009

## Phase 3: User Story 6 — carved combinations: allow host fallback or block (P1)

### Tests (write first, fail first)

- [ ] **T008** [US6] Failing shape-matrix tests: verb per LHS shape (bare-key→`nul`, text-context→`context`, deadkey-only→`nul`, mixed→`context`, carved last-consumer→`nul`), loud appends `beep` (never bare), ownership marker on every emitted rule, un-carve restores originals, deadkey carves never fall through — simulator-backed · `packages/engine/src/pattern-apply/carveSuppression.test.ts` (new)

### Implementation

**Wave 1 — independent (different files):**

- [ ] **T009** [P] [US6] `compileCarveSuppression(ir, dispositions, { loud })`: verb table (FR-020), in-place rewrite at the rule's shadowing position, `ownedByBehaviour: "carve-suppression"` on every emitted rule (FR-019/FR-021) · `packages/engine/src/pattern-apply/carveSuppression.ts` (new)
- [ ] **T010** [P] [US6] `workingCopyStore.carveDispositions`: pre-fill from closed-keyboard card state with provenance (card accepted→block, declined→allow-host, no state→FR-005 proposal rule with `bulk-default`), per-row override, recompile reads without re-prompting, un-carve deletes (FR-022) · `packages/studio/src/store/workingCopyStore.ts`
- [ ] **T011** [P] [US6] Reference host-layout data module: US / US-International / AZERTY / QWERTZ printable-layer maps, source + extraction date recorded (FR-023) · `packages/studio/src/lib/referenceHostLayouts.ts` (new)
- [ ] **T012** [P] [US6] Track 2 import recogniser lifts `ownedByBehaviour: "carve-suppression"` rules as behaviour-owned — marker alone, no shape heuristics; never author content nor carve targets (FR-021/FR-012) · `packages/engine/src/recognizer/` (+ tests)

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — extends Wave 1:**

- [ ] **T013** [US6] Guard-rule synthesis for store-slot carves: reproduce context up to the trigger, place immediately ahead of the paired `any()`/`index()` rule, ownership-marked; interior `nul` store padding stays forbidden (scenario 5) · `packages/engine/src/pattern-apply/carveSuppression.ts`
- [ ] **T014** [US6] `swallowUndefined` skip-set predicate: carved combos enter the swallow set except `allow-host` dispositions and combos covered by suppression-owned rules (FR-005 amendment; stub-enumeration tests, full FR-005 not built here) · `packages/engine/src/pattern-apply/carveSuppression.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — integration + studio surfaces (independent files):**

- [ ] **T015** [US6] Compose suppression into both carve paths — `applyCarveToVfs` and the studio `editorMutate` seam run filter → slot removals → suppression (byte-identical across paths) · `packages/engine/src/pattern-apply/applyCarveToVfs.ts`, `packages/studio/src/lib/projectWorkingCopyVfs.ts`
- [ ] **T016** [P] [US6] Gallery row disposition control: visible Allow/Block, pre-filled with provenance label, overridable in place (A1) · `packages/studio/src/editors/carve/CarveGalleryV2.tsx`
- [ ] **T017** [P] [US6] "Review removed keys" panel: every carved combination with disposition + cross-host consequence, ending in the two-sided verdict line · `packages/studio/src/editors/carve/ReviewRemovedKeys.tsx` (new)
- [ ] **T018** [P] [US6] Test-pane host-layout selector (US, US-International, AZERTY, QWERTZ, blocked) for carved combinations; Block uniform "nothing"; KeymanWeb loud-Block flashes (FR-023) · Behaviours step test pane (076 plan phase 5 location)

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — copy and touch (extends Wave 3):**

- [ ] **T019** [US6] Expanded row: host-consequence table per disposition, example-layouts caption, "do your typists expect a character on this key?", per-option risk copy; assert the slogan "allow unpredictable / block predictable" appears nowhere (A2, FR-023) · `packages/studio/src/editors/carve/CarveGalleryV2.tsx`
- [ ] **T020** [US6] Touch strip keycap consequence ("removed from the touch layout" default; "kept, does nothing" under keep-inert override) (scenario 12) · Behaviours step touch strip (076 plan phase 5 location)

**Checkpoint**: US6 is independently functional — carve on a non-Latin base yields owned, shape-correct suppression rules; rows pre-fill to Block; one row flips to Allow host and leaves the swallow sets; un-carve restores everything; the gallery demonstrates all four hosts.

## Phase 4: Polish

- [ ] **T021** [P] [US6] Layer B shadowing audit: guard rules ahead of paired rules neither shadow nor are shadowed by author-modified rules; deterministic placement, remainder reported · `packages/engine/src/validator/`
- [ ] **T022** [P] [US6] `sil_cameroon_qwerty` regression per the ruling verification plan (single RALT layer; two-level RALT+SHIFT; touch-layer variants) · engine scenario tests
- [ ] **T023** [US6] Playwright: Latin sparse-overlay flow (allow-host default, A2 banner) and Arabic flow (block default, one row flipped) · e2e
- [ ] **T024** [US6] `spec-trace check` clean (only acknowledged drift); fixture keyboards cited get a [docs/keyboard-index.md](../../docs/keyboard-index.md) row (FR-018)

## Dependencies & Execution Order

Setup → Foundational → US6 → Polish. Within Foundational: Wave 1 (T002, T003, T004) → Wave 2 (T005, T006, T007). Within US6: tests T008 first; Wave 1 (T009, T010, T011, T012) → Wave 2 (T013, T014) → Wave 3 (T015, T016, T017, T018) → Wave 4 (T019, T020); then the Checkpoint. Polish tasks T021/T022 are independent of each other; T023 needs the studio surfaces (Wave 3+); T024 closes.
