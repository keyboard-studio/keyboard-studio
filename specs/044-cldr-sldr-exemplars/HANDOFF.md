# Handoff: spec 044 fix pass

**Branch**: `044-cldr-sldr-exemplars` · **PR**: [#1371](https://github.com/keyboard-studio/keyboard-studio/pull/1371) · **Written**: 2026-07-27

All 61 tasks in [tasks.md](tasks.md) are checked and the gate is green (typecheck,
6,976 tests, eslint 0 errors, both E2E walks). This document is the list of things
that are **still wrong, still owed, or deliberately deferred** — read it before
picking the branch up.

Items are ordered by "would I be embarrassed if this shipped as-is", not by effort.

---

## 1. Two exported functions are never called (BLOCKING — I left these)

Both are implemented, typed and unit-tested. Neither is wired to a call site.
`grep` finds no production caller for either.

### 1a. `resetPhaseBDraftDecisions()` — real bug against FR-016a

**File**: [`packages/studio/src/stores/phaseBDraftStore.ts`](../../packages/studio/src/stores/phaseBDraftStore.ts)

`rejected` and `exemplarMethodDeclined` deliberately survive `reset()`, because
`reset()` runs on every entry to the build-list screen and clearing them there
would re-propose characters the author just removed. `resetPhaseBDraftDecisions()`
exists to clear them **per working copy**. Nothing calls it.

**Consequence**: an author who declines the exemplar offer for keyboard A, then
starts keyboard B in the same browser session, finds B's offer already declined —
and any character they rejected in A is silently suppressed from B's proposal.
FR-016a says the flag is per-working-copy; today it is per-session.

**Fix**: call it from the working-copy entry points in
[`workingCopyStore.ts`](../../packages/studio/src/stores/workingCopyStore.ts) —
`instantiateFromBase()` (Track 1) and `instantiateFromExisting()` (Track 2), the
same two places that already reset the rest of the per-working-copy state.

**Done when**: declining on keyboard A leaves keyboard B's offer pre-selected, and
a character rejected in A is proposed normally in B. Worth a store test asserting
exactly that, since no existing test covers the two-working-copy case.

### 1b. `warmExemplarSource()` — T038's latency goal is not actually delivered

**File**: [`packages/studio/src/lib/services.ts`](../../packages/studio/src/lib/services.ts)

T038 asked for `loadExemplarSource()` to be awaited **off the startup critical
path**. The helper is there; nothing invokes it, so the ~1.3 MB index chunk is
instead imported lazily on first use — inside the first `sourceExemplars` call the
IntroChooser makes.

**Consequence**: not a correctness bug. Every consumer awaits the idempotent
warm-up internally, so a cold call is correct, just slower. The author pays the
chunk load inline on first reaching the Characters step.

**Fix**: fire-and-forget from `mountApp()` in
[`main.tsx`](../../packages/studio/src/main.tsx), after `installE2eHook()` and
alongside the other non-blocking startup work. It must NOT be awaited before first
render — that would move the cost onto a path where every user pays it, including
the ones who never reach Phase B.

**Done when**: reaching the Characters step on a warm page shows the offer without
a visible delay, and startup time is unchanged for a session that never gets there.

---

## 2. Content sign-off on the offer (OWED — not mine to close)

[tasks.md](tasks.md) gates T048–T052 on Content sign-off, and the spec's own
Assumptions say the offer scope "needs Content sign-off before FR-016 is
implemented". **It has not happened.** The copy and accept scope currently in the
branch are the Engine defaults `tasks.md` proposed, implemented at the maintainer's
explicit direction to unblock the E2E walk.

Two separable decisions, both Content-owned per the §12/§13 split:

**Wording.** Every user-visible string is behind an i18n id, so this is a catalog
edit, not a code change. The ids added by this feature:

| id | current English |
|---|---|
| `survey.phaseB.intro.method.exemplars` | "Start from the alphabet we already have for this language — you can change anything" |
| `survey.phaseB.intro.exemplars.count` | "{n} characters" |
| `survey.phaseB.intro.exemplars.more` | "+{elided} more" |
| `survey.phaseB.exemplars.fromCldr` | "from CLDR" |
| `survey.phaseB.exemplars.fromSldr` | "from SLDR" |
| `survey.phaseB.exemplars.fromSldrUnconfirmed` | "from SLDR (machine-generated — please check)" |
| `survey.phaseB.exemplars.fromText` | "from your text sample" |
| `survey.phaseB.buildList.headingConfirm` | "Phase B — Confirm your alphabet" |
| `survey.phaseB.buildList.exemplarApplyToggle` | "Exemplars available for this language — show" |
| `survey.phaseB.buildList.exemplarApplyButton` | "Add these to my alphabet" |
| `survey.phaseB.buildList.textSampleHeading` | "Paste or upload a text sample" |
| `survey.phaseB.buildList.textSampleComingSoon` | "Coming soon — …" |
| `survey.phaseB.charChipEditor.proposedLegend` | "Dashed characters were proposed for you ({sources}). Remove any that are wrong." |
| `survey.phaseB.charChipEditor.removeProposedAriaLabel` | "Remove {char} ({cp}), proposed {attribution}" |

Note `survey.phaseB.exemplars.*` are rendered two ways — as a `<Trans>` component
(`ExemplarAttribution`) and as a plain string for `title`/`aria-label`
(`attributionText`). They are adjacent in
[PhaseB.tsx](../../packages/studio/src/survey/PhaseB.tsx) precisely so the two
wordings cannot drift; **edit both or neither**.

**Accept scope.** Currently `main` tier only, with `auxiliary`/`punctuation`/
`numbers` reaching the author through their own 047 breakdown sections. This is one
line in `seedFromProposal` — the `.filter((c) => c.tier === "main")`. Widening it is
cheap; the argument for keeping it narrow is that the other three tiers are not the
alphabet, and folding punctuation into a "confirm your alphabet" action makes the
confirmation mean less.

---

## 3. i18n extraction is broken (PRE-EXISTING — blocks getting the above into catalogs)

`pnpm --filter @keyboard-studio/studio messages:extract` runs, prints nothing, and
produces no diff. `pnpm i18n-catalog-lint` fails with "committed catalog is not a
configured locale (orphan)" for both `en` and `fr`.

**Verified pre-existing**: both reproduce identically on a clean `git stash` of this
branch. Nothing in spec 044 caused it and nothing here can fix it.

**Consequence for this feature**: the ~14 ids in §2 are not in
`packages/studio/src/locales/{en,fr}/messages.json`. Lingui falls back to the inline
default message, so the UI is correct in English and untranslated in French — but
Crowdin cannot see the strings, so they cannot be translated at all until this is
fixed.

**Where to start**: [`packages/studio/lingui.config.ts`](../../packages/studio/lingui.config.ts)
declares `locales: ["en", "fr"]` and a `catalogDir` that honours
`LINGUI_CATALOG_CHECK_DIR`. The lint calling both committed locales "orphans"
suggests the config the CLI resolves at runtime is not the one the lint compares
against. The committed `en` catalog has 893 ids and clearly was generated at some
point, so this is a regression, not a never-worked.

**Done when**: `messages:extract` produces a diff adding the §2 ids, and
`i18n-catalog-lint` passes. Then re-run extract on this branch and commit the
catalogs.

---

## 4. `LocaleSwitcher` flakiness is papered over, not fixed

**File**: [`packages/studio/src/components/LocaleSwitcher.test.tsx`](../../packages/studio/src/components/LocaleSwitcher.test.tsx)

Two tests wait on a dynamically imported French catalog with `waitFor`. Under the
default 1s window they began failing intermittently in the full suite once this
feature's tests joined it — 2 of 3 full runs, while a clean stash passed 2 of 2. The
component was not touched; this is a scheduling sensitivity, not a behaviour change.

I raised both timeouts to 10s and got two consecutive green full runs. **That is a
mitigation, not a diagnosis.** The underlying question — why a catalog import takes
more than a second under load, and whether anything user-facing waits on the same
path — is unanswered.

**Worth checking**: whether `localeReady` in `main.tsx` (awaited *before first
render*) is on the same import path. If it is, a slow catalog load is a real
first-paint cost for non-English users, and the test was telling us something.

---

## 5. Report the SLDR upstream defect

SLDR's `sldr/v/vut.xml` (Vute) writes `\0327` in its `main` exemplar set where it
means `̧` COMBINING CEDILLA. LDML has no `\NNN` numeric escape.

The codegen skips that one tier with a `[WARN]`, pinned by exact raw text in the
`KNOWN_MALFORMED` constant in
[`scripts/codegen-exemplars.mjs`](../../scripts/codegen-exemplars.mjs), so the skip
disappears the moment upstream fixes it and any *other* unparseable set is still
fatal. Net effect today: **Vute gets no seed at all** (it is SLDR-only, and its main
set is its only usable one).

**Owed**: an issue on [silnrsi/sldr](https://github.com/silnrsi/sldr). Not filed —
it is an outbound report to a third party and wanted a human's name on it.

**Done when**: reported upstream; and once fixed upstream, bump the SLDR pin, drop
the `KNOWN_MALFORMED` entry, and confirm `vut` appears in the index.

---

## 6. Deferred by design (do not "fix" these without reading first)

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

---

## 7. Housekeeping

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

So the fix pass knows where *not* to spend time:

- The index is deterministic and its determinism is asserted end-to-end against the
  committed artifact, not just in principle.
- Every stored set is parse-validated at bake time *and* re-validated in CI by
  `exemplarSource.test.ts`, so a pin bump cannot slip a bad set past a stale artifact.
- The regression floor (749 pre-feature locales) asserts not merely that a locale
  still seeds, but that it resolves to **itself** rather than a less specific
  ancestor. That is what caught the variant-subtag overwrite; keep that assertion.
- Offline behaviour is proven by stubbing `fetch` to throw across a full sourcing
  run, not by inspection.
