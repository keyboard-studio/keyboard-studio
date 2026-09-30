# Tasks: Step-model constitutional gates

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Scope reminder**: this feature is a **regression guard over an already-compliant codebase**
(FR-005–FR-008). Every task below either edits a governance document or extends an existing test
file / config array — no production code (`StudioShell.tsx`, `StepHost.tsx`, `manifest.ts`,
`steps/types.ts`) is touched.

## Phase 1: Setup

Not applicable. All four touched files (`constitution.md`, `registry.test.ts`, `manifest.test.ts`,
`.dependency-cruiser.cjs`) already exist; nothing is scaffolded (plan.md Structure Decision).

## Phase 2: Foundational

Not applicable. The three user stories gate three independent, pre-existing invariants with no
shared model, type, or blocking infrastructure between them — each story's task touches a
different file (or a distinct, non-overlapping part of one) with no cross-story dependency.

---

## Phase 3: User Story 1 — Constitution gate prevents survey-surface drift (Priority: P1)

**Goal**: Core Principle IX exists in `.specify/memory/constitution.md`, stating that no
user-facing survey surface may exist outside `steps/manifest.ts`, so `/speckit-plan`'s
Constitution Check enforces the rule on every future plan.

**Independent Test**: Read `.specify/memory/constitution.md` and confirm a `### IX.` section exists
under `## Core Principles` with the FR-001 text verbatim; confirm the "Articles I–VIII" and
`Last Amended` cross-references are updated in the same edit.

### Implementation

**Wave 1 — single task:**

- [x] **T001** [US1] Add `### IX. No user-facing survey surface outside the manifest` under
  `## Core Principles`, copying the heading and body verbatim from
  [contracts/constitution-principle-ix.md](./contracts/constitution-principle-ix.md); in the same
  edit, change the `## Authoring workflow` step-2 reference from "Articles I–VIII" to "I–IX", and
  bump the version footer's `Last Amended` date to the date this edit lands ·
  `.specify/memory/constitution.md`

**Checkpoint**: Principle IX is committed (SC-001); future `/speckit-plan` Constitution Checks
reference "I–IX" and can cite the manifest-only rule.

---

## Phase 4: User Story 2 — Registry module count is gated and enforced (Priority: P1)

**Goal**: `registry.test.ts` asserts the exact, re-verified module count (114) instead of `> 0`, so
an accidental addition or removal to `questionRegistry` fails the test suite immediately.

**Independent Test**: `pnpm --filter @keyboard-studio/studio test src/survey/questions/registry.test.ts`
passes at 114 entries and fails if a module is added/removed without updating the assertion.

### Implementation

**Wave 1 — single task:**

- [x] **T002** [US2] Replace the `"has at least one entry"` / `toBeGreaterThan(0)` assertion with
  the exact-count assertion and breakdown comment from
  [contracts/gates.md](./contracts/gates.md) §1 (`9 Phase A + 49 Phase B + 22 Phase F + 3 Phase G +
  31 Reserve = 114 total`; `expect(Object.keys(questionRegistry).length).toBe(114)`) ·
  `packages/studio/src/survey/questions/registry.test.ts`

**Checkpoint**: The registry inventory is gated at 114 (SC-002); a future PR that changes the
module count must update this literal in the same change.

---

## Phase 5: User Story 3 — Manifest step ids resolve to registered renderers; no direct editor imports (Priority: P1)

**Goal**: Every manifest step id resolves to a registered component or renderer (FR-003), and both
a fast vitest source-guard and a `depcruiser` rule stop `StudioShell.tsx` / `StepHost.tsx` from
ever regaining a direct `editors/` import (FR-004), codifying the mediating role `StepHost.tsx`
(spec 028 Stage 5) already plays (FR-006 — no new step-host runtime is built).

**Independent Test**: `pnpm --filter @keyboard-studio/studio test steps/manifest.test.ts` passes
the new FR-003 and FR-004 describe blocks; `pnpm depcruise` stays green with the new
`renderer-no-direct-editor-import` rule enforced.

### Implementation

