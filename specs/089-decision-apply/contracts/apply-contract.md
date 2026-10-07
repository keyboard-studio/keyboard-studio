# Contract: `apply` and the apply runner (specs/089-decision-apply)

The interface spec 090 builds on: gallery and picker modules will declare the
same `apply` and be executed by the same runner. Numbered clauses are the
contract; file references are to the tree this plan was written against.

**A1 — One hook.** A question module expresses its entire keyboard effect as
`apply(value, ctx) → WorkingCopyPatch` on `QuestionModule`
(`packages/studio/src/survey/types.ts`). There is no second write hook:
`mutate` is deleted, and no adapter, factory options record, or step component
writes a store on a question's behalf.

**A2 — Purity.** `apply` reads only its `value` and `ctx`
([data-model.md](../data-model.md): `ir`, `writes`, `decisions`,
`currentHistoryEntryState`). It writes no store, reads no store, and performs
no I/O. The same `(value, ctx)` always yields a deep-equal patch — this is
what spec 093's replay will depend on.

**A3 — Patch shape.** The return is a `WorkingCopyPatch`: optional channels
`ir`, `identity`, `attribution`, `helpDocs`, `historyEntryState`, each a
whole-value replace of the corresponding working-copy field. `{}` is a valid
patch. A new channel is a change to this contract and to
[data-model.md](../data-model.md), never a local extension.

**A4 — Containment.** The runner checks the `ir` channel with
`applyMutatePatch(base, patch.ir, module.writes)`
(`packages/studio/src/steps/mutateApply.ts`) before writing anything: a leaf
outside the declared `writes` throws `MutatePatchContainmentError`, the whole
patch is rejected, and the working copy is untouched (SC-003). Overlay channels
are authorized by the channel table in data-model.md; an unauthorized channel
throws `ApplyChannelError`, likewise before any write.

**A5 — One runner, unconditional.** `applyDecisionEffects` in
`packages/studio/src/steps/reducer.ts` is the only executor of `apply`. It
runs on every survey-question completion, from the host's generic completion
path, before `advance`. No flag, env var, or per-flow switch may gate it.

**A6 — Recording precedes applying.** 088's recording writes the completion's
decisions into `decisionStore` before the runner runs, so `ctx.decisions`
always contains the completing answers themselves plus every earlier decision.
A composed `apply` therefore never reads the raw `SurveyPhaseResult` for a
sibling's value.

**A7 — No-effect decisions.** A decision with no keyboard effect declares
either an explicit `apply: () => ({})` (when the spec names the decision, as
with `authoring-track`) or no `apply` at all. It never declares a placeholder
patch channel.

**A8 — Ordering.** Within one completion, patches apply in answer order, and
channels within a patch in the order `ir → identity → attribution → helpDocs →
historyEntryState`. Composed effects have exactly one owner module
(data-model.md table); no other module in the same flow returns that channel.
