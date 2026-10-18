# Quickstart validation: Touch key identity criteria (spec 104)

End-to-end validation scenarios for the implemented feature. Each maps to
a Success Criterion in spec.md; run in order — later scenarios assume the
fixtures from T001 exist. Expected results are observable behaviour, not
code inspection.

## QS-1 — Carve removes a T_-produced character completely (SC-001)

1. Import sil_cameroon_qwerty (T001 fixture form).
2. Carve U+0300 (grave combining mark).
3. **Expect**: every occurrence that produced U+0300 (the T_0300 keys on
   default/caps layers) is neutralised to T_BLANK/sp 10; the diablock
   guard rules and bare/shift T_0300 rules no longer fire in simulation;
   layout, gallery, coverage, and enumeration agree the character is
   gone; unrelated characters' productions are unchanged.

## QS-2 — Copy parity incl. context probes (SC-002)

1. Copy each T001 idiom keyboard (Cameroon guarded T_, hindi_flick ruled
   U_, gff_*, fv_*, basic_*).
2. Run tap simulation on source and copy: every key × every layer, plus
   letter+key / space+key / deadkey+key probes for context-bound keys.
3. **Expect**: zero output differences, excluding keys under a recorded
   repair (QS-3) or Track 2 decision (QS-4). The basic_* copy presents
   its dead T_<HEX> keys in the repair list.

## QS-3 — Repair list: apply, decline, ignore (FR-009, FR-015)

1. In the QS-2 basic_* copy, apply the default repair to one dead key,
   decline another.
2. Download a second copy without opening the repair list at all.
3. **Expect**: applied key produces in simulation; declined key stays
   dead with its warning recorded and its row visible-and-answered at
   the touch step; the unvisited copy downloads unblocked, repairs
   unapplied, warnings listed at the Output step.

## QS-4 — Adapt: choice, refusal collapse, decline (SC-004, FR-016/017)

1. Adapt sil_cameroon_qwerty; at the touch step, accept the severance
   recommendation for one key, decline it for another.
2. Trigger a severance whose transplant refuses (fv_ store-bound key).
3. Resume the project.
4. **Expect**: accepted key severed with a transplant record; declined
   key's id + rules byte-identical to import; the refused severance was
   offered only as keep-link vs flag-for-manual with the binding shown;
   on resume, neither answered choice re-presents.

## QS-5 — Creation: severance on redefine, silence on relabel (SC-003, FR-011/012)

1. In a new keyboard, redefine the touch 1 key's output in the editor.
2. Relabel another key without changing its behaviour.
3. **Expect**: the redefined key severs (severance line shown, decision
   recorded, no intermediate save contains a producing T_ without its
   rules); the relabelled key's id is unchanged and no decision is
   recorded. Re-link the severed key after restoring its original
   behaviour (FR-029): offered, recorded, transplant rules deleted.

## QS-6 — Full gate (SC-005, SC-006)

1. Run the decision-table suite (one case per contracts §2 arm + edge
   cases) and the proposer-vs-contracts conformance check.
2. Run the four Playwright walks (create-with-severance,
   copy-with-repair, adapt-with-choice, carve of a T_ character).
3. Run the corpus gate in the dev soak.
4. **Expect**: all green — full CI including the e2e lane; corpus diffs
   confined to criteria-mandated changes, each attributable to a
   recorded decision class.
