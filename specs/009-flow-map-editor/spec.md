# Feature Specification: Dev-only interactive flow-map editor

**Feature Branch**: `009-flow-map-editor`

**Created**: 2026-06-26

**Status**: Draft (deferred — not built as part of the survey-modularity/CYOA refactor)

**Governing doc**: Originates from `docs/survey-modularity-cyoa-plan.md` §3.7 ("Dashboard — flow map becomes the index"), specifically the `Dev-only authoring` block (Decided 2026-06-26). This feature **carves out** the interactive editor portion of §3.7, which is UI-heavy and **explicitly out of scope for the refactor** (see plan §1 "Explicitly OUT of scope"). The **read-only** flow map / viewer ships in the refactor as **P0** (the dashboard-honest flow map); this spec covers only the **authoring** layer added on top of it later.

**Input**: User description: "A dev-only authoring UI layered on the read-only flow map: reorder steps, edit constraints, and promote library questions into the flow by direct manipulation of the flow-map graph, with edits writing back to the flow manifest as a reviewable git diff."

## User Scenarios & Testing *(mandatory)*

The user of this feature is a **studio developer / content engineer**, not an end user (the end user gets the read-only viewer only, §3.7). Today, changing the survey flow — reordering steps, retargeting a side trail, locking a step, or pulling a vetted question out of the library (§3.8) into the live flow — requires hand-editing `content/flows/*.modular.yaml` and reasoning about the §3.5 invariants (acyclicity, side-trail rejoin, spine-prefix shippability, transitive staleness closure) by eye. This feature replaces that hand-editing with direct manipulation on the flow-map graph, with the editor enforcing the same invariants the build/CI enforce, and persisting every edit back to the manifest as a reviewable diff.

### User Story 1 - Reorder the flow by dragging on the graph (Priority: P1)

A developer adjusting the survey sequence drags a step to a new position on the flow-map graph instead of hand-editing the manifest's ordered step list, and the change is written back to `content/flows/*.modular.yaml` as a git diff.

**Why this priority**: Reordering is the most common authoring action and the single edit hand-editing makes most error-prone (an off-by-one in an ordered list silently breaks the spine prefix). It is the smallest independently shippable slice — a viewer that can only reorder is already useful and demonstrates the write-back round-trip end to end.

**Independent Test**: Open the editor (dev build) on a flow with a known step order, drag one step earlier in the spine, save, and confirm `content/flows/*.modular.yaml` now lists the steps in the new order and the diff contains only that reordering — with no change to the question `.ts` modules.

**Acceptance Scenarios**:

1. **Given** a flow whose manifest lists steps in order [A, B, C], **When** the developer drags C ahead of B and saves, **Then** the manifest reflects [A, C, B] and the change is a reviewable git diff in `content/flows/*.modular.yaml`.
2. **Given** a reorder that would move a step ahead of one whose output it consumes (§3.5 staleness), **When** the developer drags it, **Then** the editor surfaces the resulting staleness closure live (before save) so the downstream impact is visible.
3. **Given** a reorder that would break spine-prefix shippability (the validity gate, §3.5/§7), **When** the developer attempts to save, **Then** the save is rejected or flagged with the same diagnostic the build/CI produces, and the manifest is not written.

### User Story 2 - Edit a step's constraints in place (Priority: P1)

A developer changes a step's constraints — a **lock**, its **spine vs. side-trail placement** (`spine` / `joinTarget`), or its **visibility / branch conditions** (`definition.next`, the §3.5 CYOA metadata) — by editing it on the graph, and the change round-trips to the manifest.

**Why this priority**: Constraint edits are the other half of routine flow authoring and exercise the full §3.5 metadata surface. Locks and side-trail placement are exactly the metadata that is hardest to get right by hand and most consequential when wrong (an unreachable side trail, a cycle, an unsatisfiable branch). P1 alongside reordering because the two together cover the everyday authoring loop.

**Independent Test**: Open the editor on a step that is on the spine, change it to a side trail with a `joinTarget`, save, and confirm the manifest carries the new `spine` / `joinTarget` metadata and the editor blocked the change had the `joinTarget` been unreachable.

**Acceptance Scenarios**:

1. **Given** a spine step, **When** the developer moves it to a side trail and sets a reachable `joinTarget`, **Then** the manifest records the side-trail placement and `joinTarget`, and the diff is reviewable.
2. **Given** a branch-condition edit (`definition.next`) that would introduce a cycle, **When** the developer attempts to save, **Then** the editor rejects/flags it against the §3.5 acyclicity (no-cycle) invariant before the manifest is written.
3. **Given** a side-trail placement whose `joinTarget` is not reachable on any path, **When** the developer attempts to save, **Then** the editor flags the side-trail-rejoin (`joinTarget` reachability) invariant and does not write the manifest.
4. **Given** any constraint edit, **When** it is saved, **Then** only the manifest / config changes — the question `.ts` modules are never hand-edited.

