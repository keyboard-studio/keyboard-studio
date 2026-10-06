# Spec 087 — accepted follow-ups (post-review, 2026-10-05)

Tracked deferred work from the km-lead review of the decision-backend
unification. None of these blocks the unification itself; each has a
defined trigger.

## 1. Retire the remaining modular YAMLs (DONE)

Every `content/flows/*.modular.yaml` order list is deleted; each flow's order
derives from its modules' `provides`/`requires` via `orderDecisions`, pinned by
`decisions/orderParity.test.ts`. The wizard's step order is derived the same
way: the manifest's hand-ordered `Step[]`, its `spine` / `joinTarget` flags and
the `STEP_ORDER` literal are gone. Steps declare `provides` / `requires` /
`gatedBy` in `steps/stepDependencies.ts`; `steps/stepOrder.ts` sorts them with
the same `orderByDependencies`; side trails derive from `gatedBy` and join at
the next ungated step. `steps/stepOrder.parity.test.ts` freezes the previous
order, side trails, join targets, lock order and Flow Map edges as literals.

Residual, by design: where no dependency separates two steps, the declaration
order in `stepDependencies.ts` is the stable tie-break (like registry key order
for walk-order flows). Those pairs (`layout` against the base/track/characters
steps and the four pre-carve steps; `marks`/`punctuation`/`invisibles`/
`convenience` among themselves) are frozen in the parity test.

## 2. Remove deprecated `classifyBaseScript` (DONE: deleted; posture now read via `extractBaseScriptPosture` in `il_target_script.ts`)

`adaptation/firing.ts::classifyBaseScript` is deprecated but still exported
(T022 folded target-script classification into decision extraction
provenance). Trigger: confirm no remaining importers, then delete.

## 3. SC-001: close the gap to the spec's 80% pre-fill bar

Measured on 5 real keyboards
(`src/decisions/successCriteria.test.ts`): 4 of 6 identity/script/character
decisions extract (language-code, target-script, copyright-holder,
character-inventory). language-name and author-name have no extractors by
design — they require author input.

The spec's SC-001 bar is ≥80%. One more extractor on the identity set
(e.g. language-name from catalog displayName/language metadata, or
author-name from package metadata) takes the set to 5/6 = 83% and meets
the bar. The test pins the current 4/6 floor; raising it is a deliberate
follow-up, not a silent bar-lowering.
