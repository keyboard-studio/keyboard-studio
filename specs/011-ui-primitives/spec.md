# Feature Specification: Shared `ui/` Primitive Library Extraction

**Feature Branch**: `011-ui-primitives`

**Created**: 2026-06-26

**Status**: Draft

**Input**: User description: Extract a shared `ui/` primitive library for the studio SPA — P1 of [docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) (§3.2 / §5 / §8). Create `ui/` with `Button`, `Dropdown`, `TextField`, `RadioGroup`, `MultiSelect`, `Notice`, `Card`, and `theme`. Refactor `QuestionField.tsx` and the five wizard-step components onto these primitives, and fold `lib/galleryTheme.ts` into `ui/theme.ts`. Architectural constraint, enforced by a new dependency-cruiser leaf rule: `ui/` imports nothing from `survey/`, `steps/`, or `stores/`. Pure refactor — success is zero behavioral/visual diff (existing component tests pass unchanged) and depcruise green. Out of scope: any step-model / manifest restructuring (that is P4).

**Governing scope**: This feature implements **P1** of the Survey Modularity + CYOA Refactor plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 "P1 — `ui/` primitive library extraction", §3.2, §5, §8). It does not re-derive that scope; it operationalizes it.

> **Note on technical content in this spec (deliberate).** P1 is a pure architectural refactor with **no end-user-visible behavior**. Its value *is* the architecture: a shared primitive surface and an enforced dependency boundary that later phases (P2/P4) build against. Per author direction and repository convention — where dependency-cruiser rules are treated as architectural **contracts** ("fitness functions"), and extracted `specs/NNN/` folders carry real contract material — the non-obvious architectural constraints are specified here as Functional Requirements and Success Criteria rather than deferred entirely to `plan.md`. The *mechanics* of achieving them (move order, codemod approach, import-extension handling, the exact depcruise rule syntax) remain plan-level.

## User Scenarios & Testing *(mandatory)*

> The "users" of a pure refactor are the studio engineering team (today) and future-phase contributors (P2/P4) who build against the extracted surface. Stories are framed as developer journeys; each is independently testable and independently valuable.

### User Story 1 - One shared form-control kit, no inline duplication (Priority: P1)

A developer building or maintaining a survey question field or a wizard-step panel reaches for form controls (buttons, dropdowns, text fields, radios, multi-selects, notices, cards) from a **single shared library** instead of re-implementing them inline in each component.

**Why this priority**: This is the core deliverable — collapsing the inline-duplicated controls scattered across `QuestionField.tsx`, the five wizard-step components, and gallery chrome into one kit. Everything else (boundary enforcement, theme unification) hangs off the library existing and being adopted.

**Independent Test**: Pick any one refactored component (e.g. `QuestionField.tsx`), confirm it now imports its controls from `ui/` and contains no locally-defined button/input markup, and confirm it renders and behaves identically to before.

**Acceptance Scenarios**:

1. **Given** a refactored component that previously declared an inline button, **When** it renders, **Then** it renders the shared `ui/Button` with identical appearance and behavior and declares no local button.
2. **Given** the affected component set (`QuestionField` + the five wizard-step panels), **When** the refactor is complete, **Then** none of them contains inline-duplicated control definitions for any control the kit provides.

---

### User Story 2 - A stable primitive surface and a single theme source (Priority: P2)

A future-phase contributor (P2 declared-`inputs`/`writes`, P4 editor adapters) builds new UI against a **stable, documented primitive API** and a **single theme token source**, rather than copying one-off styles.

**Why this priority**: P2 and P4 are verified against this surface; a single theme source removes the duplicate-token drift between gallery chrome and form chrome. Valuable, but only after the kit exists (US1).

**Independent Test**: Confirm `ui/` exposes the agreed public exports and that form/gallery chrome tokens resolve from `ui/theme` with no duplicate definitions remaining in the former `lib/galleryTheme.ts` location.

**Acceptance Scenarios**:

1. **Given** the `ui/` library, **When** a contributor imports a primitive, **Then** the primitive is available from the library's public entry point with a stable name.
2. **Given** chrome styling previously defined in `lib/galleryTheme.ts`, **When** the refactor is complete, **Then** those tokens resolve from the unified `ui/` theme module and are not defined in two places.

---

### User Story 3 - An enforced architectural boundary (Priority: P3)

An architecture reviewer relies on an **automatically enforced** guarantee that the primitive library is a dependency **leaf** — it never reaches back into `survey/`, `steps/`, or `stores/` — so the kit cannot accumulate hidden coupling as later phases land.

**Why this priority**: The boundary is what keeps the kit reusable across phases; it is the first intra-`studio/src` layering rule and the durable contract this feature establishes. It depends on the library existing (US1).

**Independent Test**: Introduce a probe import from `ui/` into `survey/` (or `steps/`/`stores/`) and confirm the architecture-boundary check fails; remove it and confirm the check passes.

**Acceptance Scenarios**:

1. **Given** the boundary rule, **When** any module under `ui/` imports from `survey/`, `steps/`, or `stores/`, **Then** the automated boundary check fails the build/lint.
2. **Given** a clean `ui/` with no such imports, **When** the boundary check runs, **Then** it passes.

