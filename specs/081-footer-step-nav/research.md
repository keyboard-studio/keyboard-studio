# Research: Survey progress buttons live in the footer

Phase 0 output for [plan.md](plan.md). The spec had no open `NEEDS CLARIFICATION` markers
(both were resolved on 2026-09-25). This file records the design decisions that the spec's
non-normative implementation notes left to planning, each checked against the code as of
2026-09-25.

## R-01: Where a publication gets its step id

**Decision**: StepHost wraps the step component in a `StepNavContext.Provider` whose value is
`resolvedStep.id`. `usePublishStepNav` reads the id from that context. It does not read the
live `surveySessionStore.activeStepId`.

**Rationale**: FR-012 requires that a publication be tagged with the step it *belongs to*. The
existing walk publishers (`SurveyRunner.tsx:448`) read the live `activeStepId`. For the walk
store that is harmless, because the footer merges every walk. For nav it is a hazard: on a step
change, the outgoing step can re-render in the same commit and its publish effect would then
tag its buttons with the *incoming* step's id. That is exactly the stale Continue that US3
forbids. The provider's value is fixed for the lifetime of that step's mount, so a late publish
from an outgoing step lands under the outgoing id, and the footer ignores it.

The provider is a context node and adds no DOM element, so the direct-parent contract in
`tests/steps/stepHost.renderSmoke.test.tsx` is untouched. `QuestionRecorderContext` and
`JumpContext` already wrap the component the same way (`StepHost.tsx:546-556`). Under 057
FR-062 the *footer* still reads the location model: it selects the entry for
`surveySessionStore.activeStepId`.

**Alternatives considered**:

- *Live `activeStepId` in the hook*: rejected because of the same-commit hazard above.
- *Capture `activeStepId` once in a `useState` initializer*: this is correct for StepHost-mounted
  steps, but it silently mis-tags a component that is mounted before the traversal settles.
  It is also invisible to standalone tests.
- *A `stepId` prop threaded to every step*: rejected. It changes 18 component signatures, and
  the provider already exists structurally.

## R-02: Where a publication goes when there is no StepHost (standalone unit tests)

**Decision**: When no `StepNavContext` is present, the hook publishes under a sentinel id,
`STANDALONE_STEP_ID`. The test harness outlet (R-07) renders that entry. The production footer
never selects it, because `activeStepId` is always a manifest id.

**Rationale**: Around 20 test files render a step on its own and query its nav handles
(Appendix B). FR-051 requires that they keep working through a shared harness rather than
wrapping each test in a provider. A sentinel keeps the production path strict (only a real,
active manifest id renders) while making the harness a single option.

**Alternatives considered**: throwing without a provider breaks every standalone test. A no-op
without a provider makes the buttons unfindable in tests.

## R-03: Equality guard and handler stability

**Decision**: The store compares the *descriptive* fields of each slot (presence, `label`,
`disabled`, `testId`, `ariaLabel`, `ariaDescribedBy`, `variant`) and ignores handlers. The hook
keeps the caller's latest handlers in a ref and publishes stable wrapper functions that call
`ref.current.<slot>.onClick()`.

**Rationale**: Callers build the spec inline on every render, with fresh closures each time.
Comparing handlers by identity would make every render a store write and re-render the footer
on every keystroke. The wrapper-over-ref idiom already exists in the codebase (the StudioShell
`startOverStore` writer), and it guarantees the footer always calls the *latest* closure. This
is FR-011: the step's own `handleBack` with its current cursor, not a stale one. This mirrors
`samePositions` in `stepWalkStore.ts` (FR-050's identity no-op).

`label` is a `string`, because every call site already resolves its label through the `t`
macro. React nodes would defeat the equality guard.

## R-04: Enforcing the one-publisher rule (FR-013)

**Decision**: Each hook instance takes an owner token from `useId()`. `publish(stepId, owner,
spec)` stores the owner beside the spec. If a *different* owner publishes for a step that
already has a live entry, the store keeps the first owner's entry and, in development and test
builds only (`import.meta.env.DEV`), calls `console.error` with both owner tokens.
`clear(stepId, owner)` only clears an entry that the same owner wrote.

**Rationale**: A nested wrapper that publishes by mistake would otherwise overwrite the inner
walk owner's Back with a step-boundary Back. That is the FR-011 violation, and it would be
invisible in production. Keeping the first entry makes the failure mode "the wrapper's buttons
never appear", which fails loudly in tests. The owner-checked `clear` also stops an outgoing
nested child from wiping its parent's entry. The existing guard in `CharactersStep` (it does
not publish a step walk while its nested flow does) is the precedent. For nav, the rule is
structural: wrappers simply do not call the hook.

**Alternatives considered**: last-writer-wins, which is silent and wrong; a stack of publishers,
which over-engineers a rule that says there is exactly one.

## R-05: Footer button treatment

