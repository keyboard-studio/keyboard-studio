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

Two of these were resolved at plan time:

- PR #1774 merged on 2026-09-24.
- The marks series **does** run on the import track. `advance()` in
  `steps/advance.ts:183-218` sends both copy and adapt through `characters` and
  then `marks`. The only gate is S0, "no marks in the inventory". See §10.

## 10. Plan-time decisions (2026-09-24)

These were resolved while running `/speckit-plan`. They draw on two code surveys
of `main` at `e3b72f66`, plus the owner's answer to the Story 4 clarification
(echo-only).

### Dependency status at plan time

- **PR #1774** (both correctness defects) **merged 2026-09-24**. This meets
  FR-011's first condition.
- **PR #1757** (corpus harness) is **still open**. It must land, or the branch
  must rebase onto it, before FR-012's CI gate can exist. Until the harness
  reports zero `regressed`, author exposure stays behind a flag
  (`VITE_KM_CONTEXT_TOLERANCE`).
- **Spec 077** has no plan and no implementation branch. 078 therefore
  establishes the shared shapes (D6).

### D1: Browser-safe simulator

- **Decision:** Keep the vendored KeymanWeb engine and replace its two
  Node-only seams:
  1. **Keyboard loader.** Make the loader injectable. `nodeKeyboardLoader`
     (`node:vm`) stays the default under Node. A new `browserKeyboardLoader`
     runs the compiled keyboard with `new Function(...)` and injects the same
     sandbox globals.
  2. **Vendored imports.** Rewrite the bare specifiers
     (`@keymanapp/common-types`, `keyman/engine/*`,
     `@keymanapp/keyman-version`) to relative paths.
- **Rationale:**
  - These are the only Node dependencies. They are the whole reason for the
    "Node/vitest use only" warning in `simulator/index.ts:8`.
  - Relative specifiers remove a silent collision. The real npm package
    `@keymanapp/common-types@19.0.240-alpha` is installed as a kmc-kmn
    dependency, and a studio bundle could resolve to it.
  - `vercel.json` sets no `script-src`, so `new Function` is allowed.
- **Alternatives rejected:**
  - *Mirroring the aliases in `studio/vite.config.ts`:* it still collides with
    the npm package, and every bundler needs its own copy of the fix.
  - *A Web Worker:* there is no precedent, and WASM plus the VFS would have to
    be re-initialised inside the worker. It still needs D1's loader. Revisit it
    only if measurement shows main-thread jank.
  - *Server-side analysis:* violates spec §16 (no hosting).

### D2: Engine entry is a new subpath, lazily imported

- **Decision:** Add `@keyboard-studio/engine/context-tolerance` to the engine's
  `exports` map. It re-exports:
  - `computeContextTolerance`
  - `classifyToleranceFinding`
  - `proposeContextVariants`
  - `createContextToleranceMigrationRule`
  - `buildContextToleranceOutputDiffPreview`
  - `toleranceFingerprint`
  - `loadCharNames`

  The studio loads the subpath through a memoised `import()` in
  `lib/contextToleranceEngine.ts`.
- **Rationale:**
  - It follows two existing precedents: `./langtags`
    (`lib/langtagsDefaults.ts:45`) and `./placement`
    (`hooks/usePlacementPriors.ts:18`).
  - The root entry stays simulator-free (engine `index.ts:105-110`).
  - The comment in `migrations/index.ts:14-28` anticipates exactly this caller.
- **Alternative rejected:** *A root-barrel export.* 66 studio files import the
  engine root statically, so the simulator would land in every one of their
  chunks.

### D3: Where the analysis runs

- **Decision:** Run the analysis as an async task that follows
  `useKeyboardArtifact.runCompile` reaching `ready`.
  - It checks `runId.current` after every await, which matches the hook's
    existing staleness model (it has no AbortController). A result from a
    superseded compile is discarded.
  - It writes its result to `workingCopyStore.contextTolerance`.
  - Only callers that pass `analyseContextTolerance: true` get it, and only
    StudioShell passes it. The compare, preview, gallery and touch callers of
    `useKeyboardArtifact` do not trigger their own analyses.
- **Rationale:**
  - FR-001 forbids delaying the preview, so the task must not join the
    `Promise.all` at lines 517–563.
  - The task is not part of the validation cycle, so decision D3 does not
    govern it.
- **Alternative rejected:** *`useValidator`.* That is the D3 keystroke cycle,
  and it would re-run a full compile and simulation on every debounce.

### D4: A narrow Layer C production path

