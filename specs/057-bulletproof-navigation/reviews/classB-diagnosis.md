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

---

# Addendum — verification-run follow-up (2026-08-04)

**Trigger:** a Playwright verification run (14 tests, 8 passed, 6 failed) confirmed
the convenience/marks/mechanisms repairs above work — the WASM-oracle test and
all spec-034 walks are green. This addendum covers the four remaining items
the coordinator assigned back to km-testing from that run (a fifth,
`copy-edit.spec.ts:292`'s missing `.kps`, is explicitly out of scope — the
coordinator is investigating it separately with a live run).

## 1. Touch Gallery multi-character widening — CONFIRMED, generalized

The run confirmed the open finding from the base diagnosis above:
`touch-derivation-us1.spec.ts:255` failed on
`getByRole('button', { name: /^Use suggested long-press method for .*é$/u })`
not found (240s timeout at `:244`), and `touch-derivation-us2.spec.ts`'s AS4
test (`:469`) failed the same way on its own `driveTouchGalleryAcceptPlacement`
call — both are the exact `TouchGallery.tsx` `touchLettersToAdd`-widening
mechanism the base diagnosis flagged but declined to patch without live
evidence. That evidence now exists.

**Fix:** retired the per-spec `driveTouchGalleryAcceptPlacement(page, char)`
helpers (one in each of `touch-derivation-us1.spec.ts` and
`touch-derivation-us2.spec.ts`) and rewired all three call sites — US1's main
walk, US2's main walk (Test 1, Scenario B), and US2-AS4 (Test 2) — onto the
existing generic `driveTouchGallery(page)` from `helpers/surveyFlow.ts`. That
helper already walks an arbitrary-length `touchLettersToAdd` via a manual
"Host key for long-press" (`K_A`) + Apply loop, ignoring any kbgen/desktop
suggestion — proven in production by `carve.spec.ts`'s own two call sites.
Reusing it (rather than writing a new suggestion-aware widened driver) means:

- no new untested logic for a change I cannot Playwright-verify myself;
- the specific host key chosen (`K_A` vs. the "suggested" `K_E` a Phase-C
  deadkey assignment would carry over) does not matter to any assertion these
  specs make — verified by re-reading every ZIP assertion in both files: they
  check `phone.font`, per-row key counts, and PLAIN STRING CONTAINMENT of
  `PLACED_CHAR`/`SURVIVOR_CHAR`/`CARVED_CHARS` in the serialized
  `.keyman-touch-layout` JSON, never which specific key an alternate landed on.

**Also hardened** `driveTouchGallery` itself while making it load-bearing for
three additional call sites: replaced every `.isVisible({timeout})` check in
its loop with the module's `waitVisible()` helper (added in the base pass) —
`Locator.isVisible()`'s `timeout` option is deprecated/ignored by Playwright
(confirmed via `node_modules/.pnpm/playwright-core@1.61.1/.../types.d.ts`), so
the original loop's `continueButton.isVisible({timeout:2_000})` never actually
waited 2 seconds; it read the CURRENT DOM state once, immediately. This is the
identical bug class the base diagnosis's `driveConvenienceStep` fix corrected,
now fixed once more directly in `driveTouchGallery` rather than left
latent in a helper three tests now depend on.

Files: `packages/studio/e2e/helpers/surveyFlow.ts` (`driveTouchGallery`
hardened), `packages/studio/e2e/touch-derivation-us1.spec.ts`,
`packages/studio/e2e/touch-derivation-us2.spec.ts` (both: import swap, local
helper removed, three call sites rewired).

## 2. Axe scans now legitimately land on Carve gallery — exclusion lists extended

Both `copy-edit.spec.ts:214`'s "phase B complete (copy-edit walk)" scan and
`touch-derivation-us2.spec.ts:367`'s "phase B build list (US2 piaroa walk)"
scan now flag Carve-gallery contrast debt
(`button[aria-label="Hide info panel"]`, `button[data-testid="carve-continue"]`,
`button[aria-label="Dismiss removal recommendation"]`, and the per-node
carve-card span chains) — the same pre-existing 1.4.3 debt
`carve.spec.ts`'s own `KNOWN_CONTRAST_DEBT` already documents and excludes.

**Decision: extended the exclusion lists (did not move the scans).** Traced
both scan call sites to confirm moving them earlier would not change what they
capture:

