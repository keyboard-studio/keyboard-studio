# Architecture: Decisions Backend (spec 085)

The studio's questions, base-keyboard adaptation, flow ordering, and editors are one system. Its only semantic unit is the **Decision**.

## The Decision

```ts
interface Decision {
  id: DecisionId;                       // closed vocabulary, corpus-mined
  value: unknown;                       // typed per decision at use sites
  provenance: "asked" | "extracted" | "default";
  source?: string;                      // base keyboard identity, when extracted
}
```

- A **question** asks for one or more decisions. Asking is just one way a decision gets a value.
- The **base-keyboard scan** extracts the same decisions from the import bundle (parsed `KeyboardIR` + catalog entry: id, script, languages). Extraction is not a second pipeline — it is the same decision, filled differently.
- **Provenance** travels with every value. Nothing is ever silently a default.
- A `DecisionSet` is `Partial<Record<DecisionId, Decision>>`. An absent key means unresolved: not yet asked, gated out, or missing.

## QuestionModule

The module is the unit of declaration, not the unit of meaning. One module may provide several decisions; influence between decisions travels only through gating and derived ordering, never through module size.

| Field | Role |
|---|---|
| `provides: DecisionId[]` | the decisions this question settles (duplicate providers are a load-time error, per decision) |
| `requires: DecisionId[]` | must resolve first — drives the topological order |
| `gatedBy` | inclusion predicate; **derived** from `definition.next` via `gatedByFromNext`, hand-written only as an override |
| `extract(ctx: ExtractContext)` | reads the import bundle; the result runs through `validate()` — rejections fall through to asked/default |
| `renderer` | `ComponentType<DecisionRendererProps<T>>` — the single typed props contract |
| `definition` | the FlowQuestion: prompt, `next` routing, conditional branches |
| `inputs` / `writes` | declared `IRPath`s; `writes` is the containment set for the mutate apply path |
| `validate`, `fixtures` | unchanged |

## Ordering: derived, not listed

`orderDecisions(modules)` performs a stable topological sort over `provides`/`requires`. Three failures are named and thrown at load, never deferred:

- `unresolved decision: "<id>" required by "<module>"`
- `duplicate provider for decision "<id>": <a>, <b>`
- `dependency cycle: a -> b -> a` (names the cycle)

`gatedByFromNext(target, modules)` inverts the routing graph: for each target it collects every inbound conditional `next` rule (condition AND the negation of preceding conditions, mirroring `SurveyRunner.resolveNext`), evaluated against the provider decision's value. Unmappable conditions fail **open** — a question the author should answer is never silently dropped.

There is no hand-maintained order list. The legacy `content/flows/*.modular.yaml` playlists are deleted once parity tests prove the derived order matches them exactly.

## The DecisionId ↔ IRPath relation

Two DAGs must never diverge: the ordering DAG (which decision precedes which) and the data-flow DAG (which IR paths each module reads/writes). `decisionIRPaths: Record<DecisionId, readonly IRPath[]>` declares the relation, and the `decisionIRConsistency` lint asserts every provider module's `writes` cover its ids' mapped paths (prefix-or-equal). This is the seam the review demanded before any broad migration.

## The write path

Answers do not write to the IR directly. Step completion reduces to a patch, and `mutateApply` checks the patch against the module's declared `writes`, applies it as a path-scoped deep merge onto the single working copy, and rejects the whole patch — working copy untouched — on any violation. The reducer side of the seam is specified in `survey/types.ts` (T014); the apply path is `steps/mutateApply.ts`.

## Adaptation as diff

Adapting a base keyboard is `diffDecisions(extracted, answers)`:

- **confirmed** — extracted and never overridden (or overridden with a deep-equal value)
- **changed** — the author decided differently
- **missing** — no extraction and no answer yet

The old `adaptation/firing.ts` classifier (`classifyBaseScript`) is folded into target-script extraction provenance: one system answers "what did the base decide", and the provenance string names the threshold that decided it.

## What retires, and in what order

Risk-ordered, each wave gated by its parity test:

1. Per-phase registry fan-out → registration by decision id (mechanical)
2. Thin YAML order lists → deleted
3. `firing.ts` classification → folded into extraction
4. `steps/manifest.ts` spine → derived projection, **last** (constitution-named; the constitution is amended to name the registry when this lands)

In-flight drafts migrate automatically: `migrateDraft` maps old answer-keys onto decisions through a versioned table; unmappable answers surface visibly for re-answer, never silently dropped.

## Completing the vocabulary

The `DecisionId` union is discovered, not invented (spec's "nothing new under the sun"): the corpus harness runs the import pipeline over a catalog sample and records per-decision variance — decisions no keyboard varies become defaults with provenance — while every keyboard-lint submission gate is mapped to the decision(s) that satisfy it. Unmapped gates become the explicit gap list. Completeness criterion: every submission constraint traces to a decision; every decision is asked, extracted, or defaulted with provenance.

## Dev-only management

The question-management UI (create/edit/delete modules, inspect providers and consumers, deliberately break dependencies to see the named errors) renders only under `import.meta.env.DEV` on the `?demo=decisions` page. It ships in the bundle but cannot render in production.

## File map

```
packages/studio/src/decisions/
  decisionTypes.ts      Decision, DecisionId, QuestionModule extensions, ExtractContext,
                        DecisionRendererProps, decisionIRPaths
  orderDecisions.ts     orderDecisions, filterGated, gatedByFromNext, named errors
  decisionFlow.ts       extraction over the real bundle → ordering → gated filtering (planned)
  extractContext.ts     buildExtractContext(baseIr, baseKeyboard) (planned)
  adaptDiff.ts          diffDecisions with structural deep-equal
  migrateDraft.ts       draft migration table + orphan surfacing (planned)
  corpusMine.ts         catalog-sample variance mining (planned)
  gateCoverage.ts       gate→decision mapping + gap list (planned)
  DecisionTrailView.tsx read-only provenance trail (demo)
packages/studio/src/survey/
  types.ts              QuestionModule, the mutate seam (T014)
  questions/a/il_*.ts   the annotated identity-lite modules
  questions/registry.a.ts  registration by decision id
  FlowStepHost.tsx      step completion → mutateApply
packages/studio/src/steps/
  manifest.ts           the spine, retired last
  mutateApply.ts        contained apply path (planned)
packages/studio/src/adaptation/
  firing.ts             classifyBaseScript → folded into extraction (planned)
packages/studio/src/stores/
  workingCopyStore.ts   baseIr / baseKeyboard / baseVfs — the extract bundle source (no change)
content/flows/          thin YAML playlists — deleted after parity (planned)
```
