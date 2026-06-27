# Feature Specification: Dashboard-honest flow map (P0)

**Feature Branch**: `010-dashboard-honest-flow-map`

**Created**: 2026-06-26

**Status**: Draft

**Governing doc**: `docs/survey-modularity-cyoa-plan.md` — phase **P0** ("Dashboard-honest flow map (PREREQUISITE)") and §3.7 ("Dashboard — flow map becomes the index"). This feature is the **read-only** flow map / viewer that the rest of the survey-modularity / CYOA refactor builds on. The **dev-only interactive editor** layered on top of it later is carved out to [`specs/009-flow-map-editor/spec.md`](../009-flow-map-editor/spec.md) and is **not** part of P0.

**Input**: User description: "Make the studio flow map read what actually runs at runtime, so the map node set equals the live runtime step set with no ghost or missing nodes — establishing the durable 'map == runtime' invariant that every later refactor phase is verified against. Minimal scope: point the graph builder at the live registry/modular manifests for Phase B; make galleries and hand-built wizard steps appear as stub nodes. Read-only viewer only, reusing existing UI."

## Context: why this is non-obvious *(read first)*

The current behaviour is not what a reader of the UI would assume, and these facts shape every requirement below:

- **The flow map does not read what runs.** Today `flowmap/FlowMapView.tsx` → `buildFlowGraph.ts` builds the graph from the legacy `content/flows/*.yaml` (via `parseFlow`), **not** from the live modular registry / `*.modular.yaml` manifests that actually drive the runtime survey. The map can therefore show steps that no longer run, and miss steps that do — it is **silently stale**.
- **Runtime truth is split by phase, today.** **Phase B (characters) already runs on the modular registry** (`survey/questions/b/*` via `loadModularFlow`). **Phase A (identity), Phase F (help docs), and identity-lite still resolve through the legacy full-YAML loader** (`loadFlow`); their cutover to modular is a *later* phase (P3), out of scope here. "What runs" is therefore the modular registry for B and the legacy YAML for A/F/identity-lite — and an honest map must reflect that split as it stands.
- **Two whole classes of step are invisible to the map.** Galleries (carve / mechanism / touch — the "Form 4" editors that mutate `KeyboardIR` directly) and the hand-built wizard-step components ("Form 3": track, project-name, scaffold, identity panel, base resolution) have **no `id` / `prompt` / `next`**, so the graph cannot see them at all. A user looking at the map has no idea these stages exist.
- **This is a prerequisite, not a polish item.** P0 establishes **"map == runtime by construction"** — the honest baseline that **every later refactor phase (P1–P5) is verified against**. Without it, regressions in ordering or reachability introduced by later phases are invisible. P0 is a **hard prerequisite**, not an independent nice-to-have.

## Clarifications

### Session 2026-06-26

- Q: Should a registered Phase B question that no manifest references (a §3.8 library/reserve entry) appear on the P0 map? → A: Yes — show it, **visually distinguished as "library / not-in-flow"** (pulls a slice of §3.7 library surfacing forward; honesty preserved because the node is explicitly marked as not running).
- Q: With no manifest-driven ordering until P4, how should gallery/wizard stub nodes be placed? → A: Group them in a **separate "not-yet-ordered" region** of the graph (visible, without implying a spine sequence P0 cannot guarantee).
- Q: How should the "map node set == live runtime step set" check (FR-008) be expressed? → A: **Derived-equality assertion against the registry** for the node set **plus an edge/label snapshot** for routing-regression coverage.

## User Scenarios & Testing *(mandatory)*

The users of this feature are (1) a **studio developer / content engineer** verifying that the survey flow is what they think it is — and, after this lands, verifying later refactor phases against an honest baseline — and (2) the **end user** of the studio, who should never be shown a map that misrepresents the survey they are taking. P0 ships only the **read-only** map; no authoring affordance.

### User Story 1 - The map reflects what actually runs for Phase B (Priority: P1)

A developer (or end user) opens the flow map and, for the character-discovery phase (Phase B), sees **exactly** the steps that the live survey runs — every question that runs appears as a node, and no node appears for a step that does not run. There are **no ghost nodes** (shown but not run) and **no missing nodes** (run but not shown).

