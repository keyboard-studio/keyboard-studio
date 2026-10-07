# Spec 089 — series hand-off record (for spec 090 and the rest of the stack)

What 090 inherits from 089, as landed on `km/decision-apply`. Written at the
US1 checkpoint (commits `6096ec66`, `2ea2f548`); the US2 section below is
marked pending and must be updated when US2 lands.

## 1. The runner + channel table — the gallery seam (landed, Phase 2)

A step completion's write path is now exactly:

```
recordPhase → recordAnswersAsDecisions → applyDecisionEffects → applyStepCompletion → advance
```

(StepHost.handleComplete, order per contract A6.)

- `applyDecisionEffects(result, deps)` (`steps/reducer.ts`) is the only
  runner. For each answer it runs the module's `apply(value, ctx)` and
  merges the returned `WorkingCopyPatch` into ONE patch per completion.
- Channels: `ir`, `identity` (`IdentityPatch`), `attribution`, `helpDocs`,
  `historyEntryState` — whole-value replaces, applied by the sink in
  `StudioShell.reducerDeps` (checked `applyMutatePatch` merge first — it
  throws before any overlay setter runs — then the working-copy overlay
  setters in channel order).
- Authorization (contract A3): a module may only write the channels its
  `provides` unlock — `identity` ← `project-keyboard-id`, `attribution` ←
  `copyright-holder`, `helpDocs`/`historyEntryState` ←
  `help-welcome-paragraph`; the `ir` channel additionally requires a
  non-empty `writes` list and is contained by the checked merge (escapes
  throw `ApplyChannelError`). ALL channels are validated before the sink
  is called: a rejected patch applies nothing, including innocent channels.
- `ctx.ir` is re-read per answer, so applies chain within one completion.
  An empty patch never calls the sink; no sink dep ⇒ the runner is a no-op.
- `pb_standard_letters` (Phase 2, T008) is the IR-channel template: its
  `apply` rebuilds the same stores payload its `mutate` did, byte-for-byte,
  and returns `{}` on a null `ctx.ir`.
- Gallery modules in 090 declare `apply` the same way; there is no second
  seam to learn. Composition helpers live in `decisions/`
  (`identitySelectors.ts`, `helpDocsFromDecisions.ts`) because question
  modules may NOT import `lib/` (depcruise
  `question-modules-no-bypass-mutate-seam`) while `decisions/` may.

## 2. Golden walk — script, baseline, and the capture ruling

- Live-app walk: `packages/studio/e2e/golden-walk.spec.ts` (fixed copy-track
  walk, per-entry byte compare of the emitted source zip;
  `.studio/decision-record.json` is presence+parse only by design).
- Baseline record: `packages/studio/e2e/fixtures/golden-walk/README.md`.
  Baseline = the pre-089 stacked base per ruling OI-2, with a literal-`main`
  capture+diff proof step in T003.
- Store-level oracle: `tests/steps/stepHost.goldenWalk.test.tsx` + fixtures
  in `tests/steps/__fixtures__/goldenWalk/` — regenerated in US1 (T019);
  every fixture diff is justified in commit `6096ec66`'s message (session
  setters → `recordAll` + apply-sink overlay writes).
