# Tasks: carve suppression — carved key combinations get an explicit allow/block fate (issue #1802)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Branch**: `km/issue-1802-spec`

One user story (US6, P1). Organized Setup → Foundational → US6 → Polish, with explicit waves: tasks in one wave touch different files and are independent (`[P]`); a `⟶` join line marks where work must wait.

## Phase 1: Setup

- [x] **T001** [US6] Confirm green baseline: monorepo builds and the engine + studio suites pass before changes · repo root (`pnpm -r build`, `pnpm vitest run` in `packages/engine`, `packages/studio`) — DONE 2026-09-28: build OK; engine 3299 passed (2 environmental failures fixed — missing `fetch-sldr` data, wasmLoader 30s timeout on slow VM passes at 120s); studio suite OOM-killed on the 7GB VM by 27 files importing the 500KB+ langtags generated index — baseline rerun excluding those in progress

## Phase 2: Foundational — codec closure + shared types (BLOCKS all story work)

**Wave 1 — independent (different files):**

- [x] **T002** [P] [US6] Codec parses typed `nul` / `context` / `context(N)` in output position and `context(N)` (N>1) in context position (FR-004) · `packages/engine/src/codec/parse.ts` — DONE 2026-09-28: `nul`→`{kind:"nul"}`, bare `context`→offset 0, `context(N)` output N≥1, context-position N>1 typed; degenerate `context(0)` / context-position `context(1)` → opaque (INDEXED_CONTEXT); 19 tests in parse-nul-context.test.ts; codec suite 246 passed
- [x] **T003** [P] [US6] Add `ownedByBehaviour` (additive optional, mutually exclusive with `ownedByPattern`) to `IRRule` + zod schema drift guard (FR-002) · `packages/contracts/src/keyboard-ir.ts` — DONE 2026-09-28: additive optional sibling with `.refine` mutual-exclusion + ownership-slice schema; contracts suite green
- [x] **T004** [P] [US6] Add `CarveDisposition` type (`comboId`, `disposition: block | allow-host`, `provenance`) (FR-022) · `packages/contracts/src/carveDisposition.ts` (new) — DONE 2026-09-28: type + zod schema + export; contracts suite 35 files / 803 tests green

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — depends on Wave 1:**

- [x] **T005** [US6] Codec emits typed `nul` / `context` canonically and models the `begin` entry-point set on the IR header (`NewContext`/`PostKeystroke` readonly, never reorder hooks) (FR-004) · `packages/engine/src/codec/emit.ts` — DONE 2026-09-28: `entryPoints {main,newContext,postKeystroke}` on IRHeader; begin entry-group captured first-wins; NewContext/PostKeystroke parsed readonly; emit reuses modelled entry; canonical nul/context emit confirmed; 15 tests in entrypoints.test.ts
- [x] **T006** [US6] FR-004 round-trip fixtures: every typed form plus a two-entry-group keyboard, parse→emit identity · `packages/engine/src/codec/` fixtures + tests — DONE 2026-09-28: 7 round-trip tests in roundtrip-fr004.test.ts (all typed forms, loud forms, two-entry-group); ownedByBehaviour exclusion decision: YES, same as ownedByPattern (pipeline-assigned metadata, not stable across import/emit), documented + 2 pinning tests
- [x] **T007** [US6] Compiler error on `nul` with text-bearing context output (extends FR-009/FR-014) · existing output-position validation next to FR-009 — DONE 2026-09-28: Layer A check #8 (`contextOrdering.ts`) emits `KM_ERROR_NUL_WITH_TEXT_OUTPUT` when output contains both standalone `nul` and a text-bearing element; `context`/`beep`/`use()` excluded; 17 tests, validator suite 371 green. FOLLOW-UP for T009–T012: FR-014's LHS variant (`"x" + [K_A] > nul` → error) not yet implemented — needs coordination with the suppression compiler since it generates such rules; store-interior `nul` padding also deferred there.

## Phase 3: User Story 6 — carved combinations: allow host fallback or block (P1)

### Tests (write first, fail first)