**Why this priority**: This is the core deliverable and the whole point of P0 — the map stops lying. It is the smallest slice that establishes the "map == runtime" invariant, and it is independently valuable: an honest Phase B map is immediately useful for verifying the existing modular survey and is the baseline later phases are checked against.

**Independent Test**: Without taking the survey, compare the set of Phase B nodes the map renders against the set of Phase B steps the live runtime would run (the modular registry / manifest). Confirm the two sets are equal — no node lacks a runtime step and no runtime step lacks a node.

**Acceptance Scenarios**:

1. **Given** the live Phase B survey runs a known set of question steps, **When** the flow map is rendered, **Then** the map's Phase B node set equals that runtime step set exactly — no ghost nodes, no missing nodes.
2. **Given** a Phase B question whose `definition.next` branches on an answer (a side trail), **When** the map is rendered, **Then** the branch is shown as edges consistent with the runtime routing.
3. **Given** Phase A / Phase F / identity-lite, which still run on the legacy YAML loader today, **When** the map is rendered, **Then** those phases are still shown honestly (the map reflects their *current* runtime source), and the change to Phase B does not break or blank them.

### User Story 2 - Galleries and wizard steps are visible as stub nodes (Priority: P1)

A developer (or end user) viewing the map can see that the galleries (carve / mechanism / touch) and the hand-built wizard steps (track, project-name, scaffold, identity panel, base resolution) **exist as stages**, rendered as **stub nodes**, even though they are not registered questions and carry no rich metadata yet.

**Why this priority**: Today these stages are completely absent from the map, so the map misrepresents the *shape* of the flow, not just its Phase B contents. Surfacing them as stubs — even minimal placeholder nodes — is what makes the whole flow legible and is required for the map to be an honest dashboard. P1 alongside US1 because an "honest" map that still hides entire stages is not honest.

**Independent Test**: Render the map and confirm a stub node appears for each gallery and each hand-built wizard step, labelled enough to identify the stage, with no claim of metadata (inputs/writes/ordering) it does not yet have.

**Acceptance Scenarios**:

1. **Given** the carve, mechanism, and touch galleries and the five hand-built wizard steps exist in the studio, **When** the map is rendered, **Then** each appears as a distinct stub node identifiable by title.
2. **Given** a stub node, **When** it is inspected, **Then** it presents only the information P0 actually has (a title / kind) and does **not** fabricate inputs, writes, or precise ordering it cannot yet know.

### User Story 3 - The map is a trustworthy verification baseline (Priority: P2)

Because the map is now derived from the live runtime rather than a parallel YAML source, a developer can use it as the **baseline to verify later refactor phases against** — a future change that adds, drops, or misorders a runtime step shows up as a change in the map's node/edge set rather than passing silently.

**Why this priority**: This is the prerequisite role P0 plays for P1–P5. It is P2 because it is a consequence of US1/US2 being derived from the live runtime (it needs no extra surface), but it is the reason P0 must land first, so it is called out explicitly and guarded by a test.

**Independent Test**: Add or remove a Phase B step in the live runtime fixture and confirm the map's node set changes correspondingly (and a snapshot test flags the difference), demonstrating the map tracks the runtime rather than a stale copy.

**Acceptance Scenarios**:

1. **Given** the map is derived from the live runtime, **When** a Phase B step is added or removed in the runtime, **Then** the corresponding node appears or disappears with no separate edit to a map data source.
2. **Given** a snapshot of the map node/edge set, **When** the runtime step set diverges from it, **Then** the divergence is surfaced (a failing check), so later-phase regressions are caught.

### Edge Cases

