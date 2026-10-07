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

## 3. US2 — the flag deletion (PENDING — held for 088's landing)

T020–T023 have NOT run yet. They are held until the lead confirms spec 088
has landed, because T021 touches `steps/reducer.ts`'s mechanisms
`repropagate` gate and `editors/assignLoop/TouchGallery.tsx`, which 088's
US2 was editing concurrently. Current state 090 inherits in the meantime:

- `VITE_KM_MUTATE_SEAM` / `flags/mutateFlag.ts` still exist. The runner
  path is already unconditional (Phase 2 deleted the flag-gated
  `MutateRequest` branch); the four remaining flag readers are the ones
  T021 un-gates globally per ruling OI-1 (owner ruling 2026-10-06, Q2 —
  global, no remainder): mechanisms `repropagate` (reducer), hand-set
  promotion (TouchGallery), carve seam path + add-gallery derivation
  (VFS projection).
- `tests/survey/flagOff.test.ts` was already reduced in Phase 2 to the
  single mechanisms-repropagate flag-off test (it could not sit
  non-compiling until US2); T023 owns the final sweep.
- The three dark behaviours the ruling accepted activating early:
  repropagate-after-mechanisms, hand-set promotion, seam carve path.

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

- `src/survey/journey-runner.test.ts` — 3 failures, one root: the runner's
  `advance()` call sites predate 088's `AdvanceContext.decisions` field
  (the same root as the one pre-existing tsc error at
  `journey-runner.ts(820,87)`), so its gate evaluation routes into
  `pb_discovery_intro` unanswered. 088 US2 call-site territory.
- `src/steps/decisionsFromTraversal.test.ts` — 2 failures (gate agreement
  over decision sets). 088 mid-US2 state.
- `src/lib/draftPersistence.prePrDraft.test.ts` — 1 failure (v1-draft
  answer restore). 088 US3 migration territory.
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
