# Decision-record provenance

Each `<base>.json` is the `.studio/decision-record.json` from one case zip of the #2302 testing-profiles
walk (`ks-2302-main/tools/testing-profiles-2302/zips/`, branch `km/2302-walk-zips`). They are copied
byte for byte, never edited. `scripts/genDecisionPoints.ts` reads them to write the decision-point fixtures.

| File | Base keyboard | Case id | Build |
|---|---|---|---|
| `kbdus.json` | `basic_kbdus` | `p1-whole-bafut-kbdus` | Branch `km/s02-deadkey-purpose` (the S-02 deadkey-purpose fix, since committed as `5d3a3e44`), walked 2026-10-29. This build is the uncommitted rebuild in the worktree, not the round-3 zip. |
| `kbdus.walk.kmn` | `basic_kbdus` | `p1-whole-bafut-kbdus` | `source/bafut.kmn` from the same zip. The T014 fidelity assertion compares against it. |
| `camqwerty.json` | `sil_cameroon_qwerty` | `p4-unwrap-bafut-camqwerty` | Round 3 on `origin/main` `2698f774` (commit `a8b65d3c` on `km/2302-walk-zips`). |
| `kbdfr.json` | `basic_kbdfr` | `p1-whole-ewondo-kbdfr` | Round 3 on `origin/main` `2698f774` (commit `e5c68ed6`). |
| `camazerty.json` | `sil_cameroon_azerty` | `p4-unwrap-ewondo-camazerty` | Round 3 on `origin/main` `2698f774` (commit `269eb596`). |

The round-3 records predate the S-02 fix, and any of them may carry `zzq` placeholder assignments from the
walk harness. Replace a record only by copying it from a newer walk zip, and update this table when you do.
