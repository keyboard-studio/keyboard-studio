# #2302 walk — summary (raw observations)

Method: Playwright CLI (fresh named session per case) driving the ks-2302-walk dev build @ d273b398 (PR #2303) through the survey into the mechanisms gallery.

Coverage: 32 cases — PASS 2, FAIL 0, BLOCKED 18, NOT-ATTEMPTED 12. Both PASSes are on-diagonal Bafut/basic_kbdus walks completed end to end (P1×unwrap, P4×unwrap). One further case (P2×unwrap, Ewondo/basic_kbdfr) finished every station through rules, then was cut off in the gallery by an environment restart (result rebuilt from phase logs). No off-diagonal case completed, so no FAIL was recorded — off-diagonal evidence is structural (below).

Blocks by cause:
- Cameroon bases, 8 of 16 blocked in phase 1, most at base selection: after the base card was picked, confirm stayed disabled showing "Preparing preview…" beyond the walk's 120 s wait, so the Copy-track radio never appeared; the same step armed in seconds for both basic bases. Two camqwerty cases passed later with a warm server; one then stalled in the marks series (next item). The dev server died twice under load (HTTP 000, one page crash), ending several attempts mid-phase.
- Marks-series stalls, 4 cases: after a station's Continue was pressed, no known station or footer rendered for 35 s+. In the Ewondo cases attachment, treatment and output-form were already recorded; the stall followed output-form/stacking. In one Bafut-camqwerty case it followed attachment (rows pre-ticked from the confirmed sample).
- Driver fragility under load, the rest: click/navigation waits timing out on steps that had in fact advanced (snapshot-verified twice); cold-start waits after restarts.

Profiles:
- Input order was offered and selectable in every marks series reached (5 cases); read-back matched the case's profile in all 5.
- Output form was offered and selectable in all 5: the proposal followed input order only (postfix → "separate characters (suggested)"; prefix → "one single ready-made character (suggested)"). In the P4 walk the ready-made proposal was overridden to base-plus-mark; it stuck. The premise quoted the author's own combination with code points ("á — U+0061 + U+0301").
- No independent backspace control appeared in any output-form record (`otherControls` empty in all 3 full records; rules-step text never mentioned backspace). Each form option carried its own `backspace-preview`: base-plus-mark "à ⌫ a ⌫ (empty)" (mark first — unwrap), ready-made "à ⌫ (empty)" (whole stack).
- A text-sample prompt ("Which letters do these marks go on?") gated the marks series whenever the alphabet carried unattested marks; a pasted sample produced a 41-character proposal whose confirmation pre-ticked attachment rows.

#2300 observations (2 completed walks + partial visits):
- Rationale lines rendered under the provenance line, e.g. "ɨ goes on AltGr + the i key — mainly because 3 keyboards do this; also its upper and lower case sit together"; G2 line: "’ goes on the ' key — but ' is part of your alphabet too. Without frequency data, neither can be ranked first…".
- The displacement banner fired in the wild: (a) both-core pairs (’, “, ”) → "Keep both" default naming the missing frequency data; (b) combining grave taking the 5 key → "Move 5 to AltGr + 5…"; (c) the overwrite probe in both completed walks: ŋ onto K_X produced verbatim "ŋ took the x key from x. Move x to AltGr + x so you can still type it? Leave it and x will no longer be typeable from that key." — the walk confirmed the move.
- Fallback letters were offered and kept as proposed wherever reached: Bafut/basic_kbdus c p q v x; Ewondo/basic_kbdfr c j q x.

Standing (Matthew's rulings, 2026-10-19): this matrix is a manual/periodic instrument, NOT an automatic-CI gate — no workflow, e2e-suite or test-script wiring. Harness, scripts and results are committed as the work goes to branch `km/2302-testing-profiles-walk` under `tools/testing-profiles-2302/`; the repo copy carries results.md/results.json and per-case case-result.json — bulky raw snapshots and phase logs stay only in the notes copy.

## ROUND 2 — 2026-10-20, vs main `ed251e1b` (PR #2312 merged; PR #2303 not in this tree)

Coverage: 32 cases — PASS 3, FAIL 0, BLOCKED 10, NOT-ATTEMPTED 19 (13 attempted). PASSes completed end to end: P2×unwrap (Bafut/kbdus), P4×whole (Bafut/kbdus), P2×whole (Ewondo/kbdfr).

Backspace question (#2312) in the wild — observed in 7 completed output-form visits:

- The section renders in its own terms in every visit ("What should backspace do to an accented letter?"), below the composition question, and the proposal followed the composition in all 7 (NFD → "removes one mark at a time"; NFC → "removes the whole letter at once"); the pre-selected default matched the proposal in all 7.
- Overrides stuck in all 5 cases that took one (read back at the station and after advancing).
- The preview matched the backspace answer, not the composition, in all 7: whole-stack showed "à ⌫ (empty)" (1 press), peel showed "à ⌫ a ⌫ (empty)" (2 presses) — including off-diagonal pairings.
- Per-combo verdicts (S4 record; completion where reached): P1×whole — proposal peel, override to whole, preview matched; blocked later (guard stall). P2×unwrap — complete PASS, override stuck. P3×unwrap — proposal whole, override to peel, preview matched; blocked later (post-output-form stall, attempt 3). P4×whole — complete PASS, override stuck. P2×whole — complete PASS on the on-diagonal default. P3×whole — on-diagonal default confirmed, preview matched; blocked later (stacking stall). P1×unwrap, P4×unwrap — not re-attempted on kbdus (round-1 PASSes stand); kbdfr attempts stalled pre-output-form.

Generated behaviour, where the rules step was reached (3 cases):

- NFC + peel (P2×unwrap/kbdus): the rules step listed `any(generated_marks_unwrap_from) + [K_BKSP] > index(generated_marks_unwrap_to, 1)`.
- NFD + whole (P4×whole/kbdus): 10 generated rules of the form `U+0041 U+0300 + [K_BKSP] > nul`, commented "generated: whole-stack backspace (marks series)".
- On-diagonal P2×whole/kbdfr reached the rules step with no backspace-generated rules, consistent with native behaviour needing no extra code.

Dominant block — marks-series advance stalls: in 9 of 13 attempted cases the series stopped advancing after a station's Continue (attachment ×5 incl. 2 serial re-runs of one case, guard ×2, stacking ×1, output-form ×1); the gallery then never opened. Stalls occurred on both languages, both basic bases and the Cameroon base, in parallel and serial lanes, warm and cold; three series completed end to end. Round 1 saw the same shape in 4 cases on the dev build. Remaining blocks: one renderer crash in phase 1 (P3×unwrap/kbdfr), one phase-2 entry timeout (P1×whole/kbdfr attempt 2; its attempt-1 record stands as the case evidence), two attempts lost when environment restarts killed the dev server and lanes.

Cameroon wall verdict: on a warm, idle, single-lane server, sil_cameroon_qwerty phase 1 completed cleanly in ~73 s — base picked by card, preview armed within normal waits, alphabet reached, no errors; the round-1 "Preparing preview…" wall did not reproduce under these conditions. That case then stalled after attachment like the basic-base cases. sil_cameroon_azerty was not attempted (time-box); its round-1 wall evidence stands untested under warm/idle conditions. p4-unwrap-ewondo-kbdfr's evidence directory was wiped by a duplicate run killed before commit; its status comes from the walk log and contemporaneous reads (harness/round2-overrides.json).

# ROUND 3 — completion round (vs origin/main 2698f774: #2300 + #2312 + #2316)

Method unchanged: Playwright CLI, fresh named session per case, serial lanes; dev server from a fresh worktree at 2698f774. All 32 cases were attempted in this round (29 targeted cells plus re-runs of the 5 cells that already held passes, so every cell carries a round-3 verdict on the full tree).

The stall did not recur. All 10 round-2 BLOCKED cells — the 9 series-stall cells and the phase-1 pick-base failure — walked end to end with zero phase errors; the two cases that had stalled twice before (p1-whole-bafut-kbdus, p3-unwrap-bafut-kbdus) completed in about 4.5 minutes each, and no case in any lane stopped advancing after a station's Continue. The 17 never-attempted cells also completed, including the full sil_cameroon_azerty quadrant (8/8) on warm conditions; Cameroon phase 1 armed within normal waits throughout, and the round-1 "Preparing preview…" wall again did not appear.

Backspace behaviour repeated round 2's pattern at full coverage: the question rendered at S4 in all 32 cases, the proposal followed the chosen composition in all 32 (NFD → peel, NFC → whole-stack), overrides were selected in the 16 off-diagonal cells and read back stuck in all 16, and the preview matched the recorded answer in all 32. At the rules step, backspace-rule hits patterned by answer across bases: whole-stack answers on NFD showed 10 hits (the generated whole-stack rules), peel answers showed 3 (the unwrap/native idiom entries).

#2300 in the wild (this tree is the first with all three fixes): the ŋ-onto-K_X overwrite produced the displacement banner in 11 cases ("ŋ took the x key from x. Move x to AltGr + x so you can still type it?…"), and 64 gallery characters carried suggestion text with weighted rationale lines, e.g. "ɨ goes on AltGr + the i key — mainly because 3 keyboards do this; also its upper and lower case stay together. Nothing you use had to move." On Cameroon bases the gallery worklist was frequently empty (emptyDiff) because the base already produces the inventory; the overwrite probe had nothing to exercise in those cells. Fallback letters were kept as proposed wherever the stations offered them.

Environment losses, disclosed: two service restarts killed the dev server and the running lane mid-case (p1-whole-ewondo-kbdfr attempt 1, p1-whole-bafut-camqwerty attempt 1); both cases were re-run clean and their committed evidence is the re-run. A pre-walk smoke attempt failed on an unbuilt workspace package in the fresh tree (environment setup, before any case ran); it is not counted anywhere in the table.

**FINAL reconciled counts (32 cells): PASS 32 · FAIL 0 · BLOCKED 0 · NOT-ATTEMPTED 0.** Round-3 counts are identical: PASS 32 of 32.

Keyboard package .zip files for these runs live on the throwaway branch `km/2302-walk-zips` under `tools/testing-profiles-2302/zips/` (index: `zips/INDEX.md` on that branch).

## ROUND 4 — 2026-11-03, vs origin/main `7c411dad` (modern tree: #2449 touch-builder, #2447, PR #2388 #2374 guard removal, #2321 walk-instrument sync)

Method unchanged: Playwright CLI, fresh named session per case, serial lanes; dev server from fresh worktree ks-2302-walk4 @ 7c411dad. All 32 cases walked; results.md gains round-4 columns, round-3 records preserved under `round3/`.

**FINAL reconciled counts (32 cells): PASS 32 · FAIL 0 · BLOCKED 0 · NOT-ATTEMPTED 0.**

Product deltas vs round 3, all as expected from merged work:
- **GuardStation is gone** (PR #2388, the #2374 binding ruling): the marks series now runs attachment → treatment → output-form → stacking (context-tolerance transient where it fires). No `guard-station` rendered in any of the 32 walks; the harness's guard branch stayed inert and needed no changes.
- **Per-mark 'at the start of a line' boxes** now sit in the attachment section (same ruling): copy reads "Leave 'at the start of a line' unticked and this mark is blocked after a space at line start". The walk left them unticked (swallow default) in all 32 cases.
- **Backspace axis intact**: question rendered 32/32, proposal followed composition 32/32 (NFD→peel, NFC→whole-stack), recorded answer stuck 32/32 including all 16 off-diagonal overrides, preview matched the answer 32/32.
- **#2300 in the wild**: the ŋ→K_X overwrite displacement banner fired in 16 cases; 104 gallery characters carried weighted rationale lines.

Issues encountered (all environment or harness; zero product defects):
1. **Missing Chromium for the CLI** (environment): the VM's `~/.cache` had been wiped since October, so `@playwright/cli` had no browser (it wanted build 1252; only 1228 remained). `install-browser` failed twice — cdn.playwright.dev dropped the 194 MB download near 90%. Fixed by fetching the headless-shell zip directly with curl (resume+retry) and extracting it to the expected `chromium_headless_shell-1252` path. Lesson: `~/.cache` is ephemeral; budget a browser install after any VM replacement.
2. **Transient EPERM write denials** (environment, ~19:21–19:55): `writeFileSync`/`npm exec` intermittently failed with `EPERM: operation not permitted` in minutes-long bursts while shell writes to the same paths succeeded — no immutable flags, no quota issue, writes fine from fresh execs between bursts. It killed 7 lane-C cases at startup and stalled the retry loop for ~30 min. No root cause established (not path-, process- or user-specific in any reproducible way). Handled with a retry wrapper (`harness/run-lane4r.sh`: per-case retry with 60 s backoff until `case-result.json` exists clean); no case evidence was lost.
3. **/tmp wiped + dev server died mid-run** (environment): the tmpfs was remounted empty around 19:50, taking all lane logs; the vite dev server died with it. Workspace, browser install, and committed evidence were untouched. Server restarted; lane logs now also mirrored under `~/workspace/keyboard-studio-notes/2302-walk/`.
4. **Studio `tsc -b` OOM** (environment/toolchain): `pnpm -r build`'s studio step crashed with SIGABRT under the default Node heap (masked at first by piping through `tail`, which swallowed pnpm's exit code). With `NODE_OPTIONS=--max-old-space-size=8192`, `tsc -b` passes clean (exit 0) — no type errors on the modern tree. Lesson: never pipe a build through `tail` when you need its exit code.
5. **One flaky punctuation click** (harness flake, not product): `p4-whole-ewondo-kbdfr`'s first attempt timed out 30 s on `punctuation-done` stuck at "scrolling" with the button visible/enabled/stable. Re-ran the case once: completed clean, zero errors. Recorded here as a single-attempt flake.
6. **Results-builder bug** (harness, mine): `build-results4.mjs` omitted `round3: r3` on the attempted-case push → TypeError on `r.round3.status`. Fixed; builder now emits all four round columns.

One lane-runner stall of note: the sequential `/tmp/r4-all.sh` loop died after lane C (7 cases lost to issue 2, no lane-C commit, lane D never started) — the retry wrapper's lane E re-ran all 15 remaining cells clean.
