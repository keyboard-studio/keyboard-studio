# Feature Specification: Decompose wizard steps — track / project_name as modular SurveyRunner question flows with Flow Map drill-downs

**Feature Branch**: `km/decompose-wizard-questions`

**Created**: 2026-06-30

**Status**: **LANDED on branch `km/decompose-wizard-questions` (PR pending)** — track and project_name are now modular question flows (Phase-G question modules: `track_choice`, `project_display_name`, `project_keyboard_id`; runner wrappers `PhaseTrack` / `PhaseProjectName`; thin flows `content/flows/track.modular.yaml` and `content/flows/project_name.modular.yaml`). Both steps render as expandable "blown-up" drill-down graphs on the developer Flow Map, mirroring the Phase A/B/F drill-downs that were already present. Gallery decomposition (carve / mechanisms / touch) remains OUT of scope — see explicit non-goals below.

**Input**: [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2 (`track` row in the per-step contract table), §3.2 (per-opaque-step breakup — `track` row), and Decision 6 (resolved 2026-06-29, Matt). The governing scope is the Phase-2 "modular gate question" model ratified in Decision 6: the copy/adapt fork becomes a YAML `next` rule (CYOA fork in data), not a hand-coded `if`. The copy/adapt fork continues to live at the manifest level (`project_name` is `spine:false`, `joinTarget:characters`); the future `qu-mutate-track` spec (migration-plan spec #10) makes the YAML `next` rule the live routing path via `mutate()`.

**Governing scope**: This feature implements the Decision-6 intent from [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §3.2 (`track` row) and §2 (`track` contract table row). It does not re-derive that scope. Gallery decomposition (carve / mechanisms / touch) requires the loop primitive (migration-plan §3.1, spec #9 `qu-loop-primitive`, deferred pending Matt's build-vs-defer call) and is explicitly excluded.

---

## UX deltas (honest account)

Two deliberate UX changes land with this feature:

| Step | Before | After |
|---|---|---|
| `track` | Rich bespoke panel (`TrackStep.tsx`), hand-placed by `StudioShell` via `handleTrackSelected` | SurveyRunner radio question (`track_choice` module), rendered by the modular flow runner; behavior byte-identical, presentation changes to a standard radio-button form |
| `project_name` | Single side-by-side panel with display name + slug fields shown simultaneously | Two sequential modular questions: `project_display_name` (free-text) then `project_keyboard_id` (slug pre-seeded from the display-name answer); behavioral output identical, presentation is sequential |

The copy/adapt fork at the manifest level is unchanged: `project_name` remains `spine:false`, `joinTarget:characters`. The YAML `next` rule declared here is advisory metadata for the map drill-down; the hand-coded fork in `StudioShell.handleTrackSelected` is the live routing path until `qu-mutate-track` (spec #10) makes the YAML rule load-bearing.

---

## Functional Requirements

- **FR-001**: `track_choice`, `project_display_name`, and `project_keyboard_id` MUST exist as registered `QuestionModule` entries in the `questionRegistry` with valid `inputs`, `writes`, and `next` declarations.
- **FR-002**: Thin `content/flows/track.modular.yaml` and `content/flows/project_name.modular.yaml` MUST exist and wire the three question modules into the CYOA flow graph.
- **FR-003**: `PhaseTrack` and `PhaseProjectName` runner wrappers MUST render the respective modular flows via `SurveyRunner`, replacing the bespoke panel components.
- **FR-004**: Both steps MUST render as expandable "blown-up" drill-down graphs on the developer Flow Map, mirroring the Phase A/B/F drill-down pattern. The drill-downs are keyed by `questionRegistry` entries (the spec-015 registry-keyed drill-down mechanism).
- **FR-005**: The copy/adapt manifest fork MUST remain unchanged: `project_name` remains `spine:false`, `joinTarget:characters`; the manifest-level fork at `StudioShell.handleTrackSelected` remains the live routing path.
- **FR-006**: Gallery steps (carve / mechanisms / touch) MUST NOT be decomposed by this feature. Their current write mechanisms are unchanged. Gallery decomposition is gated on the loop primitive (spec #9, Matt's call).
- **FR-007**: `pnpm typecheck`, studio/contracts `vitest`, and `pnpm depcruise` MUST remain green. The drift guardrail (spec 016) MUST remain green with the two new drill-downs resolving correctly.

**Out of scope (explicit non-goals)**

- **FR-008**: Gallery decomposition (carve, mechanisms, touch) is NOT in scope. It requires the loop primitive (migration-plan §3.1, spec #9 `qu-loop-primitive`), which is deferred pending Matt's build-vs-defer call. No per-key or per-element loop construct is introduced.
- **FR-009**: Making the YAML `next` rule in `track.modular.yaml` the live routing path (replacing `StudioShell.handleTrackSelected`) is NOT in scope — that is `qu-mutate-track` (migration-plan spec #10), a Phase-2 follow-up.
- **FR-010**: No contracts bump. No new `KeyboardIR` field. No §18 sign-off.

---

## Success Criteria

- **SC-001**: The developer Flow Map shows blown-up drill-down graphs for both `track` and `project_name`, matching the visual treatment of the Phase A/B/F drill-downs already present.
- **SC-002**: `track_choice`, `project_display_name`, and `project_keyboard_id` are registered in the `questionRegistry` and covered by the module-count gate.
- **SC-003**: The SurveyRunner radio presentation for `track_choice` is byte-identical in behavior (fork outcome) to the former `TrackStep` panel.
- **SC-004**: The sequential `project_display_name` → `project_keyboard_id` question pair produces the same display name + keyboard ID outputs as the former side-by-side panel, with the slug pre-seeded from the display-name answer.
- **SC-005**: The drift guardrail (spec 016) stays green. `pnpm typecheck` + vitest + `pnpm depcruise` pass.
- **SC-006**: Gallery steps (carve / mechanisms / touch) are untouched — their map nodes, write mechanisms, and render paths are byte-identical to before.

---

## Assumptions

- Spec 015 (map projection), spec 016 (drift guardrail), and spec 021 (gallery/wizard node-metadata rendering) are already landed — the registry-keyed drill-down mechanism for the Flow Map is in place.
- Decision 6 (resolved 2026-06-29, Matt) ratifies the modular gate question model for `track`: the copy/adapt fork is CYOA data, not a hand-coded `if`. This spec implements Decision 6.
- The loop primitive (spec #9 `qu-loop-primitive`) is deferred. Gallery decomposition does not proceed until Matt's build-vs-defer call on spec #9.
- The `qu-mutate-track` follow-up (migration-plan spec #10) makes the YAML `next` rule load-bearing and routes the fork through `mutate()`. That is Phase-2 work, not in this feature.
