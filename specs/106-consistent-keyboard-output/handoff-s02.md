# Handoff: S-02 deadkey purpose, escapes, composed row (+ #2302 zip re-run)

Date: 2026-10-29. **Historical.** The S-02 work described here is committed and open as PR #2358. Open issue 1 became spec 106 US4, issue 2 became US7 (T060), issue 3 became gate G6, and the item 5 walk re-run became US8. Kept for the walk-harness notes in section 5.

## TL;DR

- **The bug:** the #2302 zip walk showed the Mechanism Gallery stacking several deadkeys on one trigger (`+ [K_COLON] > dk(3003)`, `dk(3004)`, `dk(3005)` …), where only the first can fire.
- **What's built:** a fix plus three follow-ups, all on branch `km/s02-deadkey-purpose` (cut from `origin/main` at `aa55594e`). The follow-ups are deadkey escapes, the composed-character section, and the trigger-then-space escape.
- **State:** nothing is committed or pushed. Tests and lint are green.
- **What's left:**
  1. Unreachable starting-keyboard rules: a carve fix is proposed, not built.
  2. The Rules demo pane dumps raw diagnostic codes.
  3. A touch-layout "lost keys" report that needs the user's session zip.
  4. The paused 32-case zip re-run.

## Working state (exact)

| Thing | Where |
|---|---|
| Fix branch (uncommitted) | `D:\Github\_Projects\_KM\keyboard-studio`, branch `km/s02-deadkey-purpose`; upstream **unset** (it was cut from `origin/main`). Push with `git push -u origin km/s02-deadkey-purpose`. |
| Walk/harness branch | `D:\Github\_Projects\_KM\ks-2302-main` (a worktree), branch `km/2302-walk-zips`. Uncommitted harness edits are applied there; see below. |
| Stash | `stash@{0}` "2302 harness: carve-suggested discard, win32 shell, zip path, headed". It's already applied in `ks-2302-main`; drop it once those edits are committed. |
| Dev server | Vite on **http://localhost:5273/**, serving the fix branch from `keyboard-studio/packages/studio`. It hot-reloads. If you restart it, kill any stale vite on 5273 first. A stale one survived a stop earlier. |
| Latest test zip | `ks-2302-main\tools\testing-profiles-2302\zips\p1-whole-bafut-kbdus.zip` (built from the fix branch). |
| Untracked noise in fix repo | `tools/testing-profiles-2302/{.playwright-cli,evidence-zips,zips}/`. These are leftovers from the walk branch; don't commit them on the fix branch. |

The user asked to **explore the zip before any commit/PR**. Don't commit until they say so.
When they do: "commit" means commit **and push**, on the feature branch only, never `main`, never a force-push. Open a PR; never merge it.

## User rulings (treat as decided)

1. **One deadkey per purpose.**
   - A deadkey's purpose is the combining marks the character adds, i.e. its NFD marks: ǎ ě share the caron deadkey.
   - Characters with no mark (ɛ Ɛ Ɔ) share a single "variant" deadkey.
   - Model: `basic_kbdusx`, which has one deadkey per accent; ç rides the acute deadkey.
2. **Each deadkey gets its own trigger.**
   - Propose the trigger of the deadkey with the same purpose. Otherwise propose the next free one of `;` `[` `]` `` ` ``.
   - "Free" means not used by a session deadkey, not used by a starting-keyboard deadkey, and not a bare key reassigned this session.
3. **Punctuation triggers are fine as long as the punctuation stays typeable.**
   - Model: `sil_cameroon_qwerty`, where `;` is the deadkey and `;` can still be typed by double-tap, `;`+space, or AltGr+`;`.
4. **Confirm the escapes when a deadkey is first placed, and remember the choice.**
   - UI: a banner shown after placing (the user chose this over inline-in-card).
   - The first deadkey defaults to all three escapes.
   - Each later new deadkey starts from the last choice.
5. **Composed characters** the marks step decided are typed from their parts:
   - They're **not placed** in the walk ("only place complete combinations if that was decided earlier").
   - They're shown in a **collapsed section**, with a yellow `!` until they're reachable.
   - "Complete/reachable" = **one or more paths**: either the composed character itself, or the decomposed base plus every mark, each typeable.
6. **Touch is out of scope for deadkeys.** Touch already turns deadkeys into standalone diacritic keys or long-press bundles.

## What's built (uncommitted, branch `km/s02-deadkey-purpose`)

### 1. One deadkey per purpose
- **New pure module** `packages/studio/src/editors/assignLoop/deadkeyPurpose.ts`:
  - `deadkeyPurposeOf` and `sessionDeadkeys`;
  - `proposeS02TriggerKey`, which follows the order in ruling 2;
  - `s02BaseClash`: "trigger + base already types X".
- **`MechanismGallery.tsx`:**
  - `resolveS02DeadkeyIdentity` **reuses** the id of a session deadkey already on the resolved trigger. The engine's existing same-name merge then folds the pairs into one store pair.
  - On each character change, the reset effect sets the trigger from `proposeS02TriggerKey`, reading its inputs through a ref so it doesn't re-fire on every assignment.
  - The S-02 suggestion accept re-proposes using the suggestion's own base letter while the author hasn't touched the trigger. On a clash it falls back to the prefilled card.
  - The deadkey card blocks Apply on a base clash and shows the inline message `editor.assignLoop.deadkey.baseClash`.
  - The demotion deadkey fallback (`buildDemotionAssignment`) proposes its own trigger and refuses on a clash.
- **Result in the Bafut kbdus zip:** `;` → caron `dk(3000)`: a A e E → ǎ Ǎ ě Ě. `` ` `` → variants `dk(3001)`: e E O → ɛ Ɛ Ɔ. `“`/`”` stay on `[`/`]`.

