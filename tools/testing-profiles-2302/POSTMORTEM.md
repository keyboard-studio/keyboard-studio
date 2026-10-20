# #2302 testing-profiles walk — postmortem

**Run:** Playwright-CLI sessions (one named session per case) against the PR #2303 build (`d273b398`, since merged to dev as `ef7dd229`). Harness, per-case scripts, `results.md`/`results.json` and per-case `case-result.json` evidence live beside this file on branch `km/2302-testing-profiles-walk` under `tools/testing-profiles-2302/`; bulky raw snapshots/logs are in the lead's notes copy (`keyboard-studio-notes/2302-walk/evidence/`).
**Standing (Matthew, 2026-10-19):** this matrix is a manual/periodic instrument, **not** an automatic-CI gate. Nothing here is wired into any workflow, e2e suite or test script.

## Coverage

32 cases (4 profiles × 2 backspace behaviours × 4 bases): **PASS 2 · FAIL 0 · BLOCKED 18 · NOT-ATTEMPTED 12.**

- Both PASSes are Bafut on `basic_kbdus`, on-diagonal unwrap walks completed end-to-end through the mechanisms gallery (P1×unwrap, P4×unwrap).
- One near-complete: P2×unwrap, Ewondo on `basic_kbdfr`, finished every station through rules; an environment restart cut its gallery.
- Cameroon bases: **0 completions** — 13 of 16 Cameroon cases blocked, 3 not attempted. Basic bases: 2 pass, 6 blocked, 8 not attempted.
- No FAIL was recorded: no case that completed contradicted its profile. The uncompleted majority is the story, below.

## Findings

**F1 — The backspace axis is not independent; the matrix's off-diagonal cells cannot be selected.** In all 5 marks series reached, input order and output form were offered, selectable, and read back correctly — and *no independent backspace control exists anywhere* (`otherControls` empty in every full record; the rules step never mentions backspace). Backspace behaviour is a property of the output-form choice itself, shown as the form's own preview at S4: base-plus-mark (NFD) previews "à ⌫ a ⌫ (empty)" — the mark peels off first, i.e. *unwrap*; ready-made (NFC) previews "à ⌫ (empty)" — the whole stack clears. So of #2302's 8 profile×backspace combinations, the 4 off-diagonal ones (P1×whole, P2×unwrap, P3×unwrap, P4×whole) are **not expressible in the studio today**: choosing the form chooses the backspace. This is evidenced structurally (5/5 series), not by a completed off-diagonal walk — none exists to complete.

**F2 — Cameroon bases stall at base selection in this environment.** 8 of 16 Cameroon cases blocked in phase 1, most at the same step: base card picked, then confirm stayed disabled on "Preparing preview…" past the walk's 120 s wait, so the Copy-track choice never appeared. Both basic bases armed in seconds. Two Cameroon cases passed the step with a warm server, and the dev server died twice under load (HTTP 000, one page crash) — so this reads as preview-preparation latency/timeout on the large Cameroon keyboards under load, not deterministic breakage. It needs a quiet-machine, headed-browser repro before it is filed as a product defect; the walk environment is a confound I am not hiding.

**F3 — Marks-series stalls after Continue.** 4 cases: a station's Continue was pressed and no known station or footer rendered for 35 s+. In the Ewondo cases, attachment, treatment and output-form were *already recorded* — the stall followed output-form/stacking. In one Bafut/Cameroon case it followed attachment (rows pre-ticked from the confirmed sample). Pattern is consistent enough to repro from the evidence snapshots.

**F4 — Throughput and driver fragility bound what this matrix can prove per run.** A single end-to-end case is a full survey plus a 57–63-character gallery; click/navigation waits timed out on steps that had in fact advanced (snapshot-verified twice). 12 cases were never attempted inside the run's time-box. As a manual instrument the matrix is sound; as a quick check it is not — budget a warm server, a quiet machine, and hours, or split the matrix by base across runs.

