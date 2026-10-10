# FR-050 step classification

This is the machine-checked companion to the `persistence` declaration on each manifest step
(research R-12). The manifest test fails if a step in `STEP_MANIFEST` is missing from this table, if
an `exempt` step has no justification, or if a row's declaration disagrees with the manifest's.

The "Today" column is the classification the plan-time audit reached ([research.md](../research.md)
Part I). The "After 079" column is the target this feature must reach.

| Step id | Today | Evidence | Declaration after 079 | After 079 |
|---|---|---|---|---|
| identity | non-compliant: survives leaving, not reload (D-5) | F-5 | `answer-store` | compliant |
| layout | new step (spec 076 A4); every pick saved per question | spec 076 A4 | `answer-store` | compliant |
| choose_base | believed compliant (working copy) | spec Assumptions | `working-copy` | compliant — revisit test `StepHost.test.tsx` "an unmount/remount at choose_base with the same evidence leaves baseKeyboard/baseIr unchanged" |
| track | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| attribution | new step (#1901: author/copyright questions moved post-track); answers recorded as decisions keyed by question id, as they were under identity | #1901 | `answer-store` | compliant |
| project_name | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| characters | non-compliant: the prefill wipes the alphabet (D-3); the manual path is D-5 | F-3, F-5 | `decision-store` (alphabet) + `answer-store` (sub-screen position, manual-path answers) | compliant |
| marks | non-compliant: component state only (D-1); stacking discarded; guards not stripped (D-6) | F-1 | `decision-store` (composite) + `answer-store` (per-toggle evidence answers, step-status slot) | compliant |
| punctuation | compliant for picks and removals; the `alreadyConfirmed` guard ignores evidence (FR-022) | F-3, F-6 | `decision-store` (picks) + `answer-store` (one evidence answer) | compliant |
| invisibles | compliant for decisions; its answers are clobbered in the phase slot (D-4) | F-4, F-6 | `decision-store` | compliant |
| convenience | non-compliant: component state (D-2); skips on unknown evidence (#1796) | F-2 | `decision-store` (retained set) + `answer-store` (step-status slot) | compliant |
| carve | believed compliant (working copy); misreads a skipped convenience step | F-2 | `working-copy` | compliant — revisit test `CarveGalleryV2.test.tsx` "a discarded character survives an unmount/remount of the gallery with the same working copy"; the skipped-convenience misread is covered by the R-09 regression test (T052) |
| deadkeys | compliant: every action saved immediately | F-10 | `working-copy` | compliant |
| rules | compliant: the demo pane is a read-only view of the compiled working copy (spec 082 Track A); the step records no answers — Continue carries `undefined` like the galleries | F-10 | `working-copy` | compliant |
| mechanisms | compliant: every action saved immediately | F-10 | `working-copy` | compliant |
| touch_seed_source | believed compliant (session slot `touchSeedSource`) | agent sweep | `working-copy` | compliant — revisit test `TouchSeedSourcePanel.test.tsx` "a NON-default recorded choice survives an unmount/remount with the same evidence" |
| touch | compliant: every action saved immediately | F-10 | `working-copy` | compliant |
| help | non-compliant (D-5) | F-5 | `answer-store` | compliant |
| package | no author answers; output step | — | `{ exempt: "Output screen: records no decision; its only state is the chosen download, re-derived on entry." }` | justified-exempt |

Every "verify by revisit test" row is now closed: each names the FR-051 test that passed. A row is closed only when its FR-051 test passes. If the test finds a gap,
the gap is either fixed in this feature or filed as a tracked follow-up (FR-050).

## Unsaved UI state beside saved questions (FR-007)

These are not questions. They are listed so that a reviewer can see each was considered:

| Surface | State | Justification |
|---|---|---|
| Punctuation | `inputVal` (the add-a-character text box) | Transient typing buffer. The character becomes an answer only on add, which saves it. |
| Punctuation | `declinedClusters` / `handedOff` / `skipped` | Presentation of the current visit. Each decision they lead to is saved through `rejected` or provenance. |
| Gallery | intro-splash seen flags | Already persisted by the galleries. They record no keyboard decision. |

## Amendment — spec 090 (2026-10-07, D-090-29)

Spec 090 (gallery decision modules) superseded the "Declaration after 079" cells for the five
gallery steps — characters, marks, punctuation, invisibles, convenience. Their settled values
are decision records in the decision store (spec 088 FR-007), so spec 090 added
`decision-store` to the `PersistenceDeclaration` vocabulary (steps/types.ts) and re-declared
the five steps decision-store-first, by lead ruling on the options recorded in spec 090's
research.md (D-090-19 → D-090-29). The `phase-b-draft` store the three Phase B/C steps
declared was deleted by spec 090 (T025). What each of the five still keeps in the answer store
is named in its row: within-step position, step-status slots, and this spec's own evidence
layer (marks' per-toggle answers, characters' addition answers, punctuation's inventory
answer), which the ruling kept as the answer store's sanctioned narrowed role. The
convenience step's legacy-boolean adoption shim (spec 090 D-090-17) also still reads older
drafts' `surveyAnswers`. All other rows are unchanged from the 079 end state.