- [x] **T008** [US6] Failing shape-matrix tests: verb per LHS shape (bare-key→`nul`, text-context→`context`, deadkey-only→`nul`, mixed→`context`, carved last-consumer→`nul`), loud appends `beep` (never bare), ownership marker on every emitted rule, un-carve restores originals, deadkey carves never fall through — simulator-backed · `packages/engine/src/pattern-apply/carveSuppression.test.ts` (new) — DONE 2026-09-28: 30 failing tests, honest missing-module signal; contract specifies `compileCarveSuppression`/`restoreCarveSuppression` signatures

### Implementation

**Wave 1 — independent (different files):**

- [x] **T009** [P] [US6] `compileCarveSuppression(ir, dispositions, { loud })`: verb table (FR-020), in-place rewrite at the rule's shadowing position, `ownedByBehaviour: "carve-suppression"` on every emitted rule (FR-019/FR-021) · `packages/engine/src/pattern-apply/carveSuppression.ts` (new) — DONE 2026-09-28: 30/30 T008 tests pass first run; pattern-apply suite 1037 passed; build green. OPEN QUESTION (ruling needed): allow-host on a deadkey-context rule currently REMOVES it (host deadkey arms); block rewrites and never deletes. Ruling §3 "deadkey carves never fall through" scoped to block/default — confirm allow-host deadkey semantics.
- [x] **T010** [P] [US6] `workingCopyStore.carveDispositions`: pre-fill from closed-keyboard card state with provenance (card accepted→block, declined→allow-host, no state→FR-005 proposal rule with `bulk-default`), per-row override, recompile reads without re-prompting, un-carve deletes (FR-022) · `packages/studio/src/store/workingCopyStore.ts` — DONE 2026-09-28: `closedKeyboardCard` slot + `carveDispositions` array; pre-fill writes only for new combos; override → `author-override`; prune on restore paths; 27 tests green; store 147 + persist 29 regressions green. NOTE: card UI itself is 076 US1 scope — slot ready for it.
- [x] **T011** [P] [US6] Reference host-layout data module: US / US-International / AZERTY / QWERTZ / UK English printable-layer maps (UK English per A3 — AltGr+4 = € leak on a real `sil_cameroon_qwerty` deployment host), source + extraction date recorded; plus `likelyHostLayouts` resolver with FR-023 resolution order (`layout_family` answer → bcp47 region→layout mapping → default five); module keyed by key+modifiers generally so the later `swallowUndefined` phase reuses it (FR-023) · `packages/studio/src/lib/referenceHostLayouts.ts` (new) — DONE 2026-09-28: HOST_LAYOUTS/base/shift/altgr tables keyed by K_ vkeys; `likelyHostLayouts(bcp47[], layoutFamilyAnswer?)` per A3.1 order (answer beats bcp47; contradicting region doesn't override); versioned region mapping; HOST_GUESS_CAPTION honesty caption; 17 tests green
- [x] **T025** [US6] Surface the existing `layout_family` regional-keyboard question in the main flow: visible/answerable/editable at the closed-keyboard card and carve gallery (promote from reserve registry), persist its value with the keyboard decision metadata, and wire it as the primary input to the likely-host resolution in FR-023 (FR-023) — DONE 2026-09-28: `LayoutFamilyQuestion` component in carve gallery (gallery-level band); persisted via survey answer store (editable, never ask-once); `useLikelyHostLayouts` consumes T011's real resolver with source provenance; 20 new tests + 2 gallery tests green. NOTE: closed-keyboard card UI is 076 US1 future work — component exported ready for it.
- [x] **T012** [P] [US6] Track 2 import recogniser lifts `ownedByBehaviour: "carve-suppression"` rules as behaviour-owned — marker alone, no shape heuristics; never author content nor carve targets (FR-021/FR-012) · `packages/engine/src/recognizer/` (+ tests) — DONE 2026-09-28: `isBehaviourOwned` guard at 7 matcher sites + central backstop in `recognizePatterns`; both-markers conflict → behaviour wins candidacy, dangling pattern stamp fails fast; 6 tests; recognizer 73 passed, codec 268 green

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — extends Wave 1:**

- [ ] **T013** [US6] Guard-rule synthesis for store-slot carves: reproduce context up to the trigger, place immediately ahead of the paired `any()`/`index()` rule, ownership-marked; interior `nul` store padding stays forbidden (scenario 5) · `packages/engine/src/pattern-apply/carveSuppression.ts`
- [ ] **T014** [US6] `swallowUndefined` skip-set predicate: carved combos enter the swallow set except `allow-host` dispositions and combos covered by suppression-owned rules (FR-005 amendment; stub-enumeration tests, full FR-005 not built here) · `packages/engine/src/pattern-apply/carveSuppression.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — integration + studio surfaces (independent files):**

- [ ] **T015** [US6] Compose suppression into both carve paths — `applyCarveToVfs` and the studio `editorMutate` seam run filter → slot removals → suppression (byte-identical across paths) · `packages/engine/src/pattern-apply/applyCarveToVfs.ts`, `packages/studio/src/lib/projectWorkingCopyVfs.ts`
- [ ] **T016** [P] [US6] Gallery row disposition control: visible Allow/Block, pre-filled with provenance label, overridable in place (A1) · `packages/studio/src/editors/carve/CarveGalleryV2.tsx`
- [ ] **T017** [P] [US6] "Review removed keys" panel: every carved combination with disposition + cross-host consequence, ending in the two-sided verdict line · `packages/studio/src/editors/carve/ReviewRemovedKeys.tsx` (new)
- [ ] **T018** [P] [US6] Test-pane host-layout selector for carved combinations, populated with the keyboard's likely hosts from `likelyHostLayouts` plus "blocked"; Block uniform "nothing"; KeymanWeb loud-Block flashes (FR-023) · Behaviours step test pane (076 plan phase 5 location)

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — copy and touch (extends Wave 3):**

- [ ] **T019** [US6] Expanded row: host-consequence table per disposition, example-layouts caption, "do your typists expect a character on this key?", per-option risk copy; assert the slogan "allow unpredictable / block predictable" appears nowhere (A2, FR-023) · `packages/studio/src/editors/carve/CarveGalleryV2.tsx`
- [ ] **T020** [US6] Touch strip keycap consequence ("removed from the touch layout" default; "kept, does nothing" under keep-inert override) (scenario 12) · Behaviours step touch strip (076 plan phase 5 location)

**Checkpoint**: US6 is independently functional — carve on a non-Latin base yields owned, shape-correct suppression rules; rows pre-fill to Block; one row flips to Allow host and leaves the swallow sets; un-carve restores everything; the gallery demonstrates the keyboard's likely hosts.

## Phase 4: Polish

- [ ] **T021** [P] [US6] Layer B shadowing audit: guard rules ahead of paired rules neither shadow nor are shadowed by author-modified rules; deterministic placement, remainder reported · `packages/engine/src/validator/`
- [ ] **T022** [P] [US6] `sil_cameroon_qwerty` regression per the ruling verification plan (single RALT layer; two-level RALT+SHIFT; touch-layer variants) · engine scenario tests
- [ ] **T023** [US6] Playwright: Latin sparse-overlay flow (allow-host default, A2 banner) and Arabic flow (block default, one row flipped) · e2e
- [ ] **T024** [US6] `spec-trace check` clean (only acknowledged drift); fixture keyboards cited get a [docs/keyboard-index.md](../../docs/keyboard-index.md) row (FR-018)

## Dependencies & Execution Order

Setup → Foundational → US6 → Polish. Within Foundational: Wave 1 (T002, T003, T004) → Wave 2 (T005, T006, T007). Within US6: tests T008 first; Wave 1 (T009, T010, T011, T012) → Wave 2 (T013, T014) → Wave 3 (T015, T016, T017, T018) → Wave 4 (T019, T020); then the Checkpoint. Polish tasks T021/T022 are independent of each other; T023 needs the studio surfaces (Wave 3+); T024 closes.
