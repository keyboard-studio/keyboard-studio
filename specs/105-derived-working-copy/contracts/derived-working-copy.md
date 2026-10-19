# Contracts: Derived working copy (spec 105)

Normative contracts for the programme. Where a phase's implementation and
this contract disagree, the contract wins until it is amended in the same
PR that changes the behaviour.

## §1 The derived-store contract

1. **One write path.** Author intent enters the working copy only as:
   record a decision (088 DecisionSet) → derive (089 `apply()` or a fold
   declared in §2) → install the replayed state. No component, hook,
   adapter, or completion effect may call a store action that mutates
   author-truth state directly.
2. **The store is a cache.** Every WorkingCopyState field is exactly one
   of: a starting-point slot (input), a replay-installed derived slot, a
   fold-installed slice, or session/ephemeral state classified as such in
   the gate registry. A field that fits none of these is a contract
   violation the gate must catch (FR-010).
3. **No rival writers.** The incremental-apply path and replay must not
   both write the same completion (spec FR-003): apply is a step *of*
   the fold. Completion effects that write the store
   (`lib/assignLoopCompletion.ts` today) are derivations or they do not
   exist.
4. **The sink is single.** Overlay-channel writes go through one
   composition of the patch sink. The current three compositions
   (StudioShell, galleryHostDeps, replay's fold) converge to the fold;
   a phase that touches a channel must not add a fourth composition.

## §2 Decision representations for editor state

1. A surface's representation is: a DecisionSet record id, a value shape
   carrying the surface's **complete** settled state, an owning question
   module, and a reproduction mechanism — either the module's pure
   `apply()` returning a `WorkingCopyPatch`, or a **declared fold**: a
   named function in `decisions/` that folds the record's value into a
   named overlay slice at the record's position in the derived order
   (the carve precedent, generalised and named, not copied ad hoc).
2. Recording is **edit-time**: the record is updated as the author edits,
   before the derived state is installed. Snapshotting the working copy
   at step completion (the D-090-31 pattern) is prohibited for surfaces
   this programme has migrated.
3. A surface's direct store writes are removed **only** in the phase
   whose equivalence arm (§3) covers that surface, and the removal and
   the arm land in the same PR.
4. Provenance: author gestures record `asked`; tool-derived prefills
   record their existing provenance strings inside the value (the carve
   dispositions precedent) — a prefill must never overwrite an
   author-override (Art. X).

## §3 The equivalence gate

Landed in Phase 0: `packages/studio/src/decisions/derivedSurfaceRegistry.ts`
+ `derivedEquivalence.test.ts`. The gate has four arms; a phase PR must
keep all four green and may only *move* surfaces between statuses as its
own work justifies.

1. **Census arm.** The WorkingCopyState member set, extracted mechanically
   from the live interface, equals the registry's classification map —
   both directions. A new member without a classification fails.
2. **Coverage arm.** Every member classified EDITOR-AUTHORED or
   UNCLASSIFIED is named by a registry surface (in its `fields` or
   `storeActions`); every surface's named members exist in the census
   with the declared kind. Absence is failure, never a default (the
   `decisionIRConsistency` pattern).
3. **Replay arm.** For each `equivalence-proven` surface: the state its
   real write path produces and the state replay-from-decisions produces
   are deep-equal (IR + overlay channels + the surface's slices).
   Phase 0 proves this arm for the survey decision-replay path.
4. **Draft-load arm.** For each `equivalence-proven` surface: a saved
   draft with the working-copy slice absent, re-supplied with only the
   starting point (by id) and the envelope's decision set, rebuilds to
   the same derived state as the intact draft. Phase 0 lands this arm in
   bypass form (the v2 loader restores the WC from its slice and its
   loader is not slice-tolerant); the final phase converts it to the
   real loader path when the v3 envelope lands.

Gate hygiene: the gate includes a planted-violation self-test (the
`galleryWriteAudit` pattern) proving the coverage arm flags an
unregistered write. Skipping, weakening, or allowlisting a red arm to
land a phase is a contract violation; the A/B rule (spec FR-011) decides
whether a red gate is the phase's at all.

## §4 Envelope v3

1. Contents exactly per data-model §4. No `workingCopy` slice, no
   `surveyAnswers` slice, no materialised keyboard state under any name.
2. `DRAFT_VERSION` becomes 3 in the final phase only; until then phases
   ship v2-compatible (their state rides the existing slices through the
   decision set, which v2 already persists).
3. v2 → v3 migration is rebuild-based (spec FR-009): read the v2 WC
   slice once, convert by the surfaces' value builders, replay, report.
   A field that cannot be converted is named in the migration report;
   a silent drop is a contract violation.
4. Session continuity across OAuth (today: `persistWorkingCopy`'s
   sessionStorage snapshot) is re-expressed as the v3 envelope (or the
   decision set + starting-point id) in the final phase — never as a
   snapshot of the derived cache.

## §5 Surface-specific rulings carried into phases

1. **Deadkeys (Phase 2).** Rebuild must install the `deadkeyOverlay`
   slice from the `deadkeys-defined` record, so the live op log and the
   record are the same object after any rebuild. The completion snapshot
   is replaced by edit-time recording through the existing commit funnel.
2. **Carve (Phase 3).** `keepAll`/`restoreAll` must not clear another
   surface's overlay except as a recorded decision of that surface.
   The family toggle (`toggleFamilyDisabled`, written from the rules
   surface) records into `carved-layout` at edit time — the
   recorded-at-carve-completion timing gap (research §3, I2 A6) closes.
3. **Touch (Phase 5).** `touchLayoutJson` is a projection: it is computed
   from derived state wherever it is consumed (preview, completion,
   output) and is deleted as a stored field. Direct `setWorkingIR`
   promotions in TouchGallery must be re-expressed as key-edit ops or
   named decision records — an IR write with no op/record is a §1
   violation.
4. **Spec 104 records (Phase 6).** The `touchKeyIdentity` record family
   moves into the DecisionSet as decision records; the WC slices become
   derived caches. Record shapes (contracts of spec 104) do not change —
   only their home and their source-of-truth status.
5. **Raw-KMN editor (Phase 7).** The phase must produce a design decision
   with evidence: either raw edits become a decision record (an explicit
   raw-override value replay folds last), or the surface is re-scoped as
   a scratch preview with its non-persistence stated in its UI copy.
   Leaving it uninventoried-but-live is not an outcome.
6. **Starting point (Phase 1).** The base-artifact slices (welcome/help/
   README texts, license, baseline findings, doc profile) must become
   pure functions of the starting-point bundle, computed where consumed
   or cached keyed by the bundle — the parallel seeding channel in
   `useKeyboardArtifact` beside instantiation is removed, so a base
   switch cannot leave stale base slices behind.
