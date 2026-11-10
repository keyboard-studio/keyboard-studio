# Feature Specification: Output from the replayed IR

**Feature Branch**: `118-replayed-ir-output`

**Created**: 2026-11-10

**Status**: Draft sketch. Not yet through `/speckit-clarify`; the open questions at the end need
rulings before planning.

**Input**: Matthew, 2026-11-10: "We start with the template keyboard and record decisions, and then
those decision transformations produce the final keyboard end-to-end every time." Spec 116 typed
the IR, but the typed IR is not what carries an author's work to the output.

**Governing authority** (Constitution precedence by topic):

- **Art III, state model.** The table already says *what renders / emits* is "the KeyboardIR working
  copy; on Open, the starting text plus spliced changes", and that replay installs the result. The
  code does not do this today (see Current state). This spec brings the code into line with Art III;
  it does not change the architecture.
- **Art II, codec spine.** Scaffolding, import, validation and mutation operate on the IR, not on
  `.kmn` text. Pattern application and several projection steps break this today.
- **Spec 105** (derived working copy, ruled 2026-10-19, Phase 0 shipped in #2292). 105 makes the
  working copy a pure function of the starting point and the decisions. This spec is its output
  side: it makes the *files* a pure function of that same replayed state. Where 105 folds a surface
  into replay, this spec requires the fold to land **in the IR**, not in an overlay slice that a
  separate projection re-applies to text.
- **Spec 116** (typed IR members, PR #2637) and **spec 117** (IR restructure, handoff in
  `specs/116-ng-parser-adoption/evidence/follow-on-handoff.md`): this spec depends on 116 and is
  sequenced with 117 (Q6).

## Current state (evidence, 2026-11-10)

Read from the spec 116 branch by four research passes; file references are to that branch.

- **Replay exists and is sound.** `decisions/replayKeyboard.ts` folds decisions over the starting
  IR. Checkpoints hold `{ ir, overlay }`. `applyDeterminism.ts` rejects impure applies.
  `replayDeterminism.test.ts` proves incremental equals full replay, byte for byte.
- **Little of the authoring reaches the replayed IR.** About 8 `apply` sites patch the IR: the rule
  set, defined dead keys, standard letters and the reserve header fields. 21 gallery modules have
  `apply: () => ({})`. Carve folds into an overlay slice, not the IR.
- **The output never comes from the replayed IR.** `lib/projectWorkingCopyVfs.ts` (1,602 lines)
  starts from the starting point's files and runs about 14 ordered steps over about 20 store inputs.
  Its own comment: "the working IR is never emitted into the artifact". Every output (download,
  `.kmp`, `.zip`, LDML, PR, preview) goes through it.
- **Text is the medium between steps.** The projection calls `parseKmn` 7 times, plus once in
  `applyDeadkeyOpsToVfs`, to read back what an earlier step wrote.
- **Pattern application edits text.** `applyAssignments.ts` splices substituted `kmnFragment` lines
  into the `.kmn` by group name. Identity (`stub-mutator`), custom CSS, icon/`&BITMAP` and copyright
  hygiene are also line edits.
- **The working IR leaks into output by side channels:** `deriveRuleAdditions` (rules stamped
  `rulesStepAdded`), `disabledFamilyRuleIds`, and the layout charts.
- **Touch layout and `.kvks` are edited as JSON/XML strings.** `TouchLayoutIR` exists with a
  full-fidelity codec, but spec 035 R9 keeps key edits as raw splices.

## Target end state

```
state  = replay(startingPoint, decisions)        // spec 093/105: pure, checkpointed
state  = { ir: KeyboardIR (incl. touchLayout, visualKeyboard), package, docs }
files  = emit(state, mode)                         // once, at the end
mode   = unedited | open | copy
```

- Every decision's `apply` is a pure transform on the state. No step reads back text another step
  wrote.
- `emit` is the only producer of `.kmn`, touch layout, `.kvks`, `.kps` and docs. The preview, the
  download, the PR and the LDML export all call it.
- Text survives only where an emit mode asks for it, never as a hand-off between steps:
  - **unedited**: the starting point's original bytes;
  - **open** (spec 111): changed nodes spliced into the author's text; a full re-emit needs consent;
  - **an author's code edit**: becomes a new starting point that decisions replay onto (Art III).

## User Scenarios & Testing

### User Story 1 - What the author sees is what ships (Priority: P1)

An author renames a touch key, adds a dead key, and applies a pattern. The preview, the downloaded
`.kmp`, the PR and the LDML export all contain exactly those changes, because all of them are
emitted from one replayed state.

**Independent test**: for a fixture walk, `emit(replay(start, decisions))` is byte-identical across
the preview, download and PR paths, and equals the current golden output
(`__fixtures__/flagParity/fullSpine.kmn`) except where W0 fixes a recorded defect.

### User Story 2 - Changing an early decision rebuilds the keyboard correctly (Priority: P1)

The author goes back and changes the carve after applying patterns and dead-key edits. Replay
recomputes the keyboard from that point. Dead-key edits recorded against rules still find their
rules, because ids come from the starting IR, not from re-parsing emitted text.

**Independent test**: random edit sequences (the `replayDeterminism` property test, extended to
every surface) give the same IR from incremental apply and from full replay, and the same files
from `emit`.

### User Story 3 - A contributor adds a step without touching the projection (Priority: P2)

A new authoring step declares a decision and a pure `apply`. It needs no new projection step, no
`.kmn` parse, and no store field read by the projection.

**Independent test**: an unregistered write path fails the spec 105 equivalence registry; the
projection has no `parseKmn` call (a lint or test asserts it).

### User Story 4 - Validation sees the real keyboard (Priority: P2)

The D3 validator checks the keyboard the author is building, not the unedited starting point.

**Independent test**: an assignment that introduces a Layer A error raises a finding in the D3
cycle without a compile.

## Requirements

### W0 - Defects to fix first (on `main`, each with a failing test before the fix)

Found during this research. Each lands as its own `fix(...)` PR before the migration, so the
migration's equivalence gates compare against correct output.

| ID | Defect | Status |
|---|---|---|
| D1 | A touch-key rename's rule half (vkey bindings) probably never reaches the download: `keyEditOps` is `[]` on the output path (`projectionInput.ts:158`), and the rename writes only the working IR with no `rulesStepAdded` stamp. | From reading; needs a reproduction test |
| D2 | Replay drops the `docFixProposals` channel (`help-body-parity`): `foldPatch` and `installRebuiltState` ignore it, so apply and replay disagree (Art III). | From reading |
| D3 | The D3 validator checks the unedited `startVfs` `.kmn` (`StudioShell.tsx:1223-1231`). Author changes are only checked by the preview compile. | Verified |
| D4 | Projection steps 2.8 (caps) and 4 (id rename) call `emitKmn` directly, bypassing `writeKmn`, so Open mode loses byte identity. Step 2.8 has no "unchanged" gate. | From reading |
| D5 | The preview never passes `openMode`, so an opened keyboard's preview is a full re-emit while its download is a splice. | From reading |
| D6 | `OskCodePane`, `TouchCodePane`, `OskEditor` and `docRegenerationFix` replace starting-point files without the replay wrapper. | From reading |
| D7 | Dead-key `repoint` ops store rule node ids; the projection re-parses carved text, which re-mints ids by position, so a recorded id can point at the wrong rule. | From reading |
| D8 | Open-mode splices use `startIr` line spans after step 0b may have inserted or removed the `&KMW_EMBEDCSS` line. | From reading |
| D9 | Bare pattern rules always target a group literally named `main`, not the entry group; `spliceRuleAdditions` silently drops additions to a group the base lacks. | From reading |

### W1 - Pattern application on the IR

- **FR-101**: Pattern application MUST produce IR, not text. Each fragment is slot-substituted as
  text (the `{{slotId}}` syntax is unchanged and must run first), then parsed with the codec inside a
  scaffold, following the `rulePacks/install.ts` precedent, and merged into the state's IR.
- **FR-102**: The merge MUST keep today's semantics, each with a test: pattern rules go before base
  rules; `match`/`nomatch` stay last, last wins per kind; user stores upsert by name; `&` system
  stores are dropped with a warning; bare rules go to the entry group (`header.entryPoints`), fixing
  D9; re-applying the same assignments is idempotent (dedup scope: Q3).
- **FR-103**: The output-form seam (spec 106 US3) MUST build its generated units as IR, not as raw
  KMN text.
- **FR-104**: The `Pattern` contract is unchanged: `kmnFragment` stays a string. No major bump.
- **FR-105**: The ~85 tests pinned to `applyAssignments` text MUST move to IR assertions, or to
  emitted-text assertions through `emit`, with no loss of coverage.

### W2 - Every surface folds into the IR during replay

This is spec 105 Phases 2-7, with one added requirement: the fold target is the IR.

- **FR-201**: Each surface's decision `apply` MUST transform the IR (or the touch/kvks model), not
  write an overlay slice for a later projection step:
  - carve (`applyCarveMutate` is already IR to IR), including `fallbackPolicy`,
    `carveTouchKeepInert` and `deletedTouchKeyIds`;
  - dead keys, over the carved IR, so replay and output compute the same thing (fixes D7);
  - assignments (W1) and the claimed-input rule drops;
  - mark guards, caps, context tolerance, custom CSS;
  - identity as header writes, retiring `stub-mutator` (marked for deletion);
  - touch-key rename via `renameTouchKey`, which already rewrites rules and layout together.
- **FR-202**: Context tolerance needs an async compile and simulation today. Its decision value MUST
  carry the computed result, so replay stays synchronous and pure (Q5).
- **FR-203**: `deriveRuleAdditions`, `spliceRuleAdditions` and the `rulesStepAdded` marker MUST be
  retired: additions arrive as decisions, not as a diff of the working IR.

### W3 - Touch layout and visual keyboard in the replayed state

- **FR-301**: `TouchLayoutIR` MUST be part of the replayed state, with the touch-step build inputs
  carried by the `touch-layout` decision value.
- **FR-302**: Emitting the touch layout MUST NOT stamp `p:"hand-set"` on keys it did not change, and
  MUST keep members the model does not type. These are spec 035 R9's surviving reasons; R9's
  original reason (missing fields) was withdrawn after the full-fidelity codec.
- **FR-303**: Pure twins exist for touch-key removal and key edits. Twins MUST be added for carve
  keycap removal, layer propagation and keycap labels.
- **FR-304**: `.kvks` (Q4): either a fidelity-preserving model, or an explicit post-emit text pass
  that is the documented exception.

### W4 - The projection becomes emit

- **FR-401**: `projectWorkingCopyVfs` MUST reduce to `emit(state, mode)` plus file-level work
  (`.kps` descriptor, id-driven renames, docs, fonts). It MUST contain no `parseKmn` call.
- **FR-402**: The three emit modes MUST be the only places text is preserved, and every `.kmn` write
  MUST go through them (fixes D4, D5).
- **FR-403**: Charts and doc models MUST read the replayed state.

### W5 - Validation on the derived keyboard

- **FR-501**: The D3 cycle MUST validate the replayed state's emitted `.kmn` (fixes D3). It stays
  one debounce cycle; no new timer (decision D3).

### Gates

- **FR-901**: Every phase is landable alone and keeps output byte-identical to the previous phase on
  the golden fixtures, except where a W0 fix changed the expected output. Spec 105's A/B rule
  applies to red gates.
- **FR-902**: Apply-versus-replay equality is asserted on the IR (and the touch/kvks models) for
  every surface, extending `replayDeterminism.test.ts`.
- **FR-903**: Each phase re-measures replay with `rebuildPerf.measure` (spec 105 FR-012). The
  existing 7.20 ms / 9.58 ms baselines cover survey decisions only, not editor surfaces, so the
  first editor-surface phase sets a new baseline.

## Success Criteria

- **SC-001**: Zero `parseKmn` calls in the projection; one emit per output.
- **SC-002**: `rulesStepAdded`, `deriveRuleAdditions` and the "working IR is never emitted" comment
  are gone.
- **SC-003**: Golden fixtures byte-identical through every phase, modulo W0.
- **SC-004**: The D3 validator raises a finding for an author-introduced Layer A error.
- **SC-005**: Replay of a full fixture walk stays under spec 093's proposed 300 ms edit / 2 s resume
  budgets.

## Phasing (sketch)

| Phase | Content | Lines up with |
|---|---|---|
| 0 | W0 defect fixes, each its own PR | - |
| 1 | Emit modes and a state-in, files-out `emit` beside the projection (no behaviour change) | - |
| 2 | Identity, custom CSS, caps, mark guards as IR applies | 105 Phase 7 |
| 3 | Dead keys over the carved IR | 105 Phase 2 |
| 4 | Carve as an IR apply | 105 Phase 3 |
| 5 | Pattern application on the IR (W1) | 105 Phase 4 |
| 6 | Touch layout and `.kvks` in the state (W3), key edits and renames | 105 Phases 5-6 |
| 7 | Projection reduced to emit; D3 validates the replayed state (W4, W5) | - |

## Open questions (need rulings)

- **Q1 - One spec or two?** Amend spec 105 so its phases fold into the IR, or keep this as a separate
  output-side spec cross-referenced with 105? *Recommendation: separate.* 105 is about what is
  stored; this is about what produces the files. They meet at the fold target.
- **Q2 - Drafts.** 105 FR-002 (decisions-only drafts) conflicts with Art III ("decisions-only drafts
  are not the shipped model, and no plan may assume them"), which predates 105 and was never
  amended. This spec does not need decisions-only drafts and works with today's snapshot envelope.
  The conflict should be resolved in 105, not here.
- **Q3 - Pattern dedup scope.** Today a matching line anywhere in the file suppresses an insert.
  Keep whole-keyboard structural equality, or narrow to the target group?
- **Q4 - `.kvks` fidelity.** Build a fidelity-preserving `KvksIR`, or keep `.kvks` patching as the one
  documented post-emit text pass?
- **Q5 - Context tolerance.** Carry the computed result in the decision value (keeps replay pure),
  or allow an async apply?
- **Q6 - Order against spec 117.** 117 changes the rule shape (explicit keystroke, typed left-hand
  side). W1's merge compares rules, so doing W1 after 117's B1 avoids writing the merge twice.
  *Recommendation:* W0 now; phases 1-4 in parallel with 117; W1 after 117 B1.
- **Q7 - Touch provenance.** Which keys does an emit mark `hand-set`: only keys a decision changed?

## Out of scope

- Decisions-only drafts (spec 105 FR-002 and Q2).
- The IR restructure itself (spec 117).
- Byte-identical round trip of arbitrary `.kmn` (Constitution, out of scope for v1).
- New authoring features.
