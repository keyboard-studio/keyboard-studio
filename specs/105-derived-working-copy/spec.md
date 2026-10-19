# Feature Specification: Derived working copy — finish the 088–093 migration

**Feature Branch**: `km/105-derived-working-copy-plan`

**Created**: 2026-10-19

**Status**: Draft (programme ruled by Matthew 2026-10-19; this spec carries the
ruling into buildable requirements)

**Input**: Matthew's ruling on the 2026-10-18 airlock structural scan
(crew D1, `~/workspace/keyboard-studio-notes/airlock-2026-10-18/state-architecture-scan.md`):
choosing costed option (a) over option (b) — **"Option A — finish the migration,
working copy becomes purely derived."** The scan's verified baseline: four
persisted stores of author truth (working copy, the 088 DecisionSet, the
spec-053 decision log, saved answers) plus a traversal store, snapshotted into
one seven-slice draft envelope; one survey completion writes the same author
act four ways and the working copy twice; ≈19,000 LOC production + ≈27,700 LOC
tests of state machinery, of which ≈3,820 LOC production is sync/bridge/replay
plumbing that exists only to keep the stores in agreement.

**Governing authority** (Constitution precedence): this spec DISCHARGES the
open obligation of [spec 093](../_archive/093-derived-keyboard/spec.md) FR-004
("Drafts MUST save the starting point's id and `decisions` only"), whose
implementing unit — 093 US2, tasks T014–T016/T018 (v2 fixture capture, v3
envelope, rebuild-on-migration, replay-only resume) — was scope-stopped on
2026-10-07 as one inseparable unit that restructures boot, with the
followups' recommendation to schedule it as its own pass
([followups.md](../_archive/093-derived-keyboard/followups.md)). This spec is
that pass, extended to the ground 093 never reached: the editor surfaces
(carve, assign-loop/touch, deadkeys, overlays, VFS/docs) that author
working-copy state directly today. It builds on spec 088 (DecisionSet, one
record per decision id; the store stays sealed per contract C-1), spec 089
(pure `apply()` over a checked patch sink), spec 090 (overlays as decision
values; gallery settled values as decision records), spec 092 (setup as a
decision — the starting point is a decision contribution), and spec 093
(replay/rebuild wiring, recalculation under the provenance rule). Where this
spec and the 088–093 texts differ on the working copy's status, this spec
wins: the working copy is a derived cache with no write path of its own.

Standing rulings carried, not re-opened:

- **Base switch = RETAIN + RECALCULATE** (Matthew, 2026-10-07, spec 093 T017
  option (b)): decisions are kept and re-derived against the new base;
  answers that no longer fit are re-proposed, never silently dropped. Every
  phase of this programme MUST keep that behaviour working through replay.
- **Base-derived values are proposals** (Constitution Art. X, Matthew's
  2026-10-14 correction): an extracted/defaulted value stands as a decision
  once presented and confirmed, always attributed, visible and changeable,
  never silently, and never overwriting an author-made decision. Replay and
  recalculation MUST preserve these provenance semantics exactly.
- **Perf is measured, not assumed**: spec 093's recorded medians (warm edit
  7.20 ms, cold resume 9.58 ms on sil_euro_latin, `rebuildPerf.measure`
  procedure) are this programme's perf baseline. Any phase that touches
  replay MUST re-measure by the same procedure and report against them.

## Clarifications

### Session 2026-10-19

- Q: Formalise the hybrid (one owner per datum, keep both stores) or finish
  the migration? → A (Matthew, options widget, 2026-10-19): **Option A —
  finish the migration, working copy becomes purely derived.** The hybrid
  (scan option (b)) is rejected; its cheaper deletions are subsumed, not
  landed as a substitute.
