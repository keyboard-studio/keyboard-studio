# corpus-mine

Corpus mining harness (spec 087 T050, US5), relocated out of shipped studio
code (`packages/studio/src/decisions/`) per the 2026-10-14 vestigial audit §3:
it is a repeatable offline tool, not part of the authoring SPA.

`mineCorpus(sample, modules, sourceLabel)` runs each question module's
extractor over a sample of imported keyboards (real codec IR + catalog
metadata) and records per-decision variance. A decision no keyboard varies
becomes a default with provenance — the default comes from observed data,
not invention. Re-running it as the corpus grows is the mechanism by which
more decisions stabilize into defaults and fewer need to be asked.

It imports the studio decision spine (`decisionTypes`, `deepEqual`,
`extractContext`, survey types) and the engine codec by relative source
path — the standalone-utility pattern (see `utilities/kbgen`,
`utilities/facet-index`). Nothing in `packages/` imports it.

Run the tests from the repo root:

```sh
pnpm run test:corpus-mine
```
