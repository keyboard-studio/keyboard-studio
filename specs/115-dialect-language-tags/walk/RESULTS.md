# Spec 115 — T061 walk results

Manual walk of `specs/115-dialect-language-tags/quickstart.md` §5, scripted as
`packages/studio/e2e/spec-115-dialect-walk.spec.ts` (archived here as
`dialect-walk.spec.ts.txt`; the live spec is deleted before commit so CI's e2e
set is unchanged) and run with the Playwright CLI against `pnpm dev`
(`vite --port 5273 --strictPort`), one worker, 400s per test.

- Branch: `115-dialect-language-tags`, base `origin/main` (see commit message).
- Dev server: vite on port 5273, `NODE_OPTIONS=--max-old-space-size=5120`.
- Batches: the walk ran in batches because a foreground `muse.exec` is killed
  at turn end (orphaning Playwright workers); every batch was launched detached
  (`setsid nohup … &`, log in this directory). Batch logs are the
  `walk*.log` files; `run.log` is appended by the spec itself.
- **Final full run (25 tests, one batch): see the table below.** Walk 4 is
  EXPECTED to fail — it records a genuine product violation (FR-013), not a
  walk defect.

## Results

| # | Walk | Result | Notes |
|---|---|---|---|
| 1 | Gascon copy path → `oc-gascon` in the `.kps` | PASS (1.4m) | `.kps` lists exactly one `<Language ID="oc-gascon">`; see `download.kps.txt` |
| 2 | Proposals: Rabinal `acr-x-rabinal`, Aranese `oc-aranes`, Yabekolo `ewo-x-yabekolo`, Sursilvan `rm-sursilv`, Yabekolo edit validation, French no screen | PASS 6/6 (4.4m) | |
| 3 | Region on demand — Canada `fr-CA` | PASS | |
| 3b | Region on demand — France `fr` | PASS | `fr-FR` minimizes to `fr` |
| 4 | Dialect re-proposal Gascon → Catalan | **FAIL (FR-013)** | See below |
| 5 | Autosuggest kept — "Ewon" suggests Ewondo, resolves `ewo` | PASS (1.3m) | |
| 6a | Typed `bft` → Balti | PASS | |
| 6b | Typed `oc-gascon` | PASS | |
| 6c | Made-up name as a dialect of Occitan | PASS (after fix 6) | Failed twice first: stale blur-close (fix 6) |
| 6d | Unlisted, no code → `qaa-Latn-x-mystery` | PASS | Script-carrying tag: Phase 7 limitation (b) |
| 6e | Unlisted with code `zzz` warns | PASS | Code-check line matched by text (three `role="status"` regions) |
| 6f | Mansim (uncoded, Glottolog) → `qaa-Latn-ID-x-mansim` | PASS | Panel shows country CODE `ID`, not `Indonesia` |
| 6g | Sechuran Olmos → `qaa-Latn-PE-x-sechuran-olmos` | PASS | |
| 6h | "Gascon Occitan" → `oc-gascon` | PASS | |
| 6i | "Ewondo (Yabekolo)" → `ewo-x-yabekolo` | PASS | |
| 6j | French Switzerland → `fr-CH` | PASS (after tag-poll fix) | First failed on an empty `decisions()` dump; now polls the draft tag |
| 6k | Swiss French → remainder chooser → `fr-CH` | PASS (after tag-poll fix) | Same as 6j |
| 6l | Ewondo Mvog-Ada → `ewo-x-mvogada` | PASS | |
| 6m | Typed tag `oc-gascon` + Tab + Next | PASS | |
| 7 | Open list: `sq-AL-gheg` error, `sr-Latn-RS` hint with "Use `sr-Latn`", `oc-gascon` passes | PASS | |

Final full run: **24 passed, 1 failed (walk 4, FR-013)** — see `walk-full.log`.

Batch history: walks 6+7 first ran 5 passed / 9 failed (9.2m) — 8 of the 9
were against spec code fixed mid-batch (the worker loads the spec at start);
re-run 6 passed / 3 failed (4.3m: 6c, 6j, 6k); targeted re-run 2 passed /
1 failed (2.0m: 6k); 6k alone passed (38.3s) after the draft-tag poll.