- Q: What is the end state for the spec-053 decision log and the saved-answers
  store? → A (derived from the ruling's terms, recorded here for review):
  decisions remain the only stored state. The 053 log is part of the decision
  spine (an audit journal *of* decisions) and persists as a decision record,
  not as a second truth — no fact may be recoverable *only* from the log. The
  saved-answers store ceases to be a persisted truth: a completed answer is a
  decision; anything not yet a decision is session state, not draft content.
  The treatment of in-flight (typed, not yet completed) answers at reload is
  an open design question assigned to Phase 0 research (see Assumptions) —
  it MUST be resolved with evidence and presented, not silently decided by
  an implementer.
- Q: Does the traversal/session position persist? → A: traversal is not
  author truth about the keyboard. Whether the v3 envelope keeps a traversal
  slice is a plan-level decision; it carries no keyboard state and its
  retention or removal MUST NOT be used to smuggle working-copy state into
  the envelope.

**Ownership** (Constitution Art. VI): Studio owns the store, the replay
wiring, the draft envelope and all editor surfaces. Contracts owns the
decision record types (any new record kinds follow spec 088/093 conventions
in `decisionRecord.ts`/`decisionTypes.ts`). Engine owns nothing new unless a
phase's decision representation needs an engine `apply` primitive, in which
case that primitive is named in the phase's tasks before it is built.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An author's work survives reload exactly — from decisions alone (Priority: P1)

An author builds a keyboard using every surface — survey steps, carve,
mechanism and touch galleries, deadkey editor, doc edits — saves, closes the
studio, and reopens the project. The keyboard that comes back is byte-for-byte
the keyboard they left, and it was reconstructed by replaying the starting
point and the decision set: the saved draft contains no working-copy slice
to restore from. Nothing the author did lives only in a materialised copy.

**Why this priority**: This is the ruling's core promise and the failure the
hybrid hides today — editor-authored state (carve dispositions, key-edit
overlays, VFS/doc edits) is authored in the working copy and merely journaled
to the decision log after the fact (the `recordEditorStep` bridge). If the
working copy were lost today, that work would be unrecoverable from
decisions. Until US1 holds for every surface, "decisions are the only stored
state" is a slogan for the survey path only.

**Independent Test**: For each editor surface, the surface's equivalence gate
(Phase 0 harness, extended per phase): perform a representative edit through
the surface's real write path, capture the resulting keyboard (projected
output); reset; replay the recorded decision set over the starting point;
the projected outputs are identical.

**Acceptance Scenarios**:

1. **Given** a project edited on any surface, **When** the draft is saved,
   **Then** the envelope contains no working-copy slice, and **When** it is
   reopened, **Then** the rebuilt keyboard's projected output (`.kmn` and
   every shipped file) is identical to the pre-save projection.
2. **Given** a draft saved by the previous (v2) envelope format, **When** it
   is opened after this programme lands, **Then** it is migrated by rebuild:
   its decision set is replayed and the resulting keyboard matches the
   keyboard the v2 draft would have restored (fixture-verified, FR-009),
   including editor-authored work the v2 draft carried in its working-copy
   slice — which the migration reads once, converts to decision records
   where the phase's representations exist, and reports where it cannot.
3. **Given** any studio surface, **When** its author makes an edit, **Then**
   the edit exists as a decision record (or a change to one) *before* it is
   visible in the working copy — the working copy changes only because
   replay/apply derived it.

### User Story 2 - Changing your mind still recalculates, on every surface (Priority: P1)

An author goes back and changes an early answer — or switches the base
keyboard — after carving, assigning keys, and defining deadkeys. Everything
downstream refreshes: extracted and derived values recompute, author-made
decisions stand, and decisions that no longer fit are re-proposed at their
owning step, never silently dropped and never silently overwritten. This is
spec 093's behaviour, extended so editor decisions participate in
recalculation on the same terms as survey decisions.

**Why this priority**: Recalculation is the benefit the derived model was
built for (093 US1), and the base-switch ruling (RETAIN + RECALCULATE) is a
standing owner ruling. Editor state that sits outside the decision set
cannot recalculate — today a base switch can only re-derive the surfaces
that recorded decisions, and the rest is carried as opaque working-copy
state. US2 is what makes the ruling true for the whole keyboard.

