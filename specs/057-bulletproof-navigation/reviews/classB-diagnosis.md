# Class B E2E Diagnosis — Driver Drift Against 07-22..07-30 `main` Landings

**Date:** 2026-08-04
**Scope:** `copy-edit.spec.ts` (`walkToOutput` callers), `touch-derivation-us1.spec.ts`,
`touch-derivation-us2.spec.ts` — the "Class B" failures established (by the main
session, before this task) as E2E-driver drift, NOT spec 057 regressions.
**Author:** km-testing (agent), acting on a pre-established diagnosis handed down
by the orchestrating session.

## Summary of what changed and why it hung

Two features landed on `main` between 2026-07-22 and 2026-07-30 while this
branch's E2E lane was dark (its own helpers couldn't drive `ui/SelectMenu`
after the portal change, so nobody noticed the drift accumulate):

1. **`fc2ee650` (2026-07-22, spec 046/052 "marks series")** — a new spine step
   (`marks`, between `characters` and `convenience`) that, for a decomposable
   accented character (`é`, `ω`... any NFD-2-codepoint letter whose second
   codepoint is a combining mark U+0300-U+036F), proposes treating the
   combining mark itself as a reusable "mark key". Accepting that proposal
   writes `session.marksWorklist` (a `PlacementWorklist`), which
   `MechanismGallery` consumes: characters reachable via a *productive* mark
   key are folded out of the desktop walk, and the mark **itself** is folded
   in as its own walk entry. Net effect: a Phase-B walk that used to add
   exactly one new character to `lettersToAdd` (the placed letter) can now
   also owe the bare combining mark — a character whose default "Assign to a
   key" method starts with **no key chosen** (`canApply` false) rather than
   the decomposable-accented default's Apply-ready deadkey prefill.
