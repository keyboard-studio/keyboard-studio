# SC-004 perf evidence — spec 093 (derived keyboard)

Evidence for owner ruling (b) in [plan.md](plan.md). The thresholds are
**PROPOSED, pending Matthew's ruling** — recorded here as proposals, never as
pass/fail gates, until he rules:

| Scenario | Proposed threshold (PROPOSED — not a gate) |
|---|---|
| `edit` — single-decision edit rebuild on `sil_euro_latin` | < 300 ms |
| `resume` — full rebuild on load on `sil_euro_latin` | < 2 s |

## Baseline (task T002, 2026-10-06) — current pre-093 working-copy path

Measured by `packages/studio/src/decisions/rebuildPerf.measure.ts`, run via
`pnpm vitest run --config vitest.measure.config.ts` from `packages/studio`.
No replay engine exists yet, so the scenarios run against the current
working-copy path — the closest faithful reading of the plan's definitions
on today's code, and the comparator T021 re-measures against the replay path:

- **edit** = one decision answer (`pb_standard_letters`, alternating
  `basic-az` / `extended-latin` so every run does real work) applied through
  the real reducer mutate seam (`applyStepCompletion`, `VITE_KM_MUTATE_SEAM=1`
  as in the SC-004 gates), followed by the full output projection
  (`projectWorkingCopyForOutput` — the projection the OSK preview and the
  ZIP/PR output paths share) and a read of the projected `.kmn`.
- **resume** = the draft-load restore reduced to its working-copy core
  (`prepareWorkingCopySnapshot` + `useWorkingCopyStore.setState`, from a
  `snapshotWorkingCopyData()` snapshot — what a draft saves today), followed
  by the same projection + `.kmn` read. This is the cost 093 replaces with a
  full replay on load.

Setup (untimed): the real `sil_euro_latin` package from the sibling
`../keyboards` corpus (source `.kmn` 12,701 bytes; parsed IR: 57 stores,
5 groups), Track 1 instantiation, then the SC-004 adapt decision flow
(identity, attribution, character inventory of 578 chars) so the working copy
carries a realistic decision set. Projected `.kmn`: 12,701 chars.

Run count is fixed at **15 measured runs per scenario after 3 warmups**; the
reported figure is the median (data-model.md, PerfMeasurement). The procedure
was executed twice on 2026-10-06; both executions are recorded — neither is
hidden.

| Scenario | Run | medianMs | meanMs | minMs | maxMs | runs |
|---|---|---|---|---|---|---|
| edit | 1 | 33.14 | 33.38 | 8.68 | 77.90 | 15 |
| edit | 2 | 7.54 | 10.34 | 5.37 | 28.56 | 15 |
| resume | 1 | 8.54 | 13.77 | 3.07 | 52.16 | 15 |
| resume | 2 | 9.94 | 22.30 | 3.87 | 75.09 | 15 |

Raw series, run 1 — edit (ms): 49.55, 77.90, 13.34, 9.50, 10.87, 8.95, 8.68,
21.59, 44.88, 37.55, 69.15, 65.37, 33.14, 35.86, 14.30.
Resume (ms): 52.16, 9.13, 8.13, 8.20, 46.50, 17.64, 12.37, 9.58, 6.99, 7.52,
8.54, 8.83, 3.07, 4.54, 3.31.

Raw series, run 2 — edit (ms): 11.14, 13.79, 28.56, 10.82, 11.41, 9.65, 6.02,
5.88, 7.54, 6.04, 7.11, 5.37, 5.98, 6.63, 19.11.
Resume (ms): 6.36, 7.60, 8.94, 9.34, 9.94, 28.89, 14.51, 67.23, 40.53, 30.97,
75.09, 15.44, 8.93, 6.82, 3.87.

### Run conditions

- Machine: VM `htch-runtime`, AMD EPYC 9D25 (2 vCPUs visible), Linux
  7.0.0-39-generic, Node v24.20.0.
- Environment: vitest with the package's jsdom environment, in Node — **not
  a browser**. Absolute numbers in a real browser may differ; T021 runs the
  identical harness against the replay path, so the before/after comparison
  is like-for-like.
- The VM was shared with sibling agents' work during measurement; the edit
  median's run-to-run spread (33.14 vs 7.54 ms) reflects that contention.
  The resume median was stable (8.54 vs 9.94 ms). Read the baseline as:
  edit is in the **single-digit-to-tens of ms** range, resume is **~10 ms**,
  on this hardware.

### Reading against the PROPOSED thresholds (evidence only)

On the current path, both scenarios sit well inside the proposed numbers —
edit at roughly a tenth or less of the proposed 300 ms, resume at roughly
two orders of magnitude under the proposed 2 s. That says nothing by itself
about the replay path: replay rebuilds from decisions instead of restoring a
saved working copy, and its cost is what T021 measures. These baselines exist
so that comparison has a "before".

## T021 — replay-path re-measurement

_To be appended by task T021 when the replay path lands, using the identical
harness and run count, presented against the same PROPOSED thresholds as
evidence for ruling (b)._