**Independent Test**: The 093 golden-walk pattern, extended with editor
decisions: change `windows-layout` and then switch the base after carve +
gallery + deadkey work; survivals and refreshes check per provenance class,
and one no-longer-fitting editor decision is shown re-proposed.

**Acceptance Scenarios**:

1. **Given** a downstream decision with `extracted` provenance, **When** an
   input changes, **Then** `extract` re-runs (093 scenario, unchanged).
2. **Given** an `asked` decision (survey or editor) that no longer fits
   after a base switch, **When** the switch recalculates, **Then** it is
   kept, flagged, and re-proposed beside the recomputed value — never
   overwritten, never dropped.
3. **Given** editor decisions recorded before this programme (as log
   journals), **When** their surface's phase lands, **Then** the phase's
   migration reads the journal as provenance for the decision records it
   mints, and the records carry that provenance.

### User Story 3 - A contributor adds a surface with exactly one write path (Priority: P2)

A contributor adds a new editor or step. There is one way to change the
keyboard: record a decision whose `apply()` derives the change. The
equivalence gate fails CI if a working-copy write appears that is not the
derived cache being installed by replay, or if a store field/action exists
that the derived-surface registry does not classify. The five-touch-point
sync tax the scan documented (recorder → incremental apply → replay
equivalence → persistence filter → migration consideration) collapses to
one: decision + apply, gated.

**Why this priority**: The hybrid's cost is paid per feature, forever, and
both camps' fan-in grew 14–25% in the nine days before the scan. A derived-
only store with a gate that *enumerates* write paths is what stops the tax
from regrowing after this programme ends.

**Independent Test**: Add a deliberate direct working-copy write in a test
branch; the equivalence gate fails and names it. Remove it; the gate passes.

**Acceptance Scenarios**:

1. **Given** a new field or action on the working-copy store, **When** CI
   runs, **Then** the gate fails unless the derived-surface registry
   classifies it (derived cache slot / starting-point slot / ephemeral).
2. **Given** a persisted draft, **When** its envelope is inspected, **Then**
   every slice is a decision record, the starting-point id, or explicitly
   non-truth session data — never materialised keyboard state.

### User Story 4 - The state machinery visibly shrinks (Priority: P3)

A reviewer diffs the tree at programme end against the scan baseline:
the sync layer the scan named (phaseResults slot + `recordPhase`, the
answers↔decisions filter/rehydrate pair, `persistWorkingCopy`'s snapshot
path, the incremental-apply path as a rival writer, the per-surface
recording bridges that translate edits into journals) is gone; the working-
copy store is a derived cache whose actions are replay's install path and
nothing else; the ghost test files for absorbed stores (`irStore`,
`surveyResultsStore`) are resolved — deleted or rewritten against the
derived store, not left testing a store that does not exist.

**Why this priority**: The ruling was a complexity ruling ("cut complexity,
not data"). The programme's success is partly a subtraction that must be
shown, not asserted — with the scan's numbers as the baseline and the same
counting method at the end.

**Independent Test**: Re-run the scan's counts (fan-in greps, store/envelope
LOC, sync-layer inventory) on the final tree; every named sync-layer item
is absent and the deltas are reported in the AS-BUILT.

## Requirements *(mandatory)*

### Functional Requirements

**End state (normative)**

- **FR-001**: The working copy MUST be a pure derived view:
  `workingCopy = replay(startingPoint, decisions)`. It MUST have no write
  path by which author intent enters except decision recording followed by
  apply/replay. Direct store mutations from editor, survey, or shell code
  MUST NOT exist outside replay's install path.
- **FR-002**: Decisions MUST remain the only stored state. The persisted
  draft envelope (v3) MUST contain the starting point's id, the decision
  set, and the decision log (a decision record), plus only explicitly
  non-truth session data. It MUST NOT contain a working-copy slice, a
  saved-answers slice, or any materialised keyboard state.
- **FR-003**: The incremental-apply path (089) MUST cease to be a rival
  writer: apply runs as part of replay (the fold), not as a separate
  incremental mutation later overwritten by a rebuild. One completion,
  one derivation.
