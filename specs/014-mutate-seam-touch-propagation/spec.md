# Feature Specification: KeyboardIR `mutate` seam + touch propagation

**Feature Branch**: `km/mutate-seam-touch-propagation`

**Created**: 2026-06-28

**Status**: **Ready / gate cleared per PR #822** — the engine mutation contract (#5b/#232) ratified and merged to main on 2026-06-28 (`@keyboard-studio/contracts` 0.12.0; §18 sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md)). The former DESIGN-ONLY / BLOCKED gate (below) is **CLEARED**; the spec was re-validated against the ratified `KeyboardIR`/`TouchKeyIR` shape on 2026-06-28 (T000). Implementation tasks T003–T018 are ungated.

**Input**: User description: KeyboardIR `mutate` seam + touch propagation — **Phase 5 (P5)** of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) (§6 P5, with the architecture in §3.3 `inputs`/`writes`/`IRPath`, §3.5 staleness/completeness invariants, §3.6 carve/add shell + per-key touch provenance + `touchSuggest` defaults-as-data policy, §8 risks). P5 implements the question-module `mutate()` write surface, routes the strategy-bearing question modules and the carve/add shell through it, promotes per-key touch provenance onto `TouchKeyIR`, and wires automatic touch re-propagation off the P4b staleness slice. **This is the phase that finally closes the four-forms STATE fork** (answer-store vs. direct-IR-mutation; §1) by unifying both into one write surface.

**Governing scope**: This feature implements **Phase 5 (P5)** of the Survey Modularity + CYOA Refactor plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 "P5 — KeyboardIR `mutate` seam + touch propagation"), operationalizing the §3.3 declared-`inputs`/`writes` contract into executed IR writes, the §3.6 per-key provenance / `touchSuggest` propagation, and the §3.5 staleness-driven re-propagation. It does **not** re-derive that scope. P2 ([specs/010-irpath-inputs-writes](../010-irpath-inputs-writes/spec.md)) and P4a/P4b ([specs/012-step-model-manifest](../012-step-model-manifest/spec.md)) are landed prerequisites this feature builds on; P3b ([specs/013-retire-legacy-flow-loader](../013-retire-legacy-flow-loader/spec.md)) is landed.