- **A registered Phase B module that no manifest references** (a §3.8 "library / reserve" question — vetted but not in the live flow): it **does** appear, but rendered as a **distinct "library / not-in-flow" node** that is explicitly marked as not running — so it is not a ghost node (it never claims to run), and the map stays honest while surfacing the reserve set (Clarifications 2026-06-26).
- **Ordering of stub nodes**: there is no manifest-driven ordering yet (that is P4), so the galleries and wizard steps cannot be placed in their true spine position; they are grouped in a **separate "not-yet-ordered" region** rather than given a fabricated inline position (Clarifications 2026-06-26).
- **A Phase B branch (`definition.next`) that targets a step not in the live set** (a dangling route): the map should surface the dangling edge rather than silently drop it, so the dishonesty is visible rather than hidden.
- **An empty or unparseable runtime source**: the map must fail visibly (or render nothing for that phase with an indication) rather than fall back to the stale YAML and re-introduce the ghost-node problem P0 exists to remove.
- **The map rendered before any keyboard / working copy is selected**: the Phase B node set is still derivable from the registry/manifest (it does not depend on a chosen keyboard), so the map renders the flow shape regardless.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The flow map MUST derive its Phase B nodes from the **live runtime source** (the modular registry / `*.modular.yaml` manifest that actually drives the Phase B survey), **not** from the legacy `content/flows/*.yaml` parsed by `parseFlow`.
- **FR-002**: For Phase B, the rendered map's node set MUST **equal** the live runtime step set — **no ghost nodes** (rendered but not run) and **no missing nodes** (run but not rendered).
- **FR-003**: The map MUST render Phase B branching/side-trail routing (`definition.next`) as edges consistent with the runtime routing, and MUST surface a route whose target is absent from the live set rather than silently dropping it.
- **FR-004**: The map MUST continue to represent Phase A, Phase F, and identity-lite **honestly with respect to their *current* runtime source** (the legacy YAML loader, which still drives them today); the P0 change to Phase B MUST NOT blank, break, or misrepresent those phases. (Their cutover to modular is P3 and out of scope here.)
- **FR-005**: The map MUST render each **gallery** (carve, mechanism, touch) and each **hand-built wizard step** (track, project-name, scaffold, identity panel, base resolution) as a **stub node**, so no entire stage is invisible.
- **FR-006**: A stub node MUST present only information P0 actually possesses (a title / stage identity) and MUST NOT fabricate inputs, writes, completeness, or precise spine ordering it cannot yet derive (those arrive in later phases).
- **FR-007**: Because no manifest-driven ordering exists yet (P4), stub nodes MUST be grouped in a **separate "not-yet-ordered" region** of the graph rather than placed in a fabricated inline spine position that P0 cannot guarantee.
- **FR-008**: A registered Phase B question that **no manifest references** (a §3.8 library/reserve entry) MUST appear as a **distinct "library / not-in-flow" node**, visually differentiated from live runtime nodes and explicitly marked as not running — so the reserve set is surfaced without introducing a ghost node (FR-002 still holds: a "live" node always corresponds to a step that runs).
- **FR-009**: The map MUST remain **read-only**: it reuses the existing viewer UI and introduces **no authoring affordance** (no reorder, no constraint editing, no promotion — that is the deferred [009] editor).
- **FR-010**: The map's node/edge set MUST be **verifiable against the live runtime** by an automated check (so a later-phase change that diverges the runtime from the map is caught), per the P0 role as the verification baseline for P1–P5. The check MUST combine a **derived-equality assertion** of the live node set against the modular registry (encoding FR-002, durable against incidental change) **with an edge/label snapshot** that catches branch-routing regressions.
- **FR-011**: When the live runtime source for a phase is empty or unparseable, the map MUST fail visibly for that phase rather than silently falling back to the legacy YAML and re-introducing stale nodes.

### Key Entities *(include if feature involves data)*