- **FR-004**: The `phaseResults` slot and `recordPhase` MUST be deleted.
  What the session derives from phase results today (via
  `mergePhaseResults`) MUST be derived from the decision set instead.
- **FR-005**: The answers↔decisions dedup pair
  (`filterSurveyAnswersForDraft`, `rehydrateAnswersFromDecisions`) MUST be
  deleted, made unnecessary by FR-002: there is no second persisted copy
  of an answer to filter or rehydrate.
- **FR-006**: `persistWorkingCopy`'s snapshot/restore path for the working
  copy MUST be removed. Session continuity across OAuth redirects (its
  current job) MUST be re-expressed in decision terms (persist the draft
  envelope, or the decision set + starting point) — not by snapshotting
  the derived cache.

**Decision representation for editor state**

- **FR-007**: Every item of editor-authored working-copy state inventoried
  in Phase 0 MUST gain a decision representation: a decision record kind
  (following 088/093 conventions) whose value carries the state and whose
  owning module's pure `apply()` (089) folds it into the derived working
  copy, including overlay channels (090: overlays as decision values).
  One phase per surface (plan.md); a surface's direct writes MUST NOT be
  removed until its equivalence gate (FR-010) is green.
- **FR-008**: The per-surface recording bridges that journal edits after
  the fact (`recordEditorStep` and kin) MUST be retired for each surface
  as its phase lands: the decision record becomes the source, not the
  journal of an edit made elsewhere. The decision log's audit role is
  preserved — entries are appended *by* decision recording, per spec 053.

**Gates (every phase)**

- **FR-009**: Migration MUST be rebuild-based and fixture-verified: v2
  draft fixtures captured before the envelope changes (093 T014's held
  task, resumed) MUST load under v3 with projected-output equivalence,
  and v2 working-copy state with no decision representation MUST be
  reported by the migration, never silently dropped (Art. X / base-switch
  no-silent-drop rule applied to drafts).
- **FR-010**: Each phase MUST land behind its equivalence gate: for the
  surface in play, edit-through-the-real-write-path vs replay-from-
  decisions MUST produce identical projected output, and draft-load
  equivalence (same draft → same keyboard with the working-copy slice
  absent) MUST hold for every surface already migrated. The gate harness
  is Phase 0's deliverable and follows the `decisionIRConsistency`
  pattern: an explicit registry in which every inventoried write surface
  is either equivalence-proven or listed as pending with its phase —
  an unregistered write path fails the gate.
- **FR-011**: The A/B rule applies to every gate in this programme: a red
  gate counts as caused by the phase only if it does not reproduce on a
  pristine `dev` tree at the phase's base. Pre-existing failures are
  reported as such, with the A/B evidence.
- **FR-012**: Any phase touching replay or derivation MUST re-measure
  derivation latency by spec 093's `rebuildPerf.measure` procedure
  (warm edit / cold resume, sil_euro_latin) and report medians against
  the 7.20 ms / 9.58 ms baselines in the phase's gate evidence.

**Preserved behaviour**

- **FR-013**: Base switch MUST remain RETAIN + RECALCULATE (2026-10-07
  ruling) throughout and after the programme: decisions retained,
  re-derived against the new base, no-longer-fitting answers re-proposed
  at their owning step. `recalculateForStartingPointChange` semantics
  are the reference behaviour.
- **FR-014**: Provenance semantics MUST be preserved exactly through
  replay: `asked` decisions are never recomputed away, `extracted` /
  `default` / `derived` recompute under the recalculation rule, and a
  base-derived value takes effect only as a presented, confirmed,
  attributed decision (Art. X) — in editor surfaces as in survey steps.

### Success Criteria *(mandatory)*

- **SC-001**: The equivalence gate's registry classifies 100% of the
  Phase 0 inventory: every working-copy field/action and every editor
  write surface is either equivalence-proven (derived) or was deleted
  with its state moved to a decision representation. Zero unclassified,
  zero pending at programme end.
