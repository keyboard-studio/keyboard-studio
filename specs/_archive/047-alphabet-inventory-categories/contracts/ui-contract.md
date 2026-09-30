# UI Contract: "How your alphabet breaks down" + "Your alphabet"

This feature exposes no API/CLI/schema. Its contract is the UI surface the tests
(`BuildListView.test.tsx`, `phaseBDraftStore.test.ts`) code against. Identifiers below are
verbatim; existing ones are reused, new ones marked **NEW**.

## Breakdown sections (center pane, `AlphabetBreakdown`)

Order top-to-bottom; each section renders **only when non-empty** (FR-006). Section headings
carry a count `(<n>)` as today. `data-testid`s:

| Section | `data-testid` | Members | Status |
|---|---|---|---|
| Letters | `alphabet-letters` | letter graphemes (`\p{L}`), case-collapsed | existing |
| Marks | `alphabet-marks` | combining marks (`\p{M}`) | existing |
| Accented letters | `alphabet-accented` | attested base+mark stacks | existing |
| Numbers | `alphabet-numbers` | `\p{N}` | **NEW** |
| Punctuation | `alphabet-punctuation` | `\p{P}` | **NEW** |
| Symbols | `alphabet-symbols` | `\p{S}` | **NEW** |
| Separators | `alphabet-separators` | `\p{Z}` | **NEW** |
| Control/other | `alphabet-controls` | `\p{C}` (surviving the whitespace skip-set) | **NEW** |

- The five new sections render **beneath** `alphabet-accented` (FR-004).
- Members within every section are ordered by the default ICU collator (FR-007).

## Uppercase toggle (Letters section)

- **NEW** control labelled **"Show uppercase letters"**, `data-testid` `letters-uppercase-toggle`,
  default off. Toggling on additionally shows the derived uppercase chips; toggling off hides
  them again. Display-only — it never changes what is recorded (FR-008).

## "Your alphabet" list (`CharChipEditor`)

- Shows only letters, diacritics (marks), and letter+mark combinations. It MUST NOT show
  numbers, punctuation, symbols, separators, or control characters (FR-011). Those remain
  visible in their breakdown sections.
- Existing heading id `survey.phaseB.charChipEditor.count` ("Your alphabet (<n>)") — the
  `<n>` reflects the filtered (linguistic) count.

## Code-point chip label (FR-014)

Every chip that shows a code point (both "Your alphabet" chips and breakdown chips):

- Single-code-point grapheme → visible label `U+XXXX` (unchanged).
- Multi-code-point grapheme with no single composed form → visible label `U+<first>+`
  (e.g. `U+018F+`), with the full space-separated stack (e.g. `U+018F U+0301`) exposed as the
  chip's hover `title` and accessible name.

## Capture behavior (`CharChipEditor` / `harvestChars`)

- Typing or pasting a string captures **every** distinct grapheme in it (FR-001), no longer
  requiring spaces between characters (AS1.2).
- Only CR (U+000D), LF (U+000A), the CRLF pair, Tab (U+0009), and space (U+0020) are dropped;
  every other character (including NBSP and other unusual invisibles) is kept and surfaced
  in the appropriate section, and logged (FR-002/FR-003, SC-006).

## Recorded alphabet on completion

- The `SurveyPhaseResult.confirmedInventory` produced by **Done** contains the full captured
  inventory plus each cased letter's locale-correct derived uppercase counterpart, deduped
  (FR-009). No breakdown category is removed from the recorded inventory (FR-013).