- **Live runtime step set (Phase B)**: the set of steps the modular Phase B survey actually runs — the modular registry resolved through the `*.modular.yaml` manifest. The authoritative input the map's Phase B nodes are derived from (FR-001/FR-002).
- **Legacy YAML flow (A / F / identity-lite)**: `content/flows/*.yaml` parsed by `parseFlow` — still the *runtime* source for those phases today, so still the honest source for their map nodes until P3 (FR-004).
- **Flow-map graph**: the node/edge view the read-only viewer renders. Nodes = steps (Phase B questions + stub nodes for galleries/wizard steps); edges = `definition.next` / branch routing. The artifact the verification check snapshots (FR-008).
- **Stub node**: a placeholder node for a gallery or hand-built wizard step that has no `id`/`prompt`/`next` and no rich metadata yet — identifiable by title/kind only (FR-005/FR-006).
- **Ghost node / missing node**: a node shown for a step that does not run / a runtime step with no node — the two failure modes P0 eliminates for Phase B (FR-002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For Phase B, the map node set equals the live runtime step set in **100%** of renders — zero ghost nodes and zero missing nodes (verified by an automated node-set comparison).
- **SC-002**: **100%** of galleries and hand-built wizard steps appear as identifiable stub nodes on the map (none of these stages is invisible).
- **SC-003**: **0** map nodes for Phase B are sourced from the legacy `content/flows/*.yaml`; the Phase B node set is derived entirely from the live runtime.
- **SC-004**: Phase A / F / identity-lite remain rendered and honest after the change — **0** of those phases are blanked or broken by the Phase B switch.
- **SC-005**: A change that adds or removes a Phase B runtime step is reflected in the map's node set with **no** separate map-data edit, and a divergence between the runtime step set and the map is caught by a failing check in **100%** of such cases.
- **SC-006**: The viewer remains read-only — **0** authoring affordances ship in P0.

## Assumptions

- **Phase B is the only phase whose runtime truth is modular today**; A/F/identity-lite remain on the legacy YAML loader until P3. P0 therefore switches *only* Phase B's source to the live registry and leaves A/F/identity-lite reading the YAML that still legitimately drives them (FR-004).
- **The existing viewer UI is reused.** P0 changes *what the graph is built from*, not how it is drawn; no new visual design or interaction model is introduced.
- **The modular registry / `*.modular.yaml` manifest for Phase B is the correct definition of "what runs"** for the purpose of the map — i.e. the same source the runtime survey resolves through.
- **Rich per-step metadata (inputs / writes / ordering / completeness) does not exist yet** and is not required by P0; it arrives in later phases (P2 for `inputs`/`writes`, P4 for manifest ordering). Stub nodes deliberately carry none of it.
- **The verification check operates on the map's node/edge set**, not on a live survey run, so it can run as a fast unit/snapshot test without an end-to-end harness.

## Out of Scope

- **The dev-only interactive flow-map editor** — reorder, constraint editing, library promotion, manifest write-back. Carved out to [`specs/009-flow-map-editor/spec.md`](../009-flow-map-editor/spec.md); P0 ships the read-only viewer only.
- **Declared `inputs` / `writes` and the `IRPath` type** (plan §3.3 / P2) — the map shows no input-requirement or IR-mutation metadata in P0.
- **Manifest-driven ordering and the unified `steps/` model** (plan §3.4 / P4) — so true spine ordering of stub nodes is not guaranteed in P0.
- **The A/F/identity-lite cutover to the modular loader and deletion of the legacy YAML loader** (plan P3) — P0 leaves those phases on their current source.
- **The KeyboardIR `mutate` seam and completeness / staleness checks** (plan §3.5 / P5) — P0's verification is limited to "map node set == live runtime step set," not the transitive-closure staleness / acyclicity / rejoin / shippability invariants of the later dashboard.
- **Any new authoring UI or visual redesign** — existing viewer chrome is reused.

## Dependencies

- **Live Phase B modular registry / manifest** — `survey/questions/b/*` resolved via `loadModularFlow` and the `*.modular.yaml` manifest; the source the map's Phase B nodes are derived from.
- **Existing flow-map viewer** — `flowmap/FlowMapView.tsx` and the graph-building path it renders; P0 repoints its data source (mechanism deferred to the plan).
- **Gallery and wizard-step components** — carve / mechanism / touch galleries and the five hand-built wizard steps; P0 needs only enough identity (a title / kind) to emit a stub node for each.

## Clarifications / Open Questions

All Day-1 open questions for P0 were resolved in the 2026-06-26 clarification session (see the **Clarifications** section above): reserve/library modules appear as distinct "library / not-in-flow" nodes (FR-008); stub nodes are grouped in a "not-yet-ordered" region (FR-007); the verification check is a derived-equality assertion plus an edge/label snapshot (FR-010). No open questions remain blocking `/speckit-plan`.