## Product fixes found by the walk

All six are in the T061–T063 commit (unit tests where noted).

1. **Sursilvan proposal** (`dialectProposal.ts`): `proposeDialect` step 2
   required exact folded description equality, but the IANA variant `sursilv`
   is described "Sursilvan idiom of Romansh" ≠ "Sursilvan". New
   `descriptionMatches()`: a description matches when the folded description
   equals the folded name OR the folded name is the description's first word
   (later words do not count). 2 new unit tests; `dialectProposal.test.ts`
   21/21.
2. **Search merge hijack — Aranese dropped, plain languages unpickable**
   (`dialectSearch.ts`): the `isOwnName` guard dropped a Glottolog hit whose
   name is an alternate name of its parent ("Aranese" is in Occitan's EthnoLib
   alternate names), and the merge rule attached the FIRST dialect hit's match
   to an already-listed parent row. Measured before the fix: French →
   "American Koine French", English → "Acrolectal Fiji English", German →
   "Berlin German", Spanish → "Abajeño Mexican Spanish", Occitan →
   "Auvergnat Occitan". Fix: new `namesLanguageItself(l, q)` — when the query
   names the language itself (code, or a word-prefix of the EXONYM only), the
   plain row stands and the dialect gets its own row. Contract updated
   (`contracts/dialect-search-and-question.md` § merge rule step 6, with the
   measured case). `dialectSearch.test.ts` 21/21.
3. **`resolveTypedLanguage` ambiguity on duplicate rows**
   (`resolveTypedLanguage.ts`): the merge fix's duplicate `fr` rows (plain +
   dialect cards) all share exonym "French", so typed auto-resolve counted
   several primary matches and returned null once the Glottolog tier streamed
   in — `chosen` cleared and the Customize button unmounted mid-walk.
   Fix: `dedupeByLanguage()` — one row per language code, preferring the
   plain (match-less) row. `resolveTypedLanguage.test.ts` 9/9.
4. **`pickStartKeyboard` 5s wedge** (`e2e/helpers/surveyFlow.ts`): `base-confirm`
   stayed disabled ("Preparing preview…") past the 5s `toBeEnabled` wait.
   5s → 30s, citing PR #2644's proven side fix. Walk 1 then passed.
5. **EthnoLib empty-needle hang — walk 6c crash** (`dialectSearch.ts`):
   clicking `"Zorpian" is a dialect: find its language` crashed the page
   (`RangeError: Invalid array length`). Root cause: our
   `dialectResultModifier` called EthnoLib's `defaultSearchResultModifier`
   with the raw `searchString` before the `q.length < 2` guard;
   `enterDialectMode` clears the search string while results are still
   listed, so one render ran the modifier with non-empty results and
   `searchString === ""`; EthnoLib's marker helper loops forever on an empty
   needle (`c += needle.length` never advances). Fix: move the short-query
   guard before the EthnoLib call. Regression test added. Filed upstream as
   sillsdev/EthnoLib#160. `dialectSearch.test.ts` 21/21.
6. **StyledCombobox stale blur-close — walk 6c** (`StyledCombobox.tsx`):
   the list opened on fill (38 rows: raw 26, merged 38) and closed ~1s later
   with the input still focused and no second Escape. Root cause, proven with
   a focus/transition log: the `onBlur` 120ms timer was scheduled by the blur
   from the "Can't find it?" click, but the main thread was busy (synchronous
   Fuse search rounds), so the timer fired ~950ms late — AFTER the author had
   refocused and refilled the input — and closed the freshly opened list.
   Fix: the timer now closes only when the input is still unfocused at fire
   time (`document.activeElement !== inputRef.current`). New
   `StyledCombobox.test.tsx` 2/2 (stays open on refocus; closes when still
   blurred). The same hazard applies to any blur→refocus faster than the
   timer on a busy thread, not just the dialect fallback.