### User Story 3 - Promote a library question into the flow (Priority: P2)

A developer pulls a vetted reserve question (§3.8 question library — e.g. the non-Roman-script research modules) into the live flow by adding it to the graph, which is realized as adding its `definition.id` to a phase manifest. No separate path and no code-rescue.

**Why this priority**: Promotion is the same gesture as any other edit (a manifest reference add, §3.7), so it reuses the write-back and validation built for US1/US2. P2 because it depends on the §3.8 library being browsable in the dashboard and is less frequent than reorder/constraint edits, but it is the payoff that makes the library catalog actionable.

**Independent Test**: With a library module that no manifest references (it appears in the dashboard's "library / not-in-flow" set, §3.8), drag it into a phase on the graph, save, and confirm the phase manifest now references its `definition.id` and the module is now live in the flow — with its `.ts` module unchanged.

**Acceptance Scenarios**:

1. **Given** a registered `QuestionModule` that no manifest references (a §3.8 reserve entry), **When** the developer promotes it into a phase on the graph and saves, **Then** the phase manifest gains its `definition.id` and the diff is reviewable.
2. **Given** a promotion whose `inputs` cannot be satisfied at its chosen position (inputs-satisfiability, §3.5/§3.7), **When** the developer attempts to save, **Then** the editor flags the unsatisfiable `inputs` before the manifest is written.
3. **Given** a promoted question, **When** it is saved, **Then** the promotion is a manifest reference add only — the question's `.ts` module / content is not modified, and no module is deleted (§3.8 no-delete).

### User Story 4 - Every edit is a reviewable, validated diff (Priority: P2)

For any edit (reorder, constraint, promotion), the developer can see and review the exact manifest diff the editor will produce, and no edit that violates a build/CI invariant can be silently persisted.

**Why this priority**: This is the cross-cutting guarantee that makes the editor trustworthy — the manifest stays the auditable source of truth (§3.4) and the editor can never push the flow into a state CI would reject. P2 because the per-action stories (US1–US3) deliver the visible authoring value first, but this is what keeps the manifest honest.

**Independent Test**: Make a valid edit and confirm the previewed diff matches what is written to `content/flows/*.modular.yaml`; force an invariant-violating edit and confirm it cannot be saved and produces the same diagnostic as the build/CI run.

**Acceptance Scenarios**:

1. **Given** any pending edit, **When** the developer reviews it, **Then** the editor shows the manifest diff that will be committed, and the persisted change matches it exactly.
2. **Given** an edit that violates any §3.5 invariant (staleness, acyclicity, side-trail rejoin, spine-prefix shippability, inputs-satisfiability), **When** save is attempted, **Then** the editor reuses the same validation the build/CI runs (§7) and refuses to write the manifest.
3. **Given** a saved edit, **When** the developer inspects the working tree, **Then** the only changes are in `content/flows/*.modular.yaml` (manifest/config) — no runtime-only, in-memory mutation persists outside the manifest, and no `.ts` module changed.

### Edge Cases

- **Concurrent manifest change on disk** (another process or a `git rebase` rewrote `content/flows/*.modular.yaml` while the editor held a stale view): the editor MUST detect the divergence on save and refuse to overwrite, rather than clobbering the on-disk manifest. [NEEDS CLARIFICATION: reload-and-replay vs. hard-refuse on detected divergence.]
- **Promotion of a library module whose `inputs` are satisfiable at one position but not another**: the editor flags only the chosen position, and offers no auto-placement — the developer chooses the position.
- **An edit valid in isolation but that breaks an invariant only in combination** with another unsaved edit (e.g. two reorders): validation runs against the full pending edit set, not per-edit, so the combined state is what is checked at save.
- **The flow is already invalid on open** (a hand-edited manifest already violates an invariant): the editor surfaces the pre-existing violation read-only and does not require the developer to fix unrelated breakage to save an unrelated valid edit. [NEEDS CLARIFICATION: whether save is gated on total-flow validity or only on not-introducing-new violations.]
- **Editor reached in a production build** (misconfiguration): the authoring affordance MUST be absent / inert, not merely hidden — end users get the viewer only.
- **A reorder/constraint edit that changes nothing** (drag and drop back to origin): produces no manifest diff.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The editor MUST be a layer on top of the **read-only** flow map / viewer (the §3.7 dashboard, shipped as refactor **P0**); it MUST NOT replace or fork the viewer, and the viewer MUST remain fully functional without the editor.
- **FR-002**: The editor MUST let a developer **reorder** the manifest-driven step sequence (§3.4) by direct manipulation on the flow-map graph.
- **FR-003**: The editor MUST let a developer edit a step's **constraints** by direct manipulation: **locks**, **spine vs. side-trail placement** (`spine` / `joinTarget`), and **visibility / branch conditions** (`definition.next`) — the §3.5 CYOA metadata.
- **FR-004**: The editor MUST let a developer **promote a question from the library / reserve** (§3.8) into the flow as the same gesture as any other edit — realized as adding the question's `definition.id` to a phase manifest — with no separate code path and no code-rescue.
- **FR-005**: Every edit (reorder, constraint, promotion) MUST **write back to the flow manifest** (`content/flows/*.modular.yaml`, §3.4) as the **source of truth**, producing a **reviewable git diff**.
- **FR-006**: The editor MUST edit **config / manifest only**; it MUST NOT hand-edit the question `.ts` modules, and it MUST NOT delete a library module's content (§3.8 no-delete).
- **FR-007**: The editor MUST NOT persist any **hidden runtime-only mutation** — no flow change may exist outside the committed manifest; in-memory edits are reflected in the manifest diff or discarded.
- **FR-008**: The editor MUST **reuse the same validation** the build / CI runs (§7) to enforce the §3.5 invariants, and MUST **reject or flag** an edit that would break **acyclicity** (no-cycle) or **completeness / spine-prefix shippability** (the validity gate) before it can be saved.
- **FR-009**: The editor MUST also enforce the remaining §3.5/§3.7 invariants on save: **side-trail rejoin** (`joinTarget` reachability) and **inputs-satisfiability** (a promoted/reordered step's `inputs` must be satisfiable at its position).
- **FR-010**: The editor MUST surface the §3.5 **transitive staleness closure live** as the developer reorders, so the downstream impact of a move is visible **before** it is committed.
- **FR-011**: The editor MUST be gated behind a **dev flag / non-prod build** and MUST be **excluded from production builds**, so it never ships to end users; end users get the **read-only viewer only**.
- **FR-012**: Before saving, the editor MUST let the developer **review the exact manifest diff** that will be produced, and the persisted change MUST match that preview.
- **FR-013**: Validation MUST run against the **full set of pending edits** (the combined resulting flow), not per-edit in isolation, so a combination that breaks an invariant is caught at save.
- **FR-014**: On save, the editor MUST detect if the on-disk manifest has **diverged** from the version the editor loaded and MUST NOT silently overwrite it. [NEEDS CLARIFICATION: reload-and-replay vs. hard-refuse on divergence — see Edge Cases.]
- **FR-015**: A no-op edit (drag back to origin, set a value to its current value) MUST produce **no manifest diff**.

### Key Entities *(include if feature involves data)*

- **Flow manifest**: `content/flows/*.modular.yaml` — the ordered, constrained list of step references (`definition.id`) plus CYOA metadata (`spine`, `joinTarget`, `definition.next`, locks). The editor's sole persistence target and source of truth (§3.4).
- **Flow-map graph**: the rendered node/edge view the read-only viewer (P0) produces from the manifest; the editor's direct-manipulation surface (nodes = steps, edges = `definition.next` / side-trail metadata).
- **Pending edit set**: the developer's unsaved changes (reorders, constraint edits, promotions) held in memory; validated as a combined resulting flow and previewed as a single manifest diff before save.
- **Library / reserve entry**: a registered `QuestionModule` that no manifest references (§3.8) — the promotable building block; promotion adds its `definition.id` to a manifest, never edits or deletes its module.
- **Invariant validator**: the shared §3.5/§7 validation (acyclicity, side-trail rejoin, spine-prefix shippability, transitive staleness closure, inputs-satisfiability) reused from the build/CI so the editor cannot produce a flow CI would reject.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can reorder a step, retarget a side trail, lock a step, and promote a library question entirely through the editor, with **zero hand-edits** to `content/flows/*.modular.yaml`.
- **SC-002**: 100% of editor saves land as a **reviewable git diff** confined to `content/flows/*.modular.yaml`; no save changes a question `.ts` module and no save persists state outside the manifest.
- **SC-003**: 100% of edits that violate a §3.5 invariant are **rejected or flagged before save** with the **same diagnostic** the build/CI produces — no editor-produced flow ever fails the build/CI flow-validation that the editor itself passed.
- **SC-004**: The previewed diff matches the persisted manifest change in 100% of saves.
- **SC-005**: The editor and its authoring affordances are **absent / inert in production builds** in 100% of release artifacts (end users see the viewer only).
- **SC-006**: When a reorder introduces staleness, the staleness closure is shown **before** save in 100% of such reorders.

## Assumptions

- The **read-only flow map / viewer ships first** as refactor **P0** (the dashboard-honest flow map, plan §3.7 / P0); this feature is **gated on P0** and layers on top of it. It is **deferred out of the survey-modularity/CYOA refactor** and tracked separately by this spec.
- The **manifest schema** (`content/flows/*.modular.yaml`, plan §3.4) and the CYOA metadata model (§3.5) exist and are stable; the editor reads and writes that schema, it does not redesign it.
- The **question contract's `inputs` / `writes`** declarations (plan §3.3 / P2; a major `packages/contracts` bump per §18) exist and are populated, so inputs-satisfiability and staleness closure are computable.
- The **build/CI flow validation** (§7) exists as a reusable invariant check the editor can call directly, rather than a CI-only script — so the editor and CI share one validator and cannot disagree.
- The **§3.8 question library / reserve** is browsable in the dashboard (the "library / not-in-flow" set), so promotion has a source to drag from.
- The editor runs in a **dev / local** context with write access to the working tree (it produces git diffs); it does not commit or push on the developer's behalf.

## Out of Scope

- **End-user editing.** End users get the **read-only viewer only** (§3.7); the authoring affordance is dev-only and excluded from production builds (FR-011).
- **WYSIWYG editing of question *content*.** The editor edits the flow's **ordering and constraints** (the manifest) and **promotes** existing questions; it does **not** edit a question's prompt, options, or `mutate`/`inputs`/`writes` — those live in the `.ts` modules and are out of scope here (FR-006).
- **Multi-user / concurrent editing.** This is a single-developer, single-working-tree tool; real-time collaborative editing and server-side merge are out of scope. (Concurrent on-disk divergence is *detected and refused*, not *merged* — FR-014.)
- **Authoring new question modules.** Creating a new `QuestionModule` (a new `.ts` module) is out of scope; the editor only wires existing/registered modules into the flow.
- **The KeyboardIR `mutate` execution and the runtime write surface.** Like the refactor itself (plan §1), this feature touches manifest ordering/constraints only; it does not execute or alter `QuestionModule.mutate`.
- **Committing / pushing / PR creation.** The editor produces a working-tree diff; staging, committing, and opening PRs remain the developer's normal git workflow.
- **Deleting questions or library modules.** No-delete holds (§3.8); the editor never removes a module's content.

## Dependencies

- **Read-only flow map (P0)** — plan §3.7 / P0 "Dashboard-honest flow map (PREREQUISITE)." The editor is a layer on this viewer; hard prerequisite.
- **Manifest schema §3.4** — `content/flows/*.modular.yaml` ordering + the §3.5 CYOA metadata model the editor reads/writes.
- **Question contract `inputs` / `writes`** — plan §3.3 / P2 (major `packages/contracts` bump, §18) — required for inputs-satisfiability and the staleness closure.
- **Build/CI flow validation (§7)** — the shared invariant validator the editor reuses (acyclicity, side-trail rejoin, spine-prefix shippability, staleness, inputs-satisfiability).
- **Question library / reserve (§3.8)** — the promotable building-block set surfaced in the dashboard.

## Clarifications / Open Questions

- **[NEEDS CLARIFICATION]** On detected on-disk manifest divergence at save (FR-014): reload-and-replay the pending edits onto the new base, or hard-refuse and make the developer reopen? (See Edge Cases.)
- **[NEEDS CLARIFICATION]** Save gating when the flow is *already* invalid on open: gate save on total-flow validity, or only on "this edit introduces no *new* violation"? (See Edge Cases.)
- **[NEEDS CLARIFICATION]** Direct-manipulation primitive for constraint edits: are locks / spine-placement / branch conditions edited via the graph nodes/edges directly, an inspector panel bound to the selected node, or both? (UI affordance; the heavy UI work this feature defers.)
- **[NEEDS CLARIFICATION]** Diff-review surface: an in-app rendered manifest diff, or a handoff to the developer's normal `git diff` after write? FR-012 requires a preview; the form is open.
- **[NEEDS CLARIFICATION]** Whether promotion offers placement *assistance* (suggesting positions where a library question's `inputs` are satisfiable) or only validates the developer's chosen position (current FR-009 assumes the latter).
