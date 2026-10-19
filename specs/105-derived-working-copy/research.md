# Research: Derived working copy (spec 105) — Phase 0 evidence

Phase 0's job was to replace the airlock scan's inferences with a census:
every working-copy field/action, every editor write, classified by whether
a decision record is its source. Three inventory passes, all at
`origin/dev d9e3d63a`, all `rg`-based with file:line evidence, filed in full
under [phase0/fragments/](phase0/fragments/):

- **I1** — the store backbone census
  ([inventory-store-backbone.md](phase0/fragments/inventory-store-backbone.md)):
  every `WorkingCopyState` member, its classification, its writers, the
  persistence capture map, the patch sink.
- **I2** — carve + deadkey editors and the rest of `editors/`
  ([inventory-carve-deadkeys.md](phase0/fragments/inventory-carve-deadkeys.md)):
  39 grouped writes, traced call-site by call-site.
- **I3** — galleries, VFS/docs, identity channels, instantiation
  ([inventory-galleries-vfs-identity.md](phase0/fragments/inventory-galleries-vfs-identity.md)):
  55 rows over the wider surface, including the writes I2's `editors/` scope
  does not reach.

## 1. The denominator: 130 store members

`WorkingCopyState` (`stores/workingCopyStore.ts:398–1464`) has **130
members — 56 fields + 74 actions** (the field/action split cross-checked
against the `WorkingCopyData` Omit list). Classification (I1 §1; the table
there is the count):

| Class | Members | Meaning |
|---|---:|---|
| STARTING-POINT | 33 | Base bundle slots + their setters; replay's input, seeded at instantiation |
| DECISION-DERIVED | 26 | Written by decision `apply()`/replay as their defining source |
| OVERLAY-CHANNEL | 8 | The four patch channels (identity, attribution, helpDocs, historyEntryState) + their setters |
| EDITOR-AUTHORED | **24** | Written directly by editor/UI code, no decision source |
| SURVEY-SLOT | 15 | `phaseResults` and its kin — the survey-results slot family |
| EPHEMERAL | 18 | UI/session state, not author truth |
| UNCLASSIFIED | **6** | No live writer exists (dormant slices — §5) |

So at store level, **30 of 130 members (24 EDITOR-AUTHORED + 6
UNCLASSIFIED) have no decision source**, and two nominally derived members
carry direct-write caveats: `ir` (DECISION-DERIVED, but `setWorkingIR` has
17 production caller files, many of them editors) and `identity`
(OVERLAY-CHANNEL, but written per keystroke by an Output-screen panel —
§3).

Persistence (I1 §2): exactly one capture enumeration exists —
`snapshotWorkingCopyData()` (`lib/persistWorkingCopy.ts:346–446`) — reused
by the draft envelope and the OAuth session snapshot. It captures **53 of
56 fields** (the three exceptions are re-derived or recomputed on restore:
`removalCapabilities`, `session`, `contextTolerance`). Two doc-vs-code
discrepancies recorded for the final phase: the interface docs call
`staleSteps`/`validatorFindings` "not persisted", but the snapshot captures
and restores both.

## 2. Reconciled vocabulary (the fragments use two; this is the programme's)

The fragments' verdicts reconcile into four classes. The distinction that
matters is not *whether a record exists* but *whether replay can rebuild
the state from records, and when the record is taken*:

| Class | Definition | Where it occurs |
|---|---|---|
| **SOURCE (apply)** | A DecisionSet record whose module `apply()` replays the state | Survey question modules; `deadkeys-defined`; `rule-set` |
| **SOURCE (fold)** | A record whose *value* is folded into an overlay slice beside `apply()` (the 093 carve mechanism) | `carved-layout` only |
| **RECORD-ONLY** | A record snapshotted *from* the working copy at step completion whose `apply()` is a no-op and which no fold reproduces — the record cannot rebuild the state | `physical-layout`, `touch-layout` |
| **NONE / LOG-ONLY** | No DecisionSet record; at most a decision-*log* journal entry (counts + bounded samples) appended at completion | Most editor residue; `recordEditorStep` covers carve/mechanisms/touch only |

