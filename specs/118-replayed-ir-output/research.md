# Research: Output from the replayed keyboard

Spec-level questions were ruled on 2026-11-10 (see spec Clarifications). These entries record the
design choices the plan makes on top of them. File-level evidence for the current state is in
[evidence/draft-sketch.md](evidence/draft-sketch.md).

## R1. Where `emit` lives

- **Decision**: `emit(state, mode)` lives in `packages/engine/src/output/`; the studio supplies the
  state and the file-level inputs.
- **Rationale**: the engine already owns the codec and the output paths (Constitution VI). Keeping
  emit there stops studio code from reading generated text back, which is the root of defects (g)
  and (h).
- **Alternatives considered**: keep it in `lib/` beside the projection. Rejected: it invites the
  same text hand-offs.

## R2. Output modes

- **Decision**: three modes: `unedited` (starting-point bytes), `open` (changed nodes spliced into
  the author's text, spec 111), `copy`/generate (full emit). Every `.kmn` write goes through them.
- **Rationale**: Constitution Art II and III already name these cases. It fixes (d) and (e) by
  construction: the projection's direct `emitKmn` calls disappear.
- **Alternatives considered**: a fourth "reformat" mode. Rejected: a full reformat of an opened
  keyboard is the same full emit, gated by consent.

## R3. Pattern application on the model

- **Decision**: substitute `{{slotId}}` as text first, parse the fragment inside a scaffold, then
  merge into the model, following `rulePacks/install.ts`. Merge rules are the six listed in FR-012.
- **Rationale**: keeps the published pattern format and the slot syntax unchanged (Art I) while
  removing text splicing by group name. Parsing in a scaffold gives bare rules a group to land in,
  and the merge sends them to the entry group, which fixes (i).
- **Alternatives considered**: a typed fragment in the Pattern contract. Rejected: a schema change
  (Art I) for no gain.
- **Sequencing**: after spec 117's explicit-keystroke change, so rule comparison is written once.

## R4. Touch layout and `.kvks`

- **Decision**: the touch layout joins the replayed state through the existing `TouchLayoutIR` and
  its full-fidelity codec. Emit stamps hand-set only on keys a decision changed and keeps unknown
  members. `.kvks` stays a documented text pass after emit.
- **Rationale**: spec 035 R9's remaining reasons are provenance and unknown members, both met by
  FR-016. No fidelity-preserving `.kvks` model exists, and building one is not needed for the goal.
- **Alternatives considered**: a `KvksIR` now. Rejected: new model work with no author-visible gain
  in this spec.

## R5. Ordering

- **Decision**: each constraint the projection enforces by step position becomes a `requires` edge
  in the decision registry. The comments in `projectWorkingCopyVfs.ts` are the inventory. A gate
  compares derived-order output against current-order output on the golden fixtures.
- **Rationale**: Art IX says one sort derives every order. A gate that fails on a difference makes
  the migration reversible per edge.
- **Alternatives considered**: keep step order as a stored list. Rejected: Art IX forbids it.

## R6. Validation input (FR-017)

- **Decision**: the existing 300 ms cycle validates the emitted `.kmn` of the replayed keyboard.
  No new timer.
- **Rationale**: D3 scopes the cycle to validation; changing its input needs no sign-off. It fixes
  defect (c).
- **Alternatives considered**: validate the model directly. Rejected: Layer A checks and the WASM
  oracle both read text, and the two must see the same input.

## R7. Defect handling

- **Decision**: each FR-020 defect gets a failing test first, then its own fix commit, in Phase 0.
  Defects marked "probably" or "can" are confirmed by the test; one that does not reproduce is
  recorded as such and its regression test stays.
- **Rationale**: the migration is then compared against correct output.
- **Alternatives considered**: fix defects inside the migration phases. Rejected: it hides output
  changes inside byte-identical gates.

## R8. Draft cache

- **Decision**: the saved draft keeps its working-copy snapshot as a cache. Replay must reproduce
  everything in it and wins on disagreement.
- **Rationale**: ruled 2026-11-10; consistent with Art III.
- **Alternatives considered**: decisions-only drafts. Out of scope.
