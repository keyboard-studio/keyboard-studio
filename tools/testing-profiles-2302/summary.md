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
