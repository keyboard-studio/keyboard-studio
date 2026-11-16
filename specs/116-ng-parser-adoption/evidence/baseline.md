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

## CI runner timing baseline

The GitHub-hosted runner reads the corpus about 1.9x slower than the machine
that recorded the baseline below, and varies by up to 1.9x between runs, so on
CI (`CI=true`) the speed budget compares against these numbers instead: the
slowest of seven main runs of the current reader (2026-11-12 to 2026-11-15,
runs 43180566533 to 43726373372), each allowed 1.3x.

- lex+line-parse total: 3426 ms
- lex+line-parse slowest file: 605 ms
- full path total: 4955 ms
- full path slowest file: 801 ms

## parse() timing baseline

- files timed: 1036
- total: 1104 ms
- slowest: release/h/hakka/source/hakka.kmn (176.7 ms)
