# Contract identifiers

The spec pins no identifiers. These are chosen here and are the contract for tests.

| Id | Kind | Requirement |
|---|---|---|
| `KM_LINT_RAW_CTRL` | lintRuleId (layer-c-enforce) | FR-001 |
| `KM_LINT_SIDED_CTRL_ADVISORY` | lintRuleId (advisory) | FR-004 |
| `KM_LINT_CTRL_ALT_UNSIDED` | lintRuleId, stub, awaiting owner | FR-005 |
| `KM_LINT_TOUCH_CTRL_LAYER_NAMES` | lintRuleId, stub, awaiting owner | FR-007 |

Upgrade pair: `{ lintRuleId: "KM_LINT_RAW_CTRL", build }` in `UPGRADE_PAIRS`; fix id `upgrade:KM_LINT_RAW_CTRL:<file>`.
