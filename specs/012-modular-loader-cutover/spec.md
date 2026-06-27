# Feature Specification: Modular-loader cutover + legacy YAML retirement

**Feature Branch**: `012-modular-loader-cutover`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: P3 of the survey-modularity-cyoa-plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 P3) — finish the #410 A/F/identity-lite loader cutover, then retire the legacy full-YAML survey loader.

> **Governing source.** This feature implements **P3** of the survey-modularity-CYOA plan ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md) §6 P3) and honours the **question-library / no-delete** invariant (§3.8). It does not re-derive scope; the plan is authoritative. It closes the remaining acceptance criteria of issue #410 (part a) and lands the explicit out-of-#410 follow-up (part b).

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are two audiences: (1) the **keyboard author** running the survey, who must see no change in what they are asked or how answers behave; and (2) the **studio maintainer**, who is paying down structural duplication where the same questions exist in two parallel forms (legacy full-YAML vs. modular manifest + registry).

### User Story 1 - Phase A / F / identity-lite render identically on the modular loader (Priority: P1)

The three remaining survey entry points that still resolve through the legacy full-YAML loader — Phase A (identity/provenance), Phase F (help docs), and identity-lite — are switched to resolve through the modular loader (thin manifest + question registry), exactly as Phase B already does. The keyboard author sees the **same questions, in the same order, with the same defaults, branching, and validation** as before. Nothing in the authoring experience changes.

**Why this priority**: This is the substance of the #410 tail. Until all four flows run on one loader, every question for A/F/identity-lite literally exists twice (once in full YAML, once as a registered module copied verbatim), and the flow map / dashboard cannot see the true runtime. This story is the prerequisite for retiring the legacy loader at all.

**Independent Test**: Run each of the three flows end-to-end through the modular loader and confirm the rendered question set, order, defaults, and branching match the legacy output exactly (golden comparison), with no visible difference to the author.

**Acceptance Scenarios**:

1. **Given** the survey is started at Phase A, **When** the author advances through every question, **Then** the questions asked, their order, seeds/defaults, and branch routing are identical to the pre-cutover legacy flow.
2. **Given** the survey is started at Phase F, **When** the author advances through every question, **Then** the help-doc questions are identical to the pre-cutover legacy flow.
3. **Given** identity-lite is started, **When** the author advances through every question, **Then** the question set is identical to the pre-cutover legacy flow, including the autonym-seeds-English-name behavior.
4. **Given** the cutover has landed, **When** the source for the three phase components is inspected, **Then** no `TODO(#410)` marker remains in any of them.

---

### User Story 2 - identity-lite gains its missing modular manifest (Priority: P1)

Phase A and Phase F already have thin modular manifests on disk; identity-lite does **not**. Before identity-lite can cut over, a thin modular manifest must be created whose referenced question set matches the legacy identity-lite flow one-for-one.

**Why this priority**: Without this manifest the identity-lite cutover (Story 1, scenario 3) is impossible — there is nothing for the modular loader to read. It is a hard precondition, co-priority with Story 1.

**Independent Test**: Load the new identity-lite modular manifest through the modular loader and confirm the resolved question id set is exactly the set the legacy identity-lite flow produced (no added, dropped, or reordered questions).

**Acceptance Scenarios**:

1. **Given** the new identity-lite modular manifest exists, **When** it is resolved through the modular loader, **Then** the question id set and order match the legacy identity-lite flow exactly.
2. **Given** the manifest references a question id, **When** the registry is consulted, **Then** every referenced id resolves to a registered question module (no orphan reference).

---

### User Story 3 - Both Playwright E2E lanes pass (Priority: P2)

The two end-to-end test lanes that were the third acceptance criterion of #410 (and have been blocked/skipped) are unblocked and pass against the cut-over flows, gating the cutover.

**Why this priority**: These lanes are the executable proof that the author-facing flows still work after the loader swap. They are listed as #410 AC#3 and are a closing condition for the issue, but they verify Story 1 rather than introduce new author value, so P2.

**Independent Test**: Run the two E2E lanes in CI; both complete green driving the survey through the modular-loader flows.

**Acceptance Scenarios**:

