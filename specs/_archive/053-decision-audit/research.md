# Research: Per-keyboard decision audit (CYOA Phase 1)

Decisions taken before design, with what was rejected. The five clarifications already recorded in [spec.md](spec.md) (provenance as a first-class field, zip-root sidecar, direct-capture impact for editor steps, supersede-on-revisit for editor steps, shed-detail-never-entries truncation) are **inputs** to this document, not decisions re-opened by it.

---

## D-01 — The record's types live in `packages/contracts` as a new additive module

**Decision**: define `DecisionEntry`, `DecisionRecord`, `DecisionProvenance`, and the event-kind union in a new `packages/contracts/src/decisionRecord.ts`, re-exported from `index.ts`, with a zod mirror and drift guards added to `schemas.ts` in the same commit.

**Rationale**: both sides need the types. The engine builds the pull-request block and the packaged sidecar; the studio owns the store and the trail. The engine cannot import the studio, so a studio-local type would force either a duplicate declaration or an inverted dependency. `axisFill.ts` is the precedent — a small provenance primitive added to contracts additively — and Article I's lock covers renames, retypes, and removals of existing fields, not new modules. The same-commit schema-mirror rule is what makes this safe to add rather than a drift risk.

**Alternatives considered**: a studio-local `decisionTypes.ts` mirroring `draftTypes.ts` — rejected because the engine's PR-summary and sidecar code would have no way to reach it. Extending `SurveyAnswer` with a provenance field — rejected: it is a locked-contract union in `surveyPhaseResult.ts` consumed by the flow completed-instance format and by every phase result, and widening it would make provenance mandatory reasoning for every existing consumer to gain one feature's field.

---

## D-02 — Recording hangs off `applyStepCompletion` via an injected dependency

**Decision**: add a `recordDecision` function to `ReducerDeps` in [packages/studio/src/steps/reducer.ts](../../packages/studio/src/steps/reducer.ts). `SurveyView` injects it, exactly as `setTouchSeedSource` and `setMarksMigrationNeeded` are injected today. No step component and no gallery learns that auditing exists.

**Rationale**: `applyStepCompletion` is documented as "called by SurveyView every time a step completes" and is already the one funnel for step-keyed side effects. It is also precisely the aggregation boundary FR-002 and the spec's Assumptions require ("editor activity is summarised when a step completes"). The `steps/` layer is forbidden from importing `stores/`, `lib/`, and `components/`, and dependency injection is the established way that boundary is respected in this file — so the injected shape is the conventional answer here, not a workaround.

**Alternatives considered**: subscribing to the working-copy store and inferring step boundaries from state transitions — rejected as a second traversal model that would drift from the reducer's own notion of completion, and as a source of spurious entries on unrelated store writes. Instrumenting each gallery — rejected: it multiplies the recording surface by the number of editors and makes "one aggregated entry per step" a per-component promise instead of a structural one.

---

## D-03 — Provenance reuses the existing `base-derived` / `hand-set` literals; agency and source are separate axes

**Decision**: `DecisionProvenance` carries an agency literal — `"base-derived" | "tool-proposed" | "hand-set"` — plus an optional `source` label naming *where* a proposal came from (`"langtags"`, `"cldr"`, `"corpus"`, `"axis-fill"`, `"base"`, `"identity"`, `"region"`, `"derived-from-axis"`). `"tool-proposed"` on a recorded entry means the stored value is the tool's proposal unmodified; an overridden proposal records `"hand-set"`.

**Rationale**: the repository already has three provenance vocabularies — `TouchKeyProvenance` (`"base-derived" | "physical-suggested" | "hand-set"` in `keyboard-ir.ts`), `AxisFillSource` (`"script-class-prior" | "import-derived"`), and `LangtagsProvenance.source` (`"langtags"`, described in its own doc comment as part of "specs/002's provenance vocabulary"). Two of the three agency literals are therefore reused verbatim, and `"tool-proposed"` replaces `"physical-suggested"` only because the latter is touch-placement-specific and would be wrong on a survey answer. The `source` labels are lifted from the [specs/002-defaults-engine](../002-defaults-engine/spec.md) "Provenance label" entity, so this adds no new naming for the source dimension at all. Keeping agency and source separate is what lets the headline say "Accepted suggested autonym from langtags" without collapsing two independent facts into one enum.

