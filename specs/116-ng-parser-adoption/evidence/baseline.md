# Spec 116 baseline (before any change)

- keyboards corpus HEAD: 435f82d69bfc926eb03c2d8632571b41b6da3266
- pnpm install and pnpm build: OK

## Test pass counts (pnpm -r test)

| package | files | tests |
|---|---|---|
| contracts | 47 | 1096 |
| keyboard-lint | 60 | 606 |
| glottolog | 5 | 42 |
| oauth-backend | 12 | 314 |
| engine | 303 | 5066 passed, 3 skipped |
| studio | 777 | 11743 passed, 1 skipped |

## Engine corpus suite (vitest.corpus.config.ts)

- 13 files passed, 2 skipped (15); 1871 tests passed, 5 skipped. No failures.
- Note: this run overlapped authoring of the reader-timing corpus test, so the count may or may not include it.

## parse() timing baseline

- files timed: 1036
- total: 1104 ms
- slowest: release/h/hakka/source/hakka.kmn (176.7 ms)
