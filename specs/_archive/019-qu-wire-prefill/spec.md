# Feature Specification: Wire prefill — Prefill resolves as a read-only registry drill-down under the opaque characters node (writes: [])

**Feature Branch**: `speckit/question-unification-phase1-specs`

**Created**: 2026-06-29

**Status**: **Ready for planning** — Phase 1, spec #5 of the Question Unification migration. Read-only / declare-consuming wiring of an **already-declared** registry drill-down. No contracts bump, no new write routing, no SPA render change, behavior byte-identical.

**Input**: Spec #5 (`qu-wire-prefill`) of [docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) (§2.1 prefill row; §2.4 step 4 "Wire each component step"; §2.5 branch/read-only oracle; §5 spec #5; findings (a)/(b) prefill rows; §2.4 step 3 C5 caveat — resolved in spec 017). Make the `Prefill` ("Confirm the basics") screen resolve as a **read-only, registry-keyed drill-down node UNDER the opaque `characters` node** (NOT a top-level manifest entry) on the developer Flow Map, with `writes: []` and its declared inputs (`header.bcp47` array + the session-level `ScriptPrefill`) populated by spec 017, while the existing hand-built `Prefill` render and its flow-advancing confirm are preserved **byte-identically**.

**Governing scope**: This feature implements **Phase 1 spec #5** of the Question Unification migration ([docs/design-notes/question-unification-migration-plan.md](../../docs/design-notes/question-unification-migration-plan.md) §2.1 prefill row, §2.4 step 4). It does **not** re-derive that scope. The companion research is recorded in [docs/design-notes/question-unification-findings.md](../../docs/design-notes/question-unification-findings.md) (findings (a): "Confirm the basics" Prefill is hand-built with no node; findings (b): Prefill is rendered as a hand-built sub-stage of `characters` — `StudioShell.tsx:930-940`, target "Promote to read-only modular node (`writes: []`)"). It depends on the map projection (spec 015), the drift guardrail (spec 016), and the declared `inputs`/`writes` + cross-graph C5 decision for `prefill` (spec 017).

> **Phase-1 vs Phase-2 boundary (load-bearing — do not blur).** `prefill` has **no manifest entry today** and cannot become a first-class manifest node in Phase 1 without **decomposing the opaque `characters` placeholder** (`manifest.ts:47-56`) — which is Phase 2 work. In Phase 1, `prefill` is a **registry-keyed drill-down UNDER the opaque `characters` node**, not a top-level manifest entry. "Resolve as its node" in Phase 1 means only that **the read-only drill-down node exists and the contract is declared** — the SPA render path is untouched: `StudioShell` continues to hand-place `Prefill` as a sub-stage of `characters` via its `activeStepId` / `charactersSub` switch (`StudioShell.tsx:930-940`), and the confirm still advances the flow exactly as today. Promotion to a first-class manifest entry is deferred to **Phase 2 spec #11 (`qu-mutate-prefill`)**.

> **Note on technical content in this spec (deliberate).** Per repository convention — where `packages/studio/src/steps/` manifest types, `packages/studio/src/survey/questions/registry.ts` registry shapes, and `packages/studio/src/dashboard/` graph model types are architectural contracts and the extracted `specs/NNN/` folders carry real material — the non-obvious constraints (the drill-down-under-`characters` placement, the read-only `writes: []` contract, the satisfiable session-derived inputs subject to the 017 C5 decision, the forbidden `irPath('header','script')`, the preserved hand-built render, the branch/read-only routing oracle) are specified here as Functional Requirements and Success Criteria. The *mechanics* (the exact snapshot harness, the precise drill-down nesting under `characters`) remain plan-level.

## Phase-1 invariants (thread through every requirement)