**Alternatives considered**: reusing `TouchKeyProvenance` directly — rejected, its `"physical-suggested"` member is about physical-to-touch propagation and overloading it would make the touch semantics ambiguous. A single flat enum crossing agency with source — rejected: it multiplies out to a dozen-plus members and makes "was this the author's choice?" a substring test.

---

## D-04 — Impact is captured from the shared projection the live preview already runs

**Decision**: at each step boundary, read the emitted `.kmn` text produced by [projectWorkingCopyVfs](../../packages/studio/src/lib/projectWorkingCopyVfs.ts) and store the net line diff against the previous boundary's text as the entry's attributed change.

**Rationale**: FR-009 requires the attributed change to come from the same process that produces the shipped keyboard, and SC-005 requires the audit and the artifact never to disagree. `projectWorkingCopyVfs` is that single process: `projectWorkingCopyForOutput` (zip and pull-request) and `useWorkingCopyTransform` (live OSK preview) both delegate to it, and its doc comment states the projection order is identical for both. Because the preview already runs it continuously, taking a snapshot is a read of an existing computation rather than a new pipeline — which is also what keeps this inside Article III (see the plan's Constitution Check for the retention seam). Storing the *diff* rather than both texts is the smaller thing that satisfies FR-008: the diff **is** the net difference, and it is what expansion renders.

**Alternatives considered**: emitting directly from the working IR with the codec emitter — rejected, that is not byte-equal to the shipped `.kmn`, because projection additionally applies touch layout, carve keycaps, assignments, and the identity overlay; an audit that diffs a different text than the one shipped violates SC-005 by construction. Storing full before/after snapshots per step — rejected: it doubles the payload for no information gain, since the diff is derivable at capture time and nothing needs the intermediate texts. Computing the diff lazily from stored texts — rejected for the same reason, and it would make the sheddable payload larger, not smaller.

---

## D-05 — Survey-decision counterfactuals ride the `mutate()` seam and report FR-011 when it is off

**Decision**: a survey decision's counterfactual impact is derived by re-running that question module's pure `mutate(value, ctx)` against the recorded pre-decision IR and diffing the two results. Where the module has no `mutate()` — or where the seam is disabled — the entry reports its headline plus the FR-011 reason instead of a change. Direct per-step capture (D-04) still applies to every step, including question steps, so no entry is left with an empty change.

**Rationale**: the mutate seam is the declared write path (`MutateRequest` in the reducer, `applyMutatePatch` with declared-`writes` containment), so re-running it is "the same process" in FR-009's sense, and it is exactly what FR-026's one-branch-deep alternative needs. But it must be said plainly: [packages/studio/src/flags/mutateFlag.ts](../../packages/studio/src/flags/mutateFlag.ts) documents the seam as **off by default** and roughly half-complete, with galleries bypassing it. In a default build, most survey decisions will therefore take the FR-011 path for counterfactuals. That is a real Phase 1 limitation, not a defect to paper over — and it is why direct capture is the floor: it keeps every entry's attributed change truthful and SC-005 satisfiable regardless of the flag.

**Alternatives considered**: making counterfactual derivation the only impact source for survey answers, per a strict reading of the clarification — rejected because with the seam off it would leave most survey entries showing nothing, which the spec's own Edge Cases forbid ("rather than showing an empty diff as if something failed"). Building a second, audit-only re-derivation path independent of the seam — rejected outright: it would be a competing write path, contradicting the spec's Assumption that existing paths are reused and inviting exactly the audit-versus-artifact disagreement SC-005 prohibits.

---

## D-06 — A small engine-local line differ, not a new dependency

**Decision**: implement `packages/engine/src/decision-audit/lineDiff.ts` — an LCS line diff emitting unified hunks with bounded context.

**Rationale**: no package here depends on a diff library (the studio's runtime dependencies are contracts, engine, glottolog, keyboard-lint, lingui, react, yaml, zod, zustand). The input is line-oriented `.kmn` text and the output need is a compact hunk list for rendering and for the sidecar — a well-understood algorithm of modest size. The repository's dependency discipline is deliberate and heavily pinned; adding a package to avoid perhaps a hundred lines is a poor trade when the diff also has to be deterministic across builds for the record to be comparable.

**Alternatives considered**: adding the `diff` npm package — rejected on the above trade, and because its patch text format would become part of the persisted record's shape, tying a stored artifact to a third-party formatter. A character-level diff — rejected: `.kmn` is line-structured, and character granularity would make hunks larger and less readable for exactly the reviewer audience US2 targets.

---

## D-07 — The packaged record reuses the zip-included / PR-excluded sidecar lifecycle; positional nesting is deferred

**Decision**: the record is written into the VirtualFS under a clearly-marked studio-metadata prefix at the archive root, `.studio/decision-record.json`. `isSidecarPath` in [packages/engine/src/output/sidecar.ts](../../packages/engine/src/output/sidecar.ts) is extended to match that prefix, so the existing `isSourceFile` filter keeps it out of the pull-request commit tree. `NEXT_STEPS.md` is updated to name the studio-metadata paths as not-to-be-copied.

**Rationale**: FR-019 and SC-008 are about the *committed* tree, and the existing sidecar filter already makes that exclusion machine-enforced rather than a convention — reusing it means the guarantee is structural. FR-020's "beside, not inside the keyboard's directory" is the part that cannot be satisfied positionally today: the archive root **is** the keyboard's directory content (`source/<id>.kmn`, `<id>.kps`), and `NEXT_STEPS.md` already sits at that root as studio metadata with the same property, while the submission instruction says to copy the archive's contents into `release/<letter>/<id>/`. So the honest statement is that the separation is realized by marking and instruction, not by position. The spec itself makes the naming and placement provisional ("must be acceptable to the Keyman team"), which is the right place for this to land.

**Alternatives considered**: restructuring the archive so the keyboard nests under `<id>/` and metadata sits at the true root — this is the option that makes "beside, not inside" structurally true, and it would fix the pre-existing `NEXT_STEPS.md` wart at the same time; deferred rather than rejected, because it changes an already-shipped artifact shape and the copy instructions, and that is a Keyman-team-facing decision rather than an implementation detail. Putting the record only in the pull-request body and omitting it from the package — rejected, FR-020 requires it in the package and the spec's clarification gives it a second job (session resumption).

---

## D-08 — Persistence is an additive optional field on `DurableDraft`, with no version bump

**Decision**: add `decisionRecord?: DecisionRecordSnapshot` to `DurableDraft` in [packages/studio/src/lib/draftTypes.ts](../../packages/studio/src/lib/draftTypes.ts), saved and loaded by the existing `saveDraft` / `loadDraft`, and left absent by builds that do not have the feature.

**Rationale**: this is the documented precedent. `phaseBDraft` was added to the same envelope as an optional field rather than a `DRAFT_VERSION` bump, with the stated reasoning that a pre-change record simply has no field and `loadDraft` treats that as empty rather than discarding an otherwise-good record. That is exactly SC-009's requirement in both directions. Reusing the one draft engine also satisfies the spec's Assumption that no second way to save appears. Pre-instantiation work (FR-004) needs nothing new either: the record rides the existing `PENDING_PROJECT_KEY` draft and moves with it when the project key is derived.

**Alternatives considered**: a separate `ks.decisions.<projectKey>` localStorage key — rejected, it would be a second persistence path, could desynchronize from the draft it describes, and would need its own migration and cloud-sync wiring. Bumping `DRAFT_VERSION` — rejected: it would invalidate existing drafts for an additive field and break the backward direction of SC-009.

---

## D-09 — Truncation sheds diff payloads at save time and states itself in the trail

**Decision**: `packages/engine/src/decision-audit/shed.ts` drops stored diff payloads — largest first, then oldest — until the serialized record fits its budget, and sets a `truncated` marker carrying how many payloads were shed. Headlines, provenance, and supersede links are never candidates. The shed runs in the save path, before the existing cloud-size check.

**Rationale**: this is the recorded clarification, and the budget already exists — `MAX_CLOUD_DRAFT_BYTES` (4 MB) is checked in `startCloudSync` in [draftPersistence.ts](../../packages/studio/src/lib/draftPersistence.ts), and a record that pushed a draft past it would silently disable cloud sync, which the spec's Edge Cases name explicitly. Shedding before that check is what keeps the failure mode "less detail" instead of "no sync". Because entries themselves are never shed, SC-002 holds unconditionally — which is the whole point of the clarification. The trail must say so, hence the marker rather than a silent drop.

**Alternatives considered**: capping the number of entries — rejected, it breaks SC-002 and the append-only requirement directly. Compressing payloads instead of shedding — rejected for Phase 1: it adds a codec to the persisted format for a bound that the Assumptions expect to be rare, and it does not remove the need for a shed policy at the limit.

---

## D-10 — This feature is the journey-corpus vocabulary's first implementer

**Decision**: define the two event kinds in `decisionRecord.ts` using [specs/032-journey-corpus](../032-journey-corpus/spec.md) FR-002's names — a survey-answer event keyed by step and question, and an editor-action summary keyed by step with an action type and a summary — and treat that module as the shared definition 032's harness will consume.

**Rationale**: 032 is unimplemented. There is no `content/journeys/` directory, no `journey-runner.ts`, and its spec is still Draft. So FR-007's "MUST NOT introduce a competing vocabulary" cannot be satisfied by importing existing types; it is satisfied by being the first implementation and putting the definition where the later consumer can reach it. 032's FR-001 also settles a naming question in advance and is followed here: a per-keyboard record spans the whole manifest spine, so it is *not* keyed by `flow_id`, which names a single flow template.

**Alternatives considered**: waiting for 032 to land first — rejected, it is not a dependency of anything in this spec and blocking on it would strand three deliverable user stories. Defining the event kinds studio-locally and reconciling later — rejected, that is precisely the fork FR-007 prohibits.

---

## D-11 — Underivability is detected from the existing lock and staleness model

**Decision**: an entry reports FR-011 unavailability when its step sits behind a passed lock gate — `lock: "physical" | "touch"` on the manifest `Step`, observed through `desktopLocked` and the touch lock — or when its counterfactual has no `mutate()` module to re-run (D-05). The reason is a structured code the studio renders as localized prose.

**Rationale**: the model is already there and is the one the flow map's completeness report uses: `Step.lock` is declared in [packages/studio/src/steps/types.ts](../../packages/studio/src/steps/types.ts) as documented against the CYOA plan's §3.5, and `staleSteps` / `markStale` / `clearStale` already exist as a working-copy slice. Deriving underivability from that model rather than a new flag means the audit's notion of "irreversible" is the same one the survey enforces. Carrying a code rather than a sentence keeps FR-016 satisfiable — the text is localizable in the studio, not baked into the engine.

**Alternatives considered**: computing the transitive `writes → inputs` staleness closure to decide underivability — rejected for Phase 1: the closure is the Phase 2 re-derivation mechanism per the spec's Out-of-scope section, and Phase 1 only needs the lock-gate concept, which the spec's Governing-documents section states outright.

---

## D-12 — The trail is a production route; the flow-map overlay stays behind the existing dev gate

**Decision**: `RouteId` gains `"trail"`, unconditionally valid (FR-017), reachable from the authoring surface and the saved-keyboards list. The overlay is rendered inside the existing flow map, which stays gated by `SHOW_FLOWMAP` (`import.meta.env.DEV || VITE_SHOW_FLOWMAP === "1"`), and the walked path is passed into the dashboard as a prop.

**Rationale**: the two surfaces have opposite audiences, and the existing route table already encodes exactly this split — `VALID_ROUTES` filters `flowmap` out unless the gate is on, so FR-025 needs no new mechanism. Passing the overlay as a prop follows the established dashboard-layer boundary, the same way `completenessReport` and `axisFills` are computed in `StudioShell` because the dashboard has no `stores/` import. FR-024's "behaves exactly as it does today with nothing selected" then becomes a testable identity: with no keyboard selected the overlay prop is absent and the render path is the current one.

**Alternatives considered**: putting the trail inside the flow map — rejected, it would inherit the dev gate and violate FR-017. Having the dashboard read the decision store directly — rejected, it breaks the dashboard-layer boundary that the existing prop-passing exists to preserve.