- Capture status: sandbox Chromium refuses localhost
  (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`), so the live capture has
  not run in this environment. Per the owner's live-capture ruling
  (2026-10-07), store-level gates are accepted for the series' golden
  walks and live captures run in CI. T003 stays open until the CI capture
  exists; do not treat the store-level oracle as a substitute without that
  ruling's cover — it is the ruling that makes it sufficient.

## 3. US2 — the flag deletion (LANDED, after the final restack)

T020–T023 landed on the final restacked tree (merge `22288cc5` onto
`km/modular-decisions` @ `f57d2b88`, containing 088's close at
`ab034928`):

- `flags/mutateFlag.ts` is deleted; zero references to
  `VITE_KM_MUTATE_SEAM` remain in source, tests, or e2e (T023 grep gate).
  The four non-question readers run unconditionally: mechanisms
  `repropagate` (reducer), hand-set promotion (TouchGallery), the carve
  seam path and the add-gallery derivation (VFS projection). In the VFS
  the un-gated seam condition made the legacy flag-off suppression branch
  provably unreachable (`hasCarveEdit ⇒ hasProjectionEdit`); it was
  deleted with the gate, and the single-path parity suite pins the seam
  path's bytes against the committed goldens.
- `mutate` is retired from the module contract (T020): `MutateContext`
  and `QuestionModule.mutate` are deleted from `survey/types.ts`;
  `decisions/impact.ts`'s counterfactual re-derivation re-runs the
  module's `apply` and takes its `ir` channel; the four reserve modules
  (iso_code, language_name_english, pa_copyright_holder, primary_script)
  declare `apply` with their previous mutate bodies verbatim; the
  spec-087 `mutateDeps` seam in `FlowStepHost` is deleted (it never had
  a production injector).
- The flag-shaped suites are single-path (T022): both flagParity files,
  `reducer.test.ts`, the SC-004 pair (stubEnv only), `impact.test.ts`
  (plus a positive counterfactual case through pb_standard_letters'
  apply), `walkEmit.compile.test.ts`; `tests/survey/flagOff.test.ts`
  was deleted per its own header's instruction.
- The three dark behaviours the Q2 ruling accepted are now simply the
  behaviour: repropagate-after-mechanisms, hand-set promotion, seam
  carve path.
- The CI capture step's `VITE_KM_MUTATE_SEAM=1` pin has been dropped
  on this branch (`a4c0db8a`); the variable no longer appears in
  `.github/workflows/ci.yml`. Inert since T021 (nothing reads it);
  captures taken while it was present remain valid.

## 4. Known remainder: the Phase F `onMount` history derivation

`phaseFOptions.onMount` still writes directly: when the help step mounts,
it derives the HISTORY-entry proposal (from the base + the recorded
`help-history-bullets` decision, via `deriveHistoryEntryState`) and writes
it through `useWorkingCopyStore.setHistoryEntryState`, because a mount has
no completion for an `apply` to ride on and `FlowStepDeps` no longer
carries setters (089 T015). The proposal's CONTENT is decision-derived;
only the write bypasses the runner. If a later spec gives mount-time
effects a channel, this is the one call site to move. The completion-side
history channel (`historyEntryState` via `pf_welcome_paragraph`'s apply)
is fully on the runner.

## 5. Pre-existing failures on the stacked base (not 089's — do not chase)

Verified by A/B against the phase-2 tree / pristine merged base
(`cab37e02` + 089 phases 1–2), identical before and after US1:

- FIXED BY THE FINAL RESTACK (were failing pre-restack, all 088's):
  `journey-runner.test.ts` (3 — 088's US2 call-site updates; the matching
  tsc error is gone too, the tree typechecks clean),
  `decisionsFromTraversal.test.ts` (2 — the module was deleted by 088),
  `draftPersistence.prePrDraft.test.ts` (1 — 088's US3 migration).
- `src/components/MyKeyboardsList.test.tsx` — 1 failure (cloud-list delete
  race), present at the phase-2 head.
- `src/decisions/successCriteria.sc004*.test.ts` — 4 failures, `ENOENT`
  on the local keyboards corpus (`basic_kbdru`, `arabic_izza` absent from
  `~/workspace/keyboards`). Environmental; green where the corpus exists.

Local tooling note: `depcruise` in this sandbox reports 122 `no-circular`
violations on the pristine base (126 on this branch — the +4 are cycle
paths through the same pre-existing SCC via 089's new `decisions/`
imports). Every reported path traverses an `import type` edge the config
intends to exempt (`dependencyTypesNot: ['type-only']`), so the local
counts are not a usable gate here; CI's resolution is authoritative.

## 6. Correction to the §5 depcruise note — the 126 were real CI errors (fixed)

The note above concluded the branch's 126 local `no-circular` reports were
exempt-in-CI because every path traverses a type-only edge. **CI disagreed,
and CI was right.** On PR #1974's first full CI run (`37581299792`, head
`70a0216f`), Build and Typecheck passed but the Lint step failed at
depcruise with **126 `error no-circular`, exit 126** — every report the same
cycle shape through `survey/questions/registry.ts → <module> →
survey/types.ts → stores/workingCopyStore.ts → dashboard/completeness.ts →
steps/stepOrder.ts → steps/stepDependencies.ts → registry.ts`.

Root cause: `bfc9c418` (Phase 2, T004 apply contract types) added
`import type { IdentityPatch }` from `stores/workingCopyStore.ts` into
`survey/types.ts`, making `types.ts → workingCopyStore.ts` an edge of the
runtime cycle above. The `no-circular` rule's type-only exemption
(`dependencyTypesNot`) only rescues a cycle whose **first** edge is
type-only; a lone type-only edge on an otherwise runtime cycle does not,
and the sandbox's depcruise classification — which made all 126 look
traversed-by-a-type-only-edge — does not match CI's. The local caveat in
§5 therefore cuts the other way: local "all exempt" readings are not
evidence about CI either. Spec 088's tree reported zero because it never
added that edge.

Fix (owner, `030bf59c`): `IdentityPatch` moved to a leaf module
`stores/identityPatch.ts` (no imports); `survey/types.ts`,
`lib/identityLanguagePatch.ts`, and `lib/outputKeyboardId.ts` import it
from there, and `workingCopyStore.ts` re-exports the type so other
importers are unchanged. `survey/types.ts` now has **no** import of
`workingCopyStore` at all — the edge is severed, not merely re-typed.
`.dependency-cruiser.cjs` is untouched (no new exemptions, no severity
changes). Verified in CI: run `37584204599` (head `030bf59c`) — Build,
Typecheck, and **Lint (eslint + depcruise + crew-lint + facet-lint) all
success**. Same leaf-extraction shape as spec 090's D-090-7.

## 7. CI e2e regression: attribution never landed when the holder was left blank (fixed)

PR #1974's first completed e2e run (`37584690376`, head `29fb3de8`) failed
12 of 21 tests — every failure the same `emit-download` timeout, the
button's aria-label reading "the keyboard needs an author and a copyright
holder". The lane had been fully green on spec 088 alone (PR #1973). All
12 walks share one shape: they complete identity-lite leaving
`il_copyright_holder` blank (the spec 064 D1 default: holder = author)
and proceed to emit.

Root cause: a survey completion result omits UNANSWERED questions
entirely (SurveyRunner skips stack entries with `value === undefined`
and appends the terminal question's answer only when its committed value
is defined). Before 089, `IdentityLiteAdapter` computed attribution from
the whole result and wrote it unconditionally, so a blank holder still
landed the D1 default. Commit `6096ec66` (T011 + T016) deleted that
write and replaced it with `il_copyright_holder`'s `apply` — but the
runner dispatched `apply` only per answer, so the sole owner of the
`attribution` channel never ran when its optional, terminal question was
left blank. `workingCopyStore.attribution` stayed null and the Output
gate blocked every download. The store-level gates could not see it:
the golden walk's IdentityLite stub emits a hand-built result that
includes an `il_copyright_holder` answer (`fakeIdentityPhaseResult`),
which the live result never contains in the blank case.

Fix: `applyDecisionEffects` gains a second, input-triggered pass — a
module that declares `apply`, was not answered at this completion, and
names a `requires` decision this completion recorded also runs (with
`undefined` as its value), composing from `ctx.decisions` like any
composed apply (A6). Pass 1 (per-answer, answer order, A8) is unchanged;
modules already run are not re-run, and a module whose inputs the
completion did not record does not fire, so nothing re-fires at later
steps. Evidence: `src/steps/applyDecisionEffects.identityCompletion.test.tsx`
drives the REAL IdentityLite through the live sequence (type the author
name, leave email and holder blank) into the real stores via StepHost's
completion order — blank holder failed with `attribution: null` before
the fix and lands `{ authorName, copyrightHolder: authorName }` after;
the typed-holder control passes both ways. Three runner unit tests in
`applyDecisionEffects.test.ts` pin the pass-2 trigger, its
completion-scoping, and the no-double-run rule.

## 8. km-triage sweep on PR #1974 — dispositions

- **i18n vitest alias (was the build check's step-18 failure)**: fixed.
  `utilities/i18n-content-extract/vitest.config.ts` aliased
  `@keyboard-studio/contracts` with a bare object key, which Vite treats
  as a prefix — the `/dev-log` subpath rewrote to
  `src/index.ts/dev-log` (ENOTDIR). 089's import chain newly reaches
  that subpath from the tool's test graph; spec 088's tree never did.
  Replaced with the regex-per-export alias array already used by
  `utilities/supportability-scanner`. Verified locally both ways: bare
  alias reproduces the ENOTDIR; the array passes 30/30.
- **Mechanicals applied**: the stale `VITE_KM_MUTATE_SEAM` pin claims in
  the golden-walk README and §3 above (the pin was dropped by
  `a4c0db8a`); the two leftover `mutate()` references in
  `survey/types.ts` JSDoc (now `apply()`); trailing whitespace after the
  `apply?:` field; the blank-line run in `surveySessionStore.ts` left by
  the deleted setters.
- **`decisionString` triplication — deferred, deliberately.** The three
  copies exist as described (`decisions/identitySelectors.ts`,
  `decisions/helpDocsFromDecisions.ts` — `""` fallback;
  `editors/adapters/flowStepOptions.tsx` — `undefined` fallback), but
  the `undefined` flavor is load-bearing: `flowStepOptions`' FR-031
  seed does `recordedDisplayName ?? defaultDisplayName`, which
  distinguishes an ABSENT decision (propose the identity default) from a
  recorded empty one (propose nothing). A single helper with a defaulted
  fallback parameter cannot express both flavors — an explicit
  `undefined` argument triggers the default — so the extraction needs
  an omitted-vs-undefined distinction (or a seed-logic revisit), not a
  mechanical move. Revisit when the project_name seed logic next
  changes.
