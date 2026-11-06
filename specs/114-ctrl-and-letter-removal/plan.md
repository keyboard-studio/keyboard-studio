# Implementation Plan: Ctrl rules and removing needed letters

**Spec**: [spec.md](spec.md) | **Branch**: `114-ctrl-and-letter-removal`

## Summary

Add a raw-Ctrl criterion (keyboard-lint check, `criteria.json` row) and a sided-Ctrl advisory, pair the raw-Ctrl criterion with an upgrade that splices the Ctrl rules out and returns their characters to the inventory unplaced, stop the galleries and touch editor from offering Ctrl planes or layers, and show a dismissable needed-letter warning on every removal path. FR-005 and FR-007 get no rows and no code until the owner rules.

The work follows the existing seams: a check under `packages/keyboard-lint/src/checks/criteria/`, a pair in `packages/studio/src/criteria/upgradePairs.ts`, the per-language needed-letter map from the per-tag exemplar data in `packages/studio/src/lib/openExpectedInventory.ts`.

## Project Structure

```text
packages/contracts/data/criteria.json                     + 2 rows (raw Ctrl, sided Ctrl advisory)
packages/keyboard-lint/src/checks/criteria/
  check-raw-ctrl.ts (+ test)                              FR-001 (the FR-004 advisory is its own check, check-sided-ctrl-advisory.ts)
packages/studio/src/criteria/
  implementedChecks.ts, upgradePairs.ts                   register check and the FR-002 pair
  rawCtrlUpgrade.ts (+ test)                              IR edit, projectKmnText splice, inventory return
packages/studio/src/test/gateCoverage.ts                  coverage rows for the new rule ids
packages/studio/src/editors/assignLoop/                   MechanismGallery, TouchGallery, touchBuilder: no Ctrl plane/layer (FR-003)
packages/studio/src/lib/irToCarveNodes.ts                 carve removal covers CTRL planes (FR-003, check only)
packages/studio/src/lib/removalWarning.ts (+ hook/UI)     FR-006, built on the per-tag exemplar data in openExpectedInventory.ts
```

**Structure Decision**: no new package. The splice and warning UI stay in `studio` where the upgrade registry and galleries already live; the check is Layer C in `keyboard-lint`.

## Constitution Check

| Principle | Assessment |
|---|---|
| Art. II (IR is the spine, text splices) | PASS: fix edits the IR and projects with `projectKmnText`. |
| Art. VI (team split) | PASS: engine owns splice, gallery limits, warning UI; content owns row and wording. |
| Art. X (suggestions, never blocks) | PASS: fix is an offer; warning is dismissable. |
| D3 single debounce | PASS: no new validating timer; check runs in the existing cycle. |
| Pattern schema locked | PASS: no `Pattern` change. |

No violations; no Complexity Tracking.

## Phases

1. **Check + rows** (FR-001, FR-004, FR-008): check with `basic_*` exemption, Space exemption, same-as-base-digit exemption; census run over `../keyboards/release` (SC-001).
2. **Upgrade** (FR-002): pair, inventory return with de-dupe against other rules (SC-002).
3. **No new Ctrl** (FR-003): gallery and touch editor filters; verify carve removal with basic_kbdurdu (SC-004, SC-005).
4. **Removal warning** (FR-006): NFC-normalised lookup returning languages per character; wired to carve, Remove tool, gallery deletion (SC-006).
5. **Stubs** (FR-005, FR-007): criteria rows only, marked awaiting the owner.

The spec's open questions are decided in research.md.