**Wave 1 — independent (different files):**

- [x] **T003** [P] [US3] Add the `"FR-003 — every manifest step id resolves to a registered
  component"` describe block: for each manifest step, assert `typeof step.component === "function"`
  when `kind === "editor-step"`, or `questionRegistry[step.questionId]` is defined when
  `kind === "question-step"` (per [data-model.md](./data-model.md) §3 /
  [contracts/gates.md](./contracts/gates.md) §2) · `packages/studio/src/steps/manifest.test.ts`
- [x] **T005** [P] [US3] Add the `renderer-no-direct-editor-import` entry to the `forbidden` array
  — exact shape from [contracts/gates.md](./contracts/gates.md) §4
  (`from: '^packages/studio/src/(StudioShell\.tsx|components/StepHost\.tsx)$'`, `to:
  '^packages/studio/src/editors/'`) · `.dependency-cruiser.cjs`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T004** [US3] Extend the existing `"SC-004 — StudioShell.tsx has no per-step render
  branches or completion handlers"` block (or a sibling block reusing its `readFileSync` helper)
  with a source-guard assertion that neither `StudioShell.tsx` nor `components/StepHost.tsx`
  source contains an import whose specifier path includes `/editors/` (per
  [contracts/gates.md](./contracts/gates.md) §3: `expect(src).not.toMatch(/from ["'][^"']*\/editors\//)`)
  · `packages/studio/src/steps/manifest.test.ts`

  *(Same file as T003 — sequenced after it, not parallel, so both describe-block edits don't
  collide.)*

**Checkpoint**: Every manifest entry resolves to a component (SC-003); `StudioShell.tsx` and
`StepHost.tsx` have zero direct `editors/` imports, verified by both a fast vitest guard and
`pnpm depcruise` (SC-004, SC-005).

---

## Phase 6: Polish

Cross-cutting validation against the spec's Success Criteria. No further code changes — these
tasks confirm the three stories above compose cleanly.

**Wave 1 — independent (read-only verification, no file conflicts):**

- [x] **T006** [P] Run `pnpm typecheck` repo-wide — confirms no orphan manifest entry surfaces as a
  structural type error and no unrelated type drift was introduced (SC-006)
- [x] **T007** [P] Run `pnpm --filter @keyboard-studio/studio test` — confirms `registry.test.ts`
  (114) and `manifest.test.ts` (FR-003 + FR-004 blocks) are green, and the full studio suite has no
  regressions (SC-002, SC-003, SC-006)
- [x] **T008** [P] Run `pnpm depcruise` — confirms `renderer-no-direct-editor-import` is registered
  and the repo has zero violations of the renderer → editor boundary (SC-005)

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T009** Cross-check SC-001 through SC-007 against the landed diff (Principle IX text,
  114-count gate, FR-003 resolution test, zero direct editor imports, `depcruise` green, full
  suite green, and the 114-module inventory documented inline in `registry.test.ts`'s comment per
  T002 — satisfying SC-007 without a separate document, since the comment is itself "keyed to the
  test gate") and record the outcome in the PR description

---

## Dependencies & Execution Order

- **Setup → Foundational**: both not applicable; work begins directly at Phase 3.
- **Phase 3 (US1), Phase 4 (US2), Phase 5 (US3)** are mutually independent — each touches a
  disjoint set of files (`constitution.md`; `registry.test.ts`; `manifest.test.ts` +
  `.dependency-cruiser.cjs`) and could be built in any order, including all three in parallel by
  separate agents.
- **Within Phase 5**: Wave 1 (T003, T005 — different files) runs before T004, which shares
  `manifest.test.ts` with T003.
- **Polish (Phase 6)** waits for all three story phases: Wave 1 (T006–T008, independent verification
  commands) before T009 (the SC-001–SC-007 cross-check, which reads all prior results together).

**Parallel opportunities**: T001, T002, T003, T005 have no file overlap and no dependency on each
other — a four-way parallel start is valid if multiple agents pick this feature up at once. T004
is the only task gated on another task in this feature (T003, via shared file).