**F5 — #2300 (PR #2303) works in the wild.** In both completed walks and the partial visits: weighted rationale lines rendered under the provenance lines (e.g. "ɨ goes on AltGr + the i key — mainly because 3 keyboards do this; also its upper and lower case sit together"); G2 trade-off lines fired; both-core pairs (’, “, ”) raised the "Keep both" banner naming the missing frequency data; a combining mark taking the 5 key produced a confirmable "Move 5 to AltGr + 5…" demotion; and the overwrite probe in both completed walks — ŋ onto `K_X` — produced the displacement banner verbatim ("ŋ took the x key from x. Move x to AltGr + x so you can still type it? Leave it and x will no longer be typeable from that key."), and the walk confirmed the move. Proposed fallback letters were kept as proposed everywhere reached (Bafut/basic_kbdus: c p q v x; Ewondo/basic_kbdfr: c j q x). One behaviour worth naming: the ’-onto-' proposal arrived as *both-core*, because the author's confirmed alphabet (from sample text) contains ' — so the tier rule treats it as core orthography, not convenience. That is the 2026-10-19 demotion-direction ruling behaving as designed, and it means punctuation overwrites will often be both-core in practice whenever the sample includes the punctuation.

**F6 — The profile machinery itself is sound where reached.** Input order read back matched the case's profile in 5/5 marks series; the output-form proposal followed input order only (postfix → separate characters suggested; prefix → ready-made suggested — the #2297 ruling's behaviour); in the P4 walk the ready-made proposal was overridden to base-plus-mark and the override stuck; the S4 premise quoted the author's own combination with code points ("á — U+0061 + U+0301"). A pasted text sample gated and then pre-ticked the marks series as designed (41-character proposal).

## Specs and amendments bulldozed making this work

The #2300 build this walk exercised deviated from the following texts. Full log with verbatim citations: the km-lead Cycle 2 implementation report (`keyboard-studio-notes/2300-cycle2-implementation.md`, "Specs/amendments deviated from") and PR #2303's body. Classes: (a) consumption-layer only, (b) text now incomplete/needs amending, (c) retired ground re-occupied.