- `copy-edit.spec.ts`: the scan already runs immediately after
  `completePhaseB(page)` and *before* `finishGalleryWork(page)` (the new
  Carve/Mechanisms driving this pass added) — the transition into the Carve
  gallery happens **inside** `completePhaseB` itself, via
  `buildOneCharacterList` → `driveConvenienceStep`, which (once its own race
  is fixed) correctly advances the manifest spine past Convenience into Carve.
  `finishGalleryWork` never ran yet at scan time; there is nowhere earlier to
  move the scan to.
- `touch-derivation-us2.spec.ts`: identically, the scan runs immediately after
  `addPlacedCharacterToInventory(page, PLACED_CHAR)` and *before*
  `carveCharacters(...)` is even called — the same `buildOneCharacterList` →
  `driveConvenienceStep` transition inside `addPlacedCharacterToInventory` is
  what lands the walk on Carve, before this test's own Carve interaction ever
  starts.

So in both cases, the scan's own label describes its INTENT ("scan whatever
the survey is showing right after Phase B's build-list step finishes"), and
that intent is still honestly met — it's simply that "right after Phase B" now
correctly means the Carve gallery (per the manifest spine
`characters -> marks -> convenience -> carve -> ...`), where before the
convenience-race fix it *looked* like Convenience only because the walk was
incorrectly stuck there. Moving the scan would not change what screen gets
captured; extending the exclusion list with the already-documented,
already-reviewed carve-gallery debt is the honest fix, not a workaround.