### 2. Trigger escapes (double-tap / space / AltGr)
- **Pattern** `content/patterns/desktop-input/deadkey-single-tap.yaml`:
  - Added `dk(..) + [K_SPACE] > '{{accentChar}}'` in both `kmnFragment` and `skeleton.kmn_template`.
  - Added a test vector.
  - Updated the description; the en/fr content catalogs were regenerated.
- **Engine** `packages/engine/src/pattern-apply/applyAssignments.ts`, new `applyDeadkeyEscapes`:
  - A new optional slot `escapes` holds space-separated tokens (`double-tap`, `space`, `altgr`).
  - A double-tap or space line whose token is absent is dropped.
  - `altgr` appends `+ [RALT trigger] > U+XXXX`.
  - **No `escapes` slot = unchanged legacy output** (double-tap + space).
  - The merge carries `escapes` through.
  - The pattern template itself is deliberately untouched, because the recognizer's S-02 rule and the touch scaffold also read it.
- **Gallery:**
  - A new trigger's first placement records `escapes` from `rememberedDeadkeyEscapes`, which reads the last `escapes` in the session and defaults to all three.
  - `altgr` is dropped if AltGr + trigger is already occupied.
  - The placement raises `DeadkeyEscapesBanner.tsx`. Its checkboxes edit the slot live via `handleEscapeToggle`.
- **Identity:** `useCasePairCompanion` and `useDisplacementProposal` gained `rebase(from, to)`. Both hold `baseAssignment` by object identity, so they must be re-pointed when a toggle replaces the assignment.
- **Superseded:** an earlier iteration raised the displacement ("Move ; to AltGr") banner for trigger keys and recorded a separate S-08 assignment. Both were removed: the escapes banner replaces the first, and putting AltGr inside the deadkey fragment means removing the deadkey removes its escapes.

### 3. Composed-character section in the strip
- **`parts/CharScrollStrip.tsx`:**
  - New optional prop `composedSet`.
  - The chip render was extracted to `renderChip(c, pendingRow)`.
  - Composed chips render in a native `<details>` (collapsed by default). The summary is "Composed characters (N) — …" plus a yellow `! N` when any are unreachable.
  - Inside, an unreachable chip's badge is a yellow `!` (`char-scroll-badge-pending-<hex>`) instead of a red 0.
  - Reachability is the existing `getProducerBadge` `count >= 1`. `composableComponentsFor` uses full NFD, so stacked marks need every part.
  - The comment that once said amber is never used on chips was updated: amber is now reserved for this pending state.
- **`MechanismGallery.tsx` passes** `composedStripSet`: the `useTreatmentFilteredChars()` members with >1 NFD codepoint (lone marks stay on the main row). Those characters were already unselectable and outside `lettersToAdd`, so Next/Continue gating is unchanged.
- **i18n:** all new strings have en and fr catalog entries. Named placeholders only (`composedCount`, `composedPendingCount`).

### Verification (all on the fix branch)
- `pnpm lint`: 0 errors. The warning count is at its baseline of 389; none come from new files.
- Engine vitest: 4391 passed. Studio vitest: 10034 passed.
- `useKeyboardArtifact.contextTolerance.test.ts` is **flaky** (it failed 1 run in 3 in isolation; that file is untouched by this branch).
- Harness run of `p1-whole-bafut-kbdus` (headed) produced the zip above. The engine compile of that zip gives 14 hints, all `KM_HINT_KMCMP_3154094` (see open issue 1).

## Open issues / next steps