1. **Given** the cutover has landed, **When** the two E2E lanes run, **Then** both pass without being skipped.
2. **Given** a regression is introduced in flow ordering or question content, **When** the lanes run, **Then** at least one lane fails (the lanes are a real gate, not a no-op).

---

### User Story 4 - Legacy loader and full flows are retired without losing research (Priority: P3)

Once the three flows have cut over (Stories 1–3) and the golden comparisons confirm identical output, the legacy full-YAML loader and the four legacy full-flow files are deleted as a **separate, independently revertable change**. Deletion removes only the redundant **delivery form** of each question — the legacy YAML duplicate. The authored question **research/content is preserved**: modules a manifest no longer references remain compiled and test-covered as the question library (§3.8), and non-Roman-script research is explicitly never deleted.

**Why this priority**: This is the payoff (removing the duplication) but it is strictly downstream of the cutover and is the explicit out-of-#410 follow-up. Kept as its own commit/PR so #410 can close on Stories 1–3 and so the deletion reverts independently of the cutover.

**Independent Test**: After deletion, run the full survey for all phases; every flow resolves through the modular loader with no reference to the deleted files, and no question's research content has been lost (library modules still compile and their unit tests still pass).

**Acceptance Scenarios**:

1. **Given** the three flows have cut over and golden comparisons pass, **When** the legacy loader and the four legacy full-flow files are deleted, **Then** the full survey still runs for every phase with no broken import.
2. **Given** a question module is referenced by no surviving manifest, **When** the test suite runs, **Then** that library module still compiles and its per-question unit tests still pass (it is inert at runtime, not deleted).
3. **Given** the deletion change, **When** it is reverted in isolation, **Then** the cutover (Stories 1–3) remains intact and the legacy files are restored without touching the cut-over phase components.
4. **Given** the thin modular manifests and the flow examples, **When** the deletion lands, **Then** they are retained (only the four legacy full-flow files and the legacy loader are removed).

---

### Edge Cases

