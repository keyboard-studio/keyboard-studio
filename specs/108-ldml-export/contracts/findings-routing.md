# Contract: LDML findings — shape, routing, grouping, i18n

**Spec**: FR-010–FR-019, FR-062 · **Research**: R25, R29

## Finding shape

`lint/ldmlFindings.ts` maps each item that carries a code (A, N and K items, and M items with a
hint such as row 3.16) to one `LintFinding`. M items without a code produce no finding.

| Field | Value |
|---|---|
| `code` | the item's `KM_LINT_LDML_*` code (mapping contract code table) |
| `severity` | `warning` for an A/N item whose construct is a **rule** (anything in a KMN group, including fragments inside a group). Otherwise `hint`, which covers header stores, touch presentation, package metadata and every K item (FR-010) |
| `layer` | `"C"` |
| `message` | `i18n._(msg({ id: "lint.ldml.<codeSlug>.message", values }))`: what LDML does instead, in plain language |
| `hint` | `lint.ldml.<codeSlug>.hint`: what the author could change, when the code has a remedy |
| `location` | `{ file: "source/<id>.kmn", line }` when the item has a line in the preview projection. Otherwise absent, and the message names the group and its owning pattern or behaviour (FR-017) |
| `origin` | absent: these are not upstream findings |

`<codeSlug>` is the code with the `KM_LINT_LDML_` prefix removed, in lower camel case, for
example `optionState` and `noKeyTrigger`.

**Never gating (FR-016)**:

- `outputBlockers` does not read LDML codes.
- Criteria resolution ignores `KM_LINT_LDML_*` codes. A test asserts this.
- `severity` is never `error`.

## Routing table (FR-015)

The studio routes a finding to a question surface first (`LINT_CODE_TO_QUESTION_IDS`). If there
is none, it routes to a step (`LINT_CODE_TO_STEP_IDS`, new). If neither applies, the finding goes
to the Output page.

| Code | Owner | Via |
|---|---|---|
| `KM_LINT_LDML_FRAME_KEY`, `KM_LINT_LDML_FORM_KEY_MISSING`, `KM_LINT_LDML_SHIFT_SIDE`, `KM_LINT_LDML_MNEMONIC`, `KM_LINT_LDML_CAPS_MODE`, `KM_LINT_LDML_MODIFIER`, `KM_LINT_LDML_MODIFIER_SIDES`, `KM_LINT_LDML_BKSP_NO_CONTEXT` | `mechanisms` | question `physical-layout` |
| `KM_LINT_LDML_TOUCH_PRESENTATION`, `KM_LINT_LDML_TOUCH_SPECIAL_KEY` | `touch` | question `touch-layout` |
| `KM_LINT_LDML_NO_KEY_TRIGGER` | `touch`. The parser sets `readonly` only on `NewContext`/`PostKeystroke` groups (`parse.ts:1218`), so rows 1.3, 1.4, 1.4b and 1.10 are all touch layer behaviour | question `touch-layout` |
| `KM_LINT_LDML_KEY_STORE`, `KM_LINT_LDML_NEGATED_CLASS`, `KM_LINT_LDML_CONTEXT_START`, `KM_LINT_LDML_GROUP_CHAIN_PARTIAL`, `KM_LINT_LDML_MATCH_NOMATCH_OUTPUT`, `KM_LINT_LDML_CALL`, `KM_LINT_LDML_PLATFORM_CONDITION`, `KM_LINT_LDML_OPTION_STATE`, `KM_LINT_LDML_BASELAYOUT_CONDITION`, `KM_LINT_LDML_LAYER_STATE`, `KM_LINT_LDML_NORMALIZATION`, `KM_LINT_LDML_OPAQUE`, `KM_LINT_LDML_BEEP`, `KM_LINT_LDML_EXPANSION_LIMIT`, `KM_LINT_LDML_NOTANY_MULTI`, `KM_LINT_LDML_CAPTURE_LIMIT`, `KM_LINT_LDML_UNREACHABLE` | `rules` | step `rules` |
| `KM_LINT_LDML_NO_LOCALE` | `identity` | question `iso_code` |
| `KM_LINT_LDML_HEADER_UNSUPPORTED`, `KM_LINT_LDML_METADATA_PACKAGE_ONLY`, `KM_LINT_LDML_KEYMAN_GAP`, `KM_LINT_LDML_ANSI_ONLY`, `KM_LINT_LDML_BASE_DEADKEY` | Output page (`BASE_DEADKEY` comes from the OS base keyboard, which the author changes through the layout survey answers, not through a key) | none |

- Routing is **by code alone**. `LintFinding` (contracts) gains no field.
- **Route fallback**: if the owning step is not in the author's current route (for example,
  `touch` on a keyboard without touch targets), the finding is treated as unmapped and appears on
  the Output page. A test pins this.
- **Output page**: every LDML finding is **also** listed in `LdmlDownloadPanel`, beside the
  download, whatever its owner (FR-015, last sentence). The Output page's generic "Other
  findings" panel excludes `KM_LINT_LDML_*`, so findings are not listed twice on one page.

## Grouping (FR-018)

- `LintSummary` gains `groupByCode?: boolean`. In grouped mode it renders one row per code:
  - the code's translated title, its count, and the severity of its findings;
  - the row expands to the individual `LintChip`s, each still carrying its line.
- Every LDML surface uses grouped mode.
- **Step badges**: `buildStepWarningCounts` counts each distinct `KM_LINT_LDML_*` code once per
  step, and counts every other code per finding as today. A step with 300 `OPTION_STATE` warnings
  and 2 `CALL` warnings therefore badges **2**.
- **Hints badge too.** FR-015 routes hints to steps on the same terms as warnings, so a
  hint-only LDML code (for example `TOUCH_PRESENTATION`) counts toward its step's badge. The badge
  counts codes, so this adds at most one per code.

## Studio strings (FR-019)

- Every id below has an `en` and a `fr` entry in `packages/studio/src/locales/{en,fr}/messages.json`.
  The `pnpm lint` i18n tiers enforce this.
- Id namespaces:
  - `output.download.ldml.*`: the button (`button.download`, `button.downloading`), the aria-label
    (`aria.ready`, plus the shared blocker descriptors), the profile picker (`profile.label`,
    `profile.option`, `profile.compilable`, `profile.tr35Only`), the base-keyboard picker (`base.label`, `base.option`, `base.default`,
    `base.unavailable`; FR-027), help text, the error alert, and
    the findings section heading;
  - `lint.ldml.<codeSlug>.{title,message,hint}`, one set per code (34 codes).
- The aria-label carries the keyboard id from `resolveOutputKeyboardId`, the same function the
  filename uses (WCAG 2.5.3). A test asserts that the aria-label's id equals the downloaded
  filename's id. This is the first such test, and it is added for the `.zip` and `.kmp` buttons too.
- The profile picker is a native `<select>` with a visible `<label>`. Each option's text includes
  the "Keyman compiles it" or "TR35-only (awaiting Keyman)" status, so the status never depends on
  colour or icon.
