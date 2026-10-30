# Harness case definitions: provenance

`harness-cases.json` is the canonical copy of the 32 testing-profile cases (spec 107 FR-035).

| Field | Value |
|---|---|
| Source branch | `km/2302-walk-zips` |
| Source commit | `a4bd8591be30360e06ec4c6b88812f5376d84548` (the last commit touching the file) |
| Source path | `tools/testing-profiles-2302/harness/cases.json` |
| Copied | 2026-10-30, byte for byte (SHA-256 `6120cda52e6971a80eb4b877bac6dcad421ced636d45be3c39336a80527973cb`) |

## Rules

- This copy is canonical. The PR set (`../prSet.json`) and the scheduled sweep
  (`.github/workflows/headless-sweep.yml`) read it; no run fetches case definitions from another
  branch.
- A change to a case is a change to this file, reviewed like any other.
- Follow-up for the harness owner: the Playwright harness on `km/2302-walk-zips` should read from
  this file or be synced from it. That branch is not edited by spec 107.
