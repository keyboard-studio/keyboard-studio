# Spec 085 — accepted follow-ups (post-review, 2026-10-05)

Tracked deferred work from the km-lead review of the decision-backend
unification. None of these blocks the unification itself; each has a
defined trigger.

## 1. Retire the remaining modular YAMLs

`identity_lite.modular.yaml` was deleted (T040); the order derives from the
registry. The remaining thin-YAML order lists stay until their parity gates
exist:

- `content/flows/phase_b_characters.modular.yaml`
- `content/flows/phase_f_helpdocs.modular.yaml`
- `content/flows/track.modular.yaml`
- `content/flows/project_name.modular.yaml`
- `content/flows/proposed/phase_a_identity.modular.yaml` (proposed, not live)

Trigger: a derived-order parity test per flow (same shape as
`decisions/orderParity.test.ts`) proves the registry-derived order equals
the YAML order; then delete the YAML and retarget its mirror suites the way
`flow-parity.test.ts` / `orphan-input-lint.test.ts` were retargeted for
identity_lite.

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
