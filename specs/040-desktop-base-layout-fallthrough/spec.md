# Spec 040 — Desktop base-layout fall-through in the script facet

**Status: [DRAFT] scope stub.** Carved out of [spec 037 — facet classifiers](../037-facet-classifiers/)
on 2026-07-17 (037 tasks T012 + the leak-edge sub-case of T010). NOT yet run through the
`/speckit-specify` generative loop — this file records scope and rationale so the intent is not lost.
Governing section: **spec.md §7 FR-007 amendment** (desktop base-layout fall-through in produced evidence).

## Problem

The 036/037 `script` classifier derives its per-keyboard script histogram from `buildProducedSet(ir)` —
the characters a keyboard's rules explicitly produce. On **desktop**, that under-counts: physical keys a
keyboard does **not** remap fall through to the OS base layout (QWERTY, AZERTY, …), so the keyboard
effectively also "produces" those base-layout characters even though no rule names them. A non-Latin
desktop keyboard that leaves the alphabetic keys un-blocked therefore emits a small, real sliver of Latin
output that the current histogram misses entirely (it only sees the rules).

## Scope (in)

- Fold **un-blocked** base-layout characters into the script classifier's produced evidence: a physical key
  is "blocked" when the keyboard maps it away (the `[K_x] > nul` idiom or an explicit remap); an un-blocked
  key contributes its base-layout character.
- Read the base layout from the keyboard's own `&baselayout` store; use the platform default base layout
  **only** when `&baselayout` is unset, and record the declared-vs-default distinction in `provenanceTier`
  / `notes` so the inference is auditable.
- The leaked characters appear as a small off-script sliver in the `distribution` (spec Edge Cases
  amendment), not as a dominant-value flip.
- Fixture: a non-Latin desktop keyboard with an un-blocked base-layout key → the leaked Latin char shows as
  a minor `distribution` entry, read from `&baselayout` rather than an assumed default (the deferred 037
  T010 leak-edge case).

## Scope (out) — why this is desktop-only

- **Touch layouts** are explicit JSON: every key is declared, nothing falls through to a base layout, so
  there is no default to infer. No touch work in this spec.
- **Mobile physical/bluetooth keyboards** assume QWERTY and expose no per-keyboard base-layout setting to
  read, so there is nothing to resolve there either.
- Consequence: the whole feature is a **Keyman Desktop** concern. Implementing it means modeling Desktop's
  base-layout resolution + the blocking idiom — a deeper scan into how the desktop processor maps unhandled
  physical keys, which is why it was carved out of 037 rather than bolted onto the content histogram.

## Dependencies & risk

- Consumes the 036/037 facet-index harness (`utilities/facet-index/script-classifier.ts`, the pinned UCD
  lookup). Changing the produced-evidence derivation **will shift** committed `docs/keyboard-facet-index.json`
  records for affected desktop keyboards and forces a `script@N` classifier-version bump + full recompute —
  plan for a regenerated artifact + re-lint, same as any classifier change (036 freshness).
- Determinism must hold: base-layout resolution must be a pure function of pinned inputs (the keyboard's
  `&baselayout` + a pinned base-layout table), no environment lookups.

## Success criteria (draft)

- A non-Latin desktop keyboard with un-blocked alphabetic keys records the leaked base-layout script as a
  minor `distribution` sliver, provenance noting declared-vs-default base layout.
- Blocked keys (`[K_x] > nul`) contribute nothing.
- Touch-only keyboards are unaffected (no regression in their records).
- The committed index regenerates deterministically after the change.

## Open questions for `/speckit-specify`

1. Where does the pinned base-layout character table come from (Keyman's `.keyman-touch-layout`/kmx base
   layouts, or a CLDR/OS mapping)? What is the pin + freshness story?
2. How is "un-blocked" detected precisely across the rule forms that suppress a key (nul output, context
   guards, group routing)?
3. Should the leaked sliver participate in the `confident`/`mixed` threshold, or be evidence-only (counted
   in the histogram but never able to flip the dominant value)?
