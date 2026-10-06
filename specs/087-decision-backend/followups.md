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

Commits: d31bfaaa, abcdfc97, 45a2c8f5, 7af9f942, ac12b6d0, 503eb3f3, cb0f6237
(tasks T070-T078).

## 2. Remove deprecated `classifyBaseScript` (DONE, d31bfaaa)

`classifyBaseScript` is deleted. Base-script posture is folded into
target-script extraction; the single classifier is `extractBaseScriptPosture`
in `survey/questions/a/il_target_script.ts`.

## 3. SC-001: close the gap to the spec's 80% pre-fill bar

Resolved. `il_language_english` now extracts language-name: the primary
catalog language tag (same one language-code extracts) is resolved to its
English name through the already-loaded langtags dataset
(`ExtractContext.resolveLanguageName`), validated by the module's own
`validate()`. The IR `&NAME` is the keyboard name, not the language name, so it
is not a fallback. Measured on 5 real keyboards
(`src/decisions/successCriteria.test.ts`): 5 of 6 identity/script/character
decisions extract (language-code, language-name, target-script,
copyright-holder, character-inventory) = 83%. author-name stays author input
(the catalog carries no author). Caveat: language-name is only extracted once
langtags has loaded (lazy chunk); otherwise the author is asked. Status: DONE
(83%, meets the 80% bar).

## 4. Declaration-order tie-breaks still decide many adjacent pairs

Order is derived from `provides`/`requires`, but where no dependency separates
two neighbours the declaration order is the stable tie-break. Counts of
adjacent pairs decided that way: phase F 18/20, phase B 34/46,
identity_lite 4/8, phase_a_identity 22/29, plus 14 wizard step pairs. This is
honest (no hidden list) and frozen by the parity tests
(`decisions/orderParity.test.ts`, `steps/stepOrder.parity.test.ts`), but those
pairs are not dependency-derived. Trigger: a real ordering constraint between
a pair should be added as a `requires` edge, and the frozen literal updated
deliberately.
