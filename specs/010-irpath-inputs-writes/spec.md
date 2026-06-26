# Feature Specification: IRPath + declared `inputs`/`writes` + folder-per-question opt-in

**Feature Branch**: `claude/survey-modularity-cyoa-plan-pcpg9a`

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: "P2 — IRPath design + declared inputs/writes + folder-per-question opt-in. From docs/survey-modularity-cyoa-plan.md §3.3, §3.8, and §6 P2."

**Governing source**: This feature implements **P2** of
[docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md)
(§3.3 the question contract, §3.8 the question library, §6 P2). It does **not**
re-derive scope from that plan — the plan is authoritative for intent. Contract
versioning is governed by spec §18 (the joint engine+content session,
2026-06-26) and Constitution Article I. `mutate()` execution is explicitly
**out of scope** here and remains a documented stub (P5, gated on #5b/#232).

## Clarifications

### Session 2026-06-26

- Q: How should `inputs` address survey-answer dependencies, given `inputs`/`writes` must share one address space for the orphan-input lint? → A: Single `IRPath` space — both `inputs` and `writes` are `IRPath[]` over the same `KeyboardIR` address space; an answer-dependency is expressed as the IR location that answer ultimately populates (one path algebra; the orphan-input lint is well-defined by construction).
- Q: How should the coverage check treat a question that genuinely reads/writes nothing (e.g. a display-only notice)? → A: Explicit empty array required — such a question MUST declare `inputs: []` / `writes: []`; "carries" means the field is present (possibly empty), and CI fails only on an absent field (the empty case is a deliberate, auditable declaration).
- Q: Is FR-008's write-surface test a P2 completion gate or deferred, given it depends on the incrementally-built §7.7 write surface? → A: Conditional gate — P2 is complete when the test **exists and passes for whatever portion of the §7.7 write surface is available at P2 close**; remaining strategy-bearing questions are covered as §7.7 lands. P2 ships the test wired to the available surface but does not block on full §7.7.
- Q: Does the orphan-input lint apply to library/reserve questions (referenced by no flow manifest, §3.8)? → A: Manifest-scoped only — the lint runs only over questions a flow manifest references (it needs an ordered upstream to check against); library/reserve questions are exempt from the lint while unreferenced, but still carry `inputs`/`writes` and a mirrored test. Promoting a library question into a manifest naturally brings it into lint scope on the next run.

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are **question authors** (Content team) who declare
what a question depends on and writes, and the **dashboard/tooling consumers**
(Engine team) who read those declarations as static data. No survey end-user
behavior changes in this feature.

### User Story 1 - Declare a question's data dependencies as typed static data (Priority: P1)

A question author adds, to each `QuestionModule`, a declaration of the data the
question reads (`inputs`) and the KeyboardIR locations it will eventually
populate (`writes`), expressed as typed paths. These are **plain static data**:
they are declared now and consumed by tooling immediately, without any
`mutate()` execution. An author who writes a path that does not correspond to a
real location in the IR is told so at compile time, not at runtime.

**Why this priority**: This is the core deliverable — it is the decoupling that
lets the dashboard, completeness checker, and lock-staleness graph be built
before the engine mutation seam exists. Without it nothing downstream (P0
dashboard, P4 manifest, P5 mutate) has a contract to read.

**Independent Test**: Add `inputs`/`writes` to a single module, point a
type-check at it, confirm a valid path compiles and a bogus path fails
typecheck — all without any runtime/mutation code.

**Acceptance Scenarios**:

1. **Given** the extended `QuestionModule` contract, **When** an author declares
   a `writes` path that names a real location in the KeyboardIR tree, **Then**
   it type-checks successfully and is readable as static data.
2. **Given** the same contract, **When** an author declares a `writes` (or
   `inputs`) path that does **not** correspond to a real location in
   `keyboard-ir.ts`, **Then** the project fails to typecheck (Drift AC).
3. **Given** a question with declared `inputs`/`writes`, **When** tooling reads
   the module, **Then** it obtains the paths without invoking `mutate()` (which
   remains a stub).

---

### User Story 2 - A typed path algebra over the whole KeyboardIR (`IRPath`) (Priority: P1)

A net-new `IRPath` type names a location inside the nested `KeyboardIR` union,
covering **both surfaces**: the physical tree (`groups[]` / `stores[]`) and the
deep touch path (`touchLayout.platforms[].layers[].rows[].keys[]`). `IRPath`
does not exist today and is not a simple import — it is designed in this
feature. An invalid path is a **compile error**, not a runtime miss.

**Why this priority**: `inputs`/`writes` (Story 1) are typed *against* `IRPath`;
the contract is meaningless without it. It is the type that makes the Drift AC
enforceable.

**Independent Test**: Construct a valid `IRPath` for a known physical location
and a known deep touch-key location and confirm both compile; construct a
malformed path and confirm a compile error.

**Acceptance Scenarios**:

1. **Given** the `KeyboardIR` union, **When** `IRPath` is used to name a physical
   `groups[]`/`stores[]` location, **Then** it compiles.
2. **Given** the touch surface, **When** `IRPath` names the deep path
   `touchLayout.platforms[].layers[].rows[].keys[]`, **Then** it compiles.
3. **Given** any path that is not a real location in the IR union, **When** it is
   used as an `IRPath`, **Then** the build fails (Design AC).

---

### User Story 3 - Every shipped question carries declarations, with no orphan inputs (Priority: P2)

All 93 existing question modules (Phase A = 30, Phase B = 55, Phase F = 8) gain
`inputs`/`writes`. A manifest lint asserts that each question's `inputs` are
produced by some upstream step's `writes` — no question declares a dependency
nothing upstream satisfies.

**Why this priority**: The contract is only trustworthy if it is populated
completely and self-consistently. This is what makes the declarations usable by
the dashboard for a real completeness/staleness graph (P0 / §3.5).

**Independent Test**: Run the manifest lint over the populated registry; it
passes when every declared `input` is matched by an upstream `write` and fails
when an orphan input is introduced.

**Acceptance Scenarios**:

1. **Given** the populated registry, **When** the declaration coverage check
   runs, **Then** all 93 modules carry `inputs`/`writes`.
2. **Given** a question whose declared `input` is produced by no upstream
   `write`, **When** the manifest lint runs, **Then** it fails and names the
   orphan input.

---

### User Story 4 - Declared writes cannot silently diverge from real strategy effect (Priority: P2)

For every strategy-bearing question (one linked to a `Pattern.strategyId`), a
unit test asserts its declared `writes` match the strategy's actual write
surface — the IR locations that strategy populates. Declared intent and real
effect cannot drift apart unnoticed.

**Why this priority**: Without this cross-check, `writes` is just a comment that
can rot. It is the guard that keeps the static declarations honest against the
strategy framework (spec §7).

**Independent Test**: For a strategy-bearing question, mutate its declared
`writes` to omit a real strategy target and confirm the unit test fails.

**Acceptance Scenarios**:

1. **Given** a strategy-bearing question, **When** the write-surface unit test
   runs against the §7.7 typed assignment-map write surface, **Then** declared
   `writes` exactly match the strategy's write surface.
2. **Given** a question whose declared `writes` omit or over-claim a strategy
   target, **When** the test runs, **Then** it fails.

---

### User Story 5 - Folder-per-question opt-in for modules with companion artifacts (Priority: P3)

The handful of question modules that need companion artifacts (images, sample
text, a custom component) graduate from the flat `<id>.ts` form to the
`<id>/index.ts` + `extras/` folder form. The registry keeps resolving every
question by `definition.id`, so both forms are identical to callers.

**Why this priority**: Mechanical layout improvement that unblocks richer
questions; lowest risk, no contract impact, and isolated from the type work.

**Independent Test**: Convert one module to the folder form, confirm the
registry resolves it by `definition.id` unchanged and its mirrored test still
maps to it.

**Acceptance Scenarios**:

1. **Given** a module with a companion artifact, **When** it is converted to
   `<id>/index.ts` + `extras/`, **Then** the registry resolves it by
   `definition.id` with no change to callers.
2. **Given** the converted module, **When** the per-question test mapping runs,
   **Then** the mirrored test path (derived from the source path) still resolves.

---

### Edge Cases

- **Deep touch path absent**: a question declaring a touch `writes` path when the
  working copy has no `touchLayout` — the path must still typecheck (it names a
  location in the *type*, independent of whether an instance is populated).
- **Library / reserve questions (§3.8)**: a registered module referenced by **no**
  flow manifest still carries `inputs`/`writes`, still compiles, and still has a
  mirrored test — it is excluded only from flow-integration/E2E, never deleted.
- **Strategy-less question**: a question with no `Pattern.strategyId` is exempt
  from the write-surface unit test (Story 4) but still subject to coverage
  (Story 3) and the Drift AC (Story 1).
- **Write-surface dependency not yet available**: the §7.7 typed assignment-map
  write surface is being built "along the way"; the write-surface test lands
  as/once that surface becomes available and must not block the rest of P2.
- **Rollback within the major line**: `inputs`/`writes` are optional fields, so a
  revert leaves modules structurally valid — but the contract addition is itself
  the major bump (it is not a freely-absorbable minor change).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a net-new `IRPath` type that names a location
  inside the nested `KeyboardIR` union, covering both the physical tree
  (`groups[]` / `stores[]`) and the deep touch path
  (`touchLayout.platforms[].layers[].rows[].keys[]`).
- **FR-002**: `IRPath` MUST make an invalid path (one not corresponding to a real
  location in `keyboard-ir.ts`) a **compile error**, not a runtime miss
  (Design AC + Drift AC).
- **FR-003**: The `QuestionModule` contract MUST be extended with optional
  `inputs?: IRPath[]` and `writes?: IRPath[]` fields, declared as static data.
  Both `inputs` and `writes` MUST address the **same `IRPath` space** over
  `KeyboardIR`; a survey-answer dependency is expressed as the IR location that
  answer ultimately populates (one path algebra — there is no separate
  answer-key address space), so `inputs` and `writes` are directly comparable.
- **FR-004**: The contract addition (`inputs`/`writes`/`IRPath` on `QuestionModule`)
  MUST be released as a **breaking version bump of `@keyboard-studio/contracts`** —
  the spec §18 "major" change (joint engine+content session, 2026-06-26;
  Constitution Article I), not a backward-compatible addition. Because the package
  is pre-1.0 (currently 0.10.0), that breaking bump is **0.11.0** under 0ver
  semantics (recommended); promoting to **1.0.0** is an open release call
  (research R5). The numbering choice does not change the §18 obligation.
- **FR-005**: `mutate()` MUST remain a documented stub; no IR-write execution is
  implemented in this feature (deferred to P5, gated on #5b/#232).
- **FR-006**: All 93 existing question modules (Phase A = 30, Phase B = 55,
  Phase F = 8) MUST carry declared `inputs`/`writes`. A question that genuinely
  reads or writes nothing MUST declare an **explicit empty array**
  (`inputs: []` / `writes: []`); "carries" means the field is **present**
  (possibly empty). The coverage CI check fails only on an **absent** field, so
  the empty case is a deliberate, auditable declaration — not an oversight.
- **FR-007**: A manifest lint MUST assert that each question's declared `inputs`
  are produced by some upstream step's `writes` (no orphan inputs) and fail
  naming any orphan. The lint is **manifest-scoped**: it runs only over
  questions a flow manifest references (it requires an ordered upstream to check
  against). Library/reserve questions (referenced by no manifest, §3.8) are
  **exempt while unreferenced**; promoting one into a manifest brings it into
  lint scope on the next run.
- **FR-008**: A unit test MUST assert that every strategy-bearing question's
  declared `writes` match its `Pattern.strategyId` write surface. This is a
  **conditional gate**: P2 is complete when the test **exists and passes for
  whatever portion of the §7.7 typed assignment-map write surface is available
  at P2 close**; strategy-bearing questions whose write surface is not yet
  exposed by §7.7 are covered incrementally as §7.7 lands. P2 ships the test
  wired to the available surface and MUST NOT block on full §7.7 availability.
- **FR-009**: Per-question tests MUST live in the mirrored tree under
  `packages/studio/tests/survey/questions/<phase>/<id>.test.ts` (mirror path
  derived from the source path), and a module without a mirrored test file MUST
  fail CI.
- **FR-010**: Modules with companion artifacts MUST be convertible to the
  `<id>/index.ts` + `extras/` folder form with the registry continuing to
  resolve every question by `definition.id` (both forms identical to callers).
- **FR-011**: Library / reserve modules (registered but referenced by no flow
  manifest, §3.8) MUST carry the same `inputs`/`writes`, compile, and tests; they
  MUST NOT be deleted and are excluded only from flow-integration/E2E and the
  manifest-scoped orphan-input lint (FR-007) while unreferenced.
- **FR-012**: The `IRPath` / `inputs` / `writes` data shape MUST be locked and
  exported as a **named contract** so the P0 dashboard spec can consume it
  directly rather than re-deriving it.
- **FR-013**: If the locked `Pattern` schema (Constitution Article I) would be
  edited, the plan MUST stop and escalate to the user; this feature touches the
  `QuestionModule` contract, not the `Pattern` schema fields.

### Key Entities *(include if feature involves data)*

- **`IRPath`**: A typed path/location reference over the nested `KeyboardIR`
  union. Names a single location in either surface. Validity is enforced at
  compile time. Mechanism (template-literal path string, typed key-path tuple, or
  generated lens set) is a P2 design decision deferred to `/speckit-plan`.
- **`QuestionModule.inputs` / `.writes`**: Optional `IRPath[]` arrays declaring,
  as static data, what a question reads and the IR locations it will populate.
  Both sides address the **same `IRPath` space** over `KeyboardIR` (no separate
  answer-key space), so they are directly comparable for the orphan-input lint.
  Consumed by tooling without invoking `mutate()`.
- **Question module (flat / folder form)**: The `<id>.ts` (flat default) or
  `<id>/index.ts` + `extras/` (folder opt-in) unit, always resolved by
  `definition.id`.
- **Mirrored test tree**: `packages/studio/tests/survey/questions/` — a sibling
  of `src/` whose paths mirror the source question tree one-for-one.
- **Strategy write surface (§7.7)**: The IR locations a `Pattern.strategyId`
  actually populates, derived from the typed assignment-map contract; the
  cross-check target for declared `writes`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 93 question modules carry declared `inputs`/`writes`
  (Phase A 30 / B 55 / F 8).
- **SC-002**: An author who declares an out-of-shape IR path discovers the error
  at compile time in a single typecheck run — zero such errors reach runtime.
- **SC-003**: The orphan-input manifest lint, the write-surface unit test (where
  the §7.7 surface is available), and the missing-mirrored-test CI check are all
  green on the populated registry and each fails deterministically when its
  invariant is violated.
- **SC-004**: Every module with a companion artifact resolves by `definition.id`
  in both flat and folder form with zero caller changes.
- **SC-005**: The P0 dashboard spec can reference the `IRPath` / `inputs` /
  `writes` contract by name without redefining it (the data shape is locked and
  exported).
- **SC-006**: No survey end-user behavior changes and no `mutate()`/IR-write
  execution is added (the seam stays a stub).

## Assumptions

- The `IRPath` realization mechanism (template-literal path-string type, typed
  key-path tuple, or generated lens set) is **left to `/speckit-plan`**; the spec
  fixes only the requirement that invalid paths are compile errors across both
  surfaces.
- The **§7.7 typed assignment-map write surface** is being built incrementally
  ("along the way") and is the cross-check target for FR-008; the write-surface
  test is sequenced with that work and does not block the rest of P2.
- `TouchLayoutIR` (the touch surface shape including
  `touchLayout.platforms[].layers[].rows[].keys[]`) is ratified (#232) and
  available for `IRPath` to cover.
- The current module population is **93** (Phase A 30 / B 55 / F 8), verified
  against the live tree; this is the coverage target for FR-006.
- `packages/studio/tests/` is the established mirror root (the package has no
  pre-existing `tests/`/`__tests__/` root), per plan §7.2.
- Per-key touch provenance (§3.6) and the `staleness` store slice (§3.5) are
  **out of scope** here — they are reserved/added in later phases (P4a / P5).
- This feature is owned jointly by Content (populating declarations, question
  layout) and Engine (the `contracts` major bump, `IRPath`, the lints/tests),
  consistent with the §18 joint session that ratified the bump.
- `mutate()` execution and the four-forms state-fork closure remain out of scope
  (P5, gated on #5b/#232).