1. **Spec 007 §7.6 strict blending cascade** (= the 2026-06-11 v1.1.1 placement-priors amendment) — **bulldozed at consumption, class (a), with (b) debt.** The gallery now re-orders its chips by a weighted score whose precedence inverts the cascade (phonetic 25 > corpus 15; corpus ≥3 no longer "wins" — it is worth at most 15/100, and 3 on cross-type occupied slots under Matthew's Ñ/ẞ ruling). The producer cascade is untouched; §7.6's text now under-describes gallery behaviour and should be amended to name the consumption-layer ranking.
2. **Contracts `placementMap.ts` ordering invariant / `topCandidate` doc** ("consumers MUST NOT re-sort… re-sorting here would corrupt the blending precedence") — **class (a) with a (b) footnote.** The contracted array is never mutated; the gallery sorts its own derived chip list. The comment does not lie about the contract but is now incomplete about consumers; a follow-up comment amendment is owed.
3. **Spec 007 §7.6 base-key preservation as the final, unscored cascade step** — **class (a).** Replaced at consumption by the scored occupied-cost factor (20) + gate G2 + the G3 demotion flow; "never silently displace" is now honoured procedurally (chip wording + banner) rather than by ranking position.
4. **Spec 085 (retired 2026-10-14)** — **class (c), partial.** Its FR-A2 provenance-on-chip pattern is re-occupied and extended by the rationale line. Part B (adaptive basis) was **not** revived — denied, not bulldozed. Its Part A gate fix had already landed separately (PR #2066; the strict `>` gate is at `placementSeeds.ts:208`) — the 085 AS-BUILT is stale on that point, which is documentation debt in the AS-BUILT, not a deviation by this work. (An early draft of the deviation log claimed Part A was still open; km-synthesis caught that, and the log was corrected before this postmortem relied on it.)
5. **A7 spare-key-budget facet (spec 043 US2)** — **partially denied, class (a).** Its stated consumer (the §7.2 base selector) is untouched and uncontradicted; the plane-level budget is superseded per-key by the occupancy ledger for gallery ranking only.
6. **S-02 placement semantics (spec 007 §7.3)** — **confirmed gap, class (a).** The consumption score has no trigger-association factor (deadkey candidates score flat), and a demoted glyph's deadkey home uses the gallery's trigger state (default K_COLON), not the S-02 family-association table. Named as a follow-up, not papered over.
7. **Spec 075 punctuation defaults (retired, shipped PR #1769)** — **class (a) on (c) ground.** 075 never ranked its CLDR tier against its base-produced group; Matthew's core>convenience tiering (2026-10-19) is new law layered on its ground. Finding F5's both-core ’ behaviour is this layering meeting sample-derived inventories.
8. **Checked and NOT a deviation:** spec 007 §7.7's many-to-many assignment map vs the demote-incoming swap — the swap is author-confirmed and the incoming character keeps a mechanism, so criterion 18.6 coverage is preserved.

## Recommended follow-ups (proposals, not rulings)

1. **Decide the backspace question as a product matter:** if backspace-follows-form is the intended truth, #2302's off-diagonal cells should be closed as by-design and the profiles documented as four, not eight. If independent backspace choice is wanted, it is a spec (a question the marks series does not currently ask), not a bug fix.
2. **Repro F2/F3 on a quiet machine in a headed browser** (Cameroon preview-prep arming; post-output-form Continue stall) and file whichever reproduces; the evidence snapshots in `results.json` are the starting points.
3. **Re-run the 12 not-attempted + the blocked basic-base cases** with the committed harness on a warm server to complete the basic-base quadrant before drawing product conclusions from it.
4. **Amend §7.6 and the `placementMap.ts` comment** (items 1–2 above) so the texts stop under-describing shipped behaviour.

---

# Completion addendum — round 2 (2026-10-20, lead)

Round 2 ran the same harness against `origin/main` `ed251e1b` (PR #2312 merged — backspace as its own axis; PR #2303 is not on main and its absence was not treated as a regression). Full two-round table: `results.md` on this branch. **Round-2 counts: PASS 3 · FAIL 0 · BLOCKED 10 · NOT-ATTEMPTED 19** (cumulative completed passes across both rounds: 5).

## The round's question is answered: the backspace axis works

In 7 completed output-form (S4) visits on the basic bases, the restored question behaved exactly as designed:

- The question renders in its own terms, below the composition question, every time.
- The proposal followed composition **7/7** (NFD → peel, NFC → whole-stack), and the pre-selected default always matched the proposal.
- Overrides stuck **5/5**, read back at the station and after advancing — including the off-diagonal pairings.
- The preview was keyed to the backspace answer **7/7** (whole-stack: "à ⌫ (empty)"; peel: "à ⌫ a ⌫ (empty)").
- Generated behaviour matched the answer in all 3 cases that reached the rules step: NFC+peel emitted the `generated_marks_unwrap_from/to` BKSP rule; **NFD+whole emitted 10 whole-stack rules** ("generated: whole-stack backspace (marks series)") — the new generator working in the wild; on-diagonal NFC+whole emitted none (native).

Complete round-2 PASSes: P2×unwrap (basic_kbdus), P4×whole (basic_kbdus), P2×whole (basic_kbdfr) — two of the three are off-diagonal cells that could not exist before PR #2312. Four more cases completed S4 with correct backspace records and blocked later.

## The dominant block is now a filed defect, not a walk observation

9 of 13 round-2 attempts stalled the same way as round 1's F3: a marks station's Continue pressed, answers recorded, no next station within patience (attachment ×5, guard ×2, stacking ×1, output-form ×1). Across two rounds it reproduces cross-language, cross-base (Cameroon included), cross-build, parallel and serial, warm and cold — load-independent in every dimension the walk could vary. Per Matthew's directive ("file and fix — the goal is to get these e2e walks working"), this is filed as its own issue with both rounds' evidence and a fix is in flight; the remaining blocked and not-attempted cells re-walk once it lands.

## Cameroon wall: did not reproduce

On a warm, idle, single-lane server, `sil_cameroon_qwerty` phase 1 completed cleanly in ~73 s (round 1's "Preparing preview…" wall absent); the case then hit the same series stall as the basic bases. Conclusion: the round-1 wall was a load/environment artefact of that run, not a product defect — it is **not** being filed. `sil_cameroon_azerty` was not attempted in round 2 (time-box); its round-1 evidence stands untested under warm conditions.

## What remains

19 not-attempted cells (mostly the Cameroon AZERTY quadrant and stall-blocked retries) belong to a future round of this manual instrument, after the stall fix lands. Nothing about them is unknown-by-design any longer: the axis they exist to test is proven.