2. **`3f0c715b` (2026-07-28, #1411 "case-pair uppercase companion")** — Later
   observed live: the uppercase counterpart of a placed decomposable letter
   (`é` → `É`) shows up as its **own** entry in the gallery's `inventory`
   (visible in the SHOW-ALL `CharScrollStrip`, at "0 ways") independent of the
   Mechanisms-level propose-then-confirm companion banner. The exact mechanism
   by which `É` enters `session.confirmedInventory` (vs. only ever being
   offered post-Apply, mechanism-gallery-side) was not traced to source in
   this pass — flagged below as an open question, not resolved.

Both land in the SAME worklist `MechanismGallery.tsx`'s `lettersToAdd` walks.
Live evidence (touch-derivation-us1, before this fix): the walk-visible
character set was `[◌́ U+0301 (0 ways), e (1 way, informational), é (0 ways),
É (0 ways)]`, status "0 of 3 added" — i.e. **three** characters now need
Mechanisms-gallery work where the fixture doc comments (and the old
`driveMechanismsPlaceLetter(page, PLACED_CHAR)` helpers) assumed exactly one.

## Failure-mode timeline (driver assumption → observed break)

| # | Driver assumption (pre-fix) | Feature that broke it | Symptom |
|---|---|---|---|
| 1 | `driveConvenienceStep`'s 5s `isVisible` poll: absence within 5s ⇒ "the convenience gate skipped this question" | The convenience-screen recompute can legitimately land several seconds after the previous step transitions — race gets worse under load (a fresh dev server, or right after a mid-walk tab round trip stresses the same recompute path) | Helper returns early while the app is still sitting on "Keep these letters for convenience?"; caller then waits on the NEXT landmark (`carve-gallery`) and times out (20s/30s) never having reached it. Matches: touch-us1 main walk hang, copy-edit T028's `carve-gallery` timeout, and (very likely, see the axe-contrast note below) copy-edit's "phase B complete" axe-scan capturing the Convenience screen instead of the intended landing screen. |
| 2 | `driveMechanismsPlaceLetter(page, char)` (touch-us1/us2's per-spec helper): click `Apply method for ${char}` directly, assuming `char` (the placed letter) is the CURRENT character on gallery entry | The marks-series mark (and, per the case-pair companion, the uppercase counterpart) can now precede the placed letter in `lettersToAdd`'s collated walk order, and/or require field input the naive click skips | `getByRole("button", {name: "Apply method for é"})` never resolves because the gallery opened on a DIFFERENT character (the bare mark, whose default "Assign to a key" method needs a key picked before Apply enables) — 240s timeout. Matches: touch-derivation-us2's AS4 test exactly (evidence #17). |
| 3 | `walkToOutput` (copy-edit.spec.ts): `completePhaseB → navigateToOutput` directly, no Carve/Mechanisms interaction at all | Previously safe because every fixture's `charToAdd` is already produced by its base, so `lettersToAdd` was empty and `useInventoryCoverageGate` never blocked the Output nav link. The marks-series promotion breaks that: the combining mark is genuinely NEW (not already produced) even when the precomposed letter is, so `lettersToAdd` is non-empty and the gate now blocks | `a[href="#output"]` stays `aria-disabled` ("Finish every inventory character before you can access Output") forever — 240s timeout on every walk that reaches Output this way (evidence #4-#8). |

## Fixes applied (this pass)

All changes are in `packages/studio/e2e/`, none in application code.

### 1. Race-proof `driveConvenienceStep` / `driveMarksSeries` (`helpers/surveyFlow.ts`)

Replaced the fixed-timeout absence poll with a **race** against the landmark(s)
that always follow on the spine (`carve-gallery` for convenience;
`convenience-continue` OR `carve-gallery` for marks — see `steps/manifest.ts`'s
locked spine order `characters → marks → convenience → carve → …`), using
`Locator.waitFor({state:"visible"})` rather than `Locator.isVisible({timeout})`
(the latter's `timeout` option is deprecated/ignored by Playwright — it never
actually waits, it just reads the current DOM state; this was a latent
correctness bug in the ORIGINAL helper, not something spec 057 introduced,
and it is what actually causes the "gate skipped" misread). Added a private
`waitVisible(locator, timeout)` helper (`Promise<boolean>`, never throws) so
every future "is this rendered YET" check in this module has one correct,
non-deprecated implementation to reach for.

### 2. `driveMechanismsGallery` — a generic, worklist-size-agnostic driver (`helpers/surveyFlow.ts`, new export)

Walks however many characters `lettersToAdd` actually holds:
- dismisses the one-time intro splash;
- handles the empty-diff exit cleanly (mirrors `confirmMechanismsEmpty`'s
  shape) — the Georgian fixture (`basic_kbdgeo`/`ქ`, no combining marks) hits
  this branch, proven by code reading (`isDecomposableAccented` is
  false for `ქ`, so the marks series S0-skips and nothing is promoted);
- per character: if the generic "Apply method for X" button is already
  enabled (true for any decomposable-accented character — both a placed
  letter like `é` AND, for the same reason, its uppercase counterpart `É`,
  since `MechanismGallery`'s per-char effect prefills the §3c deadkey default
  with zero required edits for both), click it directly;
- otherwise (the bare combining mark case: not decomposable, so the default
  "Assign to a key" method starts with no key chosen and `canApply` is false)
  falls back to "Type a sequence" with a **synthetic, per-character-unique**
  `(content, indicator)` pair — `content` embeds the character's own
  codepoint (e.g. `"zzq301"`), so it can never collide with any real
  preceding-context string a base keyboard's own rules would match, and no
  two loop iterations can ever produce the same pair. Verified against
  `SequenceBuilderPanel.tsx` / `charInput.ts` / the `multi_char_sequence`
  pattern (`content/patterns/desktop-input/multi-char-sequence.yaml`): the
  rule this method emits is `'{{firstLetterOut}}' + '{{secondLetter}}' >
  '{{collapsedChar}}'`, a **preceding-context match**, not a physical-key
  remap — so it cannot conflict with a base keyboard's own single-key rules
  the way reusing an arbitrary physical key via "Assign to a key" would have.
  Also verified `hasSequenceForChar`/`uncoveredTargets`
  (`lib/unimplementedInventory.ts`, `assignmentMap.ts`) both count a
  sequence-only mechanism as coverage — the fallback genuinely satisfies the
  same gate a real key assignment would, not merely the in-gallery
  `canGoNext` check.
- advances via "Next character"/"Done" until the gallery completes.

Deliberately does **not** assert which character was which mid-walk — callers
that need to prove a *specific* placed letter landed correctly still do so
from the emitted ZIP (unchanged: `touchText`/`kmnText` containment checks),
which is where the meaningful spec-level assertions already lived.

`touch-derivation-us1.spec.ts` and `touch-derivation-us2.spec.ts`'s local
`driveMechanismsPlaceLetter(page, char)` helpers are retired in favor of this
shared driver at all three call sites (US1's main walk, US2's main walk, and
US2-AS4 — the exact test that hung 240s in the evidence).

### 3. `finishGalleryWork` in `copy-edit.spec.ts` (new local helper)

Waits for `carve-gallery`, clicks `carve-continue` (unconditional accept — no
gate on that button; verified in `CarveGallery.tsx`), then calls
`driveMechanismsGallery(page)`. Inserted before every `navigateToOutput(page)`
call in the file (4 call sites: the top describe block's 3 tests, plus the
`walkToOutput` helper used by T010/T011/T016). Positioned so it does **not**
move the existing axe-violation scan in the first test ("phase B complete
(copy-edit walk)") — that scan still runs on whatever screen `completePhaseB`
leaves the walk on (now, correctly, past Convenience thanks to fix #1 above,
not stuck on it), and `finishGalleryWork` runs strictly after that scan,
before Output nav.

## Fixture-specific coverage-gate shapes verified by code reading

- **Latin fixtures with a decomposable `charToAdd`** (`é` on `basic_kbdfr`, and
  touch-derivation's bambara/pid_piaroa fixtures): the precomposed letter may
  already be produced by the base (copy-edit's case) or not (touch-derivation's
  case, by fixture design — see each spec's own doc comments), but the bare
  combining mark is *never* already produced standalone, so it always ends up
  in `lettersToAdd` once the marks-series proposal is accepted. `driveMarksSeries`
  (unchanged in this pass beyond the race-proofing) already accepts every
  station's propose-then-confirm by construction, so this path is exercised on
  every run, not conditionally.
- **Non-decomposable `charToAdd` fixtures** (Cyrillic `я`, Greek `ω`, Armenian
  `ա`, Georgian `ქ`): `isDecomposableAccented` is false for all four (verified
  the NFD-length/combining-mark-block check in
  `packages/contracts/src/utils/charUtils.ts`), so the marks series S0-skips
  entirely and nothing is promoted — `driveMechanismsGallery` hits its
  empty-diff branch for these (assuming, as documented in each of these
  fixtures' own header comments, that the target character is itself already
  produced by its base).

## Open question — NOT fixed here, flagged for the main session

**How does `É` end up in `session.confirmedInventory` (and therefore in the
Mechanisms gallery's SHOW-ALL `inventory`/`lettersToAdd`) at all?**

The live evidence quoted in this task's brief showed `É` as its own walk entry
("0 ways") *before* any Mechanisms-gallery Apply action had occurred for `é`.
The Mechanisms-gallery-level case-pair companion (`casePairCompanion.ts`,
`proposeCompanion(...)`) is a **propose-then-confirm** UI banner raised only
*after* an Apply — it does not, on its own, write to `confirmedInventory` or
appear in `lettersToAdd` ahead of time. This session's driver
(`driveMechanismsGallery`) never confirms that banner (it advances via
"Next character"/"Done" without touching it — the per-`currentChar` `useEffect`
in `MechanismGallery.tsx` clears the pending companion on navigation, so
leaving it unconfirmed is inert, not a leak), so it isn't the source of the
pre-existing `É` entry either.

This means `É`'s presence in the confirmed alphabet most likely originates
**earlier** — at Phase B / the marks series itself (spec 051
"uppercase-counterpart-suggestion", referenced in `casePairCompanion.ts`'s
`@see`) — not from anything this driver does. **This was not traced to
source in this pass** (out of the confirmed root-cause scope handed to this
task); the fix above is deliberately generic to `lettersToAdd`'s actual
contents regardless of *why* `É` is there, so it does not depend on resolving
this question. Flagging it because:

1. It explains why the live evidence showed **three** characters (mark, `é`,
   `É`) rather than two.
2. If the main session wants to assert something more specific than "the
   gallery completes and the placed letter's own ZIP content is present" —
   e.g. a spec-level assertion about `É` itself — this is the mechanism to go
   trace next.

## Touch Gallery — a related risk, deliberately NOT fixed here

Reading `TouchGallery.tsx`'s own walk-list derivation (`touchLettersToAdd`,
~line 1761) shows the **same** class of assumption break is architecturally
possible there: `touchLettersToAdd` is `inventory` filtered to characters
that are either not yet detected on the seed touch layout, or ARE detected but
still carry an unreviewed Phase C suggestion (`desktopSuggestionTargets`,
derived from ALL desktop `MechanismAssignment` targets). Since this pass's
`driveMechanismsGallery` now applies a REAL desktop mechanism to `É` (and the
bare mark, via the sequence fallback) in addition to `é`, all three become
candidates for `desktopSuggestionTargets`, and therefore for
`touchLettersToAdd` — which `touch-derivation-us1.spec.ts` /
`touch-derivation-us2.spec.ts`'s existing `driveTouchGalleryAcceptPlacement`
helper (a single hard-coded "accept the suggestion for `${PLACED_CHAR}`, then
click touch-continue once" driver) does not walk.

**This was explicitly out of the confirmed root-cause list handed to this
task**, and none of the current evidence (both touch-derivation specs
currently fail *before* reaching Touch Gallery — us1 on an axe-contrast
violation at the Phase B screen, us2-AS4 on the Mechanisms hang this pass
fixes) proves it actually manifests. Per this task's own instruction to
surface rather than silently patch a suspected-but-unverified app/test
interaction, this is written up here rather than changed: the existing
generic `driveTouchGallery(page)` helper (already used successfully by
`carve.spec.ts`, which walks an arbitrary-length `touchLettersToAdd` via a
manual "Host key for long-press" + Apply loop, ignoring any kbgen/desktop
suggestion) would be the natural swap-in if evidence from an actual run shows
`driveTouchGalleryAcceptPlacement` hanging the same way `driveMechanismsPlaceLetter`
did — but making that swap now, without being able to run Playwright to
confirm it's needed AND that it doesn't disturb the FR-002/004/005 touch-layout
assertions these two specs make, risks trading one unverified hang for another.
**Recommend the main session re-run both touch-derivation specs after this
pass's fixes and, if either now hangs inside the Touch gallery (as opposed to
failing earlier on the known axe-contrast debt), come back for that swap.**

## Files touched this pass

- `packages/studio/e2e/helpers/surveyFlow.ts` — `waitVisible` (new private
  helper), `driveConvenienceStep`/`driveMarksSeries` (race-proofed),
  `driveMechanismsGallery` (new export).
- `packages/studio/e2e/touch-derivation-us1.spec.ts` — retired the local
  `driveMechanismsPlaceLetter`, rewired its one call site onto
  `driveMechanismsGallery`.
- `packages/studio/e2e/touch-derivation-us2.spec.ts` — retired the local
  `driveMechanismsPlaceLetter`, rewired all three call sites (US2 main walk,
  US2-AS4) onto `driveMechanismsGallery`.
- `packages/studio/e2e/copy-edit.spec.ts` — new local `finishGalleryWork`
  helper, wired before all four `navigateToOutput` call sites (the top
  describe block's 3 tests + `walkToOutput`).

No application code (`packages/studio/src/**`) was touched. `pnpm --filter
@keyboard-studio/studio exec tsc -b` is clean. E2E specs are not covered by
that build (by design — see `playwright.config.ts`'s header comment); a
scratch `tsconfig` extension was used to typecheck the touched `e2e/**` files
directly and surfaced only PRE-EXISTING issues in files this pass did not
touch (missing `"node"` in `tsconfig.json`'s `types` field, affecting every
spec that imports `node:fs`/`node:path`/`node:fs/promises`; a duplicate
`declare global { interface Window { __ksE2E__?: ... } }` shape conflict
across `carve.spec.ts`/`compare-isolation.spec.ts`/
`switch-base-exploration.spec.ts`/`switch-base-rebase.spec.ts`) — neither is
new, and neither is in a file this pass edited.