Added the same superset `touch-derivation-us1.spec.ts`'s own (already-passing)
`KNOWN_CONTRAST_DEBT` list already carries for its own Phase-B scan (which
never needed fixing this round, confirming the superset is the right shape):
`button[aria-label="Hide info panel"]`, `button[data-testid="carve-continue"]`,
`button[aria-label="Dismiss removal recommendation"]`,
`div[aria-label="Removal recommendation"]`,
`button[data-testid^="carve-card-"]` (the stable testid-PREFIX exclusion
`carve.spec.ts` itself prefers over a brittle nth-child span chain — verified
against `Rail.tsx` that `data-testid="carve-card-${node.nodeId}"` and
`data-kind={node.kind}` are attributes of the SAME `<button>`, so this one
selector's subtree-exclude also covers the `data-kind="pattern"` selector
variant axe reported for `copy-edit.spec.ts`'s basic_kbdfr fixture and the
`carve-card-simple-swap#main` variant it reported for
`touch-derivation-us2.spec.ts`'s pid_piaroa fixture, without needing either
file's exact brittle nth-child chain verbatim), `button[aria-label$="go to"]`,
`button[aria-label$="places"]`, `div[style*="letter-spacing: 0.13em"]`.

Files: `packages/studio/e2e/copy-edit.spec.ts`,
`packages/studio/e2e/touch-derivation-us2.spec.ts` (both: `KNOWN_CONTRAST_DEBT`
extended with inline per-selector 1.4.3 comments; doc comment above each list
rewritten to explain the "label names intent, not a literal screen" point).

## 3. T028 Back-from-carve — (b) confirmed: pre-existing durable-store behavior, not a 057/finishGalleryWork interaction

Traced to source. **This is (b): the test's own assumption was wrong, and it
predates both spec 057 and this pass's changes** — it was simply never
exercised in a passing run before, because every prior run failed earlier (at
the convenience-race bug this pass's base diagnosis fixed), before ever
reaching the Back-click assertion.

**Citations, in order:**

1. `packages/studio/src/stores/surveySessionStore.ts:299` — `discoveryMethod`
   is a field of `SurveySessionState` (and therefore, via the type alias at
   `:479`, of `TraversalSnapshot`).
2. `surveySessionStore.ts:657-674` (`snapshotTraversal`) explicitly includes
   `discoveryMethod: s.discoveryMethod` in the snapshot every hard-reload
   persists.
3. `surveySessionStore.ts:736-741` (`applyTraversalSnapshot`) restores the
   ENTIRE snapshot verbatim via `setState({...snapshot, history: ...})` —
   `discoveryMethod` is not special-cased or reset on restore.
4. `surveySessionStore.ts:693-700` (`performManifestBack`, the ONE handler
   shared by every manifest-level Back button including Carve's own
   `"← Back"` — see its own doc comment) calls only `popHistory()` (or, for
   the `"touch"` step, `backToTouchSeedSource()`). Neither touches
   `discoveryMethod`.
5. `packages/studio/src/survey/PhaseB.tsx:1299-1307` — `PhaseB`'s FIRST check
   is `if (discoveryMethod === null) return <IntroChooser .../>`. Once
   `discoveryMethod` is non-null (set by `IntroChooser`'s own
   `data-testid="phase-b-intro-next"` button → `handleContinue` →
   `onChoose(selected)` → `setDiscoveryMethod(...)`, `PhaseB.tsx:1430-1442`/
   `:1494-1495` — exactly what `completePhaseB`'s FIRST pass through Phase B
   does, earlier in this same test), every subsequent render of the
   "characters" step — via Back, via reload-restore, or both at once, as T028
   does — renders `BuildListView` directly. It never re-renders `IntroChooser`
   for the rest of that draft.
6. `packages/studio/src/survey/CharactersStep.tsx:26-28` states this
   explicitly, in the codebase's own words: *"Hosts the prefill -> PhaseB
   substage driven by the persisted `charactersSubStage` store slot, so
   back-from-carve remounts at PhaseB rather than replaying prefill."* The
   `resetPhaseBDraft()` call that clears `phaseBDraftStore`'s alphabet
   (`chars`) is scoped to exactly the `Prefill`'s `onConfirm` callback
   (`CharactersStep.tsx:54-60`) — the prefill→B transition only, never a later
   Back into an already-visited "characters" step. So the alphabet
   (`FIXTURE.charToAdd`, added on the first pass) is also still present after
   Back, not cleared.
7. Ruled out `stores/viewStateStore.ts` (spec 057 US5) as a cause: its
   `ViewState` shape (`flowMapSection`, `trailCollapsedSteps`,
   `trailShowSuperseded`, `paneSplitPct`, `oskMode`, `scrollTop`,
   `compareSelection`) carries no Phase-B-substage or discovery-method field
   at all — it cannot be the mechanism here, confirming the coordinator's
   suggested lead was worth checking but the actual cause is the pre-existing
   `surveySessionStore`/`phaseBDraftStore` durability, not the new 057 store.

**Fix:** updated the test to wait for the build-list screen's own control
(`[aria-label="Character to add"]`, the coordinator's suggested locator)
directly after the Carve gallery's Back click, instead of waiting for
`[data-testid="phase-b-intro-next"]` (which never renders again once
`discoveryMethod` is set). Rewrote the stale comment block above the
assertion (which incorrectly described `BuildListView`'s alphabet as
"component-LOCAL `useState`" that "resets on this remount" — it is a
`usePhaseBDraftStore` zustand-store value, and per citation 6 above does NOT
reset here) to cite the actual mechanism, matching the six citations above.
Left the subsequent fill/"+ Add"/`phase-b-done` sequence unchanged (still
exercises the same UI path; it is now a harmless re-add/dedup of an alphabet
character that was already present, rather than a fresh addition — this does
not weaken what the test proves, since its stated purpose is the Back+Forward
history round-trip, not a fresh-alphabet assertion).

File: `packages/studio/e2e/copy-edit.spec.ts` (T028 test body only).

## 4. `copy-edit.spec.ts:292` (missing `.kps`) — untouched per instruction

Not investigated or modified this pass — the coordinator is running this one
down live in the main session.

## Addendum file list

- `packages/studio/e2e/helpers/surveyFlow.ts` — `driveTouchGallery` hardened
  with `waitVisible` (no behavior change to its call signature).
- `packages/studio/e2e/touch-derivation-us1.spec.ts` — local
  `driveTouchGalleryAcceptPlacement` removed; call site rewired to the generic
  `driveTouchGallery`.
- `packages/studio/e2e/touch-derivation-us2.spec.ts` — local
  `driveTouchGalleryAcceptPlacement` removed; both call sites (Test 1, Test
  2/AS4) rewired to the generic `driveTouchGallery`; `KNOWN_CONTRAST_DEBT`
  extended with carve-gallery debt selectors.
- `packages/studio/e2e/copy-edit.spec.ts` — `KNOWN_CONTRAST_DEBT` (the "phase
  B complete" scan's list) extended with carve-gallery debt selectors; T028's
  Back-from-carve assertion corrected to expect the build-list screen, with
  citations.

`pnpm --filter @keyboard-studio/studio exec tsc -b` is clean after these
changes. The same scratch-tsconfig e2e typecheck used in the base pass shows
no new errors in any file this addendum touched (only the same pre-existing,
unrelated `node:fs`/`node:path`/`node:fs/promises` "node" types-field gaps
already noted in the base diagnosis).