> **DEPENDENCY GATE — CLEARED 2026-06-28 (was: `/speckit-plan` MUST NOT run until #5b/#232 land; resolved Q1=A).** This was a **design-only** specification until the engine mutation contract (#5b / #232) ratified the executable `KeyboardIR` mutation surface. That contract **landed in PR #822** (merged to main; `@keyboard-studio/contracts` 0.12.0): `QuestionModule.mutate?(value, ctx: MutateContext): Partial<KeyboardIR>` is activated at the type level in `survey/types.ts`, and `TouchKeyIR.provenance?: TouchKeyProvenance` + its zod mirror are landed in `packages/contracts`. The spec was re-validated against the *ratified* contract shape on 2026-06-28 (T000) — all 5 non-empty-`writes` `IRPath`s resolve cleanly to the ratified `KeyboardIR`/`IRHeader` shape, so the §8-named `writes`/IR-shape risk is confirmed mitigated. `plan.md`/`tasks.md` are now valid and the tasks are ungated.

> **Note on technical content in this spec (deliberate).** Like P4 ([specs/012-step-model-manifest](../012-step-model-manifest/spec.md)), P5 is principally an **architectural** change — it unifies two write paths into one and adds a safe, provenance-aware propagation contract. Per author direction and repository convention (where `packages/contracts` types and the `IRPath` algebra are architectural **contracts** and extracted `specs/NNN/` folders carry real contract material), the non-obvious architectural constraints — the pure `mutate()` shape, the declared-`writes` containment assertion, idempotency, the provenance promotion onto `TouchKeyIR`, the no-clobber re-propagation rule, and the global rollback flag — are specified here as Functional Requirements and Success Criteria. The *mechanics* (exact reducer wiring, per-module codemod, contract version-bump packaging, the real per-spine-prefix validator implementation) remain plan-level.

## Clarifications

### Session 2026-06-28

All eight clarifications below were pre-resolved and approved by Matthew Lee (recommended answers accepted). They are baked into the requirements; **no `[NEEDS CLARIFICATION]` markers remain**.

- Q1 — **Dependency gate** → A: **Design-only, marked BLOCKED** on the engine mutation contract #5b/#232. The spec is complete and reviewable now; `/speckit-plan` MUST NOT run until #5b/#232 land. Stated as a precondition prominently above and in FR-001 / Assumptions.
- Q2 — **Provenance home** → A: **Promote per-key touch provenance onto `TouchKeyIR` in `packages/contracts`** (the §3.6-anticipated field). The editor-layer `TouchKeyProvenance` (`editors/assignLoop/provenance.ts`) becomes a **re-export** of the contracts type. This implies a **contracts MAJOR version bump (per §3.6)** and a §18 joint-session / coordination note. Provenance MUST survive IR serialize / round-trip (required by the no-clobber AC).
- Q3 — **`mutate()` shape** → A: **Pure** — `mutate()` returns a `Partial<KeyboardIR>` patch that the reducer applies; it **runtime-asserts it touches only the module's declared `writes` paths**; it is **idempotent on re-apply**.
- Q4 — **Scope of write surfaces** → B: Convert the **carve/add shell + all question modules with non-empty `writes` (the 5 identity/header writers)** to route through `mutate()`. **Display-only questions stay no-op**; answer-store-only / identity-metadata modules are **out of scope**. Note that the genuinely strategy-bearing IR writes (carve/mechanism/touch) live in the `editors/` carve/add shell (the separate FR-006a prong), not in the question modules; the 5 non-empty-`writes` modules are identity/header writers (`a/iso_code.ts` → header.bcp47, `a/primary_script.ts` → header.bcp47, `a/language_name_english.ts` → header.name, `a/pa_copyright_holder.ts` → header.copyright, `b/pb_standard_letters.ts` → stores). The direct `workingCopyStore` gallery mutations being retired are listed explicitly (Key Entities + FR-006).
- Q5 — **Re-propagation** → A: **Automatic on physical-lock / step-completion**, driven by the **P4b staleness slice** (`staleSteps` root-set + completeness fixpoint): re-run `touchSuggest` over `base-derived` / `physical-suggested` keys only, overwrite those, **never `hand-set`**. Follow-up resolved **yes**: a user edit on a `physical-suggested` key **promotes it to `hand-set`** so future re-propagation never clobbers it.
- Q6 — **Flag** → A: **Single global flag** gates `mutate()`. On → `mutate` is the write path. Off → today's declared-only seam; off-state output MUST be **byte-identical to P4b**. This is the rollback mechanism.
- Q7 — **Test strategy** → A: **Reuse existing IR fixtures** as `mutate` round-trip inputs; add a small set of **provenance-tagged touch-layout fixtures** for the no-clobber tests, in the established mirror test tree (`packages/studio/tests/survey/questions/<phase>/<id>.test.ts`). Per-question unit tests assert: applies `mutate` to a known IR fixture, writes exactly the declared `writes` paths and nothing else, idempotent, respects provenance.
- Q8 — **Scope boundaries** → OUT: publishing paths, the flow-map editor (spec 009), touch-first / reverse touch→physical authoring (Constitution Art. VII), deleting library/reserve modules. **IN (resolving 012's deferral): wire the real per-spine-prefix validator** in P5 — 012 shipped only a structural proxy (its FR-017) and reserved real validation "for P5."

### Session 2026-06-28 (`/speckit-clarify` pass — residual ambiguities)

These three were surfaced by the `/speckit-clarify` taxonomy scan after the pre-resolved Q1–Q8 above and were resolved with recommended answers (approved by Matthew Lee). They tighten the patch-application, re-propagation-batching, and assertion-failure semantics the earlier set left implicit; none reopens Q1–Q8.

- Q9 — **Patch merge semantics** → A: **Path-scoped deep merge at exactly the declared `writes` paths.** The reducer applies the `Partial<KeyboardIR>` patch by writing each value to its declared `IRPath` location only; it does **not** shallow-replace top-level branches, so siblings under a shared parent (e.g. other keys/layers under `touchLayout`) are preserved. (Rationale: a shallow top-level merge would clobber sibling nested IR and violate both FR-003 declared-`writes` containment and the US2 no-clobber rule; `IRPath` is already a per-path algebra.)
- Q10 — **Re-propagation batching when multiple steps are stale** → A: **Single coalesced pass over the union of the staleness closure.** When one physical change makes several steps stale, re-propagation runs **once** over the unioned `staleSteps` closure rather than once per stale step, so no derived key is re-suggested more than once per change. (Rationale: matches §3.5 fixpoint-closure semantics and the Article IV single-validation-path stance; preserves the FR-004 idempotency / no-double-write guarantee.)
- Q11 — **Assertion-failure behavior (flag on)** → A: **Fail-fast — reject the entire patch and surface the error; in all builds, not dev-only.** A `mutate()` patch that touches any path outside the module's declared `writes` is rejected whole (no partial apply), the failure is raised/surfaced (never swallowed), and the IR is left unchanged for that step. (Rationale: "rejected, not silently merged" + Constitution Art. II "never silently dropped"; a dev-only assert would let an out-of-shape write reach the working copy in production, the §8 risk this guards.)

## User Scenarios & Testing *(mandatory)*

> The "users" here are the studio engineering and content teams (who gain one write surface instead of two forks) and the keyboard author running the survey (whose manual touch edits must never be silently overwritten when they revisit a physical decision). Each story is independently testable and independently valuable.

### User Story 1 - One write surface: `mutate()` replaces the direct-IR fork (Priority: P1)

A developer (or the survey runtime) writes to the `KeyboardIR` through **exactly one** path — the question module's `mutate()` — for every in-scope surface, instead of the current split where answer-bearing questions flow to `workingCopyStore` as survey results while the galleries mutate the `KeyboardIR` directly. The four-forms **state fork** is closed.

**Why this priority**: This is the headline deliverable and the reason P5 exists. P4 closed the *ordering/map* fork; the *state* fork (answer-store vs. direct-IR-mutation, §1) persists until `mutate()` is the single executed write surface. Everything else in this feature (propagation safety, the rollback flag, the validator) hangs off this one path existing.

**Independent Test**: Take an in-scope question module (e.g. one of the 5 identity/header writers with non-empty `writes`) and a known `KeyboardIR` fixture; apply its `mutate()`; confirm the resulting IR differs **only** at the module's declared `writes` paths and that the carve/add shell's edits — which carry the strategy-bearing carve/mechanism/touch writes (FR-006a) — land through the same `mutate()` path rather than calling `workingCopyStore` mutators directly.

**Acceptance Scenarios**:

1. **Given** the flag is on and an in-scope question module, **When** the survey reducer applies its result, **Then** the IR is updated **only** via that module's `mutate()` returning a `Partial<KeyboardIR>` patch the reducer applies as a **path-scoped deep merge at the declared `writes` paths** (siblings preserved) — no in-scope surface writes the IR by any other route.
2. **Given** the carve/add shell (carve remove-mode + the add galleries), **When** the author makes an edit, **Then** that edit is expressed as a `mutate()` patch routed through the reducer, and the direct `workingCopyStore` gallery mutators it replaces (`deleteNode`/`restoreNode`/`deleteItem`/`restoreItem`/`restoreAll`/`keepAll` and the add-gallery's selected-pattern writes) are no longer the IR write path for in-scope surfaces.
3. **Given** a display-only question (empty `writes`) or an answer-store-only / identity-metadata module, **When** it completes, **Then** it performs **no** IR `mutate()` (it stays a no-op) and is out of P5 scope.
4. **Given** any in-scope `mutate()`, **When** it produces a patch that would touch a path **outside** the module's declared `writes`, **Then** the **runtime assertion fails fast in all builds** — the **entire** patch is rejected (no partial apply), the IR is left unchanged for that step, and the failure is surfaced (not silently merged or swallowed).

---

### User Story 2 - A physical change re-suggests only derived touch keys and never clobbers manual edits (Priority: P1)

When the author revisits and changes a physical decision (breaking the physical lock / completing a physical step), the touch surface automatically re-derives — but only the keys it owns. Keys the author placed or edited by hand are **never** overwritten.

**Why this priority**: This is the correctness guarantee that makes cycle-back safe and the explicit P5 acceptance criterion in the plan. Without provenance-gated re-propagation, the first re-derivation after a physical edit would silently destroy the author's hand-set touch work — the exact §8 risk the provenance reservation in P4a was created to prevent.

**Independent Test**: Build a provenance-tagged touch-layout fixture mixing `base-derived`, `physical-suggested`, and `hand-set` keys; trigger re-propagation off a physical-step completion; confirm `base-derived` and `physical-suggested` keys are overwritten by the fresh `touchSuggest` output while every `hand-set` key is byte-identical to before.

**Acceptance Scenarios**:

1. **Given** a physical lock is broken or a physical step completes, **When** re-propagation runs, **Then** it is **automatic** — driven by the P4b staleness slice (`staleSteps` root-set + completeness fixpoint) — and re-runs `touchSuggest` over the affected `base-derived` / `physical-suggested` keys only.
2. **Given** re-propagation runs, **When** it overwrites touch keys, **Then** it overwrites **only** `base-derived` and `physical-suggested` keys and **never** a `hand-set` key.
3. **Given** a key currently tagged `physical-suggested`, **When** the author manually edits it, **Then** that key is **promoted to `hand-set`** so future re-propagation will not clobber it.
4. **Given** a touch surface that has never been hand-edited, **When** a physical change re-propagates, **Then** the derived keys update and no error occurs (the empty-hand-set case is the trivial pass).

---

### User Story 3 - Per-key touch provenance lives on the contract and survives round-trip (Priority: P2)

The per-key provenance tag is promoted from the inert editor-layer reservation onto `TouchKeyIR` in `packages/contracts`, so it is part of the persisted IR, survives serialize/round-trip, and is the single source the no-clobber rule reads.

**Why this priority**: The no-clobber guarantee (US2) is only sound if provenance is durable across save/load. A tag that lives only in the editor layer or is dropped at serialization would let a reload reset every key to its default and make the first post-reload propagation destructive. It is P2 because it is the enabling contract for US2 rather than a user-visible behavior on its own.

**Independent Test**: Round-trip a `KeyboardIR` containing provenance-tagged touch keys through serialize→deserialize; confirm every key's provenance tag is preserved exactly, and confirm the editor-layer `TouchKeyProvenance` is now a re-export of the contracts type (no second definition).

**Acceptance Scenarios**:

1. **Given** `TouchKeyIR`, **When** the contract is updated, **Then** each touch key carries a provenance tag (`base-derived` / `physical-suggested` / `hand-set`) as a contract field, and pre-existing / untagged keys default to `hand-set` (conservative — never auto-overwritten).
2. **Given** a `KeyboardIR` with provenance-tagged touch keys, **When** it is serialized and deserialized, **Then** every provenance tag survives the round-trip unchanged.
3. **Given** the editor layer, **When** it references `TouchKeyProvenance`, **Then** that symbol is a **re-export** of the contracts type (single source of truth), not a parallel definition.
4. **Given** the provenance promotion, **When** the change is packaged, **Then** it is delivered as part of the **`packages/contracts` MAJOR version bump** (per §3.6) with a §18 joint-session / coordination note, not an additive-minor change.

---

### User Story 4 - A global flag makes the whole seam reversible (Priority: P2)

A developer can turn the `mutate()` write path off with a single global flag, falling back to the P4b declared-only seam, and the off-state output is byte-identical to P4b — so the entire phase is rollback-safe at runtime, not just at the commit level.

**Why this priority**: P5 changes the IR write path for live surfaces; a single switch back to the proven P4b behavior is the safety net that lets the seam ship without risking the working copy. It is P2 because it gates *confidence in shipping* rather than delivering propagation itself.

**Independent Test**: Flip the flag off; run the full spine; confirm the produced IR and observable survey behavior are byte-identical to P4b (no `mutate()` executes). Flip it on; confirm `mutate()` becomes the write path.

**Acceptance Scenarios**:

1. **Given** the global flag is **off**, **When** the survey runs, **Then** no `mutate()` executes, the declared-only P4b seam is in force, and the output is **byte-identical to P4b**.
2. **Given** the global flag is **on**, **When** the survey runs, **Then** `mutate()` is the IR write path for all in-scope surfaces.
3. **Given** a regression is observed with the flag on, **When** the flag is turned off, **Then** P0–P4b behavior is fully restored with no other code change (the defined rollback).

---

### User Story 5 - The real per-spine-prefix validator replaces the 012 structural proxy (Priority: P3)

The spine-prefix shippability check graduates from the structural proxy 012 shipped to the **real per-spine-prefix validator**, now that an executed `mutate()` produces a real per-prefix working copy the validator can run against.

**Why this priority**: 012 (FR-017) deliberately shipped only a structural proxy ("complete, lock-consistent working copy") and reserved real validation "for P5," because no executed IR-write surface existed to validate. P5 supplies that surface, so the deferral resolves here. It is P3 because the proxy already guards the invariant; this upgrades proxy→real, it does not introduce a new invariant.

**Independent Test**: For each spine prefix, run the real validator against the working copy `mutate()` produces at that prefix and confirm it reports shippability (passing the base-template-derived prefixes and flagging a deliberately broken one) — distinct from the inputs-satisfiability check.

**Acceptance Scenarios**:

1. **Given** a spine prefix and the flag on, **When** the spine-prefix shippability check runs, **Then** it invokes the **real per-spine-prefix validator** against the working copy produced by `mutate()` at that prefix, replacing 012's structural proxy.
2. **Given** the real validator, **When** it evaluates a prefix, **Then** shippability remains a check **distinct from** inputs-satisfiability (a prefix can satisfy all inputs yet fail validity, and vice versa).
3. **Given** the validator wiring, **When** it runs, **Then** it respects the Constitution's single-debounce / single-validation-path rule (Article IV) — no second debounce timer or parallel validation path is introduced.

---

### Edge Cases

- **`mutate()` applied twice** (same value, same IR): the second application MUST be a no-op on the IR (idempotency, FR-004) — re-answering or replaying a step never double-writes.
- **A `writes`-declared path that does not match the ratified IR shape** (the §8 risk): caught at typecheck via `IRPath` (P2) and, at runtime, by the declared-`writes` containment assertion (FR-003) — which **fails fast and rejects the whole patch in all builds** (Q11), leaving the IR unchanged. The spec MUST be re-validated against the ratified #5b/#232 contract before planning.
- **A dead-key output whose base isn't on the touch base layer** during re-propagation: the suggestion still resolves per the §3.6 `touchSuggest` policy (the popup hangs off wherever that base landed); provenance is assigned to the produced key.
- **Breaking a physical lock with no derived touch dependents**: the staleness closure yields nothing to re-suggest; re-propagation is a no-op, not an error.
- **One physical change marking several steps stale at once**: re-propagation runs as a **single coalesced pass over the union of the staleness closure** (FR-013, Q10), not once per stale step — each affected derived key is re-suggested at most once per change, preserving idempotency.
- **A `hand-set` key on a base that a later physical change removes**: the `hand-set` key is **not** auto-overwritten (no-clobber wins); surfacing the now-orphaned hand-set key is a dashboard/completeness concern, not a silent deletion.
- **Flag flipped mid-session**: out of scope — the flag is a build/deploy-time global; this spec does not require live in-session toggling.
- **A patch from `mutate()` that is empty** (`{}`): valid — represents "this answer changes no IR" and merges to a no-op (the path-scoped deep merge writes nothing and preserves all existing IR).
- **Re-propagation over a key whose provenance is missing** (legacy/untagged): treated as `hand-set` by default (FR-009), so it is conservatively never auto-overwritten.

## Requirements *(mandatory)*

### Functional Requirements

**Dependency gate (blocking precondition)**

- **FR-001** *(SATISFIED — gate cleared per PR #822, 2026-06-28)*: This feature was **BLOCKED** on the engine mutation contract (#5b / #232) — `/speckit-plan` must not run, and no executed `mutate()` may ship, until that contract ratified the `KeyboardIR` mutation surface. **That contract ratified and merged to main in PR #822** (`@keyboard-studio/contracts` 0.12.0; §18 sign-off recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md)). The spec, plan, and tasks were **re-validated against the ratified contract shape on 2026-06-28 (T000)** with no `writes`/IR-shape drift, so planning and implementation are unblocked. `mutate?` is now the activated type-level signature in `survey/types.ts` (the executed reducer apply path remains front-end task T014).

**The `mutate()` write surface**

- **FR-002**: The system MUST implement `QuestionModule.mutate()` as a **pure** function that takes the question's value (and survey context) and **returns a `Partial<KeyboardIR>` patch**; the survey reducer (the §3.4 manifest-level `applyStepCompletion` reducer) applies the patch. `mutate()` MUST NOT mutate the IR in place or perform side effects. The reducer MUST apply the patch as a **path-scoped deep merge at exactly the declared `writes` paths** — writing each value to its declared `IRPath` location only and preserving all sibling nested IR under a shared parent — **not** a shallow top-level branch replacement (Q9).
- **FR-003**: Every `mutate()` MUST **runtime-assert that its returned patch touches only the module's declared `writes` paths** (typed as `IRPath` per P2). A patch touching any undeclared path MUST be **rejected whole — fail-fast, in all builds (not a dev-only assert)**: the entire patch is rejected (no partial apply), the failure is raised/surfaced (never swallowed), and the IR is left unchanged for that step; it is never silently merged (Q11).
- **FR-004**: `mutate()` MUST be **idempotent on re-apply** — applying the same value against the same IR a second time yields no further IR change.
- **FR-005**: `mutate()` MUST become the **single IR write path** for all in-scope surfaces (US1); the answer-store-vs-direct-IR **state fork** (§1) is closed for those surfaces, unifying both into one write surface.

**Scope of converted write surfaces (Q4=B)**

- **FR-006**: The following surfaces MUST be converted to route through `mutate()`: **(FR-006a) the carve/add shell** — the carve remove-mode component and the add galleries, retiring their direct `workingCopyStore` mutations (the `deleteNode` / `restoreNode` / `deleteItem` / `restoreItem` / `restoreAll` / `keepAll` carve mutators and the add-gallery's direct selected-pattern IR writes); this prong carries the genuinely **strategy-bearing** carve/mechanism/touch IR writes, which live in `packages/studio/src/editors/`, not in the question modules; and **(FR-006b) all question modules with non-empty `writes` — the 5 identity/header writers** (`a/iso_code.ts` → header.bcp47, `a/primary_script.ts` → header.bcp47, `a/language_name_english.ts` → header.name, `a/pa_copyright_holder.ts` → header.copyright, `b/pb_standard_letters.ts` → stores).
- **FR-007**: **Display-only questions (empty `writes`) MUST remain no-op** under `mutate()`. Answer-store-only / identity-metadata modules are **out of scope** for `mutate()` conversion in P5.

**Per-key touch provenance (Q2=A)**

- **FR-008**: Per-key touch provenance MUST be **promoted onto `TouchKeyIR` in `packages/contracts`** as a contract field carrying `base-derived` / `physical-suggested` / `hand-set`. The editor-layer `TouchKeyProvenance` (`editors/assignLoop/provenance.ts`) MUST become a **re-export** of the contracts type (single source of truth).
- **FR-009**: Pre-existing / untagged touch keys MUST default to **`hand-set`** (conservative — never auto-overwritten).
- **FR-010**: Provenance MUST **survive IR serialize / round-trip** unchanged (required by the no-clobber AC — FR-012).
- **FR-011**: The provenance promotion MUST be delivered as part of the **`packages/contracts` MAJOR version bump** (per §3.6), with a §18 joint engine+content session / coordination note; it is **not** an additive-minor change shippable independently of that bump.

**Touch re-propagation (Q5=A + follow-up)**

- **FR-012**: A physical change (physical-lock break / physical-step completion) MUST trigger **automatic** re-propagation that re-runs `touchSuggest` over **only** `base-derived` and `physical-suggested` keys, overwriting those, and **never** overwriting a `hand-set` key (the no-clobber rule).
- **FR-013**: Re-propagation MUST be **driven by the P4b staleness slice** — the `staleSteps` root-set plus the completeness fixpoint (§3.5 transitive closure) — so only keys derived from the changed physical decision are re-suggested, not the whole touch layer. When a single physical change makes **multiple** steps stale, re-propagation MUST run as a **single coalesced pass over the union of the staleness closure** (not once per stale step), so no derived key is re-suggested more than once per change (Q10).
- **FR-014**: A manual edit to a `physical-suggested` key MUST **promote it to `hand-set`**, so subsequent re-propagation will not clobber the author's edit.

**Rollback flag (Q6=A)**

- **FR-015**: A **single global flag** MUST gate `mutate()`. With the flag **on**, `mutate()` is the IR write path. With the flag **off**, the P4b declared-only seam is in force and **no `mutate()` executes**.
- **FR-016**: With the flag **off**, the produced IR and observable survey behavior MUST be **byte-identical to P4b**. Turning the flag off MUST fully restore P0–P4b behavior with no other code change (the defined rollback).

**Per-spine-prefix validator (Q8 — resolving 012's deferral)**

- **FR-017**: P5 MUST **wire the real per-spine-prefix validator**, replacing the structural proxy 012 shipped (012 FR-017), running the validator against the working copy `mutate()` produces at each prefix.
- **FR-018**: Spine-prefix shippability MUST remain a check **distinct from** inputs-satisfiability, and the validator wiring MUST respect the Constitution Article IV single-debounce / single-validation-path rule (no second debounce timer or parallel validation path).

**Out of scope (explicit non-goals — Q8)**

- **FR-019**: This feature MUST NOT implement publishing paths, the dev-only flow-map editor ([specs/009-flow-map-editor](../009-flow-map-editor/spec.md)), touch-first or reverse touch→physical authoring (Constitution Article VII — touch is seeded from the locked physical layout, never the other way), or the deletion of library / reserve question modules (§3.8 no-delete).

### Key Entities *(include if feature involves data)*

- **`mutate()` (question-module write surface)**: A pure function returning a `Partial<KeyboardIR>` patch the reducer applies as a **path-scoped deep merge at the declared `writes` paths** (siblings preserved); runtime-asserts declared-`writes` containment with **fail-fast whole-patch rejection** on violation; idempotent. The single IR write path for in-scope surfaces.
- **Declared `writes` (`IRPath[]`)**: The P2-declared, typed paths a module is allowed to populate; the containment set the FR-003 runtime assertion checks the patch against.
- **`TouchKeyIR` provenance field**: The per-key tag (`base-derived` / `physical-suggested` / `hand-set`) promoted onto the contract; defaults to `hand-set`; survives round-trip; single source the no-clobber rule reads. `editors/assignLoop/provenance.ts`'s `TouchKeyProvenance` becomes a re-export of it.
- **`touchSuggest` generator**: The §3.6 physical→touch defaults-as-data adaptation policy; on re-propagation it re-derives only non-`hand-set` keys and tags each produced key with its provenance and producing-default.
- **Staleness slice (`staleSteps`)**: The P4b recomputable set (root-set + fixpoint) that drives which derived touch keys re-propagation re-suggests.
- **Global `mutate` flag**: The single switch gating the `mutate()` write path; off ⇒ byte-identical-to-P4b declared-only seam; the rollback mechanism.
- **Retired direct gallery mutations**: The `workingCopyStore` carve mutators (`deleteNode` / `restoreNode` / `deleteItem` / `restoreItem` / `restoreAll` / `keepAll`) and the add-gallery's direct selected-pattern IR writes — the second prong of the state fork being collapsed into `mutate()`.
- **Real per-spine-prefix validator**: The validator wired in P5 against each prefix's `mutate()`-produced working copy, replacing 012's structural proxy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `mutate()` is the **single** IR write path for in-scope surfaces — a repo audit finds **zero** direct `workingCopyStore` IR mutations from the converted carve/add shell (which carries the strategy-bearing carve/mechanism/touch writes) and **zero** other IR write routes for the 5 non-empty-`writes` identity/header modules when the flag is on.
- **SC-002**: For every in-scope module, applying `mutate()` to a known `KeyboardIR` fixture changes the IR at **exactly** the module's declared `writes` paths and **nothing else** — sibling nested IR under a shared parent is byte-identical (the path-scoped deep merge, Q9) — and an attempt to write outside `writes` **fails fast, rejects the whole patch, and leaves the IR unchanged** (per-question output test, Q11).
- **SC-003**: `mutate()` is **idempotent** — applying the same value twice produces a byte-identical IR to applying it once, across all in-scope modules.
- **SC-004**: Round-tripping `mutate()` against the **reused existing IR fixtures** passes (no shape drift; patches merge cleanly and the result re-serializes).
- **SC-005**: On the provenance-tagged touch-layout fixtures, a simulated physical change re-suggests **only** `base-derived` / `physical-suggested` keys and leaves **100%** of `hand-set` keys byte-identical (no-clobber holds).
- **SC-006**: A manual edit to a `physical-suggested` key promotes it to `hand-set`, and a subsequent re-propagation leaves that key untouched.
- **SC-007**: Every touch-key provenance tag **survives serialize→deserialize** unchanged, and the editor-layer `TouchKeyProvenance` resolves to the contracts type (single definition).
- **SC-008**: With the flag **off**, the full-spine output is **byte-identical to P4b** and **zero** `mutate()` calls execute; with the flag on, `mutate()` is the write path — both states demonstrated.
- **SC-009**: The real per-spine-prefix validator runs against each prefix's `mutate()`-produced working copy, passes the base-template-derived prefixes, flags a deliberately broken prefix, and introduces **no** second debounce timer or parallel validation path (Article IV holds).
- **SC-010**: The contracts change ships as a **MAJOR** version bump with the §18 coordination note recorded; no consumer absorbs the provenance field as a silent minor.

## Assumptions

- **Gate cleared (was: BLOCKED on #5b/#232, Q1=A).** This spec was design-only until the engine mutation contract ratified; that happened in **PR #822** (2026-06-28). The spec was re-validated against the ratified contract shape on 2026-06-28 (T000) — the §8 "declaring `writes` that don't match the real IR shape" risk is mitigated by `IRPath` (typecheck) plus the FR-003 runtime assertion, and the ratified contract now confirms the shape: all 5 in-scope `writes` `IRPath`s resolve cleanly to the ratified `KeyboardIR`/`IRHeader`.
- **P2 and P4a/P4b are landed and stable.** `IRPath` + declared `inputs`/`writes` (P2, `@keyboard-studio/contracts` 0.11.0), the manifest + `applyStepCompletion` reducer, the `staleSteps` staleness slice, and the completeness checks (incl. the C4 lock-consistency / spine-prefix structural proxy) already exist and are reused as-is. The reserved `TouchKeyProvenance` (`editors/assignLoop/provenance.ts`) and `touchSuggest` defaults seam from P4a are the inert reservations P5 activates.
- **`TouchKeyIR` currently has no provenance field** (`packages/contracts/src/keyboard-ir.ts`); P5 adds it. The editor-layer `TouchKeyProvenance` re-export keeps the package boundary intact.
- **The 5 identity/header modules are the non-empty-`writes` set** (current ground truth after the P3 loader cutover + #781 legacy retirement; the original "8" was the stale P2-era snapshot); display-only and answer-store-only modules keep empty `writes` and stay no-op. The genuinely strategy-bearing carve/mechanism/touch IR writes live in the `editors/` carve/add shell (FR-006a), not in the question modules.
- **Touch is seeded from the locked physical layout, never the reverse** (Constitution Article VII / §3.6 Decision 6). Re-propagation is a propagation/merge over the physical-derived substrate, not a re-projection and not touch-first authoring.
- **The flag is a build/deploy-time global**, not a live in-session toggle; mid-session flipping is out of scope.
- **"Byte-identical to P4b"** means the produced IR and observable survey behavior with the flag off equal P4b's, not source-identical components.
- **Team ownership.** This change spans the **Engine** boundary (the `KeyboardIR` contract, the validator wiring) and the studio/front-end survey surface; the contracts MAJOR bump requires a **§18 joint engine+content session** (Constitution Governance / Article I-style coordination), since it touches a locked `packages/contracts` surface. No `Pattern` schema field is renamed or removed by this feature.
- **Rollback is the flag** (FR-015/FR-016), not a git revert of the whole phase: turning the flag off restores P4b at runtime.
