# Golden-walk baseline record (spec 089 SC-001 / T003)

**Baseline**: `basic-kbdfr-copy.zip` — the source .zip emitted by the fixed
copy-track walk in `../../golden-walk.spec.ts` (basic_kbdfr, fixed answers;
see that file's header for the exact answer set and the comparison shape —
per-entry bytes, with `.studio/decision-record.json` presence/parse-only
because it embeds wall-clock timestamps by design).

**Capture environment (pinned, research R9)**: `VITE_KM_MUTATE_SEAM=1`.

**Capture command (one command, from `packages/studio`)**:

```
GOLDEN_WALK_CAPTURE=1 VITE_KM_MUTATE_SEAM=1 npx playwright test e2e/golden-walk.spec.ts --project=desktop
```

## Capture status

- **Stacked-base capture: PENDING.** The walk script is written and the
  capture was attempted 2026-10-06 on the merged stacked base
  (`km/decision-apply` @ `25d4e075`, 088 landed through `cab37e02`), but the
  implementation sandbox's Chromium (/opt/meta-chromium) refuses every
  localhost navigation with `net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`
  — the same block recorded in spec 088's T019 evidence (localhost and
  127.0.0.1, with LocalNetworkAccessChecks disable-features flags). The
  capture must run where a browser permits localhost (a developer machine
  or the CI e2e lane). No baseline zip is committed yet; the verify mode
  fails loudly on a missing baseline rather than passing vacuously.
- **Literal-`main` capture + cross-base diff (amended T003): PENDING**, for
  the same reason. When both captures exist, record here: the two base
  commits, the capture date, and either "diff empty" or the name of the
  differing surface (the stacked-base capture stands either way, per the
  OI-2 ruling).

## Re-capture notes

- After 088's final commits land and this branch restacks, re-capture on
  the new base and update this record (the lead orders the restack).
- The HISTORY proposal carries the capture date: a re-capture on a
  different day legitimately differs in the HISTORY entry alone. Record
  the capture date here on every capture so that diff is attributable.
