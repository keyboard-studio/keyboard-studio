# Plan: one consistent, clean keyboard from base + decisions + carve

Date: 2026-10-29. Original planning note, moved into the spec folder as source material; its phases became spec 106 user stories. Historical: where it disagrees with spec.md/research.md, those win.
Branch context: `km/s02-deadkey-purpose` (uncommitted S-02 work, see the handoff). Everything below is
proposed on top of that branch landing first.

## Evidence (Bafut on basic_kbdus, fix-branch zip + its decision record)

| # | Requirement | What the evidence shows | Where it lives |
|---|---|---|---|
| E1 | Blocked marks never reach output | Decision record carries `marks_guard.behaviour = swallow`, attachment matrix (caron only on a A e E), `backspace = whole-stack`. Produced `.kmn` has **no** `generated_marks_guard` group and **no** whole-stack rules. `applyMarkGuards` runs only in the `marksTreatment` decision apply, into the working IR, which the projection never emits (`projectWorkingCopyVfs.ts:668-676` says so). | `survey/questions/gallery/marksTreatment.ts`, `lib/projectWorkingCopyVfs.ts` |
| E2 | Diacritic output consistent with upstream decisions | Output form is `base-plus-mark`, yet the deadkey stores hold `'ǎǍěĚ'` (precomposed). S-02 output = `currentChar` as shown in the strip, which is NFC-normalised (`MechanismGallery.tsx:609, 1795, 2202`). `outputStringForStack` has zero studio callers. | `editors/assignLoop/MechanismGallery.tsx`, `engine/src/marks/output-form-policy.ts` |
| E3 | Non-needed outputs gone | 7 starting rules survive carve and are shadowed (`+ [K_COLON] > U+003B` under `+ [K_COLON] > dk(3000)`, same for `` ` `` `[` `]` `'` x 5). Carve runs before assignments and never removes a rule whose *input* was claimed. 14 `HINT_UnreachableRule`. Carve's "Suggested to discard" is opt-in (the harness had to click "Discard all"). | handoff issue 1; `editors/carve/CarveGalleryV2.tsx:1336-1350` |
| E4 | Reasonable placements | `'` -> `’` with no demotion of U+0027; `“ ”` on `[ ]` with `[ ]` lost. Weighted rationale + demotion proposals (#2300, PR #2303) are on main; the walk still produced S-03 `zzq…` placeholders because nothing pre-selects the top proposal. Deadkey trigger proposal is on this branch only. | `survey/placementRationale.ts`, `editors/assignLoop/deadkeyPurpose.ts` |
| E5 | Contexts handle NFC and NFD | Spec 086 normalization group is a propose-then-accept station computed from the *compiled projection*; because of E1 the generated guard/backspace rules (the only text-context rules with marks) are never analysed. No normalization group in the output. | `lib/contextToleranceAnalysis.ts`, `survey/marks/ContextToleranceStation.tsx` |
| E6 | Rules clean | Every S-03 rule carries the same 4-line comment; assignment rules interleave with base rules; deadkey rule clusters split; numeric `dk(3000)` ids where a purpose name exists; codec already round-trips `dk(name)`. | `engine/src/pattern-apply/applyAssignments.ts`, `codec/emit.ts` |
| E7 | Caps / `&CasedKeys` | Copy track: `scaffoldIR` silently strips CAPS/NCAPS rules and inserts `&CasedKeys` for any non-"non-roman" group — no decision, no casing check. Adapt track (`instantiateFromExistingWithIdentitySeed`) never calls it. Touch scaffold already emits a `caps` layer with `*ShiftedLock*`. | `engine/src/scaffolder/scaffold-ir.ts:211-290`, `scaffolder/index.ts:687` |

## Rulings carried (not re-opened)

- One deadkey per purpose; own trigger; punctuation triggers fine if typeable; escapes confirmed at first placement (handoff rulings 1-4).
- Output form is ONE keyboard-wide policy (#2297 narrowing). Backspace is its own axis (#2302).
- Base-derived values are proposals (Art. X). Base switch = retain + recalculate.
- Spec 105 direction: working copy is derived; new behaviour goes in the projection / replay, never as a second author-truth store.
- New (this session): `&CasedKeys` is the **default on the Copy track** and a **strong suggestion on the Adapt track**, both only when the script has casing.

## Phases

Each phase = one feature branch cycle, one PR, one commit per phase gate. Order is dependency order.

### Phase 0 — Land the S-02 branch (already built)
Commit + push `km/s02-deadkey-purpose` as planned in the handoff (two commits), open PR. Everything below rebases on it.

### Phase 1 — Mark guards reach the artifact (fixes E1; prerequisite for E5)
1. Add projection step **2.6 "Mark guards"** in `projectWorkingCopyVfs.ts`, after assignments (2) and before context tolerance (2.7): parse the projected `.kmn`, run `applyMarkGuards(ir, completion.worklist, outputForm, backspace, stacks)` from the recorded `marks-treatment` decision, emit. Idempotent by construction (the engine strips its own `generated_marks_*` artifacts first).
2. Remove the guard generation from `marksTreatment.apply` (it is dead for the artifact; keeping both would double the truth, which 105 forbids). Keep the decision value unchanged.
3. **Extend blocking to non-letters.** Replace per-pair enumeration with one rule per mark: `notany(allowed_<mark>) <mark> > context(1)` plus the empty-context case, in the same keyless guard group. "Allowed" = the attachment matrix row (cased forms already listed). Default on, under the existing `swallow` behaviour answer; `beep` variant adds `beep`.
   **Ruling 2026-10-29:** the attachment station ("Which letters take each mark?") gains **space** as a pre-unchecked column on every mark row. Ticking it adds U+0020 to that mark's allowed set. That column is the whole disclosure; no separate guard-station tick and no extra copy beyond the column label. Digits, punctuation and buffer start are never offered and are always blocked.
4. Tests: projection test proving guard group + whole-stack rules are in the download for the Bafut decision record; simulator tests: `5` after `a` blocked when `à` is unchecked, after `1`, after space, at buffer start; touch `T_0300` route hits the same group.
5. Walk evidence: Bafut p1/p2 zips contain the guard group; harness asserts it.

### Phase 2 — Output composition follows the output-form decision (fixes E2)
1. One seam: `applyAssignments` (engine) takes `outputForm` and rewrites **every** emitted output string through `outputStringForStack`. S-01, S-03, S-08 stores: trivial. **S-02 under base-plus-mark:** parallel `'…'` stores cannot hold 2-codepoint items (codec gap noted in spec 062), so the candidate shape is `dk(caron) + any(caron_bases) > index(caron_bases, 2) U+030C` — no output store at all. The pattern YAML gets a second `kmnFragment` variant keyed on output form (or the engine rewrites post-apply; prefer the pattern variant, pattern authors can read it).
   **Ruling 2026-10-29:** km-keyman rules on the rule shape before it is built. Phase 2 opens with a km-keyman dispatch (inputs: this candidate, the sil_cameroon hand-written idiom, the codec store-item gap) and the ruling is recorded in the PR body; the builder follows the ruling, not this note.
2. S-01 mark key under **ready-made** output with postfix input (the p3 profile): the bare `+ [K_5] > U+0300` must become `any(grave_bases) + [K_5] > index(grave_composed, 1)` with a fallback `+ [K_5] > U+0300` only if the author kept the "bare mark" escape. Add this as a `postfix-compose` pattern (S-01 cannot express it). The composed store is derived from the attachment matrix, so blocked pairs are not in it (consistent with Phase 1).
3. Case counterparts ride the same seam (spec 074 companion already shifts base + output).
4. Tests: four #2302 profiles x {deadkey, mark key} produce exactly the output form chosen; simulator round-trips; no precomposed char in any output under base-plus-mark and vice-versa (the Layer C uniformity lint that was retired as FR-022 comes back as a projection-time assertion, not a user-facing lint).

### Phase 3 — Carve removes what the decisions made unreachable (fixes E3)
1. **Claimed-inputs filter** (handoff proposal, built as designed): in the carve projection derive the session's claimed inputs from assignments (S-01 key+modifiers from `kmnRules`, S-08 combos, S-02 bare trigger + `RALT trigger` when the altgr escape is on, Phase 2's postfix rules). Drop any starting rule whose entire context is exactly one claimed vkey+modifier set (no preceding context, no deadkey, no `if()`). Computed fresh every projection; undo is automatic. Contextual rules untouched. Extend `slotOccupancy.ts` helpers with deadkey triggers rather than a second parser.
2. **Suggested discards are an approvable default.** `recommendedRemovalChars` rows become `removals` with provenance `default` on first visit to carve (Art. X: shown as "discarded, suggested — click to keep"), and the carve step's Continue is the approval: the author sees the discarded set before leaving the step, and the decision record stamps the approval. The retained-convenience decision still shields its letters. Existing "Discard all / Keep" controls stay as the override. **Ruling 2026-10-29:** confirmed as an approvable default.
3. **Needed punctuation is never silently lost.** `isAlwaysKeepCategory` chars that an assignment overwrites (E4's `'` -> `’`) must trigger the #2300 demotion proposal exactly like a needed letter does; if the author declines, the loss is recorded as a decision, not left as an unreachable rule.
4. Tests: plain override drops the base rule; Shift-only difference kept; contextual rule survives; removing the assignment restores the rule; Bafut zip compiles with **zero** unreachable hints (harness gate).

### Phase 4 — Caps handling as a decision, `&CasedKeys` as the mechanism (E7)
1. New gallery decision module `caps-handling` (same shape as `windowsLayout.ts`), screen `layout`, `requires: ["character-inventory", "windows-layout"]`. Value: `{ mode: "cased-keys" | "explicit-rules" | "none", keys: "letters" | "azerty-extended" | string[] }`.
2. **Casing gate:** proposal fires only when the confirmed alphabet has at least one case pair (`caseCounterpart`, the one casing source). Caseless script -> `mode: "none"`, no `&CasedKeys`, step auto-completes.
3. **Copy track default:** extraction seeds `cased-keys` with provenance `default`; key set from the layout family: QWERTY/QWERTZ = `[K_A]..[K_Z]`, AZERTY = the Capsifesto extended list. Then **union** every key whose base/shift outputs form a case pair after assignments (so `ŋ`/`Ŋ` on a non-letter key is caps-aware too). The store is re-derived in the projection from the decision + assignments; `scaffoldIR` stops inserting it silently (it keeps the CAPS/NCAPS strip, which stays correct for a copy because the copy's own rules are regenerated). **Ruling 2026-10-29: expand to all cased characters** — the union covers every key, on every modifier plane the assignments use (base/shift and RAlt/shift+RAlt), that carries a cased pair; the family list is the floor, never the ceiling.
4. **Adapt track strong suggestion:** extraction reads the start IR: `&CasedKeys` present -> extracted/confirmed; explicit `[CAPS]`/`[NCAPS]` rules (per-rule duplication) -> offered `cased-keys` with the simplification (strip + store), **compile-gated and simulator-checked**: every key's output under {none, SHIFT, CAPS, SHIFT+CAPS} must be identical before and after, else the offer is withheld with the reason; `any/index` fold -> offered with the same check; no caps rules + cased alphabet -> offered add. Declining keeps the author's rules.
5. Case-pair companion: when the target key is inside the derived `&CasedKeys` set and the counterpart exists in the alphabet, the companion proposal is pre-accepted (still visible, still dismissible), so caps never produces a half-cased key.
6. Touch: the scaffold already emits `caps`/`symbol-caps`; add a parity test that every cased letter placed on `default` lands on `shift` and `caps`, and that `caps` keys carry no `nextlayer` (Capsifesto Part 2.3).
7. Tests: WASM check #4 (NCAPS consistency) green on all four #2302 base keyboards; sil_cameroon_qwerty adapt -> offer accepted -> `kmc` warnings zero; QWERTY vs AZERTY store text; caseless (e.g. a Devanagari base) -> no store.

### Phase 5 — Contexts tolerate NFC and NFD by default (E5)
1. With Phases 1-2 in, the tolerance analysis finally sees every text-context rule. Make the spec 086 normalization step **default-accepted** when the report has gap findings (provenance `default`, station shows it as accepted with "change"). The 062 per-rule fallback stays as is.
2. Generated rules are tolerant by construction where cheap: guard `allowed_<mark>` stores and whole-stack sequences carry only the keyboard's own form; the normalization group in front of `begin` canonicalises pasted/foreign text before `main`. Verify with seeded-context simulator tests: NFC `ǎ` and NFD `a+̌` contexts both block/peel/whole-stack identically.
3. Harness gate: `KM_WARN_CONTEXT_NOT_TOLERANT` count is zero for the 32 profile cases.

### Phase 6 — Clean emitted rules (E6)
1. `applyAssignments` emits **one** comment per pattern block, not per rule; drop the multi-line pattern prose from the `.kmn` (keep a one-line `c S-03 sequence: …`).
2. Group generated rules by mechanism in a stable order: stores, AltGr block, deadkey clusters (trigger, fan-out, escapes together), simple swaps, sequences; starting rules after. Deterministic (serializeWorkingCopy determinism tests extend to cover it).
3. Deadkey ids use the purpose name (`dk(caron)`, `dk(variant)`) through the codec's named-deadkey support; numeric ids only when a name collides with a starting-keyboard deadkey.
4. Rules pane: render `plainDiagnosticMessage` instead of raw codes (handoff issue 2); hide hints once Phase 3 makes them zero.

### Phase 7 — Placement proposals pre-selected (E4, verification)
1. In the mechanism gallery, the top-ranked `placementRationale` candidate (letters), the S-02 purpose trigger (marks under composed treatment), and the spare-key rule (`;` `[` `]` `` ` `` order) for own-key marks are **pre-selected**, so Accept-all yields a real keyboard; the harness drops the `zzq` placeholder path and records which proposals it accepted.
2. Re-run the 32-case #2302 walk (handoff item 5) with gates: zero unreachable hints, zero non-tolerant warnings, guard group present, output form uniform, `&CasedKeys` present iff cased.
3. **Touch "lost keys" (handoff issue 3):** not a separate task. Each walk run from Phase 1 onward also diffs the phone and tablet `default` layers of every zip against the confirmed alphabet and reports any alphabet letter missing from the layout; the first run that reproduces the loss files the bug with the zip attached.

## Dependencies and sequencing

```
P0 -> P1 -> P2 -> P3 -> P5 -> P7
             \-> P4 (independent of P3, P5; needs P2 for the case-pair seam)
P6 after P2 and P3 (touches the same emitter)
```

## Rulings recorded 2026-10-29 (closed)

1. Phase 1: space is a pre-unchecked column per mark row at the attachment station; that column informs the author. Everything else not in the row is blocked.
2. Phase 2: km-keyman rules on the base-plus-mark deadkey shape at the start of the phase.
3. Phase 3: suggested discards are an approvable default (Continue on the carve step approves them).
4. Phase 4: `&CasedKeys` expands to every key carrying a cased pair, not only the layout-family list.
5. Touch lost keys: watched in every walk run, filed when it reproduces; no separate task.

No open points remain. Next action is Phase 0 (commit and push the S-02 branch, open its PR), then cut `km/mark-guards-in-artifact` for Phase 1.
