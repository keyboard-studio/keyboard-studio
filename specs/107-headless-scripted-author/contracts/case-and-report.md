# Contract: case input, PR-set manifest, run report

## Case file

A JSON array of `Case` objects ([data-model.md](../data-model.md#case)). `loadCases(path)` accepts the
`harness/cases.json` shape unchanged, plus optional `group`, `track` and `script`; when absent, `group`
is looked up from the corpus, `track` defaults to `copy`, and `script` comes from the identity step's
own prefill.

**Canonical file**: `packages/studio/src/test/headlessAuthor/cases/harness-cases.json` (FR-035), a byte
copy of `tools/testing-profiles-2302/harness/cases.json` from `km/2302-walk-zips` commit `a4bd8591`,
with `cases/PROVENANCE.md` beside it. The PR set and the scheduled run read this file; nothing fetches
cases from another branch. The Playwright harness should read from it or be synced from it (harness
owner's follow-up).

## PR-set manifest: `packages/studio/src/test/headlessAuthor/prSet.json`

```json
[
  {
    "caseId": "p1-whole-bafut-kbdus",
    "shape": ["simple"],
    "reason": "No deadkeys, no stores, one group; committed walk record anchors parity."
  },
  {
    "case": { "id": "pr-cree-woods", "base": "bj_cree_woods", "group": "bj", "...": "..." },
    "shape": ["regression-guard", "mixed-case-group", "any-index", "opaque-group", "non-latin"],
    "reason": "applyAssignments merged group(main) into group(Main): duplicate group failed kmcmplib.",
    "guards": "502fb061 (sameGroupName)"
  }
]
```

An entry names either `caseId` (a case in the canonical file) or an inline `case` (only for keyboards
outside the harness set: `bj_cree_woods`, `chechen_latin`), never both.

Initial entries (spec FR-031): `basic_kbdus`, `basic_kbdfr` (Ewondo), `bj_cree_woods`,
`sil_cameroon_qwerty`, `sil_cameroon_azerty`, `chechen_latin`. Rules:

- adding a keyboard is part of the fix for a keyboard-specific bug, in the same PR;
- the manifest test fails if a `regression-guard` entry has no `guards`, or if a shape FR-031 names is
  uncovered;
- more than 6 entries needs a re-measured budget (research R1) in the same change.

## Run report (per case, JSON)

Serialised `AuthorRun` minus `bundle` (bundle bytes are hashed: `bundleSha256`). Keys are stable and
sorted, so two reports diff cleanly.

## Sweep summary (per tier and shard, JSON)

See [data-model.md](../data-model.md#sweep-summary). File name
`headless-report-<tier>-<shard>.json`; the merge job writes `headless-report-<tier>.json`.

## Skip reasons

`SkipReason` is `missing`, `not-codec-clean`, `unsupported-script-stub`, `outside-slice` or
`too-large`. `too-large` means the keyboard's `ruleCount` exceeds `MAX_SWEEP_RULE_COUNT` (2,000;
research R6) and is decided only for the `latin` and `eligible` sweep tiers. Explicit harness,
PR-set and `KS_AUTHOR_CASE` runs are never size-capped. Every skip, `too-large` included, appears
in the summary's `skips` by reason and is never filed as an issue.

## Console output

Plain ASCII, one line per case: `[OK] <caseId> gates=8/8 placeholders=N`,
`[FAIL] <caseId> <gate> @ <decision point>: <detail>`, `[SKIP] <caseId> <reason>`,
`[WARN] ...`. No emoji (Art. VIII).
