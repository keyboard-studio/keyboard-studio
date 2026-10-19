# Data Model: Derived working copy (spec 105)

Entities introduced or redefined by this spec. No new storage is created:
the programme's data-model work is (a) giving editor state DecisionSet
record shapes, (b) the gate's registry, and (c) the v3 envelope. Record
conventions follow specs 088/093 (`decisionRecord.ts` / `decisionTypes.ts`,
Constitution Art. III); field lists are normative at the level the FRs and
contracts cite, TypeScript shapes are each phase's tasks to finalise.

## 1. Editor decision records (one family per surface phase)

Each surface's state becomes a DecisionSet record (or a small record
family) whose value carries the *complete* settled state of that surface —
the completion-snapshot values of today, recorded **at edit time** and
reproduced by the module's `apply()` or by a named replay fold:

| Phase | Decision id(s) | Value (today's snapshot shape, unless noted) | Reproduction |
|---|---|---|---|
| 2 | `deadkeys-defined` (exists) | `{ ops: DeadkeyOp[] }` — the op log itself | `apply()` replays ops (exists); **new**: rebuild installs the `deadkeyOverlay` slice from the record |
| 3 | `carved-layout` (exists) | `CarvedLayoutValue { removals, dispositions, closedKeyboardCard }` | The carve fold (exists); **new**: fold promoted to the module contract (a carve channel or a declared fold), recorded at edit time |
| 4 | `physical-layout` (exists) | `{ assignments: MechanicAssignment[] }` **plus** the sequence-flag set | **New**: a reproducing `apply()`/fold for assignments into `phaseResults`-free session state; completion effects (`desktopLocked`, repropagate) become derivations, not writes |
| 5 | `touch-layout` (exists, extended) | `{ ops: KeyEditOperation[], deletedTouchKeyIds }` **plus** character-mode assignments (today's `touchDraft.charTouchEntries`), suggestion resolutions, bulk groups | **New**: fold installing `keyEditOverlay` + `deletedTouchKeyIds`; character-mode assignments gain a value arm; `touchLayoutJson` becomes a projection of the derived state, never a stored field |
| 6 | `touch-key-identity` (**new** DecisionSet family) | Spec 104's spine records: repair proposals, identity decisions, transplant records, guard specifications, choice states (today's WC `touchKeyIdentity` slice shape) | **New**: records live in the DecisionSet; the WC slices become derived caches installed by replay |
| 7 | `project-identity` edits, `doc-fix-proposals`, `chart-preference`, `start-holder-override`, `context-tolerance-fix` (**new** kinds or arms of existing families) | Each surface's settled value (identity patch fields; fix accept/decline set; chart choice; holder string; accepted fix) | **New**: `apply()` folds into the existing overlay channels / derived state; the raw-KMN editor's representation is this phase's design task (see contracts §5) |

State rules for all rows:

- A record is **superseded, never edited in place** at the spine level;
  the DecisionSet holds the current record per id (088 C-1).
- Provenance follows the existing classes (`asked` for author gestures;
  base-derived values only as presented/confirmed/attributed decisions,
  Art. X / FR-014).
- Edit-time recording: the record changes **before** the derived working
  copy changes (FR-001). Completion-time snapshotting from the WC is the
  pattern being retired (research §2, RECORD-ONLY/BRIDGE classes).

## 2. Derived working copy (redefined)

`replay(startingPoint, decisions)` → `ReplayState { ir, overlay }` (093),
installed as the store's content. The store retains:

- the **starting-point slots** (base bundle identity + the bundle itself,
  re-fetched/re-derived by id — an input, not a truth);
- the **derived cache**: IR + overlay channels + fold-installed slices
  (carve slice, deadkey ops slice, touch overlays) — every field either
  installed by replay or classified session/ephemeral;
- **no author-truth field without a decision source** (SC-001: the gate
  registry reaches zero pending, zero unclassified).

Removed at programme end: the `phaseResults` slot (session derived from
decisions instead), the WC-held spec-104 slices, `touchDraft` /
`touchLayoutJson` as stored fields, the dormant slices (research §5),
and every store action that exists only to mutate the cache directly.

## 3. Derived-surface registry (gate data)

One entry per inventoried write surface — the FR-010 registry, landed in
Phase 0 as `packages/studio/src/decisions/derivedSurfaceRegistry.ts`:

| Field | Notes |
|---|---|
| `id` | Stable surface id (e.g. `touch-layout`, `docs-identity-overlays`) |
| `phase` | The programme phase that migrates it (1–9); `0` for Phase 0-proven |
| `status` | `equivalence-proven` \| `pending` \| `starting-point` \| `session-only` \| `dormant-no-live-writer` |
| `fields` / `storeActions` | The WorkingCopyState members the surface writes — checked against the live interface census by the gate |
| `decisionIds` | The record family that will source (or sources) the surface |
| `evidence` | Pointers into research.md / phase0 fragments |

Rules: a member classified EDITOR-AUTHORED or UNCLASSIFIED must be covered
by exactly the registry (absence = gate failure); a surface flips to
`equivalence-proven` only in the phase PR that lands its gate arm.

## 4. Draft envelope v3

Successor to `DurableDraft` v2 (`DRAFT_VERSION` 2 → 3). Contents (FR-002):

| Slice | Status in v3 |
|---|---|
| `projectKey` / `displayName` / `languageTag` / `savedAt` | Kept (envelope metadata; display fields re-derivable, retained for the project index) |
| starting-point **id** | **New explicit slice** (today it lives inside the WC slice as `startKeyboard`) — satisfies 093 FR-004's wording |
| `decisions` | Kept — the DecisionSet snapshot; now the sole keyboard truth |
| `decisionRecord` | Kept — the spec-053 log (a decision record; audit only, never a sole source of a fact) |
| `criteriaRecord`, `testing` | Kept as named decision-family slices (research §7) or folded into DecisionSet kinds — final phase decides with the classification on record |
| `traversal` / position | **Open** — research §6: keeping a non-truth position slice vs dropping spec 079 R-01's reload-surviving positions is presented for ruling in the final phase |
| `workingCopy` | **Removed** |
| `surveyAnswers` | **Removed** (question answers are decisions; gallery answers are Phases 4/5 records; position is the row above) |

Migration (FR-009): v2 envelopes load through a rebuild migration — the
v2 WC slice is read **once**, converted to decision records wherever a
phase's representation exists (the completion snapshots already in the
v2 `decisions` slice cover completed steps; un-completed editor state is
converted by the same value builders the adapters use), replayed, and any
field that cannot be converted is named in a migration report. Silently
dropped items: zero (SC-003).

## 5. Migration report (final-phase artefact)

Per v2 fixture/draft: `{ fixture, convertedFields[], unconvertedFields[]
{field, surface, reason}, projectedOutputEqual: boolean }`. The report is
a test artefact of the migration suite, and its unconverted list must be
empty for every fixture the programme claims (SC-003) — a non-empty list
is a reported limitation with the field named, never a silent drop.
