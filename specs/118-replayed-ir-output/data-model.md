# Data Model: Output from the replayed keyboard

No Pattern or contracts field changes (Art I). This feature reshapes how existing entities relate and
adds a small number of engine-level types. Names below describe roles; exact identifiers are set at
implementation.

## Starting point

The keyboard the working copy was instantiated from (copied keyboard in Track 1, current release in
Track 2).

- **Fields**: original files (path to bytes), parsed `KeyboardIR`, origin (copied | opened), source
  keyboard id.
- **Rules**: read-only after instantiation. A direct code edit replaces it with a new starting point
  and recorded decisions replay on top (FR-015).
- **Invariant**: unedited, its source files are emitted byte-for-byte (SC-005).

## Decision

One recorded author choice (unchanged shape, spec 105 envelope).

- **Fields**: decision id, recorded value, provenance, `requires` edges to other decision ids.
- **Change**: `apply(keyboard, value)` returns the transformed keyboard, including touch layout and
  visual keyboard, for every surface (D-090-24 revised). It is pure and synchronous.
- **Validation**: a write path to output-bearing state that is not declared as a decision fails the
  spec 105 equivalence gate (US4). A recorded choice that can no longer apply is reported, never
  dropped (Art X).
- **Ordering**: `requires` edges are the only source of order (FR-013). Each position-implied
  constraint in the current projection becomes one edge. The derived order must produce the same
  output as the current step order on the golden fixtures.

## Replayed keyboard

The only producer of output state (FR-010, FR-011). A function of starting point plus decisions.

- **Fields**: `KeyboardIR` (rules, stores, groups, opaque fragments), `TouchLayoutIR`, visual keyboard
  model, identity and package metadata.
- **Checkpoints**: replay keeps `{ ir, overlay }` checkpoints. After amended FR-007, overlay holds
  only state no output file carries (attribution, help-doc answers).
- **Relationships**: built from one Starting point and N Decisions; consumed by one Output set.
- **Validation**: determinism. Same inputs give the same keyboard; incremental and from-scratch builds
  agree (FR-031, SC-002).

## Touch layout and visual keyboard state

Carried in the replayed keyboard.

- **Touch layout**: existing `TouchLayoutIR` with its full-fidelity codec. Keys gain a hand-set mark
  only when a decision changed them. Members the model does not describe are kept unchanged (FR-016).
- **Visual keyboard**: model state for keycap labels, layer propagation and carve keycap removal. The
  `.kvks` file stays a documented text pass after emit until a fidelity-preserving model exists.
- **Transition**: raw-JSON twins and the separate spec 063 R10.2 rule-synthesis pass retire once the
  twin-equivalence tests are green.

## Pattern application (merge)

Not a new stored entity: a transform inside the pattern decision's `apply`.

- **Input**: pattern `kmnFragment` after `{{slotId}}` text substitution, parsed inside a scaffold.
- **Merge rules (FR-012)**: pattern rules take precedence over starting rules; end-of-group
  directives stay last; same-named stores are replaced; system stores in a pattern are refused with a
  warning; rules without a group go to the entry group (not a group literally named "main"); applying
  again adds nothing (a rule identical to one anywhere in the keyboard is not added again).

## Output mode

Enumeration controlling how `.kmn` text is written (R2).

- **Values**: `unedited` (starting-point bytes), `open` (changed nodes spliced into the author's
  text, spec 111), `copy` (full emit).
- **Selection**: unedited starting point and no changes gives `unedited`; opened keyboard gives
  `open`; otherwise `copy`.
- **State transitions**: `open` to a full reformat only with the author's recorded consent (FR-015);
  a direct code edit makes a new Starting point, after which the mode is chosen afresh.
- **Validation**: every source write goes through a mode. Preview and download use the same mode for
  the same keyboard (removes defect (e)).

## Output set

The files produced by one `emit(state, mode)` call in `packages/engine/src/output/`.

- **Fields**: source files (`.kmn`, touch layout, `.kvks`), package files, archive, pull-request
  file set, LDML export.
- **Inputs**: Replayed keyboard, Output mode, file-level inputs from the studio (descriptor, id
  renames, docs, fonts).
- **Rules**: produced once; no stage re-reads text another stage generated (FR-014). Compiled
  artifacts are staged on the download path only, never in the shared projection (criteria SS1).
  `.kvks` text pass runs after emit.

## Validation input

The existing single 300 ms cycle (D3) now validates the emitted `.kmn` of the replayed keyboard
(FR-017). Findings appear within one cycle of a change and clear when it is undone. No new timer.

## Draft envelope (cache)

Saved draft keeps its working-copy snapshot as a cache (spec 105 FR-002 amended).

- **Rule**: replay must reproduce everything in the snapshot; on disagreement replay wins and the
  snapshot is discarded and rewritten.
