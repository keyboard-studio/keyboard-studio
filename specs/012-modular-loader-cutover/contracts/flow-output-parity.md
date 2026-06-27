# Contract: Author-visible flow-output parity

The single behavioral contract of this feature. The studio exposes the survey as a sequence of questions to the keyboard author. Cutting the loader MUST NOT change that sequence for Phase A, Phase F, or identity-lite.

## Contract statement

For each phase P ∈ {phase_a_identity, phase_f_helpdocs, identity_lite}:

```
loadModularFlow(modularYaml[P]).questions  ≡  parseFlow(legacyYaml[P]).questions
```

where `≡` is equality on the **author-visible fields** of each resolved `FlowQuestion`, in order:

- `id`
- `prompt`
- `help_text`
- `type`
- `options` (value + label, in order; for `select` types)
- `required`
- `next` (string | null | ordered `FlowGotoRule[]`)

and likewise for `provenance_questions` where present (Phase A).

Fields that are implementation detail of one loader and absent in the other (e.g. internal validation closures, fixtures) are **out of scope** for the equality — the contract is about what the author sees and how the flow routes.

## Verification (golden compare, part a)

A vitest suite (`survey/flow-parity.test.ts` or equivalent, in `packages/studio/tests/survey/`) that, per phase:

1. Loads the legacy `FlowDef` via `parseFlow(<legacy>?raw)`.
2. Loads the modular `FlowDef` via `loadModularFlow(<modular>?raw)`.
3. Asserts deep equality on the author-visible field projection above, for `questions` and `provenance_questions`.

**Ordering guarantee**: This suite MUST pass for a phase before part (b) deletes that phase's legacy YAML (FR-006). The suite is the deletion's safety baseline.

## Post-deletion (part b)

Once a phase's legacy YAML is deleted, its golden comparison can no longer run (no baseline). At that point:

- Remove the per-phase parity assertion for that phase from the suite (in the same part-(b) change).
- Pin the surviving modular `FlowDef` with a **snapshot** so future drift is still caught.

## Non-goals

- This contract does **not** assert anything about rendering pixels, timing, or the `validate`/`mutate` internals — only the question sequence and routing the author experiences.
- `mutate` remains a stub; no IR-write behavior is contracted here (that is P5 / #5b·#232).
