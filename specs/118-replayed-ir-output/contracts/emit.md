# Contract: output from the replayed keyboard

Spec: [../spec.md](../spec.md). Plan: [../plan.md](../plan.md). Research: [../research.md](../research.md).

This contract fixes the interface the feature exposes. Names are the spec's. Parameter shapes the
spec does not fix (for example the exact type of `state`) are left for `data-model.md` and the
tasks, and are marked as open here rather than invented.

## 1. The output stage: `emit(state, mode)`

Location: `packages/engine/src/output/` (research R1). One entry point. The studio supplies `state`
and file-level inputs (descriptor, id renames, docs, fonts); the engine returns the output set.

- `state` is the replayed keyboard: rules and stores, touch layout, visual keyboard, identity and
  package metadata (spec Key Entities), plus the starting point's original files.
- `mode` is the output mode, one of the three in section 2.
- The result is the output set: the files produced from the replayed keyboard.

Guarantees:

- FR-014: preview, download, source archive, pull request and LDML export all call this stage. No
  caller re-reads text another stage generated.
- FR-010: the same starting point and decisions give the same `state`, so the same output
  (byte-identical on rebuild, User Story 2).
- FR-011: nothing downstream of `emit` applies a decision a second time from separately stored
  state.
- Compiled artifacts are not produced here; they stay on the download path only (Constitution V).
- The published `Pattern` format and `{{slotId}}` syntax do not change (FR-012).

## 2. Output modes

Three modes (research R2). Every `.kmn` write goes through one of them (FR-015).

| Mode | Behaviour | When |
|---|---|---|
| `unedited` | Starting-point bytes copied byte-for-byte. | No decision changed the file (SC-005). |
| `open` | Changed nodes are spliced into the author's own text (spec 111). | A keyboard opened for update. |
| `copy` | Full generate from the model. | A copied keyboard with changes. |

A full reformat of an opened keyboard is the same full emit as `copy`, and needs the author's
agreement (Constitution Art X). `emit` never reformats an opened keyboard on its own. A direct
code edit is not a mode: it becomes a new starting point, and recorded decisions replay on top of
it.

Touch layout writing (FR-016): a key is marked hand-set only when a decision changed it, and
layout members the model does not describe are kept unchanged. The `.kvks` file may remain a
documented text pass after `emit` until a fidelity-preserving visual-keyboard model exists
(Assumptions).

## 3. Decision `apply` contract

Every surface's `apply` returns the transformed keyboard (D-090-24 revised, spec 090 option c).

- Input: the keyboard model so far and the decision's recorded value.
- Output: the transformed keyboard, including its touch layout and visual keyboard where the
  decision changes them (FR-011).
- Pure and synchronous. No timers, no network, no reads of generated text. Replay stays repeatable
  (FR-010).
- Provenance stays on the decision. The recorded value is the only stored truth about the author's
  intent; `apply` stops being a no-op.
- Anything an output file carries folds into the keyboard model (spec 105 FR-007 amended).
  Overlay channels remain only for state no output file carries (attribution, help-doc answers).
- Context tolerance: its decision records the computed result (it needs a compile and a
  simulation), so `apply` itself stays synchronous.
- If a recorded value can no longer apply (its rule was removed by an earlier choice), `apply`
  reports it to the author. It never ignores it silently (Edge Cases, Art X).

Pattern application (FR-012): `{{slotId}}` is substituted as text first, the fragment is parsed
inside a scaffold, then merged into the model. Merge behaviour:

- pattern rules take precedence over the starting keyboard's rules;
- end-of-group directives stay last;
- stores replace same-named stores;
- system stores in a pattern are refused with a warning;
- rules without a group go to the entry group;
- re-applying is idempotent (a rule identical to one anywhere in the keyboard is not added again).

Equivalence (FR-031, FR-011): for every surface, building one change at a time and rebuilding from
scratch give the same keyboard model. A write path that is not declared as a decision fails the
spec 105 equivalence check, which names the write path (User Story 4).

## 4. `requires` ordering edges

Ordering between decisions is declared, not implied by the position of an output stage (FR-013).

- Each constraint the projection enforces by step position becomes a `requires` edge in the
  decision registry (research R5). The comments in `projectWorkingCopyVfs.ts` are the inventory.
- Replay order is derived by `orderByDependencies` (Constitution IX). No stored step order.
- Gate: the checks fail if the derived order would produce different output from the current stage
  order on the golden fixtures.

Adding a step needs one decision and one transformation, with its `requires` edges. No change to
`emit` (SC-007).

## 5. Validation input

Continuous validation checks the replayed keyboard, not the starting keyboard (FR-017, defect (c)).

- The input is the emitted `.kmn` of the replayed keyboard (research R6). Layer A checks and the
  WASM `kmcmplib` oracle both read text, and both see this same input.
- It runs inside the existing single 300 ms debounce cycle (decision D3). No second timer.
- An error introduced by an author's change appears in the findings within one cycle, and is gone
  after the change is undone (User Story 3, SC-004).

## 6. Compatibility and gates

- FR-030: each phase keeps output byte-identical on the golden fixtures, except where an FR-020
  fix changed it on purpose. A red gate counts against a phase only if it reproduces on an
  unchanged tree (spec 105 A/B rule).
- FR-032: each phase that changes replay re-measures rebuild time against the spec 105 FR-012
  baselines. Budgets (SC-006): rebuild after an edit under 300 ms, draft restore under 2 seconds.
- Drafts keep a working-copy snapshot as a cache. Replay must reproduce everything in it and wins
  on disagreement.

## Open items for data-model.md

- Exact type of `state` and of the `emit` result.
- Exact `apply` signature and the form of the "can no longer apply" report.
- Exact shape of a `requires` edge in the registry.