**Decision**: Add `size?: "default" | "compact"` to `ui/Button`. `compact` sets the padding to
`4px 12px`, the font size to 13, `whiteSpace: nowrap` and `flexShrink: 0`, and drops the `back`
variant's legacy `marginTop: 20`. It keeps `ks-focus-ring ks-hit-target` and all three variants.
The footer maps the slots to variants as follows: `back` → `"back"`, `secondary` →
`"secondary"`, `forward` → `"primary"`.

**Rationale**: FR-023 requires the three-way visual distinction and the house hit-target rule.
`ks-hit-target` already provides `min-height: 44px` under `(pointer: coarse)`
(`src/index.css:38`), which is what FR-020a sizes the frame around. A `size` prop keeps one
Button component instead of forking a `FooterButton`.

## R-06: Frame height under coarse pointers (FR-020 / FR-020a)

**Decision**: Move the footer's `height` out of the inline style into a `.ks-studio-footer`
class in `src/index.css`: `height: 40px`, and `height: 52px` under
`@media (pointer: coarse)`. Keep `flexShrink: 0` and `overflow: hidden` inline.

**Rationale**: An inline style cannot express a media query. That is the same reason
`ks-hit-target` is a class. No current test asserts the inline `height`; the grep over
`StudioFooter.a11y.test.tsx` and `e2e/footer-progress.spec.ts` is empty. 52 = 44 + 2 × 4, which
is exactly FR-020a.

## R-07: Test harness (FR-051)

**Decision**: Extract the footer's nav cluster as `components/StepNavCluster.tsx`, which takes a
`stepId` prop. StudioFooter renders `<StepNavCluster key={activeStepId}
stepId={activeStepId} />`, and the `key` provides FR-032's remount. `renderWithI18n` gains an
option, `render(ui, { withStepNav: true })`, which renders `ui` followed by
`<StepNavCluster stepId={STANDALONE_STEP_ID} />` inside the same wrapper. A global `afterEach`
in `src/test-setup.ts` calls `useStepNavStore.getState().reset()`.

**Rationale**: Existing `getByTestId("marks-continue")`-style queries keep working unchanged.
Only the render call gains an option. StepHost-level tests (such as the golden walk) mount the
real StudioFooter or the cluster keyed on the active step.

## R-08: Carve strings (FR-044)

**Finding**: The retired v1 catalog entries (removed in `1dbb5266`) are *byte-identical* to the
labels that Carve V2 hard-codes today:

| id | en | fr (from `1dbb5266^`) |
|---|---|---|
| `editor.carve.backButton` | `← Back` | `← Retour` |
| `editor.carve.skipButton` | `Skip` | `Passer` |
| `editor.carve.continueButton` | `Continue →` | `Continuer →` |
| `editor.carve.loadingKeyboard` | `Loading keyboard…` | `Chargement du clavier…` |

**Decision**: Restore all four ids with their original source strings, including
`editor.carve.loadingKeyboard` for the loading state. Restore the fr values from `1dbb5266^`.
Only the nav group label (FR-034) gets a new id: `footer.nav.groupLabel`, "Step navigation".

**Deviation flagged**: FR-044 says the loading string "gets a new id". Reusing the retired
`editor.carve.loadingKeyboard` id is the same principle FR-044 applies to the three buttons
(same meaning, so the same permanent handle, and the translation comes back). It is recorded
here as a plan-level refinement. **If the reviewer prefers the spec's literal text, only the id
string changes.**

The arrows in `← Back` and `Continue →` stay, for label parity (FR-010). The other footer Back
buttons have no arrow; making them uniform is a separate copy change for Content.

## R-09: `aria-describedby` across subtrees (FR-033)

**Decision**: The body keeps rendering the "why blocked" hint and the question-flow progress
description, each with an id from `useId()`. The publisher passes that id as
`ariaDescribedBy`. The hint and the footer share one document, so IDREF resolution works across
subtrees. This confirms the spec's Assumption 3. The one hazard is a hint that is rendered
conditionally. When the hint is absent, the publisher must pass `ariaDescribedBy: undefined`,
because a dangling IDREF is an axe `aria-valid-attr-value` finding.

## R-10: Focus across a within-step screen change (FR-032, US4 scenario 3)

**Finding**: The cluster is keyed only by `activeStepId`, and the buttons inside it keep stable
keys (`back`, `secondary`, `forward`). A within-step cursor change therefore re-renders the same
`<button>` nodes, and the pressed button keeps focus natively. This covers a label that changes
from Next to Finish, or a count that changes. One case needs care: a slot that *disappears*
(for example, Back is absent on question 1). Only that slot unmounts. The forward button keeps
its key, and so keeps its focus.

## R-11: Pre-change baseline for parity (FR-010, SC-002)

**Decision**: Before migrating each step, record its nav state (label, disabled state,
accessible name, `aria-describedby` target text) per gating state in the step's existing unit
test, where one exists, as assertions against the in-body buttons. The same assertions then run
unchanged against the footer through `withStepNav`. The test that passes before and after the
move is the baseline. There is no separate snapshot artefact.