- **A legacy question has no equivalent registered module.** The cutover must surface this as a hard failure (the golden comparison shows a missing question), not silently drop the question. Resolution is to author/restore the module, never to skip the question.
- **identity-lite seed behavior (autonym → English name).** The autonym-pre-fills-English-name "default once, then user owns it" contract must survive the loader swap unchanged.
- **A module referenced only by the legacy YAML, never by a manifest.** It becomes a library/reserve module — preserved, compiled, and test-covered, not deleted (§3.8). Deletion of such a module is permitted **only** when its content is provably duplicated by a surviving module, and never for non-Roman-script research.
- **Import-extension breakage.** The repo uses explicit `.ts`/`.tsx` import extensions under bundler resolution; a move/rename that drops an extension breaks the build. Every edit must preserve extensions.
- **Deletion ordering.** Deleting any legacy YAML before its golden comparison passes would remove the comparison baseline — deletion must not precede successful golden comparison for that phase.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Phase A MUST resolve its survey flow through the modular loader against the existing `content/flows/phase_a_identity.modular.yaml` manifest instead of the legacy full-YAML loader.
- **FR-002**: Phase F MUST resolve its survey flow through the modular loader against the existing `content/flows/phase_f_helpdocs.modular.yaml` manifest instead of the legacy full-YAML loader.
- **FR-003**: A new thin modular manifest for identity-lite (`content/flows/identity_lite.modular.yaml`) MUST be created, and identity-lite MUST resolve through the modular loader against it. The manifest's referenced question set MUST match the legacy identity-lite flow one-for-one.
- **FR-004**: All `TODO(#410)` markers in the three cut-over phase components MUST be removed once their respective cutovers land.
- **FR-005**: The questions asked, their order, defaults/seeds, branching, and validation for Phase A, Phase F, and identity-lite MUST be identical before and after the cutover (verified by a golden comparison of modular-vs-legacy flow output per phase).
- **FR-006**: A golden comparison of modular-vs-legacy output MUST pass for a phase **before** any of that phase's legacy YAML is deleted.
- **FR-007**: The two Playwright E2E lanes (the remaining #410 AC#3) MUST be unblocked (no longer skipped) and MUST pass against the cut-over flows.
- **FR-008**: After the cutover and passing comparisons, the legacy full-YAML loader (`survey/loadFlow.ts` and its test) MUST be deleted.
- **FR-009**: After the cutover and passing comparisons, the four legacy full-flow files (`phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`) MUST be deleted.
- **FR-010**: The thin modular manifests (`content/flows/*.modular.yaml`) and the flow examples (`content/flows/_examples/*`) MUST be retained.
- **FR-011**: Deletion MUST remove only redundant **delivery forms** of a question. A question module MUST NOT be deleted unless its content is provably duplicated by a surviving module; non-Roman-script research MUST NOT be deleted under any circumstances.
- **FR-012**: A registered question module that no surviving manifest references MUST remain compiled and test-covered (a library/reserve module, inert at runtime), not deleted.
- **FR-013**: The cutover (FR-001..FR-007) and the legacy deletion (FR-008..FR-010) MUST be delivered as separate, independently revertable changes (commits/PRs), so #410 can close on the cutover and the deletion reverts on its own.
- **FR-014**: Every file move, rename, or edit MUST preserve explicit `.ts`/`.tsx` import extensions (bundler-resolution requirement).
- **FR-015**: Phase B MUST remain unchanged — it already resolves through the modular loader and is not in scope for re-work.

### Key Entities *(include if feature involves data)*

- **Legacy full-YAML flow**: A complete survey flow expressed inline as one YAML file, parsed by the legacy loader. The redundant delivery form being retired for A/F/identity-lite. Four exist (`phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`).
- **Thin modular manifest**: A small YAML file that references question ids resolved against the registry by the modular loader; the surviving delivery form. Exists for A/F/B; must be created for identity-lite.
- **Question module**: One authored question with its definition, validation, and fixtures, registered by id. A module referenced by some manifest is "in flow"; one referenced by none is a library/reserve module — preserved, not deleted.
- **Golden comparison baseline**: The recorded legacy-flow output per phase, used to prove the modular-loader output is identical before any deletion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of survey flows (A, B, F, identity-lite) resolve through the single modular loader; zero flows depend on the legacy full-YAML loader after the deletion change.
- **SC-002**: For each of Phase A, Phase F, and identity-lite, the post-cutover question set, order, defaults, branching, and validation match the pre-cutover flow with zero differences (golden comparison passes).
- **SC-003**: Zero `TODO(#410)` markers remain in the survey source after the cutover.
- **SC-004**: Both Playwright E2E lanes run unskipped and pass.
- **SC-005**: Zero questions lose their research/content: every question module that survives manifest-dereferencing still compiles and its unit tests still pass; no non-Roman-script research module is deleted.
- **SC-006**: The legacy loader and the four legacy full-flow files are removed, and the deletion change can be reverted in isolation without disturbing the cutover.
- **SC-007**: The codebase builds and typechecks with all import extensions intact (no resolution failures introduced by moves/edits).

## Assumptions

- The modular loader and the legacy loader both produce the same flow-definition shape, so the cutover for Phase A/F is a loader + manifest-source swap rather than a behavioral rewrite (Phase B already demonstrates this pattern).
- The existing `phase_a_identity.modular.yaml` and `phase_f_helpdocs.modular.yaml` manifests already reference the correct question sets for A and F (they were created when the 93 modules were authored); the cutover wires the components to them.
- The two Playwright E2E lanes that satisfy #410 AC#3 already exist as skipped specs in the studio E2E directory and need unblocking rather than authoring from scratch.
- The TODO markers' aspirational manifest names (`phase_a.modular.yaml`, `phase_f.modular.yaml`, `identity_lite.modular.yaml`) are not the on-disk names for A/F; the cutover targets the real existing files for A/F and creates the real file for identity-lite. (Any later functional renaming per the plan's Decision 2026-06-26 is out of scope for this feature.)
- This is a Content-team-adjacent change to survey wiring and flow data; it touches no locked contract (`Pattern`/`KeyboardIR`), no validator layering, and no output path, so the constitution gates are satisfied by non-interference.
- Phase B requires no change and is excluded from the cutover work.