### 1. Unreachable starting-keyboard rules (proposed, not built). Next up if the user agrees.
- **Code:** `KM_HINT_KMCMP_3154094` = `0x3020AE` = kmcmplib `HINT_UnreachableRule`.
- **Cause:** `projectWorkingCopyVfs.ts` runs **carve (step 1) before assignments (step 2)**. Assignments are prepended by `applyAssignments` (merge-by-group, never deletes). So a starting-keyboard rule such as `+ [K_COLON] > U+003B` survives carve (its output is needed), then gets shadowed by the injected `+ [K_COLON] > dk(3000)`.
- **Harness zip:** 7 such rules, each reported twice (one per compile pass): x, `;`, `` ` ``, `[`, `]`, `'`, 5.
- **The user's own session reported 368.**
- **User's framing:** carve is supposed to clean out rules with unneeded outputs *and inputs that no longer exist*.
- **Proposal:**
  - In the carve projection, derive the session's claimed inputs from the assignments:
    - S-01 key + exact modifiers (from `kmnRules`);
    - S-08 combos;
    - S-02 bare trigger keys, plus `RALT trigger` when the `altgr` escape is on.
  - Drop any starting-keyboard rule whose entire context is exactly one claimed vkey+modifier set: no preceding context, no deadkey, no `if()`.
  - Compute this fresh on every projection, not stored as discards, so undo is automatic.
  - Leave contextual rules alone.
- **Tests:**
  - plain override drops the base rule;
  - a Shift-only difference is kept;
  - a contextual rule survives;
  - removing the assignment restores the rule;
  - the harness zip ends with zero unreachable hints.
- **Helper:** `assignmentSlotKeys` / `mechanismSlotEntries` in `packages/studio/src/survey/slotOccupancy.ts` already parse S-01/S-08 slots. Deadkeys are not included there, by design.

### 2. Rules page shows raw diagnostic codes
- **Where:** `packages/studio/src/components/rules/DemoPane.tsx:435-441` renders "Compiled with N warning(s): <codes>" (pre-existing on main).
- **Unused helper:** `packages/studio/src/lib/plainDiagnosticMessage.ts` already maps `0x20ae` to friendly copy, but the pane doesn't use it.
- **The user:** "I don't know what they are and the user can't fix them."
- **Fix:** hide hint severity, or render plain-language messages. Fixing issue 1 removes most of them anyway.

### 3. "We lost some real keys" (touch), unreproduced
- **The report:** the user's screenshot (phone-size touch layout, Bafut) is missing w t y u p, d f h and b, all of which are in Bafut's alphabet.
- **Harness zip:** its tablet default layer is complete.
- **Branch:** nothing on this branch changes touch output. `CharScrollStrip` is shared with `TouchGallery`, but with `composedSet` omitted it renders as before.
- **Next step:** ask the user for their session's source .zip (Output tab → "Download source .zip"), and which screen the screenshot came from (it looks like the touch gallery's key view).

### 4. Commit plan (when the user approves)
Commit on `km/s02-deadkey-purpose`, push, and open one PR against `main`:
- **Commit 1:** `fix(studio): one deadkey per purpose in the mechanism gallery`. Covers the trigger proposal, id reuse and base-clash guard, plus the space escape in the pattern and the engine `escapes` slot, escapes banner and `rebase`.
  - If the reviewer prefers, split this into a fix + a feat. Title style is `<prefix>(<area>): …`, and no issue numbers in code.
- **Commit 2:** `feat(studio): composed characters in a collapsed strip section`.
- **Phonebook:** `basic_kbdusx` and `sil_cameroon_qwerty` are referenced in comments. Both already have rows in `docs/keyboard-index.md`, so no edit is needed.

### 5. #2302 zip re-run (paused at the user's request until the deadkey fix lands)
- **Harness** (in `ks-2302-main/tools/testing-profiles-2302`, branch `km/2302-walk-zips`):
  - `scripts/phase2.template.js`: carve now clicks "Discard all N" on the *Suggested to discard* group (`carve-v2-suggested-toggle-all`) and records `carveSuggested`. Before this, Continue discarded nothing, which is the original complaint behind this whole thread.
  - `harness/run-zip.mjs`:
    - `shell` is set on win32 (`npm.cmd`).
    - The zip path is substituted as a JSON string (Windows backslashes had been read as escapes).
    - `WALK_HEADED=1` opens the browser visibly, for watching.
    - `WALK_BUILD` labels the build.
  - `.playwright/cli.config.json`: the Chromium path was changed to the local Windows install. **Don't commit this machine-specific path**; restore the original before committing, or make it configurable.
- **Batch run:** `bash harness/run-lane-zip.sh harness/lane-zip-{a,b,c}.txt {A,B,C}`, three lanes, 32 cases, against the server on 5273. Point the server at whatever build should be zipped (the fix branch, or `main` once merged).
- **Watch for:** the convenience step pre-checks "Keep c C / p P …" (Bafut) and "Keep c C / j J …" (Ewondo). Those letters therefore never become carve suggestions. Uncheck them in the harness only if the user wants them dropped.
- **Note:** the earlier lane-A start was aborted and its partial outputs reverted. The committed zips on `km/2302-walk-zips` are still the old (pre-fix, nothing-discarded) set, apart from `p1-*-bafut-kbdus` evidence that is modified in the worktree.
