# Contract: KeyboardIR → LDML keyboard3 mapping — profile `49` (deltas from `46`)

**Spec**: [../spec.md](../spec.md) (FR-060, FR-061, FR-066) · **Base profile**:
[ldml-mapping.md](ldml-mapping.md) · **Evidence**: [../research.md](../research.md) R13, R28

| Profile field | Value |
|---|---|
| Profile id / `conformsTo` | `49` |
| Namespace | `https://schemas.unicode.org/cldr/49/keyboard3` (an identifier; research R28) |
| TR35 revision written against | CLDR 49, `tr35-79` (2026-10-21) |
| Keyman release defining the hardware subset | none: **TR35-only (awaiting Keyman)**. The pinned Keyman schema accepts `conformsTo` 45 and 46 only (research R16) |
| Based on | profile `46`, every row and section not listed below unchanged |
| Validation | CLDR 49 `ldmlKeyboard3.dtd` (via `xmllint-wasm`) and the FR-052 TR35 checker. Not compiled with Keyman (FR-050, FR-065) |

This file lists **only** the rows that differ from profile 46. The implementation is a delta
table in `engine/src/ldml-export/profiles/profile49.ts` that names the same row ids. A parity
test fails if either side has a row the other lacks (spec SC-011).

## Header deltas

| Item | Profile 46 | Profile 49 |
|---|---|---|
| `keyboard3/@conformsTo` | `46` | `49` |
| `keyboard3/@xmlns` | `…/cldr/46/keyboard3` | `…/cldr/49/keyboard3` |
| `keyboard3/@draft` | not written | not written: it is a CLDR-repository review status, not author data (research R13) |
| `version/@cldrVersion` | not written | not written: the DTD fixes it to the CLDR release (research R28) |
| CLDR imports | none (row 4.15) | none (row 4.15) |

## Row deltas

| # | Profile 46 | Profile 49 | Code change |
|---|---|---|---|
| 4.10 `info/@attribution` | K, omitted, hint `KM_LINT_LDML_KEYMAN_GAP` | **M**: `<info attribution="…">` holds the attribution text that the header comment also carries (FR-041, FR-066) | the hint is removed |
| 3.7 set mapping | M only when the mapping is capture group 1 **and** the whole `to` | **M** for a mapping on **any** capture group (`$[N:set]`, N 1–9), alone or mixed with other text in `to`, one mapping per `index()` | — |
| 3.8 several `index()` in one rule, or a mapping not in group 1, or a mixed `to` | M by cartesian expansion | **M without expansion**: each `index(store, n)` becomes `$[n':set]`, where n' is the capture group of its `any()`. Expansion is used only when an `index()` refers to an `any()` the export could not make a capture group | — |
| 3.9 expansion beyond the cap | N, `KM_LINT_LDML_EXPANSION_LIMIT` | unchanged in kind, but reachable only through the residual expansion case of 3.8 | — |

Rows 3.13 (`$1`–`$9`) and 3.11 (`notany` multi-codepoint) are unchanged: TR35 49 has the same
limits.

## Unchanged by design

- **Section 5 (touch)**: identical. The 46 → 49 format delta has no touch-schema change
  (research R13).
- **Hardware half**: under profile 49 it follows TR35 in full (FR-005). The only hardware
  constructs where Keyman 19 is stricter than TR35 are rows 3.7/3.8 above.
- **Report**: the delivery note says the file cannot be compiled by any shipping Keyman, and the
  FR-064 "gained" list shows rows 4.10 and 3.7/3.8 moving to M (or to smaller output) relative
  to 46.

## Lift condition (FR-063)

Profile 49 becomes Keyman-compilable when a pinned `@keymanapp/common-types` schema accepts
`conformsTo="49"` **and** `info/@attribution`, **and** the pinned `kmc-ldml` accepts `$[N:set]`
with N > 1. The FR-065 test is written to work both ways ([test-harnesses.md](test-harnesses.md)), so it
then fails, and the profile's label must change in the same PR.
