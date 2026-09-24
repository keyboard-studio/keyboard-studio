# FR-050 step classification

This is the machine-checked companion to the `persistence` declaration on each manifest step
(research R-12). The manifest test fails if a step in `STEP_MANIFEST` is missing from this table, if
an `exempt` step has no justification, or if a row's declaration disagrees with the manifest's.

The "Today" column is the classification the plan-time audit reached ([research.md](../research.md)
Part I). The "After 079" column is the target this feature must reach.

| Step id | Today | Evidence | Declaration after 079 | After 079 |
|---|---|---|---|---|
| identity | non-compliant: survives leaving, not reload (D-5) | F-5 | `answer-store` | compliant |
| choose_base | believed compliant (working copy) | spec Assumptions | `working-copy` | verify by revisit test |
| track | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| project_name | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| characters | non-compliant: the prefill wipes the alphabet (D-3); the manual path is D-5 | F-3, F-5 | `phase-b-draft` (alphabet) + `answer-store` (sub-screen position, manual-path answers) | compliant |
| marks | non-compliant: component state only (D-1); stacking discarded; guards not stripped (D-6) | F-1 | `answer-store` | compliant |
| punctuation | compliant for picks and removals; the `alreadyConfirmed` guard ignores evidence (FR-022) | F-3, F-6 | `phase-b-draft` | compliant |
| invisibles | compliant for decisions; its answers are clobbered in the phase slot (D-4) | F-4, F-6 | `phase-b-draft` | compliant |
| convenience | non-compliant: component state (D-2); skips on unknown evidence (#1796) | F-2 | `answer-store` | compliant |
| carve | believed compliant (working copy); misreads a skipped convenience step | F-2 | `working-copy` | verify by revisit test |
| mechanisms | compliant: every action saved immediately | F-10 | `working-copy` | compliant |
| touch_seed_source | believed compliant (session slot `touchSeedSource`) | agent sweep | `working-copy` | verify by revisit test |
| touch | compliant: every action saved immediately | F-10 | `working-copy` | compliant |
| help | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| package | no author answers; output step | — | `{ exempt: "Output screen: records no decision; its only state is the chosen download, re-derived on entry." }` | justified-exempt |

A "verify by revisit test" row is closed only when its FR-051 test passes. If the test finds a gap,
the gap is either fixed in this feature or filed as a tracked follow-up (FR-050).

## Unsaved UI state beside saved questions (FR-007)

These are not questions. They are listed so that a reviewer can see each was considered:

| Surface | State | Justification |
|---|---|---|
| Punctuation | `inputVal` (the add-a-character text box) | Transient typing buffer. The character becomes an answer only on add, which saves it. |
| Punctuation | `declinedClusters` / `handedOff` / `skipped` | Presentation of the current visit. Each decision they lead to is saved through `rejected` or provenance. |
| Gallery | intro-splash seen flags | Already persisted by the galleries. They record no keyboard decision. |