And one timing fact that applies to **every** editor surface (I2 §1):
**all DecisionSet recording for editor surfaces is completion-time only.**
Nothing under `editors/` records at edit time. During editing, the working
copy is the only holder of the state; a decisions-only rebuild mid-step
loses everything since the last completion. "SOURCE" for an editor surface
always means "…once the step has completed and recorded."

## 3. Per-surface verdicts (the phase map's evidence)

Editors census (I2, grouped writes; one row = one store action/field as
called from one surface):

| Surface | Writes | SOURCE | RECORD/LOG-ONLY | NONE |
|---|---:|---:|---:|---:|
| Carve | 6 | 5 (fold, completion-time) | 0 | 1 (`undoStack`) |
| Deadkeys | 13 | 13 (apply, completion-time) | 0 | 0 |
| Mechanisms / physical | 7 | 0 | 2 | 5 |
| Touch / assign-loop | 10 | 0 | 3 | 7 |
| Panels | 2 | 0 | 0 | 2 |
| Adapters / misc | 1 | 0 | 1 | 0 |
| **Total** | **39** | **18** | **6** | **15** |

Wider sweep (I3, 55 rows incl. VFS/docs/identity/instantiation and the
completion effects in `lib/assignLoopCompletion.ts`): 5 SOURCE / 18
BRIDGE (= RECORD-ONLY or LOG-ONLY in the vocabulary above) / 26 NONE /
6 not-a-WC-write. Its assign-loop area (30 rows) has **zero** SOURCE rows.
The two counts overlap by design (I3 re-covers I2's ground from the store
side); they are not additive.

The findings that shape the phases:

1. **Carve is a fold, not an apply.** `carved-layout`'s module `apply()` is
   a deliberate no-op (D-090-30: the 089 patch contract has no carve
   channel); reproduction is `carveOverlayFromValue`
   (`decisions/replayKeyboard.ts:235`) folded at the record's position and
   installed wholesale (`rebuildWorkingCopy.ts:294–308`). Six fields ride
   the value; `undoStack` and `carveTouchKeepInert` sit outside it.
   Hazard: carve's `keepAll`/`restoreAll` also clears `deadkeyOverlay`
   and `keyEditOverlay` — one surface's "keep all" discards two other
   surfaces' unrecorded work (I2 A3).
2. **Deadkeys is the model surface — with one hole.** Every commit funnels
   through `DeadkeySurface.tsx:108` paired with `commitDeadkeyOp`, and
   `deadkeys-defined` has a real `apply()` replaying the op log. But
   rebuild never reinstalls the live `deadkeyOverlay.ops` slice — only
   its IR effect — so the live log and the record can diverge across a
   rebuild, and the next completion re-snapshots from the live log (I2 §B).
3. **The touch gallery is the largest hole.** Character-mode assignments
   live only in `touchDraft.charTouchEntries` (`TouchGallery.tsx:4742`) —
   they are in **no** decision value: the `touch-layout` value holds only
   key-edit ops + deleted ids, and its `apply()` is a no-op with no fold,
   so even those are RECORD-ONLY. `touchLayoutJson` (the shipped layout
   string) and the direct `setWorkingIR` promotions are likewise unsourced.
4. **Spec 104's records are decisions in shape only.** Severance, repair
   and identity-choice records live in the working-copy slice
   `touchKeyIdentity` (plus the parallel `keyIdentityDecisions` slice,
   one live writer) — contracts record shapes held by the WC, entirely
   outside the DecisionSet (I3 T9).
