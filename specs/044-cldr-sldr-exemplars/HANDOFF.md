# Handoff: spec 044 fix pass — resolution record

**Branch**: `044-cldr-sldr-exemplars` · **PR**: [#1371](https://github.com/keyboard-studio/keyboard-studio/pull/1371)
· **Written**: 2026-07-27 · **Fix pass**: 2026-07-27

The original handoff listed seven items that were still wrong, still owed, or
deliberately deferred. Five are now closed in this PR; the rest are recorded
below with what actually remains. Read the "Still open" section before picking
the branch up — everything above it is done.

---

## Closed in this PR

### 1a. `resetPhaseBDraftDecisions()` was never called — FIXED

`rejected` and `exemplarMethodDeclined` are per-working-copy (FR-016a) but
survive `phaseBDraftStore.reset()`, which runs on every entry to the build-list
screen. Nothing cleared them per working copy, so they were effectively
per-browser-session: declining the exemplar offer on keyboard A silently
pre-declined keyboard B, and a character rejected in A was suppressed from B's
proposal.

Now called from both working-copy entry points in
[`workingCopyStore.ts`](../../packages/studio/src/stores/workingCopyStore.ts) —
`instantiateFromBase()` (Track 1) and `instantiateFromExisting()` (Track 2),
**after** the `resolveInstantiationCase` no-op guard, so a redundant re-fire of
the same instantiate never discards a live decision.

Four tests in
[`workingCopyStore.test.ts`](../../packages/studio/src/stores/workingCopyStore.test.ts)
cover the two-working-copy case that nothing covered before: each entry point
clears the decisions, a character rejected on A is proposed normally on B, and
the redundant re-fire preserves them. Verified as a negative control — with the
two calls neutralised, three of the four fail.

### 1b. `warmExemplarSource()` was never called — FIXED

Fire-and-forget from `mountApp()` in
[`main.tsx`](../../packages/studio/src/main.tsx), after `installE2eHook()`.
Deliberately **not** awaited, and its rejection is swallowed: the exemplar index
is its own ~1.14 MB chunk (confirmed in the build output as
`assets/exemplars.generated-*.js`), and awaiting it before first render would
charge every visitor — including the ones who never reach Phase B — for a chunk
only the Characters step needs.

### 2. Content sign-off on the offer — CLEARED

Signed off by the maintainer on 2026-07-27: the offer copy as shipped, and the
accept scope as implemented (`main` tier only, with
`auxiliary`/`punctuation`/`numbers` reaching the author through their own 047
breakdown sections). Recorded in [tasks.md](tasks.md) (the Phase 6 gate note and
the dependency list), [spec.md](spec.md) (Assumptions) and [plan.md](plan.md)
(Constitution Check Article VI, and the implementation-order note).

Wording stays a catalog edit, not a code change — every user-visible string is
behind an i18n id, and they are now in the catalogs (see §3). The two rendering
paths for `survey.phaseB.exemplars.*` — the `<Trans>` component
`ExemplarAttribution` and the plain-string `attributionText` — are still
adjacent in [PhaseB.tsx](../../packages/studio/src/survey/PhaseB.tsx) precisely
so the two wordings cannot drift; **edit both or neither.**

### 3. i18n extraction — FIXED (root cause found)

**Root cause: the local Node was below `@lingui/cli`'s floor.** `@lingui/cli` v6
gates its CLI entry on `import.meta.main`, which does not exist before Node
22.19. Below that, every `lingui` subcommand imports the module, defines its
options, runs nothing, prints nothing and exits **0**. So `messages:extract`
looked like it succeeded while doing nothing, and `i18n-catalog-lint` — which
diffs the committed catalogs against a fresh extraction into a temp dir — saw an
empty temp dir and reported every committed locale as an orphan. One cause, two
symptoms; nothing was wrong with `lingui.config.ts`.

CI is unaffected: `.github/workflows/ci.yml` pins `node-version: "22"`, which
resolves to the latest 22.x and is above the floor.

Landed with it:

- The floor is now explicit — root [package.json](../../package.json) `engines`
  is `>=22.19.0` (pnpm warns on every script when it is not met) and
  [.nvmrc](../../.nvmrc) is `22.19.0`. [CLAUDE.md](../../CLAUDE.md) documents
  the failure mode next to the pnpm/Node line.
- [`utilities/i18n-catalog-lint`](../../utilities/i18n-catalog-lint/index.js)
  now fails loudly when the fresh extraction produces **no locales at all**,
  naming the running Node version and the floor, instead of letting an empty
  extraction flow into the orphan check and misdiagnose itself.
- The catalogs are regenerated and committed: `en` went 893 → 908 ids, `fr`
  gained the same ids as empty strings for Crowdin.

**One extra id was recovered.** `survey.phaseB.exemplars.fromText` was invisible
to the extractor even on a working Node. `attributionText` receives `t` as a
*parameter*, and the babel macro only rewrites `t(...)` where it can see the
`useLingui()` binding in the same scope — so its inline `t({ id, message })`
objects were never extracted. Three of the four survived by accident because
`ExemplarAttribution` repeats them as `<Trans>` under the same ids; `fromText`
has no component twin. The four wordings are now `msg` macro descriptors at
module scope, which extract correctly. Runtime behaviour is unchanged (the
inline form already reached `i18n._` and fell back to `message`) — the bug was
that Crowdin could never see the string.

### 4. `LocaleSwitcher` flakiness — DIAGNOSED (the mitigation was right)

The open question was whether the fr catalog's dynamic import is genuinely slow,
which would matter because `localeReady` in `main.tsx` awaits the *same*
`activateLocale()` before first render — a real first-paint cost for every
non-English visitor.

Measured with a throwaway probe: a cold `activateLocale("fr")` (Lingui chrome
catalog + three content-i18n sidecars) is **~32 ms run alone and ~7 ms with the
whole 4,192-test suite running around it**; warm, ~3 ms. The import path is not
what those tests wait on — the overrun is vitest worker-pool CPU contention
starving `waitFor`'s poll loop and React's scheduler.

So the raised timeout is the right instrument, not a papered-over bug: it costs
nothing when things are fast and absorbs scheduling jitter. Both waits now share
a named `WIDE_TIMEOUT` constant in
[`LocaleSwitcher.test.tsx`](../../packages/studio/src/components/LocaleSwitcher.test.tsx)
carrying the measurement, so the next reader does not re-open the question.
**There is no hidden latency behind `localeReady`.**

### Out-of-handoff: `e2e/locale-switch.spec.ts` was broken — FIXED

Found while verifying §4. The spec drove the switcher with
`getByRole("combobox").selectOption()`, but PR #1326 migrated `LocaleSwitcher`
off a native `<select>` onto `ui/SelectMenu` (a trigger button plus a
DOM-rendered `<ul role="listbox">`) and never updated the spec — so it had been
timing out ever since, on `main` as much as here. Rewritten onto the
open-then-click-`li[data-value]` pattern the survey helpers already use for the
target-script and host-key pickers. Passes.

---

## Still open

### 5. Report the SLDR upstream defect (OWED — needs a human's name on it)

SLDR's `sldr/v/vut.xml` (Vute) writes `\0327` in its `main` exemplar set where it
means `̧` COMBINING CEDILLA. LDML has no `\NNN` numeric escape.

The codegen skips that one tier with a `[WARN]`, pinned by exact raw text in the
`KNOWN_MALFORMED` constant in
[`scripts/codegen-exemplars.mjs`](../../scripts/codegen-exemplars.mjs), so the
skip disappears the moment upstream fixes it and any *other* unparseable set is
still fatal. Net effect today: **Vute gets no seed at all** (it is SLDR-only, and
its main set is its only usable one).

**Not filed.** It is an outbound report to a third party
([silnrsi/sldr](https://github.com/silnrsi/sldr)) and wants a human's name on it.

**Done when**: reported upstream; and once fixed upstream, bump the SLDR pin,
drop the `KNOWN_MALFORMED` entry, and confirm `vut` appears in the index.

### Pre-existing E2E failures, unrelated to this branch

Six specs fail on this branch and are **not** caused by it — nothing in the
branch's diff reaches the surfaces they exercise, and neutralising this PR's
`warmExemplarSource()` call (the only plausible suspect, since it loads a chunk
during boot) does not change the result:

- `carve.spec.ts` — the rule-carve walk
- `copy-edit.spec.ts` — the `.kps`/`.kvks`/`welcome.htm` body check, and the
  spec 034 US3 durable-draft reload walk (the main Track 1 walk at :169 passes)
- `touch-derivation-us1.spec.ts` and both `touch-derivation-us2.spec.ts` walks —
  all three time out waiting for `seed-source-preview`, which does exist in
  `TouchSeedSourcePanel.tsx`, so the walk is not reaching that panel

Worth their own investigation; they are not this feature's to fix. **Run E2E
with `--workers=1`** — the config sets no worker cap, and the default parallel
run thrashes the single dev server hard enough to fail specs that pass serially
(9 failures parallel vs 6 serial).

The three walks that matter for this feature pass:
`exemplar-prefill.spec.ts`, `copy-edit.spec.ts:169` (Track 1), and
`locale-switch.spec.ts`.

### 6. Deferred by design (do not "fix" these without reading first)

Filed as issues, linked from [plan.md](plan.md#follow-ups-explicitly-not-in-this-plan):

- **#1367** opt-in live refresh — the fetch loaders still exist and work; nothing
  invokes them from the authoring path. Needs its own provenance vocabulary before
  it is safe.
- **#1368** kbgen's duplicate `parseUnicodeSet` — **still has both R9 defects.**
  `utilities/kbgen/` is a prototype outside `packages/*`; treat its exemplar output
  as unusable until the TS port. Retirement recipe is in
  [INTEGRATION.md](../../utilities/kbgen/INTEGRATION.md).
- **#1369** CLDR/SLDR union as an author action — 346 locales have both sides in the
  index and only CLDR's is surfaced. Cheap to build; the UX is what's undecided.
- **#1370** the LDML `index` tier — excluded on purpose (titlecased; would duplicate
  the alphabet in uppercase). Reopening it means changing `ExemplarTier`, the
  codegen's tier map and the index format, so it wants evidence.

Also deferred: the paste/upload surface behind
`TextSamplePlaceholder` is owned by [specs/050-text-sample-prefill/](../050-text-sample-prefill/).
The store already accepts a `"text"` provenance it never produces, and proposal
sources union rather than override — so 050 should need no store changes.

### 7. Housekeeping

- **Broken relative links.** [plan.md](plan.md) and [tasks.md](tasks.md) link to
  `specs/050-text-sample-prefill/`, which is in-flight on another branch. They 404 on
  `main` until 050 lands. Left alone deliberately — not this branch's file to create.
- **Files left dirty on purpose.** `.specify/feature.json` and
  `specs/008-data-flow/spec.md` were modified before this work started and are not in
  the branch. Don't sweep them in.
- **Regenerating the artifacts.** `pnpm run fetch-sldr && pnpm run codegen-exemplars`
  rebuilds the index (byte-identical from the same pins).
  `node scripts/gen-exemplar-baseline.mjs` regenerates the regression-floor fixture —
  **only** alongside a deliberate CLDR pin bump, and review that diff, because it is
  the thing standing between a pin bump and a silent coverage loss.
- **Staleness.** `pnpm run check-exemplar-staleness` reports (never applies) when
  either pin is behind upstream. Deliberately outside `prebuild`.

---

## What is genuinely solid

So a future pass knows where *not* to spend time:

- The index is deterministic and its determinism is asserted end-to-end against the
  committed artifact, not just in principle.
- Every stored set is parse-validated at bake time *and* re-validated in CI by
  `exemplarSource.test.ts`, so a pin bump cannot slip a bad set past a stale artifact.
- The regression floor (749 pre-feature locales) asserts not merely that a locale
  still seeds, but that it resolves to **itself** rather than a less specific
  ancestor. That is what caught the variant-subtag overwrite; keep that assertion.
- Offline behaviour is proven by stubbing `fetch` to throw across a full sourcing
  run, not by inspection.

## Gate at the close of the fix pass

Run on Node 24.11 (any Node ≥ 22.19 works; the repo floor is now enforced):

- `pnpm typecheck` — clean
- `pnpm lint` — all checks GREEN, including `i18n-catalog-lint` and
  `content-i18n-lint`
- `pnpm test` — **6,989 passed**, 2 skipped, 0 failed (studio 4,192; engine 2,077;
  contracts 450; oauth-backend 137; keyboard-lint 82; glottolog 42; llm 9)
- `pnpm build` — clean
- E2E — see the pre-existing-failures note above