- **No new write routing.** This spec introduces no IR write path. `prefill` declares `writes: []` (it is a read-only confirm — no IR leaf). `mutate()` is NOT introduced for this surface. The confirm-advances-the-flow routing stays exactly where it is today: `handlePrefillConfirm` (`StudioShell.tsx:632-634`) sets `charactersSub` from `"prefill"` to `"B"`.
- **No contracts bump.** This spec reuses existing manifest/registry/`StepGraph` shapes and existing `KeyboardIR` locations. No new `KeyboardIR` field, no `@keyboard-studio/contracts` change, no §18 sign-off. In particular, **`irPath('header','script')` does not exist and MUST NOT be declared** — `prefill`'s script signal is the session-level `ScriptPrefill`, not a `header.script` IR leaf.
- **Behavior byte-identical.** The confirm resolves to exactly the same next sub-stage (`charactersSub` "prefill" → "B") as today; the SPA render of `Prefill` is byte-identical; the back action is unchanged.
- **Step appears as a map node.** The `prefill` node appears on the rendered Flow Map as a **read-only registry drill-down under the opaque `characters` node** (via the spec-015 projection's `questionRegistry`-keyed drill-down layer), NOT as a top-level manifest entry.
- **Read-only / declare-consuming as applicable.** This spec adds no new declaration of its own — `prefill`'s drill-down `inputs`/`writes` and the cross-graph C5 decision are declared/resolved by spec 017. It only confirms the read-only node resolves with that contract populated and that the confirm/render are unchanged.

## Clarifications

### Session 2026-06-29

Phase 1 scope was confirmed by Matt (2026-06-29, migration-plan §6): Phase 1 only specs converting the custom/bespoke flow stages into opaque "questions" with valid inputs and outputs. For this spec there is **no new open decision** — the one decision in scope is inherited from spec 017 and not re-opened here:

- **Cross-graph C5 mechanism for `prefill`'s session-derived inputs — owned by spec 017 ([NEEDS DECISION: D1] there).** `prefill` reads `header.bcp47` (an **array**, session-derived) + the session-level `ScriptPrefill`; the writer of `header.bcp47` is the survey question `iso_code` (`iso_code.ts:80` writes `irPath('header','bcp47')`) hidden inside the opaque `charactersStep` placeholder, not a manifest step. Spec 017 carries the C5 resolution (Option A subsumption vs Option B cross-graph exemption + separate question-writer C5, Option B recommended). **This spec does not open a new decision** — whichever option 017 picks determines how `prefill`'s session-derived inputs are validated as satisfiable; this spec consumes that resolution. It is surfaced below as **[NEEDS DECISION — inherited from 017]** so the dependency is visible, not actioned here.

No `[NEEDS CLARIFICATION]` markers remain that this spec must resolve.

## User Scenarios & Testing *(mandatory)*

> The "users" here are the keyboard author confirming the basics (whose confirm/back experience must not change) and the studio engineer reading the developer Flow Map (who gains a visible, read-only, contract-declared confirm node under `characters`) and the studio engineer who needs the map honest while the hand-built render path is preserved exactly. Each story is independently testable and independently valuable.

### User Story 1 - The confirm step appears as a read-only node under the characters stage (Priority: P1)

As a keyboard author (via the studio engineer reading the developer Flow Map), I want the "Confirm the basics" step to appear as a **read-only node in the flow map under the `characters` stage**, so that the confirm step is visible without changing what it reads or that it writes nothing.

**Why this priority**: This is the headline deliverable. Today the confirm step is a hand-built React screen (`Prefill.tsx:64`) with **no map node** (findings (a)) — the map is silent about a step every author takes. With the map projection (015) landed and `prefill`'s drill-down declared (017), this spec confirms `prefill` resolves as a read-only registry drill-down under the opaque `characters` node, making the confirm visible on the map while it stays read-only (`writes: []`).

**Independent Test**: With the dev flowmap flag on, render the Flow Map; drill into the opaque `characters` node; confirm there is exactly one `prefill` drill-down node under `characters` (NOT a top-level manifest entry), that it is marked read-only (`writes: []`), and that its declared `inputs` (`header.bcp47` array + session `ScriptPrefill`, from spec 017) are populated on the node — with **no** `irPath('header','script')` referenced.

**Acceptance Scenarios**:

1. **Given** the map projection (spec 015) is active, **When** the Flow Map renders and the opaque `characters` node is expanded, **Then** the `prefill` node appears as a **registry-keyed drill-down UNDER `characters`** (sourced from the `questionRegistry`-keyed drill-down layer), **NOT** as a top-level manifest entry on the spine.
2. **Given** the declared `prefill` drill-down contract (spec 017), **When** the `prefill` node renders, **Then** it carries `writes: []` (read-only confirm — no IR leaf) and `inputs` covering `header.bcp47` (array, session-derived) + the session-level `ScriptPrefill` (script subtag / A2 class / routing group), populated on the node.
3. **Given** the `prefill` node, **When** its contract is inspected, **Then** **no** `irPath('header','script')` is declared anywhere on it (the path does not exist in `KeyboardIR`); the script signal is the session-level `ScriptPrefill`.

---

### User Story 2 - Prefill is modeled as a read-only registry drill-down while the hand-built render is preserved (Priority: P1)

As a studio engineer, I want `prefill` modeled as a **read-only registry drill-down (`writes: []`) with satisfiable inputs**, so that the map is honest while the existing hand-built render path is preserved exactly.

**Why this priority**: This is the safety guarantee that makes the wiring shippable. The map must stop lying about the confirm step, but Phase 1 must not touch the live render path or the flow advance. If wiring the node also moved the render to a manifest-resolved component, the "map node appears" change and a render change would be entangled, and the Phase-2 promotion (spec #11) would have no byte-identical baseline. It is P1 because it is the same deliverable as US1 from the behavior side and is the cheapest regression lock on the confirm.

**Independent Test**: Confirm the `prefill` drill-down declares `writes: []` and that its declared inputs are **satisfiable** (subject to the 017 C5 resolution — Option B's separate question-writer C5 resolving `iso_code → header.bcp47` within the question graph, or Option A's subsuming-step write). Then run the confirm in the SPA: assert `handlePrefillConfirm()` advances `charactersSub` from `"prefill"` to `"B"` exactly as today, and that the `Prefill` render is byte-identical (StudioShell still hand-places it via `StudioShell.tsx:930-940`).

**Acceptance Scenarios**:

1. **Given** the `prefill` drill-down declaration (spec 017), **When** its inputs are checked for satisfiability, **Then** `header.bcp47` (array) + session `ScriptPrefill` resolve as satisfiable per the **017 C5 decision** (cross-graph / session-derived inputs handled by the chosen D1 option), without manifest-level C5 returning a spurious orphan.
2. **Given** the SPA, **When** `StudioShell` reaches `stepId === "characters"` with `charactersSub === "prefill"`, **Then** it hand-places `<Prefill>` as a sub-stage of `characters` via the `activeStepId` / `charactersSub` switch (`StudioShell.tsx:930-940`) exactly as today; there is no manifest-resolved render; the `Prefill` render is byte-identical.
3. **Given** the confirm, **When** `handlePrefillConfirm()` runs (`StudioShell.tsx:632-634`), **Then** it sets `charactersSub` from `"prefill"` to `"B"` (advancing into Phase B), exactly as today; the back action (`handlePrefillBack`, `StudioShell.tsx:721`) is also unchanged.
4. **Given** Phase 1, **When** the node resolves, **Then** `prefill` is **NOT** promoted to a first-class manifest entry (that is Phase 2 spec #11) — it stays a registry-keyed drill-down under the opaque `characters` node.

---

### User Story 3 - The wiring stays green under the drift guardrail and the full gate (Priority: P2)

The studio engineer can ship this wiring with the drift guardrail (spec 016) staying green with `prefill` resolving as a question-graph drill-down node, and with `pnpm typecheck` + vitest + `pnpm depcruise` all green.

**Why this priority**: The drift guardrail (016) enforces the rendered-graph ⟺ manifest+`questionRegistry`-runtime bijection; `prefill` resolving as a `questionRegistry`-keyed drill-down must keep that bijection satisfied (it is a registry id the runtime reaches via the confirm sub-stage, so it must keep a rendered drill-down node — checked in the **question** graph per §2.2(b), not the manifest graph). It is P2 because it is a non-functional guard on US1–US2 rather than a user-visible behavior, but it is the gate that proves the wiring did not introduce drift.

**Independent Test**: Run the drift guardrail (spec 016) with `prefill` resolving as a question-graph drill-down node; confirm green (the `prefill` registry id has a rendered drill-down node; the negative test stays red only for a deliberately-uncovered id). Run `pnpm typecheck`, the studio + contracts vitest suites, and `pnpm depcruise`; confirm green.

**Acceptance Scenarios**:

1. **Given** `prefill` resolving as a question-graph drill-down node, **When** the drift guardrail (spec 016) runs, **Then** it stays green — `prefill` is reachable in the question graph (reached via the confirm sub-stage) and has a rendered drill-down node (no orphan, no uncovered id); reachability is computed **per-graph** (question graph) per §2.2(b).
2. **Given** the full gate, **When** `pnpm typecheck` + studio/contracts vitest + `pnpm depcruise` run, **Then** all are green, with no new `dashboard → stores` or `dashboard → editors` edge.
3. **Given** the flow-routing snapshot test (§2.5), **When** it runs in CI, **Then** it is green and locks the resolved next sub-stage (`charactersSub` "prefill" → "B") for the confirm.

---

### Edge Cases

- **Flag off entirely**: the developer Flow Map (`FlowMapView`) does not mount (per `SHOW_FLOWMAP`, `StudioShell.tsx:84`), so no projection runs; the SPA still hand-places `Prefill` as a sub-stage of `characters` and the confirm advances identically. Output is byte-identical to today.
- **`prefill` is not a manifest entry — it is a drill-down**: `prefill` has no manifest entry and MUST NOT be added as one in Phase 1; it resolves only as a `questionRegistry`-keyed drill-down under the opaque `characters` node. The drift guardrail checks it in the **question** graph (§2.2(b)), not via `findUnreachable` on the manifest.
- **`writes: []` — no IR/phase-result to compare**: `prefill` is a read-only confirm, so the byte-identical oracle is a **flow-routing snapshot** (resolved next sub-stage `charactersSub` "prefill" → "B"), NOT an emit-byte or `SurveyPhaseResult` comparison (§2.5 branch/read-only surfaces). There is no IR or phase-result output to diff.
- **`irPath('header','script')` forbidden**: the path does not exist in `KeyboardIR` (`keyboard-ir.ts:348-359`); `prefill`'s script signal is the session-level `ScriptPrefill`. A test asserts no declaration references `irPath('header','script')`.
- **Cross-graph input satisfiability**: `prefill`'s `header.bcp47` writer (`iso_code`) lives inside the opaque `charactersStep`, so satisfiability rides on the **017 C5 decision** (D1) — this spec consumes that resolution and does not re-resolve it; if 017 has not resolved D1, this spec inherits the [NEEDS DECISION].
- **Component resolution by manifest is out of scope**: there is no `SurveyView`; `prefill` is not rendered from a manifest `component`. Any move to render `Prefill` from the manifest/registry is a Phase-2 user-facing render change requiring parity proof (§2.4 step 4) — spec #11.
- **Promotion to first-class manifest entry**: requires decomposing the opaque `characters` placeholder — Phase 2 (spec #11). This spec must not anticipate or partially perform that decomposition.

## Requirements *(mandatory)*

### Functional Requirements

**The prefill node resolves on the map (read-only drill-down under characters)**

- **FR-001**: The `prefill` step ("Confirm the basics", hand-built `Prefill.tsx:64`) MUST resolve as a **read-only, registry-keyed drill-down node UNDER the opaque `characters` node** on the rendered Flow Map (via the spec-015 projection's `questionRegistry`-keyed drill-down layer) once foundation (a) / spec 015 has landed. It MUST **NOT** resolve as — or be promoted to — a top-level manifest entry (that requires decomposing the `characters` placeholder; Phase 2 spec #11).
- **FR-002**: The `prefill` node MUST render with its declared contract (from spec 017) **populated on the node**: `writes: []` (read-only confirm — no IR leaf) and `inputs` covering `header.bcp47` (an array, session-derived) + the session-level `ScriptPrefill` (script subtag / A2 class / routing group).
- **FR-003**: The `prefill` node MUST be marked / projected as **read-only** (its `writes` is empty), distinguishing it from write-bearing editor-steps on the spine.
- **FR-004**: **`irPath('header','script')` MUST NOT be declared anywhere** on the `prefill` node. It does not exist in `KeyboardIR` (`keyboard-ir.ts:348-359`); `prefill`'s script signal is the session-level `ScriptPrefill`. A test MUST assert no declaration references it (FR-012).

**Declared inputs are satisfiable (subject to the 017 C5 decision)**

- **FR-005**: `prefill`'s declared inputs (`header.bcp47` array + session `ScriptPrefill`, from spec 017) MUST be **satisfiable** subject to the **017 cross-graph C5 decision (D1)** — whichever option 017 picks (Option A subsumption vs Option B cross-graph exemption + separate question-writer C5) determines how the session-derived inputs are validated. This spec **consumes** that resolution and MUST NOT open a new decision or re-resolve the C5 mechanism (it lives in spec 017).
- **FR-006**: Manifest-level C5 (`checkInputsSatisfiable`, `completeness.ts:419-437`) MUST return **no spurious orphan** for `prefill` once the 017 D1 decision is applied; satisfiability of `prefill`'s cross-graph / session-derived inputs is established per that decision (Option B's separate question-writer C5 resolving `iso_code (iso_code.ts:80) → header.bcp47` in the question graph, or Option A's subsuming-step write).

**The hand-built render and confirm are preserved byte-identically**

- **FR-007**: The **SPA render path MUST be unchanged**: `StudioShell` MUST continue to hand-place `<Prefill>` as a **sub-stage of `characters`** via its `activeStepId` / `charactersSub` switch (`StudioShell.tsx:930-940`). There is no manifest/registry-resolved render of `Prefill`. The `Prefill` render MUST be byte-identical to today.
- **FR-008**: The confirm MUST advance the flow **exactly as today**: `handlePrefillConfirm()` (`StudioShell.tsx:632-634`) MUST set `charactersSub` from `"prefill"` to `"B"` (advancing into Phase B); the back action (`handlePrefillBack`, `StudioShell.tsx:721`) MUST be unchanged.
- **FR-009**: This spec MUST NOT introduce `mutate()` for the `prefill` surface, MUST NOT introduce any new write routing, and MUST NOT promote `prefill` to a first-class manifest entry. The promotion (and any modular read-question conversion) is implemented in **Phase 2 spec #11 (`qu-mutate-prefill`)**, not here.

**Branch/read-only oracle (§2.5)**

- **FR-010**: A **branch/read-only oracle** test (migration-plan §2.5, branch/read-only surfaces) MUST assert that the **resolved next-step id / sub-stage is unchanged** for the confirm via a **flow-routing snapshot** — there is no IR or phase-result output to compare for `prefill` (`writes: []`), so the oracle is the resolved routing (`charactersSub` "prefill" → "B"), not an emit-byte or `SurveyPhaseResult` comparison.

**Guardrail & gate**

- **FR-011**: The drift guardrail (spec 016) MUST stay **green** with `prefill` resolving as a **question-graph drill-down node** — `prefill` is a registry id the runtime reaches (via the confirm sub-stage) and MUST have a rendered drill-down node (no orphan, no uncovered id); reachability is computed per-graph (question graph) per §2.2(b).
- **FR-012**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` MUST be **green**, with no new `dashboard → stores` or `dashboard → editors` edge introduced; a test MUST assert no declaration references `irPath('header','script')` (FR-004).

**Out of scope (explicit non-goals)**

- **FR-013**: This feature MUST NOT: make `prefill` a top-level manifest entry (it is a drill-down under the opaque `characters` node; promotion to first-class manifest entry is Phase 2 spec #11, requiring decomposition of the `characters` placeholder); touch the SPA render path (StudioShell keeps hand-placing `Prefill` as a `characters` sub-stage; no manifest/registry-resolved render); introduce new write routing or `mutate()` (`writes: []`); declare `irPath('header','script')` (it does not exist); bump `@keyboard-studio/contracts`; change the byte-identical confirm/render behavior; declare or re-declare `prefill`'s `inputs`/`writes` (that is spec 017); or itself resolve the cross-graph C5 mechanism (that lives in spec 017).

### Key Entities *(include if feature involves data)*

> No `@keyboard-studio/contracts` change. All entities below are **existing** symbols / locations reused as-is (no contracts bump).

- **`prefill` (registry drill-down)** (`Prefill.tsx:64`): the hand-built "Confirm the basics" confirm screen, declared (by spec 017) as a registry-keyed drill-down **under the opaque `characters` node** with `writes: []` and `inputs` = `header.bcp47` (array) + session `ScriptPrefill`. The node this spec confirms resolves. Declaration unchanged by this spec (owned by 017).
- **`charactersStep` (opaque placeholder)** (`manifest.ts:47-56`): the single manifest node subsuming the Phase A/B survey questions; `prefill` is a drill-down **under** it in Phase 1 and cannot be promoted to a top-level manifest entry without decomposing it (Phase 2 spec #11).
- **`Prefill`** (`survey/Prefill.tsx:64`): the live React component hand-placed by `StudioShell` as a `characters` sub-stage (`StudioShell.tsx:930-940`). Render unchanged.
- **`handlePrefillConfirm` / `handlePrefillBack`** (`StudioShell.tsx:632-634`, `:721`): the confirm/back handlers — confirm sets `charactersSub` "prefill" → "B" (advance into Phase B). **Preserved byte-identically**; the flow-routing oracle locks the confirm advance.
- **`charactersSub` (`CharactersSubStage`)** (`StudioShell.tsx:377`): the intra-`characters` sub-stage state (`"prefill"` → `"B"`) the confirm advances; the routing the §2.5 branch/read-only oracle snapshots.
- **`ScriptPrefill` (session-derived)**: the session-level script subtag / A2 class / routing group `prefill` reads; **not** an `irPath()` over `KeyboardIR` and **not** `header.script`. Its satisfiability rides on the 017 C5 decision (D1).
- **`header.bcp47` (`IRPath`, array, session-derived)**: `prefill`'s array input, produced by the survey question `iso_code` (`iso_code.ts:80` writes `irPath('header','bcp47')`) inside the opaque `charactersStep` — the cross-graph boundary the 017 C5 decision resolves.
- **`questionRegistry`** (`survey/questions/registry.ts`): the registry the spec-015 projection keys drill-down nodes off; `prefill` resolves as a `questionRegistry`-keyed drill-down under `characters`.
- **`buildManifestStepGraph()` + the map adapter** (spec 015): project the manifest spine; the `buildModularFlowGraph` drill-downs (keyed off `questionRegistry`) hang under each opaque node. Unchanged by this spec (consumed, not modified).
- **`SHOW_FLOWMAP`** (`StudioShell.tsx:84`): the dev-only flowmap gate under which the projected `prefill` drill-down node renders; off ⇒ byte-identical to today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the dev flowmap flag on, the Flow Map renders the `prefill` step as a **read-only registry drill-down under the opaque `characters` node** (NOT a top-level manifest entry), with `writes: []`.
- **SC-002**: The `prefill` node's declared `inputs` (from spec 017) are **populated on the node** — `header.bcp47` (array, session-derived) + session `ScriptPrefill` — and an audit finds **no** `irPath('header','script')` declared anywhere.
- **SC-003**: Advancing the confirm advances the flow **exactly as today** — a flow-routing snapshot shows `handlePrefillConfirm()` setting `charactersSub` "prefill" → "B", unchanged (§2.5 branch/read-only oracle); the resolved next-step id is unchanged.
- **SC-004**: The **SPA render path is unchanged** — `StudioShell` hand-places `Prefill` as a `characters` sub-stage via `activeStepId` / `charactersSub` (`StudioShell.tsx:930-940`); there is no manifest/registry-resolved render; the `Prefill` render is byte-identical.
- **SC-005**: The drift guardrail (spec 016) stays **green** with `prefill` resolving as a question-graph drill-down node (no orphan / uncovered id), reachability computed per-graph (question graph).
- **SC-006**: `prefill`'s declared inputs are satisfiable subject to the 017 C5 decision — manifest-level C5 returns **no spurious orphan** for `prefill` once D1 is applied (no new decision opened here).
- **SC-007**: `pnpm typecheck` + studio/contracts `vitest` + `pnpm depcruise` pass; a repo audit finds **zero** new IR write route for `prefill` (`writes: []`), **zero** new top-level manifest entry for `prefill`, and **zero** SPA render-path change (StudioShell still hand-places `Prefill`).

## Assumptions

- **`prefill` has no manifest entry today** and cannot be a first-class manifest node in Phase 1 without decomposing the opaque `characters` placeholder (`manifest.ts:47-56`). It is a registry-keyed drill-down under `characters`; promotion to a manifest entry is Phase 2 spec #11.
- **Spec 015 (map projection) and spec 016 (drift guardrail) are landed** — `prefill` gets a rendered drill-down node from the `questionRegistry`-keyed drill-down layer, and the drift guardrail is the bijection gate (question graph for `prefill`).
- **Spec 017 (declare steps) has declared `prefill`'s drill-down `inputs`/`writes` and resolved (or carries) the cross-graph C5 decision (D1)** before this spec runs — `prefill`'s declared contract and its satisfiability mechanism must exist first (dependency). This spec consumes 017's declaration and C5 resolution; it opens no new decision.
- **The SPA render path is untouched** — `StudioShell` continues to hand-place `Prefill` as a `characters` sub-stage (`StudioShell.tsx:930-940`); there is no `SurveyView` / manifest-resolved render. Any component-resolution-by-manifest move is Phase 2 and requires parity proof (§2.4 step 4).
- **No contracts bump and no `mutate()`** — `prefill` writes no IR leaf in Phase 1 (`writes: []`); `irPath('header','script')` does not exist and is not declared; all contracts decisions are deferred to Phase 2 (migration-plan §6).
- **The C5 mechanism is inherited from spec 017** — whichever D1 option 017 picks determines how `prefill`'s session-derived inputs are validated; **no new decision is opened here**. If 017 has not resolved D1, this spec inherits the [NEEDS DECISION].
- **"Byte-identical" for `prefill`** means the resolved next sub-stage (`charactersSub` "prefill" → "B") and the `Prefill` render equal today's, verified by a flow-routing snapshot — not source-identical components. There is no IR or `SurveyPhaseResult` output to compare (`writes: []`).
