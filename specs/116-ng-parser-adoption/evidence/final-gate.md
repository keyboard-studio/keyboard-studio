# Final gate (T069)

Run 2026-11-10 on branch `116-ng-parser-adoption`, Windows, Node 22.23.1. The corpus is
`../keyboards` at `435f82d6`, the CI pin (`KEYBOARDS_CORPUS_SHA`).

## Results

| Check | Result |
|---|---|
| `pnpm build` | pass |
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| `pnpm -r test` | pass: contracts 1157, engine 5129 (+3 skipped), studio 11743 (+1 skipped), keyboard-lint 611, oauth-backend 314, glottolog 42 |
| engine corpus suites (`vitest.corpus.config.ts`) | pass: 18 files, 1879 tests (+7 skipped) |
| studio corpus suites (`vitest.corpus.config.ts`) | 1 failure, which predates this branch (below) |

The spec 116 corpus suites all ran against the corpus; none was skipped for a missing corpus:

- `reader-regression.corpus.test.ts`
- `reader-timing.corpus.test.ts`: the budget test ran; its two baseline-recording tests skip by design
- `ng/lexer-equivalence.corpus.test.ts`
- `ng/parser-equivalence.corpus.test.ts`
- `shared/rule-shape-equivalence.corpus.test.ts`

## Regression found and fixed by this gate

The first run failed `pattern-apply/normalization-step/parity.corpus.test.ts` for `el_dinka`
and `sil_yoruba8`: "refused opaque-output-store".

**Cause.** Before T052–T059, a store whose body holds `outs()` was an opaque fragment with a
`storeSketch`, which is its expansion. `buildOutputRepertoire` read that sketch. Once those stores
became typed, the repertoire filtered them out through `withoutOutsStores`, and no sketch was left.
Every `any()` and `index()` over such a store was then unresolved.

**Fix.** `buildOutputRepertoire` maps a typed `outs()` store to its expansion through
`resolveStoreItems`, which is what the sketch held. Like the sketch, a reference that cannot expand
contributes nothing. A new unit test in `outputRepertoire.test.ts` pins this: it fails on the old
code and passes on the new.

## Failure that predates this branch

`studio/src/test/decisionPoint.carving.corpus.test.ts` > "at tolerance" > "no emitted rule
references a carved character in context or output" fails with
`rule#279: È Û à è é ì Ń`. The offending rule is in the generated `context_normalize` group.

The merge base `6c643b4f` (origin/main) fails the same way, with the same rule and the same
characters. So spec 116 did not cause it, and this branch leaves it alone.
