# Contract: Live extraction (specs/092-live-extraction)

The interfaces this feature establishes. These are internal studio
contracts (all in `packages/studio`); no public API and nothing in
`packages/contracts` changes.

## The extraction pass

```ts
runLiveExtraction(deps: {
  modules: readonly QuestionModule[];   // the live registry, derived order
  ctx: ExtractContext;                  // buildExtractContext(baseIr, baseKeyboard), post-setup
  store: DecisionStore;                 // 088's decisionStore
}): { seeded: DecisionId[]; offered: DecisionId[] }
```

- Runs **once**, synchronously inside the setup commit, after the setup
  decision's `apply` has instantiated the working copy. No timer, no
  subscription, no effect-per-step.
- Per module, in `orderByDependencies` order: skip if gated off; run
  `extract(ctx)`; a `null` result is absent; run the module's `validate()`
  over the result — a rejection makes it absent.
- Merge rule (the whole contract in one paragraph): an **unanswered**
  decision is seeded `{ value, provenance: "extracted", source: <starting
  point keyboard id>, inputs }`; an **already-answered** decision keeps its
  record and gains `offered: <extracted value>`; a decision with no
  extracted value is left alone. Lookup defaults run in the same pass and
  produce `{ provenance: "default", source: <lookup name> }` under the same
  merge rule.
- Returns the ids it seeded and the ids it offered to, so the caller (and
  the SC-002 measurement) can count the pass's effect without re-reading
  the store.
- Idempotent over an unchanged store + bundle.
- A throwing `extract`/`validate` aborts the pass with the module id named
  (the `runDecisionFlow` precedent) — a broken extractor is a loud defect,
  never a silent skip.

## The setup decision

- `requires` includes `"authoring-track"` and `"base-keyboard"`.
- Its `apply` is the only code that instantiates the working copy in the
  live wizard; it runs through 089's patch runner and the declared-writes
  check, once, with the track known.
- After its `apply` completes, and only then: the extraction pass runs,
  and `recordBaseContribution` is called (its inputs — base keyboard, base
  IR, instantiation mode — exist by construction at that point).

## Renderer source labels

- Default (question) renderer: given a decision record, renders the source
  label naming `source` (for `extracted`, the starting-point keyboard —
  "from <keyboard>"), and renders `offered` beside the author's value when
  `offered` is set and differs.
- Custom renderer (`DecisionRendererProps`, 090): receives `provenance`,
  `source` and the record's `offered` through props; same label rule.
- No renderer computes a seed, a source, or an offered value itself.

## `il_copyright_holder` (FR-005)

- `requires: ["author-name", "authoring-track"]` — the only module
  declaration change the acceptance test is allowed.
- Seeding disposition by track: `authoring-track = adapt` → the extracted
  copyright seeds the record; `authoring-track = copy` → no extracted seed;
  the D1 default-to-author applies.