- **Decision:** keyboard-lint exports
  `lintContextTolerance(ir, report): LintFinding[]`, a wrapper around check
  19.x. The studio calls it with the precomputed report.
  - The studio keys its rendering off each finding's `code`. The text comes
    from the report's **structured data**, not from the lint `message` string,
    which is prebuilt English and fails FR-013.
  - The rendering lives in `lint/ContextToleranceNotice.tsx`, next to
    `LintSummary`, inside StudioShell's existing `role="status"
    aria-live="polite"` region.
- **Rationale:**
  - This gives Layer C its first production caller while limiting it to one
    check, as the spec assumes.
  - `lintWithContext` would run every Layer C check, and the studio renders
    none of the others.
  - `DiagnosticsPanel` only accepts `CompilerDiagnostic[]` and is mounted only
    on CompareScreen. It is not "where other problems are reported" in the
    main walk.
- **Alternatives rejected:**
  - *Mounting `DiagnosticsPanel` in the shell:* wrong input type.
  - *Changing check 19.x to emit message ids:* that is an i18n migration of
    keyboard-lint, which is out of scope.

### D5: Gap status

- **Decision:** No contract change. The engine gains
  `classifyToleranceFinding(f): "tolerant" | "made-tolerant" | "gap" | "not-analysed"`,
  next to the report producer. The studio and the harness both use it.
- **Rationale:**
  - The report encodes a gap as `status: "not-analysed"` plus
    `failingKeystrokes`, with no reason (`context-tolerance.ts:471-478`).
  - Widening `ToleranceStatus` would change the SC-006 invariant and check
    19.x at the same time.
  - A shared classifier replaces the ad-hoc `failingKeystrokes !== undefined`
    tests in each consumer.
  - Widening the status later is a candidate `maint(contracts)` follow-up
    outside this spec.

### D6: Decision record shape (shared with 077)

- **Decision:** Record the decision as one `survey-answer` entry:
  - `questionId: "marks.context_tolerance"`, `answerType: "select"`, value
    `accept`, `partial` or `decline`.
  - For `partial`, a second answer, `marks.context_tolerance.sites` (type
    `text`), holds the accepted site ids, sorted and comma-joined.

  Provenance depends on the outcome:

  | Outcome | Agency | Proposal recorded |
  |---|---|---|
  | Accept all | `tool-proposed` | `source: "analysis"`, a new `DecisionProposalSource` member |
  | Partial or decline | `hand-set` | a new optional `provenance.proposed`, carrying the tool's proposal (`"accept"` plus the proposed site ids) |

  `resolveProposal` in `createStudioDecisionRecorder.ts` learns the new
  question id, and `lookupQuestionLabel` gets a label source for it.
- **Rationale:**
  - FR-007 needs the tool recorded as proposer on every outcome. Today an
    override drops the proposal (the semantics at `decisionRecord.ts:54`).
  - An optional field is additive and read tolerantly, so
    `DECISION_RECORD_VERSION` does not need a bump.
  - This is the first trail entry the marks series records; it currently
    records nothing (`answers: []`).
- **Alternative rejected:** *A new `DecisionPayload` kind.* It is heavier,
  forces a version bump, and 077 would have to adopt it too.

### D7: Decision fingerprint

- **Decision:** `toleranceFingerprint(ir, ruleIds)` is an FNV-1a 64-bit digest
  of the affected rules' emitted `.kmn` text, taken in rule-id order.
  - It is synchronous and browser-safe. `crypto.subtle` is async and
    unnecessary at this size.
  - It is stored in `SurveyPhaseResult.marksContextTolerance.fingerprint`, so
    it persists with `phaseResults` automatically (the `marksOutputForm`
    precedent).
  - A proposal is re-raised only when the fingerprint of the currently
    fixable rules differs from the stored one (FR-009).
- **Rationale:** Emitted text is stable across sessions. IR object identity and
  source line numbers are not.

### D8: Apply effect and Article IX

- **Decision:** A hook, `useContextToleranceApply`, watches
  `phaseResults.marksContextTolerance`. It acts when the decision is `accept`
  or `partial` and that fingerprint has not been applied yet:
  1. **Recompute** the report and proposal against the **current** working IR.
     Marks-reducer guards may have changed rules since the station rendered.
  2. **Filter** the accepted site ids to sites whose rules still match the
     fingerprint. Any dropped site is reported as stale (spec edge case).
  3. **Verify.** Build a `TransformProposal` and run
     `applyFacetTransform(ir, proposal, { ruleOverride })`, which checks opaque
     integrity and runs the compile oracle. `useFacetTransform.commit` does not
     pass a `ruleOverride` today and gains one.
  4. **Commit.** Take the verified IR's changed top-level paths as a patch and
     commit it via `applyMutatePatch(base, patch, CONTEXT_TOLERANCE_WRITES)` and
     then `setWorkingIR`. `CONTEXT_TOLERANCE_WRITES` covers the groups' rules
     and the stores, and is declared on the `marks` manifest entry.
  5. **Record** `appliedFingerprint`, which makes the effect idempotent
     (FR-008).
- **Rationale:**
  - The async work (compile and simulation) all happens before the seam.
  - The IR write itself passes the seam's containment check, which satisfies
    Article IX without an amendment.
  - `commitFacetTransform` is not used. Its produced-set re-seed does not
    apply, because echo leaves the produced set unchanged.
- **Alternative rejected:** *Calling `commitFacetTransform` directly.* It is an
  undeclared write path.

### D9: What the preview must disclose (FR-006 and edge cases)

Beyond the panel's source diff, the station's preview adds three things:

- **Shadowing.** It lists every rule that an addition shadows or is shadowed
  by. `precedesFallbackRuleId` only covers fallback rules, so this needs new
  overlap detection in `context-variants.ts`.
- **Mnemonic layouts.** When the keyboard has `&mnemoniclayout`, each
  backspace-unwrap site carries a "cannot be demonstrated here" note. Those
  sites are never shown as a simulated success.
- **Mark order.** For any two-class mark stack in the inventory, it shows the
  resulting mark order.
