# Research: what spec 062 shipped, and why no author can reach it

Companion to [spec.md](spec.md). This document is the audit that motivated the
feature: what [062-canonical-context-tolerance](../062-canonical-context-tolerance/spec.md)
specified, what its implementation PR delivered, where the delivered code
stops short of the running studio, and the defects found afterwards. Everything
below was verified against `main` on 2026-09-23 unless stated otherwise; file
and line references are to that state and will drift.

## 1. What spec 062 asked for

Spec 062 (created 2026-08-12, docs merged in PR #1622) names the invariant
**"Output is uniform. Context is tolerant."** A keyboard emits one
normalization form but must match its context rules against either form. The
motivating defect: `sil_yoruba8`'s acute key, when FieldWorks has decomposed
the buffer, falls through to the unaccompanied-key fallback and types a
spacing acute instead of adding the accent. Four user stories:

| Story | Priority | Ask |
|---|---|---|
| US1 | P1 | Diacritic keys work over text the host has decomposed |
| US2 | P2 | The author is shown the gap, with a reproducible case |
| US3 | P3 | The author chooses what gets written back (echo vs. own form) |
| US4 | P4 | Backspace peels one mark regardless of form |

Its research document established that the fix belongs at source level, not in
Keyman Core: `.kmn` has no normalization directive, and Keyman's own
documentation recommends writing both forms into the context. Spec 062
automates that advice.

## 2. What PR #1650 delivered

PR #1650, "feat(engine): canonical-equivalence context tolerance (spec 062)",
merged 2026-08-27, authored by KevinPNG. All 25 tasks in
[062 tasks.md](../062-canonical-context-tolerance/tasks.md) are checked. The
implementation is at the engine, contracts, and lint layers:

- **Simulator seeding.** `simulate()` gained an optional third parameter
  (`SimulatorContextSeed`: text, caret position, pending deadkeys) so a test can
  place decomposed text in the buffer before a keystroke.
  `packages/engine/src/simulator/index.ts`.
- **Diagnostic.** `computeContextTolerance` in
  `packages/engine/src/validator/context-tolerance.ts` resolves each rule's
  context statically, then for rules that need it compiles the keyboard through
  the real WASM kmc-kmn pipeline and simulates the keystroke against both forms.
  Produces a `ToleranceReport` (`packages/contracts/src/toleranceReport.ts`).
- **Generator.** `proposeContextVariants` in
  `packages/engine/src/pattern-apply/context-variants.ts` adds decomposed-context
  sibling rules and backspace-unwrap rules into the `KeyboardIR`, idempotently,
  with fallback-preemption placement and store-pairing safety reused from
  `applyStoreSlotRemovals.ts`. A composed-unit pairing helper was extracted to
  `pattern-apply/mark-decomposition.ts` and shared with `mark-guards.ts`.
- **Layer C check.** `KM_WARN_CONTEXT_NOT_TOLERANT` and
  `KM_HINT_CONTEXT_NOT_ANALYSED` in
  `packages/keyboard-lint/src/checks/check-19-x-context-tolerance.ts`, fed by a
  precomputed `toleranceReport` on the lint context so keyboard-lint never
  imports the engine (dependency-cruiser forbids it).
- **Migration factory.** `createContextToleranceMigrationRule(result, policy)` in
  `packages/engine/src/facet-transform/migrations/context-tolerance.ts` wraps a
  precomputed proposal as a synchronous `MigrationRule` for the spec 039
  facet-transform seam, with the echo/own-form write-back choice. Deliberately
  **not** registered in `MIGRATION_RULES` because the proposal step is async.
- **Contracts.** `contextToleranceWriteBack` added to `DiscoveryAxisVector`.
- **Tests.** Corpus canary against the real `sil_yoruba8.kmn` proves the grave
  key case; 56 files / 1305 tests across simulator, validator, and pattern-apply
  passed at merge.

A km-lead review cycle during the PR (five specialists) fixed a fragile
empty-string sentinel and the duplicated pairing helper.

### Limitations documented at merge

Recorded in 062's tasks.md "Follow-ups" and in code comments:

1. **FR-012's Unicode-name half is unmet.** Findings carry codepoints only; no
   studio renderer decorates them with names.
2. **Mnemonic-layout backspace-unwrap does not fire** in this repo's
   KeymanWeb-model simulator (`sil_yoruba8` included). Spec 062, PR #1650 and
   the `addBackspaceUnwrap` doc comment all attribute this to upstream
   `keymanapp/keyman#3744`. **That citation is wrong**: checked 2026-09-23,
   #3744 is a closed OSK bug about modifier keys not showing as released, with
   no connection to mnemonic layouts or `Lcode`. The root-cause description
   (`setMnemonicCode` deleting `Lcode` for non-modifier keys with no character
   mapping) may still be accurate; the issue number is not. Spec 062's spec.md,
   its tasks.md and `context-variants.ts` all need the correction — a docs
   follow-up outside this feature. Not verified against Keyman's native Core.
3. **Canonical mark order, not typing order,** on backspace for two-class stacks
   (Vietnamese circumflex + tone). Spec-compliant, not typing-order-faithful.
4. **Codec gap:** multi-codepoint store items do not round-trip (`emit.ts`
   `emitStoreItems` has no per-item separator). Independent of 062.
5. **Studio wiring is a deliberate follow-up.** Quoted from tasks.md line 216:
   "every call site in this PR's diff is a test ... wiring it into an
   end-user-reachable path is tracked as separate follow-up work, not an
   oversight."

## 3. Where the delivered code stops (issue #1756)

Issue #1756, "feat(studio): wire spec 062 context tolerance to a user-reachable
path", filed 2026-09-09, verified the gap against `main` at `d663e6ba`. Re-verified
on 2026-09-23:

- `computeContextTolerance`, `proposeContextVariants`, and
  `createContextToleranceMigrationRule` have call sites **only in `*.test.ts`**.
- `packages/studio/src` has **zero** non-test references to any of them, to
  `ToleranceReport`, or to the lint check id.
- The lint check is wired at `packages/keyboard-lint/src/lintContext.ts` but
  gated on `ctx.toleranceReport`, which nothing in production populates.
- **`lintWithContext` itself has no production callers repo-wide.** The studio
  never runs Layer C. Its `DiagnosticsPanel` renders `CompilerDiagnostic[]`
  (Layer A from kmcmplib) and the store's `setValidatorFindings` slice carries
  Layer A findings from `StudioShell.tsx`. Layer C findings reach the author
  only via bespoke inline panels (e.g. `TouchGallery.tsx`'s touch-lint panel),
  not a general path.
- **The facet-transform surface is unmounted.** `FacetTransformPanel.tsx` is
  imported by nothing; `useFacetTransform()` is called by nothing. The
  propose/preview/confirm seam spec 062 US3 targets does not exist in the
  running app. This is the largest cost item and was not in 062's follow-up
  note.

What wiring requires, per #1756 and confirmed by reading the code:

1. **Compute the report where the compile runs.** The studio's compile gate is
   `packages/studio/src/hooks/useKeyboardArtifact.ts` (the concurrent
   `Promise.all` of `engine.compile` and the parse/recognize branch, around
   lines 517–563). It already strips dangling asset stores for the preview
   compile. `computeContextTolerance` would be fired from there and added to
   the `EngineModule` interface at the top of the file — but it must **race**
   that `Promise.all`, not join it: the function runs its own WASM compile
   whenever a rule needs behavioural simulation, so awaiting it would make the
   preview wait on a second unbounded compile, violating the spec's "Large
   keyboards" edge case. Its result lands via its own state update. Two cycles
   exist in the studio: the 300 ms keystroke debounce in `useValidator.ts`
   (Decision D3, Layer A) and the non-debounced compile gate here. The tolerance
   report rides the compile gate and touches no timer, so D3 is unaffected.
2. **Populate `toleranceReport`** into a lint context and run the 19.x check,
   which means giving Layer C a production caller for the first time.
3. **Register the migration.** Construct the rule from the precomputed
   proposal (the factory pattern) and route it through `useFacetTransform` or
   an equivalent seam.
4. **Commit through the existing seam.** `commitFacetTransform` / `setWorkingIR`
   in `workingCopyStore.ts`. Explicitly **not** the survey `mutate()` seam,
   which is synchronous, pure, and scoped to declared writes; the generator is
   async and compiles.
5. **Export from the engine barrel.** Neither tolerance function is exported
   from `packages/engine/src/index.ts`. `facet-transform/migrations/index.ts`
   documents a deliberate decision not to re-export them because it would drag
   the Node-only simulator chain into the studio's Rollup build graph. This
   needs a design decision at plan time (lazy import, a browser-safe entry, or
   a worker), not just an export line.

### Where the decision point should live

Two candidate homes were considered:

- **A finding-driven action** ("Fix this" on the diagnostic). Simplest to reach,
  but it is a user-facing survey surface outside the step manifest, which
  Constitution Article IX forbids: every step declares typed inputs and writes.
- **A step in the mark question series** ([071-marks-question-series](../071-marks-question-series/spec.md)).
  Context tolerance is the mark model's fifth consumer
  ([mark-composition-model.md](../../docs/design-notes/mark-composition-model.md));
  the NFC posture question already asks the author about output form in the
  same series. A pre-filled "make it tolerant" decision there fits §3c and
  Article IX, and lands in the decision trail (specs 053/055) like every other
  step. This is the spec's assumption. The transform still commits through the
  facet-transform seam (item 4), not `mutate()`, because it compiles.

The closest existing shape for a §3c prefilled confirmation with provenance is
`packages/studio/src/adaptation/InheritancePostureStep.tsx` (spec 038 US2), but
it is **not a settled precedent**: it has no non-test references and is not in
the manifest either. It shows the intended pattern; it does not prove it.

**Constitution Article IX and the write seam.** `reducer.ts`'s
`applyStepCompletion` accepts exactly one IR-writing result from a step: a
synchronous, pure `mutate()` closure whose writes are contained by the step's
declared `writes: IRPath[]`. `commitFacetTransform` is a second, undeclared IR
write path invoked directly from a hook. A step whose real IR write is
`commitFacetTransform` would be invisible to the manifest contract. The spec's
FR-005a therefore splits the two: the step writes the *decision* through
`mutate()` with declared writes; a separate effect keyed off that decision
applies the transform through the facet-transform commit seam. Spec 039 is
built this way implicitly; 078 makes the split a requirement.

## 4. Correctness defects found after merge

Both filed 2026-09-09 from a corpus survey the owner requested in Slack, both
open, both fixed together in PR #1774 (KevinPNG, opened 2026-09-22, branch
`km/062-context-tolerance-fixes`; CI was mixed at the time of writing).

**#1753 — the transform corrupts multi-key `any()` rules.** `resolveKeyPart`'s
`any` branch took only the store's first member, so `sil_yoruba8`'s five-member
`any(key.all)` collapsed to `[`; the generator then copied the full key part
verbatim while baking in the output measured for that one key. Result, buffer
seeded NFD (`o` + U+0323), one keypress:

| Key | Before 062 | After 062 as merged | Correct |
|---|---|---|---|
| `[` grave | o + dot + spacing grave | ọ + U+0300 | fixed |
| `]` acute | o + dot + spacing acute | ọ + U+0300 | wanted U+0301 |
| `{` `}` `\|` | stray spacing mark | ọ + U+0300 | all wrong |

The pre-existing failure was visible. The new failure is a well-formed
character with the wrong tone. Tone is phonemic in Yorùbá, so this is silent
data corruption. The shape (multi-member key store plus key-position `index()`
in the output) occurs in **2,461 rules across 28 keyboards**. The refusal gate
did not catch it because it inspects the context store's pairing, not whether
the output reads the key position. PR #1774 adds `resolveKeyPartCandidates`
and simulates per member.

**#1754 — missing `&LAYOUTFILE` strip disables the feature on 965 of 1,044
keyboards.** `stripAssetStoresForCompile` dropped only `&BITMAP` and
`&VISUALKEYBOARD`. Any keyboard declaring `&LAYOUTFILE` failed the internal
compile and reported "keyboard failed to compile" with zero variants and no
throw, indistinguishable from a keyboard with no gaps. Measured on `haroi.kmn`:
0 gaps as shipped, 53 gaps / 74 variants with the strip. Of roughly 162
keyboards that break the way `sil_yoruba8` does, the code as merged fixed about
5%; with the strip, a 25-keyboard sample gave 11 of 24, roughly 43%. PR #1774
adds a shared `buildToleranceCompileVfs` that reuses the existing
`compiler/stripDanglingAssetStores.ts`.

Spec 078's FR-011 gates author exposure on both landing.

## 5. The corpus harness (PR #1757)

PR #1757, "feat(tools): NFD/NFC context-tolerance corpus harness", opened
2026-09-09, CI green, unmerged. Adds `utilities/nfd-tolerance-corpus`, which
runs the real transform end to end on every corpus keyboard — parse,
`computeContextTolerance`, `proposeContextVariants`, real WASM compile,
`simulate()` — and buckets each keyboard: `no-gap`, `gap-fixed`,
`gap-remaining`, `regressed` (a miscorrection or a moved composed path),
`compile-failed`, `refused` with the gate named, `harness-error`. It exists
because the earlier rule-shape count declared `sil_yoruba8` fixed while it typed
the wrong tone. Spec 078's FR-012 makes its verdict the regression gate.

## 6. Owner's stated intent

Recorded in #1756: the intent is that a keyboard treats decomposed and composed
as equivalent **input**, with **no change to output**, via propose-then-confirm
(062 FR-009; §3c), not rewrite-on-import. This is consistent with spec 062's
echo default and is the basis for the Story 4 clarification: exposing the
own-form write-back at all may be out of step with that intent.

## 7. Related open work that touches the same seams

- [077-base-decisions](../077-base-decisions/spec.md) (in progress on its own
  branch) brings base-derived facet findings to the author through the decision
  record. Its decision-trail plumbing is the same one Story 2/3 write to.
- Spec 039's facet-transform panel is unmounted. Whoever mounts it first
  (077 or 078) establishes the pattern; coordinate at plan time.

## 8. Crew review, 2026-09-23

Six specialists reviewed the draft (documentation, validator, front-end,
Keyman, linguistics, upstream parity). All returned approve-with-notes; none
rejected. The edits they drove are in the spec: FR-005a (Article IX split),
the decision fingerprint entity, FR-010's explicit hazard list, FR-013's
reference glosses, FR-015 (legible generated rules), SC-008's rewording, the
non-fallback shadowing edge case, and the 077 dependency. Two recommended
resolving Story 4 as echo-only; that is recorded in the clarification marker
for the owner to decide. The Keyman reviewer confirmed the #1753 account and
that Keyman matches first-in-source-order within a group, which the generator's
fallback-preemption placement already respects.

## 9. Not verified first-hand

- Whether PR #1774's failing check is a flake or a real regression.
- Behaviour of backspace-unwrap on Keyman's native Core (limitation 2 above),
  and the correct upstream issue for the `Lcode` root cause.
- Whether spec 071's marks series runs on the import track.
- The `~162 broken keyboards` denominator; it comes from the survey behind
  #1754 and was not recomputed.
