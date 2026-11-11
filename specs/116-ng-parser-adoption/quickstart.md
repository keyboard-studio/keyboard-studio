# Quickstart: validating spec 116

Run from the repo root unless noted. Corpus suites need the sibling `../keyboards` checkout of the
keyboard-studio/keyboards fork at the commit pinned in `KEYBOARDS_CORPUS_SHA`
(see [tooling](../../docs/tooling.md#corpus-gated-tests)).

## Prerequisites

```sh
pnpm install
pnpm build            # runs prebuild; studio typecheck needs engine built
```

## Phase 1: rule-shape accessors

```sh
pnpm --filter @keyboard-studio/contracts exec vitest run src/rule-shape
pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts src/shared/rule-shape
pnpm lint
pnpm -r test
```

Expect:
- The accessor equivalence property test passes over the corpus.
- `pnpm lint` passes, including the raw rule-shape guard.
- `pnpm -r test` passes with no changed expectation (`git diff --stat` shows no edited `*.test.*`
  assertion or snapshot).

## Phase 2–3: reader swap and comments

```sh
pnpm --filter @keyboard-studio/engine exec vitest run src/codec
pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts src/codec/reader-differential
```

Expect:
- Every existing codec test passes unchanged.
- The comparison suite reports zero non-allow-listed differences in IR, emitted text, `nodeId`
  sequence, import status and comments. It writes its report to
  `specs/116-ng-parser-adoption/evidence/reader-differential.md`; commit that report at the end of
  Phase 3.
- After Phase 3, `parse-legacy.ts` no longer exists and nothing imports it.

Boundary checks:
- Importing `codec/ng/*` from outside the codec fails depcruise.
- Building the studio bundle succeeds, which shows the vendored parser uses no Node built-ins.

## Phase 4: additive IR members

```sh
pnpm --filter @keyboard-studio/contracts exec vitest run src/schemas
pnpm --filter @keyboard-studio/engine exec vitest run src/codec src/ldml-export
pnpm typecheck
```

Expect:
- Fixtures for `layer()`, `platform()`, `set`/`save`/`reset`, `call`/`return` and store `outs()`
  import as typed members and round-trip.
- The LDML classifier output on its fixtures is identical to before.
- A deliberately unhandled new kind in any consumer fails `pnpm typecheck`.

## Phase 5: capability table

```sh
pnpm --filter @keyboard-studio/contracts exec vitest run src/capability
```

Expect:
- Every IR kind path has a row, and every row's KMN export cell is `mapped`.
- Adding a scratch union member without a row fails, at compile time or in the test.

## Whole-feature gate

```sh
pnpm lint && pnpm typecheck && pnpm -r test
pnpm --filter @keyboard-studio/engine exec vitest run --config vitest.corpus.config.ts
```