## Walk 4 — FR-013 (genuine product violation, kept failing as specified)

Spec requires an asked dialect answer, when its language changes, to be
flagged as re-proposed — never silently kept or dropped (spec.md:199, FR-013,
data-model.md:172). The walk drives Gascon (`oc-gascon`), goes Back ×5,
picks Catalan, and checks for the footer re-proposal notice
("…will need reconfirming…") at the script step.

What the walk finds (probed twice, identical): the footer notice never
appears, and the persisted `decisions` map at the script step holds NO
`language-dialect` record at all — its derived companions
`language-dialect-source` = "registered-variant" and `dialect-glottocode` =
"gasc1240" remain, orphaned. `language-autonym` is "gascon" (asked) with
offered "occitan" (re-proposed); `language-name` is "Occitan" (asked);
`language-code` is "cat".

Mechanism: `recalculate.ts` checks gating FIRST, so for Catalan (no dialect
match → dialect question out of gate) the record is dropped/inactivated before
asked-validation can flag it reproposed. The walk is kept failing as
specified; `recalculate` is NOT changed here (spec-079 core mechanism, high
blast radius — needs Matthew's ruling).

## Quickstart divergences (product text/behavior vs quickstart §5)

- §5 step 1: "No region screen appears (Occitan has one region)" — WRONG.
  Occitan has ES/FR and the region question DOES appear after picking Gascon
  (walk 1, walk 2 Aranese, walk 4).
- §5 step 3: editing Yabekolo to `yabekolo-east` shows the note "Not a valid
  dialect subtag (use 5–8 letters or digits, or a digit followed by 3 letters
  or digits)." — the VARIANT reason, not the quickstart's quoted "private-use
  subtags are 1-8 letters or digits". The walk asserts Save disabled + `/5[–-]8/`.
- §5 step 4: "The dialect answer is flagged as re-proposed" — the footer
  notice does not appear in the walk-4 flow (FR-013 above); the quickstart
  does not name the notice text.
- §5 step 5: "Type `Bafutt`: Bafut is suggested" — not separately asserted in
  the walk spec as written (walk 5 covers "Ewon" → Ewondo only).
- §5 step 6 (US6): uncoded qaa tags carry the script explicitly
  (`qaa-Latn-x-mystery`, `qaa-Latn-ID-x-mansim`,
  `qaa-Latn-PE-x-sechuran-olmos`) where the quickstart shows `qaa-x-…` /
  `qaa-ID-x-mansim` / `qaa-PE-x-sechuran-olmos` (known Phase 7 limitation
  (b)); the Mansim panel shows the country code "ID", not "Indonesia"; the
  unlisted panel's confirm button is "Use this language", not "Confirm".

## Walk-spec notes (helpers, not product)

- `pickLanguageRow` scans rendered options for a plain language row (starts
  with `{name},`, no "dialect of|variety of|also called|known to Glottolog");
  `pickDialectCard` polls option labels for `${name}: a (dialect|variety) of`.
- `passRegionQuestion(page, regionName?)` polls 30s for region-or-autonym; the
  named branch opens the SelectMenu and picks `li` by label text; the blank
  branch advances for the default. A region question can precede the autonym
  (region-ambiguous parent, or a region implied by the pick).
- Typing auto-resolves but does NOT advance — Tab resolves the entry; the
  author then clicks Next (`survey-advance`).
- The code question renders two ways: picker (`#il_language_code`) or
  confirmation (`[data-testid="language-code-value"]` + "Change").
- 6j/6k assert the composed tag via a polling read of the draft
  (`waitForDraftTag`, 30s): the draft save is debounced, so a single read at
  the layout step can return `null`. The `decisions()` localStorage dump
  returned `{}` at the layout step and is not a reliable tag read.
- The `dialectDecisions` / `draftLanguageTag` probe helpers stay in the
  archived spec as documentation of the FR-013 probe.
- `pickStartKeyboard`'s `base-confirm` wait is 30s (fix 4 above).

## T062 desktop e2e — runs, fixes, and open questions (2026-11-11)

The full 136-test desktop set was run in three batches (runs 1 + re-run +
batches A/B) plus a verification batch. PR CI's e2e desktop lane runs only a
quick slice (`boot-smoke decision-store-reload touch-key-identity --grep
"boot-smoke|decision-store-reload|spec 104 walk 1:"`, ci.yml:701,708); the
full set runs on the schedule only (nightly). No recent `schedule` run exists,
so there is NO recent full-set baseline on main — a long-walk failure cannot
be called pre-existing from PR CI alone.

### Batch counts

- Run 1 (killed by the agent at 53/136: 31 passed, 17 failed) — killed
  deliberately: the golden walk was burning its 20-min budget on the known
  code-confirmation stall.
- Re-run (killed by a VM replacement at test 59: 40 passed, 13 failed).
- Batch A (specs journey-strip-badges → open-existing-keyboard): **22 passed,
  10 failed, 2 skipped** (20.5m).
- Batch B (switch-base + tab-roundtrip + touch): **7 passed, 6 failed,
  7 skipped, 28 did not run** (12.8m) — the 28 are the serial-describe
  cascade: the switch-base-exploration matrix is `mode: "serial"`, so the L3
  failure skipped the rest of the matrix.
- Verification batch (19 specs, fixes + open questions): log
  `e2e-verify.log`.

### Fixes applied from these runs (all in the T061–T063 commit)

- **Criteria census 149→live** (`e2e/criteria.spec.ts`): the pin came from spec
  084 (#2048); main's catalog already has 209 rows (branch 211). The page
  renders every catalog row (unit test pins no census). Fix reads the count
  live from `contracts/data/criteria.json`. Verified 2/2.
- **`driveIdentityLite` Q4 two-form** (`e2e/helpers/surveyFlow.ts`): Phase 7's
  `LanguageCodeField` renders a confirmation (`[data-testid=
  "language-code-value"]` + "Change") when the code is already known, and the
  picker input only when blank. The helper waited only for the input, so
  resolved languages hung (240s/480s) or threw at 15s. Fix waits for either
  form; fills the input if present, else asserts the confirmation text.
  Verified: exemplar-prefill 2/2, criteria 2/2, copy-edit 25,
  decision-store-reload 47.
- **Text-sample prompt dismiss** (`surveyFlow.ts` + loanwords spec): a
  resolved language's exemplar data puts marks on the alphabet that free-text
  entry never did, so `shouldPromptTextSample` fires and the prompt defers
  the characters completion. New `dismissTextSamplePrompt` clicks
  "Continue without a text sample" when present, else no-ops. Verified:
  loanwords 3/3.
- **Browser-back track step** (`e2e/browser-back.spec.ts`): `track_choice` was
  removed 2026-11-06 (77cefa97); Back from attribution goes to choose_base,
  not track. Fix expects `base-picker` after the third Back.
- **Locale-switch `navBar`** (`e2e/locale-switch.spec.ts`): the helper used
  `getByRole("navigation", { name: "Studio navigation" })`, but the nav's
  aria-label is the translated `nav.ariaLabel` message — in French it is
  "Navigation dans le studio", so the locator found nothing (the page WAS in
  French; the `"nav.language": "Langue"` translation exists). Fix anchors on
  the unique `#nav-language-select` and takes its ancestor `<nav>`.
- **Open-existing-keyboard list selector**: `#open-languages-heading + p + ol
  li` never matched — the `<p>` is INSIDE the `<section>` sibling of the
  `<h2>` (structure already on main; the selector was stale there too). Fix:
  `#open-languages-heading + section ol li` (4 sites).
- **Switch-base track radio** (5 sites in `switch-base-exploration.spec.ts`
  and `switch-base-rebase.spec.ts`): same removed track step. L3 and the
  rebase confirm now expect `#il_author_name` (attribution); the `trackCopy`
  probe records the author-name field instead.

### Open questions (unresolved at commit time — see PR body)

- **Decision-log test 46** (`invisibles-inventory` has 0 live entries): the
  walk completes; the other five gallery decision ids each have 1 live entry.
  The record is written only by the gallery decide core via draft ops
  (`recordInvisibles`, `useInventoryDraft.ts`); `recordAnswersAsDecisions`
  cannot create it (questionIds `invisibles.u200c` etc. are not in the
  question registry). Whether it fails on main is UNKNOWN — needs a
  main-worktree baseline run of `decision-log.spec.ts`.
- **Golden walk test 54** (`.js`/`.kmx` differ, `.kmn` identical): only
  `build/test.js` and `build/test.kmx` differ from the baseline; the name set
  and every other file (incl. `.kmn`, `.kps`) are byte-identical. The walked
  zip is captured to `/tmp/golden-walked.zip` by a TEMPORARY test edit (revert
  before commit) for the byte diff.
- **OAuth `#root` empty** (boot-smoke 3+4, light-theme-a11y 8+9): the app never
  paints on the oauth callback route within 30s. Spec 115 touches no
  boot/oauth/routing code. Environmental vs branch-caused UNRESOLVED.
- **Copy-version test 36**: `make-test-build` accessible description expected
  `/version 0\.1\b/` — a version-string mismatch; spec 115 touches no
  versioning. Not triaged.
- **Crash-chunk test 37**: `#root` empty with the engine chunk blocked. Not
  triaged.
- **Carve test 9** (disabled Continue at docs): `survey-advance` disabled for
  240s at the welcome-paragraph step. Re-run with the text-sample dismiss
  helper in place.
- **Derived-keyboard 48 + fallback-policy 51**: both stall at/after the touch
  step ("Choose your touch layout starting point"). Re-run in the
  verification batch.
- **Tab-roundtrip test 35**: `page.waitForFunction` timed out (15s) on the
  Trial step. Not triaged.
- **Touch seed-source-preview ×3** (grid-a11y 41, layer-switch 47,
  mode-toggle 48): `getByTestId('seed-source-preview')` not found in 15s.
  The touch preview is untouched by this branch (no diff in touch/preview
  files); plausibly a slow KMW iframe load under contention — the
  verification re-run decides.
- **Light-theme-a11y test 10** (axe): the axe scan itself passed; the failure
  is 3× `history.replaceState` errors — `replaceState` called while the
  document URL is still `about:blank` (boot-timing race, not a data issue).
- **Journey-strip-badges test 3**: 240s timeout at the "Help documentation" /
  "French Basic" docs phase, waiting for "Survey complete". Not triaged.

### Verification batch results (2026-11-11, log `e2e-verify.log`)

**32 passed, 20 failed, 1 skipped, 20 did not run** (58.4m). The 20
"did not run" are the serial-describe cascade (switch-base matrix L7 failure
skipped the rest of that describe).

Fixed and VERIFIED in this batch:
- Browser-back (fix #13): passing.
- Carve test 9 (text-sample dismiss): passing.
- Journey-strip-badges test 3 (240s docs timeout in batch A): passing —
  flake/load, not a defect.
- Criteria 43+44, copy-edit 25, decision-store-reload 47, exemplar-prefill
  49+50 (Q4 fix): passing.
- Switch-base matrix L1–L6 (track-radio → attribution fix): passing; the
  L3 failure that cascaded batch B's 28 "did not run" is gone.

Fixed AFTER those specs ran in the batch (need a re-run to verify):
- Locale-switch test 29: `navBar` fix worked (locator resolves now), but the
  assertion still failed — `nav.compare`'s French is "Comparer" (real
  translation in fr/messages.json:1737), so the test's fallback-to-English
  premise is stale. Expectation updated to `/^Comparer$/` (the test's real
  point — never the retired `nav.preview`'s "Aperçu" — still holds).
- Switch-base-rebase F1: the attribution fix worked (past the track radio),
  but the draft-key assertion failed — the draft version is v2 on main
  (`draftPersistence.ts:132`, unit test pins `ks.draft.my_kbd.v2`), so the
  test's v1 expectation is stale. All 5 sites updated v1→v2.

Still failing, all pre-existing-candidate (main-baseline run in flight,
worktree `~/workspace/ks-main-baseline` on main `e06631e5`, dev server on
port 5274, log `/tmp/baseline-e2e-a.log`):
- OAuth `#root` empty ×4 (boot-smoke 3+4, light-theme 24+25) — consistent
  across runs 1, re-run, batch A, verification.
- Copy-version 11: `make-test-build` not found — page landed on Publish, not
  Trial. (Run 1's test 36 found the button; the state differs between runs.)
- Crash-chunk 12: `#root` empty with the engine chunk blocked (test 13 in
  the same file passed).
- Decision-log 14: `invisibles-inventory` 0 live entries (reproducible).
- Derived-keyboard 15: `survey-back` never appears on the touch seed step
  (`usePublishStepNav` publishes Back only when `onBack` is defined).
- Fallback-policy 16: stuck on the touch seed step — the test drives
  mechanisms → fallback directly, but the flow now inserts the touch seed
  step between them.
- Golden walk 17: 20-min timeout at the purpose question (empty required
  textbox, Continue disabled). The re-run's golden walk DID complete the
  full walk on this branch, so this is a flaky pre-fill, not a branch block.
  The `.js`/`.kmx` diff question still needs a completed walk + the walked
  zip (temp edit in `golden-walk.spec.ts` writes it to
  `/tmp/golden-walked.zip` — revert before commit).
- Light-theme-a11y 26: 3× `history.replaceState` pageErrors (boot-timing
  race: `replaceState` while the document is still `about:blank`).
- Open-existing 33+34: past the list selector now; stall at Publish — the
  `continueOpenWalk` helper's selector has no control matching the publish
  step's forward action, so the loop waiting for `#criteria` never advances.
- Switch-base L7 47: rules `rule#18`/`rule#20` missing after refresh at the
  carve-deleted level (empty array, 10s predicate timeout).
- Tab-roundtrip 69: `page.waitForFunction` 15s timeout on the Trial step.
- Touch seed-source-preview ×3 (grid-a11y 70, layer-switch 71, mode-toggle
  72): `getByTestId('seed-source-preview')` not found in 15s. The touch
  preview is untouched by this branch (no diff in touch/preview files).

### Baseline run (main `e06631e5`)

Worktree `~/workspace/ks-main-baseline`, `pnpm install` done (8.8s, store
cache), dev server on port 5274 (playwright.config.ts scratched to 5274 in
that worktree only — never commit it there), batch A log
`/tmp/baseline-e2e-a.log`: boot-smoke, decision-log, derived-keyboard,
fallback-policy, copy-version, crash-engine-chunk-blocked,
open-existing-keyboard, tab-roundtrip, touch-key-grid-a11y,
touch-key-layer-switch, touch-mode-toggle, locale-switch. Golden walk +
switch-base matrix follow as batch B. The baseline decides, for each
still-failing test above, whether it fails on main too (pre-existing) or
only on the branch (regression).

### Baseline verdicts (main `e06631e5`, worktree `~/workspace/ks-main-baseline`)

Baseline run A3 (log `/tmp/baseline-e2e-a.log`, lost to the 11:39 UTC VM
replacement — the verdicts below were read live from that log before the
wipe; run A4 re-confirms them, log `baseline-e2e-a.log` in this dir):

- **Copy-version: FAILS ON MAIN** (pre-existing). Same `make-test-build`
  failure as the branch.
- **Crash-chunk test 12: FAILS ON MAIN** (pre-existing). Same `#root` empty.
- **Decision-log test 46: FAILS ON MAIN** (pre-existing). Same
  `invisibles-inventory` 0 live entries — the gap is in main's gallery
  decide/recording path, not a spec-115 regression.
- Boot-smoke 1–4 in A3 ran during a broken-import window (the fresh
  baseline worktree lacked the engine build + the git-ignored
  `charnames.generated.json` codegen artifact + the keyboard-lint build),
  so those four results are INVALID and are re-run in A4. Baseline setup
  notes: `pnpm install` (8.8s, store cache); build engine, glottolog,
  `@keymanapp/keyboard-lint`; copy `charnames.generated.json` +
  `exemplars.generated.json` into both
  `packages/engine/src/character-discovery/generated/` and
  `packages/engine/dist/character-discovery/generated/` (tsc does not emit
  the dynamically-imported charnames JSON); vite on port 5274
  (playwright.config.ts scratched to 5274 in that worktree only).
- Main moved during the baseline: #2654 merged 11:07:36Z as `956d6490`
  (docs-only index.html change), so the final rebase target is `956d6490`,
  not `e06631e5`. The #2653 merge (e06631e5) has no full CI verdict (its
  run was cancelled, superseded by #2654).

### Baseline verdicts, run A4 (main `e06631e5`, log `baseline-e2e-a.log`)

**9 passed, 17 failed (20.9m).** Every test that failed on the branch and was
run on the baseline ALSO fails on main — all 17 are pre-existing, none is a
spec-115 regression:

- OAuth `#root` empty ×2 (boot-smoke 3+4) — main's app boots fine (tests
  1, 2, 5, 6, 7 pass); only the oauth callback route fails to paint.
- Copy-version 8, crash-chunk 9, decision-log 11, derived-keyboard 12,
  fallback-policy 13 — all fail on main with the same errors as the branch.
- Locale-switch 14 + 16 — fail on main with the same English-`navBar`
  locator (14) and the same `/^Compare$/` vs "Comparer" (16). The branch's
  fixes (ancestor-nav locator, "Comparer" expectation) address main's
  staleness, not a branch regression.
- Open-existing 18, 19, 20, 21 — fail on main (the stale `+ p +` selector
  at 18/19; the tail/continue-waiter at 20/21 — on main they fail at the
  selector, on the branch they get past it and stall at Publish).
- Tab-roundtrip 22, touch seed-source-preview ×3 (23, 24, 25) — fail on main.

Not covered by A4 (separate runs): golden-walk (branch re-run for the
`.js`/`.kmx` zip diff + baseline run), switch-base matrix L7, light-theme-a11y
test 10 (replaceState boot race — environmental; its oauth part is covered
by boot-smoke oauth, pre-existing).

### Golden walk — root cause + baseline refresh (2026-11-11)

The `.js`/`.kmx` diff is a **spec-115 Phase 6 change, not a regression**:
spec-115 commit `fc3bfa37` (2026-11-10, T030–T037/T065–T072) changed
`buildOutputBundle.ts` to compile as a RELEASE build
(`{ saveDebug: false }`), with the comment that kmc-kmn defaults to
saveDebug, "which ships store names, line numbers and a pretty-printed
.js. A shipped package must match what Keyman Developer builds from the
same source." The baseline (`basic-kbdfr-copy.zip`, captured 2026-11-05,
commit `bd6a82ad`) predates that change, so it carries DEBUG-mode output:
pretty-printed 96,166-byte `.js` (with the `var modCodes`/`var keyCodes`
preamble) and a 10,574-byte `.kmx` with debug store names/line numbers.
The branch's walk produces RELEASE-mode output: minified 34,581-byte
`.js` (no preamble) and a 9,298-byte `.kmx`. The `.kmn` and `.kps` are
byte-identical — the source is unchanged; only the compile mode changed.
Same kmc version (19.0.240-alpha) at capture and now, so it is not a
version drift. The golden walk PASSES on main (baseline batch B, test 1)
because main still compiles in debug mode (it lacks `fc3bfa37`).

Resolution: the baseline was re-captured from the branch's completed walk
(`/tmp/golden-walked.zip`, 189,641 bytes — the exact buffer the test
produces, written by a temporary test edit that has since been reverted).
Full zip comparison: 30 files, name sets equal; only 4 entries differ —
`build/test.js`, `build/test.kmx` (the saveDebug mode change),
`.studio/decision-record.json` (decision records; the test compares it as
JSON only) and `HISTORY.md` (same length; the test normalizes its date).
The golden walk was re-run against the refreshed baseline (log
`e2e-golden-confirm.log`).