---

### Edge Cases

- **Control not covered by the kit.** A component uses a control variant outside the agreed primitive set. Resolution must be explicit: either the variant is added to the kit, or it is documented as a deliberate local one-off — it is never silently left as inline duplication that the kit was meant to replace.
- **Theme token with no kit equivalent.** A `galleryTheme` token has no current primitive consumer. It must still land in the unified theme source (not orphaned in the deleted location) so no chrome regresses.
- **Import-path breakage.** Moving/renaming must not break the studio's strict explicit-extension import convention; a broken specifier is a regression, not an acceptable cost of the move.
- **Partial adoption window.** While call sites are being switched over, the new library and the old inline controls may briefly coexist; the end state must have no surviving inline duplicates for kit-provided controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A shared primitive library MUST exist under the studio SPA exposing, as its **baseline**, `Button`, `Dropdown`, `TextField`, `RadioGroup`, `MultiSelect`, `Notice`, and `Card`, plus a `theme` module, all reachable from a single public entry point. The baseline is a floor, not a ceiling — the final set is whatever the FR-007 audit justifies, and is expected to include additional controls beyond these seven.
- **FR-002**: `QuestionField` and the five wizard-step components — `TrackStep`, `ProjectNameStep`, `ScaffoldForm`, `TrackOneIdentityPanel`, `BaseResolution` — MUST consume these primitives instead of inline-duplicated controls.
- **FR-003**: Form/gallery chrome currently defined in `lib/galleryTheme.ts` MUST be unified into the library's `theme` module, establishing a single token source; the duplicate location MUST NOT retain a second definition.
- **FR-004** *(architectural contract)*: The primitive library MUST be a dependency **leaf** — no module under it may import from `survey/`, `steps/`, or `stores/`. This MUST be enforced by an automated architecture-boundary check (the first intra-`studio/src` layering rule), not left to convention.
- **FR-005** *(invariant)*: The refactor MUST NOT change the runtime behavior or visual appearance of any affected component. Existing component tests MUST pass **unchanged** — i.e. no test is edited to accommodate a behavior or markup change.
- **FR-006** *(scope boundary)*: This feature MUST NOT convert any panel or component into the `steps/` step model, alter survey ordering, or touch the flow manifest. Those restructurings belong to P4 and are explicitly out of scope here.
- **FR-007**: The composition of the primitive set MUST be **audit-driven**: an inventory of the controls actually duplicated inline across the affected components determines the final set. The seven controls named in FR-001 are the expected baseline; the audit is expected to surface **additional** primitives beyond them, and any such control MUST either be added to the kit or explicitly recorded as a deliberate local one-off (per the "control not covered by the kit" edge case). The audit and its resulting set MUST be settled before adoption begins.

### Key Entities

- **Primitive library** (`ui/`): the shared, reusable form-control kit and its theme; the single home for control chrome going forward. A dependency leaf within the studio source tree.
- **Primitive**: one reusable control (e.g. `Button`, `TextField`) with a stable public name and identical behavior to the inline control it replaces.
- **Theme module**: the single source of form/gallery chrome tokens, absorbing the former `galleryTheme` tokens.
- **Architecture-boundary rule**: the enforced "leaf" constraint that fails when the library imports from `survey/`, `steps/`, or `stores/`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the affected components (`QuestionField` + the five wizard-step panels) import their form controls from the shared library, and those files contain **zero** remaining inline definitions of controls the kit provides.
- **SC-002**: The existing studio component test suite passes with **no test modifications** attributable to behavior or markup changes — demonstrating zero behavioral/visual regression.
- **SC-003**: The architecture-boundary check **fails** when a probe import from the library into `survey/`/`steps/`/`stores/` is introduced, and **passes** on the clean tree — i.e. the leaf constraint is genuinely enforced, not merely documented.
- **SC-004**: Form/gallery chrome resolves from exactly **one** theme token source; no token is defined in two places after the fold.
- **SC-005**: No import specifier in the studio SPA is left broken by the move (build/typecheck clean), preserving the explicit-extension convention.

## Assumptions

- **Team ownership**: Engine team (the SPA is Engine-owned per the constitution's team-boundary article). No Content-owned material is touched.
- **No locked contracts touched**: P1 does not modify the `Pattern` type, `KeyboardIR`, or any `packages/contracts` schema. The contract-affecting work (declared `inputs`/`writes`, `IRPath`) is P2 and is out of scope here.
- **Additive-until-switch**: The library is introduced additively; call sites switch over incrementally, so a revert before full adoption leaves the tree valid (rollback safety).
- **Scope boundary with P4 (default chosen)**: The five wizard-step components are refactored **onto primitives only**. Whether any of them later becomes a `steps/` step is a P4 decision and is assumed out of scope here (FR-006).
- **Naming**: This feature does not depend on the deferred `editors/`/`dashboard/` folder renames (those are sequenced before P4a); it only introduces the `ui/` library.
- **Strict-TS imports**: The repository's explicit `.ts`/`.tsx` import-extension convention is preserved across all moves/renames.