- **SC-002**: Draft-load equivalence suite green: for the fixture corpus
  of drafts (survey-only, per-editor, mixed, base-switched), loading the
  v3 envelope and replaying produces projected output identical to the
  pre-programme v2 restore of the same project state.
- **SC-003**: v2→v3 migration: every captured v2 fixture loads under v3;
  any state the migration cannot convert is named in a migration report
  (fixture + field), and the count of silently dropped items is zero.
- **SC-004**: Derivation latency, final measurement by the 093 procedure:
  warm-edit and cold-resume medians reported against 7.20 ms / 9.58 ms;
  no phase lands with an unreported regression.
- **SC-005**: Each phase's PR is independently landable and green under
  Matthew's standing definition of resolved CI (all lanes, Playwright
  e2e included), with its gate evidence (equivalence output, A/B result,
  latency where FR-012 applies) in the PR body.
- **SC-006**: Final accounting against the scan baseline, same counting
  method: state-machinery and sync-layer LOC deltas reported in the
  AS-BUILT (scan estimates for the end state: −2,500..−4,000 production,
  −3,000..−5,000 tests — reported as measured, not gated to the estimate).

### Key Entities

- **Decision set**: the 088 `DecisionSet` — one record per decision id,
  the single stored truth about what the author chose, extracted, or was
  defaulted (with provenance per record).
- **Starting point**: the base keyboard bundle, itself a decision
  contribution (spec 092); the envelope stores its id, replay re-fetches
  or re-derives the bundle by the existing start machinery.
- **Derived working copy**: `replay(startingPoint, decisions)` — the IR
  plus overlay channels folded from the accumulator (093 I-1). A cache:
  rebuildable at any time, never persisted, never edited directly.
- **Decision representation**: for one surface's state — the record kind,
  its value shape, its owning module, and the module's pure `apply()`
  that folds the value into the derived working copy.
- **Derived-surface registry**: the gate's explicit list (FR-010) mapping
  every inventoried write surface to {decision representation, phase,
  status: pending | equivalence-proven}. The `decisionIRConsistency`
  allowlist pattern applied to write paths: absence from the registry is
  a gate failure, not a default.
- **Draft envelope v3**: the persisted shape of FR-002 / 093 FR-004 —
  starting-point id + decision set + decision log (+ non-truth session
  data only). Successor to v2 (`DRAFT_VERSION` 2 → 3).

## Assumptions

- Editor decision representations follow the shipped 089/090 conventions
  (pure `apply()`, overlay values as decision values, gallery settled
  values as records) rather than a new mechanism; spec 090's carve-overlay
  fold (D-090-24) is the precedent for carve.
- The decision log (spec 053) is retained as the audit journal of the
  decision spine. If Phase 0 evidence shows a fact recoverable *only* from
  the log, that fact gets a DecisionSet representation in its surface's
  phase — the log never becomes a back-door second truth.
- **Open question (Phase 0 to resolve with evidence)**: in-flight answers —
  values an author has typed/selected but not yet completed as a step —
  are persisted today through the saved-answers slice (filtered). Under
  FR-002 they are either (i) decision records with an explicit
  not-yet-completed status, or (ii) session-ephemeral and lost on reload.
  Phase 0 research MUST quantify what is in-flight-only today and what
  reload loses under (ii), and the choice MUST be presented for ruling
  before the final phase removes the answers slice. No implementer
  decides this silently.
- Derivation performance is not a programme risk on current evidence
  (093 baselines are two orders of magnitude inside the proposed
  thresholds); FR-012 exists to keep that true as editor surfaces join
  replay, not to re-litigate the thresholds.
- The traversal store and the small ephemeral UI stores (scan Camp C) are
  out of scope except where they persist author truth; the criteria and
  testing stores' envelope slices persist *records about* the project
  (attestations, tester reports) — whether those are "decisions" in the
  FR-002 sense is a Phase 0 classification task, and the v3 envelope MUST
  NOT carry them as unexamined exceptions.
