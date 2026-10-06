# Contracts: Decisions Backend (specs/087-decision-backend)

The interfaces this feature exposes. Identifiers below are the spike's established vocabulary (the spec pins no verbatim identifiers, so these exact strings *are* the contract — do not rename, recase, or pluralize them downstream).

## ExtractContext (Q1)

```ts
interface ExtractContext {
  ir: KeyboardIR | null;
  catalog: BaseKeyboard | null; // id, script, languages[], displayName, version
}
```

`extract(ctx: ExtractContext): unknown` on `QuestionModule`. Null `ir` → the extract returns `undefined` (decision missing; the question is asked). Language identity (code/script/name) reads from `catalog`, where the codec does not populate it.

## Ordering

- `orderDecisions(modules: QuestionModule[]): QuestionModule[]` — stable topological sort over `provides`/`requires`. Throws, fail-fast at load:
  - `unresolved decision: "<id>" required by "<module>"`
  - `dependency cycle: a -> b -> a` (names the cycle)
  - `duplicate provider for decision "<id>": <a>, <b>` (per-decision rule)
- `filterGated(modules, decisions: DecisionSet): QuestionModule[]` — applies `gatedBy`.
- `gatedByFromNext(target: FlowQuestion, modules: readonly QuestionModule[]): ((d: DecisionSet) => boolean) | undefined` — inverts `definition.next` routing into per-target clauses; unmappable conditions fail **open** (question shown). Hand-written `gatedBy` overrides the derived one.

## Diff

- `diffDecisions(extracted: DecisionSet, answers: DecisionSet): DecisionDiff[]` — per id, `confirmed | changed | missing`, compared with deep-equal.

## Renderer (FR-011)

```ts
interface DecisionRendererProps<T> {
  value: T | undefined;
  onChange: (value: T) => void;
  decisionId: DecisionId;
}
```

`renderer?: React.ComponentType<DecisionRendererProps<unknown>>`. The dev-only management UI (`?demo=decisions`, gated by `import.meta.env.DEV`) is out of contract scope.

## Draft migration (Q5)

- `migrateDraft(answers: Record<string, unknown>): { decisions: DecisionSet; orphans: string[] }` — old answer-keys mapped through the versioned table; orphans returned for visible surfacing, never dropped.

## DecisionId ↔ IRPath relation

- `decisionIRPaths: Record<DecisionId, readonly IRPath[]>` — the declared relation between the ordering DAG and the data-flow DAG.
- The `decisionIRConsistency` lint asserts every provider module's `writes` cover its ids' mapped paths.
