# `touch-derivation-us2.spec.ts` — three stale assertions, one upstream cause

**Date:** 2026-08-04
**Status:** fixed; the spec is green and the full E2E suite is green (66/0/3).
**Scope:** spec 035's walk spec. **Not** a spec 057 regression — every studio and
engine file involved is byte-identical to `main` (`git diff main...HEAD` over
`TouchSeedSourcePanel.tsx`, `buildTouchLayoutJson.ts` and
`scaffoldTouchLayout.ts` is empty).

This was the single failure blocking T073's clean-suite prerequisite. It turned
out to be three separate stale assertions in the test, all traceable to **one
upstream commit**, plus one pre-existing vacuous assertion found alongside them.

## The common cause

`8709ff54` — *"Fix touch layout scaffolder: deadkey placement, overflow
handling, altgr-shift (#1431)"*, 2026-07-29 — changed two things this spec was
reading:

1. It **split TouchSeedSourcePanel's preview column** into two mutually
   exclusive cards keyed on the current selection. Before:

   ```tsx
   <div style={previewCardStyle} data-testid="seed-source-preview">   {/* always */}
     {preview === null && <p data-testid="seed-source-absent-note"> … </p>}
   ```

   After:

   ```tsx
   {selected === "import-adapt" ? (
     <div data-testid="seed-source-preview">        {/* absent-note lives in here */}
   ) : (
     <div data-testid="seed-source-reseed-preview">
   )}
   ```

2. It **added the tablet reseed skeleton** (`platformStyle: "tablet"`). The
   reseed path now emits a platform with `id: "tablet"`;
   `id: "phone"` is reached only by the phone skeleton or a shipped layout.

Neither change is wrong. The walk spec simply was not updated with it, and E2E
does not run in the unit CI lane, so nothing caught the drift for a week.

## Defect 1 — the failing one (`seed-source-preview` never appears)

`confirmReseedDefault` waited on `seed-source-preview` and
`seed-source-absent-note`. On the Scenario B path — where the default selection
**is** reseed, which the same helper asserts two lines later — neither element
can exist. The helper was waiting for markup that only renders when the card it
asserts is pressed is *not* pressed.

The failure looked like a stalled walk (a 15 s timeout on a missing testid), and
had been recorded as "spec 035's reseed step, identical in shape to the previous
run". The page snapshot in Playwright's `error-context.md` showed otherwise: the
panel was fully rendered, on the right step, with **Reseed from desktop
[pressed]** and a "Derived tablet layout (reseed preview)" card. The step was
working; the handle was wrong.

**Fix:** wait on `seed-source-reseed-preview`, and additionally assert
`seed-source-preview` has count 0 — so the two branches stay distinguished
rather than the check simply being dropped. The Scenario B precondition
(`hasUsableBaseLayout === false`) is still asserted: it is surfaced
selection-independently in the import-adapt card's own body copy
(`editor.touchSeed.importAdaptUnusable`, "There is no base touch layout to
import…"), gated on the very same flag the absent-note was.

## Defect 2 — the vacuous layer loops (both tests)

With the walk unblocked, the next failure was real:

```
expected a "default" layer
Received array: []
```

Both tests typed the artifact as `PhoneTouchJson` and read `touchJson.phone`.
Against a reseed that emits `tablet`, that is `undefined`, so every

```ts
for (const layer of touchJson.phone?.layer ?? []) { … }
```

iterated an **empty array and asserted nothing**. These were not passing — they
were not running. Test 2 (US2-AS4) was reported "passing" for exactly this
reason.

The emitted artifact, captured from a real walk rather than inferred:

| platform | layers | row widths |
|---|---|---|
| `tablet` (only) | `default, shift, numeric, rightalt, rightalt-shift` | up to **11** |

**Fix:** a `TouchLayoutJson` type keyed by platform id, and assertions against
`touchJson.tablet`. The `<=10 keys per row` check is **removed, not repointed**:
it was `buildCanonicalPhoneLayers`'s compact-*phone*-row invariant, and the
tablet skeleton deliberately violates it — its digit row is 1–0 plus `K_BKSP`,
11 keys wide. Repointing it at the real platform would have failed honestly.

In its place, both tests now assert the **platform key set**:
`expect(Object.keys(touchJson)).toEqual(["tablet"])`. For Test 2 this is
strictly stronger than the row-width check it replaces — bambara ships exactly
`["phone"]`, so an emitted set of exactly `["tablet"]` proves R10's strip
(`const { touchLayout: _stripped, ...rest } = baseIr`) actually discarded the
shipped platform rather than augmenting or carrying it forward. It also fails
loudly if the platform id ever moves again, which is the failure mode that hid
here.

## Defect 3 — a negative assertion that could never fail

Found while reading the neighbouring helper, not part of the failure.
`chooseReseedExplicitly` asserted the reseed card does **not** contain:

> "discards the base's shipped **tablet/desktop** touch platforms"

The shipped copy (`editor.touchSeed.reseedDiscardsPlatforms`) says
**phone/desktop**. The asserted substring appears in no branch of the component,
so the assertion passed unconditionally and would have gone on passing had the
advisory rendered — which is the one thing it exists to catch.

**Fix:** corrected to the shipped wording. Verified the assertion now has teeth
for the right reason: a Node probe over
`../keyboards/release/b/bambara/source/bambara.keyman-touch-layout` returns
`platforms: ["phone"]`, so `hasOtherPlatforms`
(`platformIds.some((id) => id !== "phone")`) is false and the advisory correctly
does not render.

## Also touched

`helpers/contrastDebt.ts` gained `LINT_CHIP_DEBT`. Once the walk ran to
completion it reached a screen it had never scanned, where axe flagged
LintChip's `<code>` badge (`KM_ERROR_DEPRECATED_STORE` — pid_piaroa's own .kmn
uses `&ETHNOLOGUECODE`, illegal since Keyman v10). Same open 1.4.3 debt as every
other exclusion on that screen, and LintSummary is survey-pane chrome present
for the whole walk, so it belongs in the shared module. The new selector is
scoped to the findings list (`[aria-label="Lint findings"] code`) rather than
the bare `"code"` this spec previously excluded page-wide.

## What this cost, and the cheap guard

Three of the four defects were **silent**: two vacuous loops and one vacuous
negative assertion, all of which reported green. Only Defect 1 announced itself,
and it announced itself misleadingly — as a stalled step rather than a stale
selector.

The shape is the same one the F2 investigation hit
([`F2-reload-phaseresults-loss.md`](F2-reload-phaseresults-loss.md)): **a green
assertion is not evidence that the property it names holds.** There, a gating
spec passed while the property it gated was broken; here, assertions passed
while not executing.

`utilities/test-antipattern-lint` already bans `expect(true).toBe(true)`-style
tautologies, but it scans `packages/*/**/*.test.ts` — E2E specs are `.spec.ts`
and out of its reach, and "loop over an array that is always empty" is a
different shape from a literal tautology anyway. Worth considering (not done
here, outside 057's scope): assert the container is non-empty before looping
over it in walk specs, so an emptied collection fails instead of passing.
