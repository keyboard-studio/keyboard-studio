# Contract: Documentation Layer C checks (spec 076, US7 / FR-019)

Thirteen criteria rows (thirteen codes) land as pure check functions in twelve modules in
`packages/keyboard-lint/src/checks/docs/`, input `DocLintInput`
([../data-model.md](../data-model.md) §7), output `LintFinding[]` on the existing
contract. **No criteria.json edits** — every row already carries its `lintRuleId`;
each check's `code` string-matches it. All findings: `severity: "warning"`,
`layer: "C"`, `hint` populated with plain-language remediation, `location.file` set to
the member's projected path.

| Criteria row | `code` (= existing `lintRuleId`) | Check module | Fires when |
|---|---|---|---|
| 3.3 | `KM_LINT_HISTORY_ORDER` | `check-3-3-history-order.ts` | top entry's version is not the newest among parsed entries |
| 3.4 | `KM_LINT_HISTORY_TRUNCATED` | `check-3-4-history-cumulative.ts` | base HISTORY entries present at instantiation are missing from current text (needs `baseHistoryMdText` in input) |
| 3.5 | `KM_LINT_HISTORY_ENTRY_FORMAT` | `check-3-5-history-entry-format.ts` | an entry heading doesn't match `<version> (<YYYY-MM-DD>)` + bullet items |
| 3.6 | `KM_LINT_HISTORY_VERSION_MISMATCH` | `check-3-6-7-1-version-match.ts` | top HISTORY version ≠ keyboard version (message names both — US7-1) |
| 3.7 | `KM_LINT_HISTORY_STALE_FILE_REFS` | `check-3-7-history-stale-refs.ts` | a bullet references a filename in `deletedFilenames` |
| 4.7 | `KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT` | `check-4-7-copyright-holder.ts` | holder strings across LICENSE/.kmn/.kps/README/HISTORY are not identical (absent files skipped) |
| 5.7 | `KM_LINT_README_TARGETS_MISMATCH` | `check-5-7-readme-targets.ts` | README platform list ⊄/⊅ `targets` (names the extra/missing platform — US7-2) |
| 7.1 | `KM_LINT_KMN_VERSION_MISMATCH` | `check-3-6-7-1-version-match.ts` (shared module, two codes) | same fact as 3.6 viewed from the `.kmn` side; one shared comparison, two codes emitted at most once each, never duplicated per file |
| 11.5 | `KM_LINT_HTML_NOT_WELL_FORMED` | `check-11-5-html-wellformed.ts` | tag-balance scanner finds unbalanced/unclosed elements in welcome or help body (dependency-free scanner, not DOMParser — research R7 deviation, documented in module header) |
| 11.6 | `KM_LINT_PHP_DATA_STATES_INCOMPLETE` | `check-11-6-data-states.ts` | help page `data-states` names a layer not in `layerIds` (phantom layers; complement of 11.2) |
| 11.7 | `KM_LINT_PHP_PAGENAME_FORMAT` | `check-11-7-pagename-format.ts` | `$pagename` doesn't match the [help-header contract](help-header.md) format |
| 11.9 | `KM_LINT_PHP_HTM_BODY_MISMATCH` | `check-11-9-body-parity.ts` | welcome vs help body differ after stripping header/layout section and normalizing whitespace (US7-3) |
| 11.10 | `KM_LINT_PHP_HTM_STYLE_MISMATCH` | `check-11-10-style-parity.ts` | inline CSS differs modulo non-rendering whitespace |

Conventions (matching the existing check corpus):

- One module per row (3.6+7.1 share one), module-header comment quoting the criteria
  text and scope guards, co-located `*.test.ts`, returns `[]` on absent input, never
  throws.
- Registered in `lintContext.ts`'s ordered list behind a `ctx.docLintInput` gate, and
  exported from the package barrel.
- **Bijection test** (new): asserts every FR-019 `lintRuleId` in `criteria.json` has a
  check emitting that code — closes the known unenforced-linkage gap.
- **Severity ceiling**: warning. No error-severity Layer C documentation check may be
  added (existing layer-boundary convention; FR-018).

## Studio wiring

```ts
// packages/studio — new hook, useTouchKeyDiagnostics precedent (no new timer, D3)
function useDocumentationFindings(): LintFinding[];
// pure assembly of DocLintInput from rendered members + store slices
function collectDocLintInput(...): DocLintInput;
```

- Memoized on the same inputs the docs preview consumes; recomputed inside the
  existing cycle; concatenated into the findings array `StudioShell` already renders.
- **Upstream classification (FR-020)**: baseline findings computed once per
  instantiation from base member texts; a current finding is `origin: "upstream"` iff
  its code appeared in the member's baseline AND the member's tier is still
  `inherited` (research R8). Upstream findings render muted (existing `LintChip`) and
  are excluded from `LintSummary` headline counts (new).
- **Non-blocking (FR-018)**: doc findings never enter `canDownload` /
  `submitEnabled` / `isBlockingFinding` inputs (warning severity already guarantees
  the latter; a regression test pins it).

## SC-007 fixture contract

For each of the thirteen rows: one deliberately-broken fixture producing exactly one
finding for that row, and one clean fixture producing zero documentation findings.