5. **Identity has a live non-sink author writer; the other channels don't.**
   `TrackOneIdentityPanel.tsx:107,122` calls `setIdentity` per keystroke
   from the Output screen and records nothing. `setAttribution` /
   `setHelpDocs` have no live non-sink writers (I3 §c, grep-verified).
   Separately, `historyEntryState` is written on help-step *mount* by
   `flowStepOptions.tsx:515` — a derived seed installed by an effect, not
   an apply.
6. **The starting point is decision-*gated*, not decision-*sourced*.**
   Instantiation waits for both `base-keyboard` + `authoring-track`
   decisions (spec 092), but the decision value is only `{id, name}`; the
   VFS/IR/capabilities it seeds come from the compile pipeline's
   `pendingArtifactRef`. The base-artifact slices (welcome/help/README
   texts, license, baseline findings) are seeded by
   `hooks/useKeyboardArtifact.ts` *beside* instantiation, in a parallel
   channel instantiation does not touch (I3 §c C5/C6, §d). Under FR-002
   this is legitimate *if* those slices are pure functions of the starting
   point (re-fetchable by id) — Phase 1's job is to make that true by
   construction rather than by parallel seeding.
7. **A whole editor lives outside every store.** The raw-KMN editor
   (`components/KmnEditor.tsx:52`) writes the compile pipeline's ephemeral
   session VFS; its edits are never written to any store and do not
   survive a pipeline re-run or reload (I3 B3). Option A must either give
   raw edits a decision representation or rule the surface's persistence
   semantics explicitly — it cannot stay uninventoried.
8. **Completion effects are writes too.** `lib/assignLoopCompletion.ts`
   fires `lockDesktop()`, a `repropagate` IR write, and the
   `touchLayoutJson` build at step completion from the adapters — its own
   header states these "are not decision `apply` work". They belong to
   the physical/touch phases.
