# Fallback-character surface for `swallowUndefined` — design (#1912)

**Status**: Proposed for review.  
**Replaces**: The archived carve-gallery Allow/Block disposition UI (spec 076
amendments A1–A4, archived 2026-09-29 to `docs/archive/carve-disposition-ui/`).  
**Decides**: FR-019 per-carve override — re-enable or retire.

## 1. What the feedback actually rejected

Author feedback on the shipped gallery (quoted in the archive README):

> "the 'which keyboard layout does your community use' and the following
> popups are entirely inappropriate during the carve gallery: 'Do your
> typists expect a character on this key? Allow / Block / Key does
> something, but output varies by computer. / bulk default'. ... I think
> the 'Do your typists...' question is a poor attempt at managing fallback
> characters. That needs to go elsewhere."

And the issue's problem statement:

> The allow/block disposition framing itself may be wrong — not just
> misplaced. Carving is about trimming the alphabet; host fallback is a
> separate concern about **undefined keys**.

Three distinct defects, not one:

1. **Wrong place.** The carve gallery is where the author trims the alphabet.
   Interrupting that flow with "what should happen on undefined keys?" breaks
   the author's mental model — they are deciding what they *need*, not what
   should happen on keys they *don't* need.
2. **Wrong granularity.** Per-row Allow/Block implies every carved key needs
   an individual fallback decision. In practice the answer is almost always
   uniform ("my keyboard should be self-contained" or "let the host handle
   the rest") — the per-row UI manufactured decisions the author didn't have.
3. **Wrong question.** "Do your typists expect a character on this key?"
   asks the author to predict typist expectations per key. The real question
   is a single policy choice: *when a key isn't in my keyboard, should it be
   silent or should the computer's own layout handle it?*

The archived UI is therefore **starting material, not a blueprint**. The
per-row control and its framing are not restored.

## 2. Design principles

- **Separation.** Carve decisions (what to trim) and fallback policy (what
  undefined keys do) are different concerns, decided in different places.
  The carve gallery never asks about fallback again.
- **One policy, not N decisions.** The fallback surface is a single
  keyboard-wide setting. Per-key override is retired (see §5).
- **A2 copy, binding.** Each option states its *own* risk. No option is
  framed as the safe choice and the other as the risky one. The retired
  slogan ("Allow means unpredictable; Block means predictable") must never
  reappear — in copy, in tests, or in code comments.
- **Honesty about hosts (A3).** Where host output is shown, it is a best
  guess from reference layouts, never presented as sight of the typists'
  machines. "Unknown" where reference data has no cell.
- **Engine backstops stand.** Deadkey carves always suppress (the ruling:
  "deadkey carves never fall through" — allowing fallback would leave the
  deadkey armed). Behaviour-covered combos are excluded from the swallow
  set. These are not author choices; the UI says so plainly where relevant.

## 3. The new surface

**Location.** The fallback policy lives with the `swallowUndefined`
behaviour configuration — the Behaviours step (spec 076 phase 5), *after*
carve suppression in the sequencing (FR-004 → carve suppression →
`swallowUndefined`). It is never in the carve gallery.

**The setting.** A single radio group, "When a key isn't in your keyboard":

| Option | Copy (A2-symmetric, draft) |
|---|---|
| **Do nothing** (swallow) | "Keys not in your keyboard do nothing. Silent on every computer — but if your typists expect a character on a key, that key will feel dead." |
| **Use the computer's layout** (pass through) | "Keys not in your keyboard fall through to the computer's own layout. The key types something — but what it types varies by computer." |

Each option states its own risk. Neither is framed as recommended.

**Supporting material.** Below the radio group, an adapted host-consequence
summary (from `CarvedHostConsequences`): for the keyboard's likely hosts,
what a representative undefined key would produce under each policy —
"unknown" where reference data has no cell, with the honesty caption. This
informs the *global* decision; it is not per-row.

**Default.** Swallow (do nothing). Rationale: the `swallowUndefined`
predicate already fails safe toward suppression ("suppress host leakage by
default"), and a keyboard that silently differs from the host is less
surprising than one that types unexpected characters. The author can change
it; the choice is recorded, never re-prompted on recompile.

## 4. Decision on each archived piece

| Piece | Decision | Rationale |
|---|---|---|
| `DispositionControl.tsx` (per-row Allow/Block) | **Retire** | The per-row granularity was the core of the rejected framing (§1, defect 2). Not restored in any form. |
| `ReviewRemovedKeys.tsx` (review panel) | **Adapt** | "Review what you carved" is still valuable — but as a plain carve review, *without* the disposition column or the allow/block verdict. Rename to "Review carved keys". Shows key+modifiers and what was removed; no fallback decisions. |
| `CarvedHostConsequences.tsx` (host-consequence table) | **Adapt** | The `hostOutcomeText` lookup ("what would this host produce") is reused for the *global* policy summary (§3), not per-row. The per-row expanded mount is retired. |
| `CarveHostSelector.tsx` | **Retire** | Never mounted in live UI. The host-guess concept is folded into the adapted consequence summary; a standalone selector adds no value. |
| `carveDispositionCopy.ts` | **Adapt** | The A2 *principle* (each option states its own risk) is binding and carried forward. The specific Allow/Block copy is retired; §3 draft copy follows the same principle. The "retired slogan must never appear" assertion is preserved as a standing rule. |
| `carvedCombo.ts` (shared row type) | **Adapt** | The carved-combo resolution (comboId → display row) is still needed by the adapted review panel. Kept, minus disposition fields. |
| Tests (`*.test.tsx.txt`, removed gallery cases) | **Retire** disposition tests; **adapt** review-panel tests | Disposition-control and allow/block copy tests are retired with the UI. Review-panel tests are adapted to the disposition-free panel. |
| e2e `carve-disposition-flows.spec.ts.txt` | **Retire** | Covers the retired per-row flow. A new e2e for the global policy belongs with the Behaviours step when built. |

## 5. FR-019 per-carve override: formally retired

**Decision: retire.** The per-carve override half of FR-019's two-tier
choice is not re-enabled.

Rationale:

1. The author feedback rejected the per-row disposition framing outright —
   re-enabling it under a new name would repeat the defect.
2. The engine already handles the per-combo distinctions that matter:
   deadkey carves always suppress (ruling, enforced in
   `carveSuppression.ts` as well as the predicate); behaviour-covered
   combos are excluded from the swallow set (`isInSwallowSet`). These are
   the cases where per-combo behavior genuinely differs, and none of them
   is an author choice.
3. A global policy plus engine backstops covers the real needs. Per-key
   override would reintroduce N decisions for a rare requirement.
4. Escape hatch: an author who truly needs per-key fallback control can
   write explicit rules. This is documented, not UI'd.

**Consequence for the store.** With per-carve override retired, the
`carveDispositions` store (per-combo allow/block records + pre-fill effect)
is redundant: it would only ever carry the bulk default. It is replaced by
a single `fallbackPolicy: "swallow" | "pass-through"` setting on the
working copy. The engine's `isInSwallowSet` predicate reads the global
policy instead of per-combo dispositions (the `allow-host` early-return
becomes "policy is pass-through → not in swallow set"). FR-020–FR-022
(engine suppression mechanics) are unchanged; only the *source* of the
decision changes from per-combo records to the global policy.

This is a larger change than the UI alone, and it is proposed here — not
assumed — for review.

## 6. Copy (draft, A2-binding)

The §3 table is the draft. Standing rules, carried from A1/A2:

- Each option states its own risk; no option is framed as safe vs risky.
- The retired slogan ("Allow means unpredictable; Block means predictable"
  and any paraphrase) appears nowhere — copy, tests, comments.
- Host output is "best guess, not sight" (A3 honesty caption retained).
- Deadkey suppression is stated as a rule, not a choice: "Deadkey
  combinations always do nothing — allowing fallback would leave the
  deadkey armed."

## 7. Out of scope

- The Behaviours step UI itself (spec 076 phase 5) — this design defines
  the fallback *policy surface*; the step that hosts it is separate work.
- `LayoutFamilyQuestion` — already moved to the `layout` spine step per A4.
- The `pb_text_sample` manual path — untouched.
