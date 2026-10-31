# Contract: consistency gates G1-G8

Checked on every decision-point fixture (where applicable) and on every walk zip. One pure checker,
`checkConsistencyGates(input) -> GateResult[]`, shared by the vitest fixtures and the walk harness.
The harness imports it from the built studio test helper, or a copy guarded by a parity test if the
harness cannot import workspace code.

| Gate | Property | Measured by | Applies at point |
|---|---|---|---|
| G1 | Zero unreachable rules | `compile()` diagnostics with code `KM_HINT_KMCMP_3154094` count = 0 | assignments and later |
| G2 | Contexts NFC/NFD tolerant | `lintContextTolerance(ir, await computeContextTolerance(ir))` count of `KM_WARN_CONTEXT_NOT_TOLERANT` = 0 | tolerance |
| G3 | Guard present iff needed | projected IR has group `generated_marks_guard` <=> (blocked pairs non-empty OR any mark row restricts contexts) | marks and later |
| G4 | One output form | every generated rule output and generated store item `s` satisfies `s === s.normalize(nf)`, nf from `normalizationFormForOutputForm(outputForm)`; starting rules kept by carve are reported, not failed | assignments and later |
| G5 | `&CasedKeys` iff cased | `store(&CasedKeys)` present <=> confirmed alphabet has a `caseCounterpart` pair; when present it covers every assigned key carrying a pair | caps and later |
| G6 | No lost touch letters | every confirmed-alphabet letter on each platform's `default` layer of the projected `.keyman-touch-layout` | assignments and later (walk only until a fixture reproduces) |
| G8 | No `nul`/`beep` in stores | every `store()` item in the projected IR is neither `nul` nor `beep` (keymanapp/keyboards#4181) | all |
| G7 | Deterministic | two projections of the same fixture are byte-equal across all VFS files | all |

Input:
`{ vfs, keyboardId, compileDiagnostics, decisions: DecisionSet, point }`.

Output: `GateResult[] = { gate, applicable, pass, detail: string[] }`.