9. **Small unsourced author writes** (Phase 7's long tail):
   `setDocFixProposals` (the #1908 confirmable fixes — answers recorded
   in the WC by the component's own header), `setChartPreference`,
   `setStartHolderOverride` (the spec-064 copyright escape hatch),
   `setContextToleranceOverlay` (an accepted context-tolerance fix),
   `setStartDocProfile` (base-derived; a starting-point function).
10. **The sink exists three times.** `applyWorkingCopyPatch` is composed
    identically in `StudioShell.tsx:905–915` and
    `lib/galleryHostDeps.ts:27–36`, and replay folds the same channels a
    third way (`foldPatch` + `installRebuiltState`). Any channel change
    is a three-place edit today (I1 §3).

## 4. Assumption deltas vs the D1 scan (stop-and-report items)

The scan (`state-architecture-scan.md`) was the programme's evidence base;
Phase 0 corrects it in five places. None reverses the ruling; two change
phase shapes.

1. **"Gallery settled values are decision records (spec 090)" — false as
   stated.** That holds only for the question-battery steps
   (`steps/manifest.ts:106–262`, `persistence: "decision-store"`). The
   editor steps declare `persistence: "working-copy"`
   (`steps/registerEditorSteps.ts:113–276`), their records are completion
   snapshots *from* the WC (ruling D-090-31, record-from-working-copy),
   and three of the four gallery module applies are ruled no-ops. The
   scan's Camp B fan-in counts stand; its "decisions own the galleries"
   implication does not. *Phase impact: physical/touch are build phases
   (representations + folds), not wiring phases.*
2. **`decisionIRConsistency.test.ts` is not an IR-equivalence test.** It
   asserts the `decisionIRPaths` ↔ registry relation (mapped paths are
   written by their providers; IR-less ids are allowlisted). The
   equivalence harness (Phase 0) follows its *registry pattern*; the
   runtime equivalence arms are new code, not an extension of an existing
   equivalence proof.
3. **The dedup pair is narrower than the scan framed it.** Per the
   save-site comment (spec 088 FR-006), survey-*question* answers are
   already not persisted — the decisions slice is their only saved
   record. `filterSurveyAnswersForDraft` today keeps position/status and
   gallery-step answers; `rehydrateAnswersFromDecisions` rebuilds
   question answers from decisions at load. Deleting the pair (FR-005)
   is therefore about the answer store's *runtime* role and the gallery
   residue, not about question answers being double-persisted.
4. **Store size: 130 members, not 155.** The scan's interface count
   included non-member lines; the mechanical census is 56 fields + 74
   actions = 130.
5. **`recordEditorStep` does not cover deadkeys** (its step map is
   carve/mechanisms/touch), and carve's source is a fold *beside* `apply`,
   not an `apply` — the scan's "journal after the fact" framing fits
   mechanisms/touch but understates carve and deadkeys, which are
   completion-time *sources* of two different kinds. The RECORD-ONLY
   class (§2) is a scan gap this inventory names.

## 5. Dormant slices (no live writer — final-phase cleanup, not phases)

- `keyTransplants` + `recordTransplant`: **0 callers repo-wide**. Live
  transplant records go into `touchKeyIdentity.transplantRecords`.
- `guardSpecification` (WC slice) + `setGuardSpecification`: **0
  callers**. The live guard specification rides the marks-treatment
  decision value and `touchKeyIdentity.guardSpecifications`.
- `carveTouchKeepInert` + `setCarveTouchKeepInert`: test-only callers; the
  `carved-layout` value has no field for it (D-090-31), so replay cannot
  reconstruct it; it is only cleared and snapshot-restored.
- Dormant carve actions with no production caller: `setCarveDisposition`
  (its Allow/Block UI is archived), `setClosedKeyboardCard` (card UI not
  mounted), `restoreNode`/`deleteItem`/`restoreItem`/`deleteTouchKey`
  paths superseded by the cascade pair in the v2 gallery (I2 §A.2).

These are deletions the final phase makes once the derived store's shape
is fixed — they need no decision representation because nothing writes
them.

## 6. The in-flight answers question (spec.md Assumptions) — narrowed

Phase 0 evidence narrows the open question to two residues:

- **Question answers**: already decision-only at persistence (delta 3).
  At runtime the answer store holds what was *given* (spec 079 give-time
  capture); on load, question answers are rehydrated from decisions. The
  runtime store can remain as a session cache over decisions without a
  persisted slice of its own.
- **Position/status + gallery answers**: the filter's surviving content.
  Position (within-step walk position, spec 079 R-01: positions survive
  reload by design) is session-class state, not keyboard truth — but
  losing it on reload is a deliberate behaviour change to R-01, so the
  v3 envelope question (keep a non-truth position slice vs drop it) is
  **presented for ruling in the final phase's plan**, not decided here.
  Gallery answers are Phases 4/5's decision representations; once those
  land, nothing in the filter's output remains author truth.

## 7. Criteria / testing envelope slices (spec.md Assumptions) — classified

- `criteriaRecord` (spec 084): the author's attestations/confirmations,
  keyed by criterion id. These are author acts *about* the project, not
  derivations of the keyboard. Classification: **decision-class records**
  (authored, provenance-bearing, persisted) — the v3 envelope may carry
  them as a named decision-family slice, or they gain DecisionSet record
  kinds in the final phase; what they may not do is ride along
  unexamined. No phase before the final touches them.
- `testing` (spec 094): test builds + tester reports — records *about*
  output artefacts, authored outside the derivation. Same classification
  and disposition as criteria.

## 8. Perf baseline (FR-012 reference)

Spec 093's measurements stand as the baseline: warm edit median **7.20 ms**,
cold resume median **9.58 ms** (sil_euro_latin, `rebuildPerf.measure`
procedure, 15 runs after 3 warmups;
`specs/_archive/093-derived-keyboard/perf-baseline.md`). Every phase that
touches replay re-measures by the same procedure and reports against these
numbers (tasks.md, per-phase gate evidence).
