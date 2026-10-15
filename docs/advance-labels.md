# Advance-button labels

The rule for what a step's forward ("advance") button may say. Raised by
issue [#1900](https://github.com/keyboard-studio/keyboard-studio/issues/1900):
labels were hard-coded per component with no shared rule, so "Finish" and
"Done" appeared mid-journey — misleading, because the author never sees the
spine segments and reads "Finish"/"Done" as "the end of the whole process".

## The rule

1. **Mid-journey steps say "Continue"** — with an optional count or
   consequence suffix ("Continue (# characters)", "Continue, keeping none",
   "Continue without punctuation"). Never "Finish", never "Done".
2. **"Finish"/"Done" are reserved for the last step of the whole journey** —
   the step that leads to Output. No step currently qualifies: the Output
   step's own actions are verbs (rule 3), so today the reserved words appear
   on no advance button at all.
3. **A forward action that commits a decision may use a verb** — "Choose
   this keyboard", "Confirm", "Confirm and continue", "Get started →". It
   may only say "and continue" if it really advances.
4. **`SurveyRunner` never derives its label from `next === null`.** Running
   out of questions in one flow is not the end of the journey. The runner
   defaults to `survey.surveyRunner.nextButton` ("Continue"); a wrapper that
   genuinely ends the journey passes `finalLabel` explicitly (spec: rule 2).
   Landed in PR #1923; the per-step "Done" labels were renamed in PR #2078.
5. **Enforcement is a test, not vigilance** — see below.

## Scope

An **advance label** is any string that can render on the forward button a
step publishes to the footer step-nav (`usePublishStepNav` /
`PublishStepNav`, `forward` slot), or on an equivalent in-step primary
forward control. Every user-facing string goes through the lingui catalogs
(`packages/studio/src/locales/{en,fr}/messages.json`), so the catalogs are
the choke point: an advance label is, in practice, a catalog entry whose id
names a button (the id contains `Button` / `.button.`), plus the matching
`t({ id, message })` defaults at call sites.

Out of scope — these may legitimately use the reserved words, because the
author does not read them as "advance":

- **Status and description text**, e.g. `ruleBuilder.description.done`
  ("Done" as a state), `output.sections.summary.completed` ("Terminé").
- **Titles and error/gate copy**, e.g. "Finish your keyboard before
  continuing", "Finish every inventory character before downloading."
- **In-step action buttons that do not advance the journey**, e.g. "Finish
  hiding this key" (completes a sub-task inside the step).
- **Survey answer options** — the author's choice, not the button that moves
  them. Example: `pb_additional_methods` offers "Done -- go straight to the
  review" as one radio option among "add characters another way" options;
  picking it *is* the author's decision to stop adding, and the step's own
  advance button still says "Continue". (Judgment call recorded for #1900:
  the option stays, with its wording owned by the question text, not this
  rule.)

## Enforcement

[`advanceLabels.test.ts`](../packages/studio/src/lib/advanceLabels.test.ts)
(vitest, runs with the studio suite) scans both catalogs and the call sites:

1. **Catalog layer** — every `*Button*` entry in the en and fr catalogs is
   checked (including ICU plural branches, so "Done (# characters)" inside a
   plural cannot sneak past). A value beginning with "Done"/"Finish" (en) or
   "Terminé"/"Terminer"/"Terminez" (fr — the fr scan also rejects the
   English words, since untranslated fallbacks render English) fails, unless
   the id is on the journey-end allowlist.
2. **Call-site layer** — every non-test `t({ id, message })` in
   `packages/studio/src` whose id names a button is checked the same way, so
   an English default cannot drift from its catalog entry unnoticed.

The **journey-end allowlist** lives in the test
(`JOURNEY_END_ALLOWLIST`), is empty today, and each future entry must carry
a comment naming the step and why it ends the journey. An allowlist entry
whose id no longer exists in both catalogs fails the test, so the list
cannot silently rot.

To change a label: edit the catalog entry (en + fr) — if the new label is a
reserved word on a non-journey-end step, this test is the thing that should
stop you.
