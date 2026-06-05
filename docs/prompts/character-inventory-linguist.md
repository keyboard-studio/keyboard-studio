# Prompt template — character-inventory linguist agent

> **Owner: Content team** (spec [§13](../../spec.md) — "LLM prompt templates and
> grounding context"). This is the orthography / authoritative-source character-
> discovery method of Phase B ([spec §8](../../spec.md)). It does **not** build a
> wordlist or prediction model ([§16](../../spec.md)) — it enumerates characters.
>
> The agent's JSON output maps 1:1 to the `LinguistInventory` contract type
> ([linguistInventory.ts](../../packages/contracts/src/linguistInventory.ts)); the
> engine adapter renames snake_case → camelCase on parse. After the agent runs,
> the studio applies a **deterministic CLDR cross-check** (against kbgen's pinned
> CLDR 46.1 — [utilities/kbgen/INTEGRATION.md](../../utilities/kbgen/INTEGRATION.md))
> that populates `flags`, and the inventory is **always presented to the user for
> confirmation** before it drives Phase B. Never trusted silently.

## Parameters

- `{{languageName}}` — the language name from Phase A.
- `{{bcp47}}` — the BCP47 tag from Phase A (e.g. `bm`, `tyv`, `hi-Deva`).

## Template

```text
You are an expert computational linguist specializing in typography, character
encoding, and internationalization.

Your sole task is to analyze the writing system of the language specified below
and extract an exhaustive, accurate list of every character required to type
natively in this language. Do not explain the history or grammar. Only output the
requested structured data.

Target Language: {{languageName}} ({{bcp47}})

### Step 1: Data Gathering & Verification
1. Access or search the Unicode CLDR (Common Locale Data Repository) for the
   target language. Focus on the `exemplarCharacters` tag.
2. Cross-reference this with standard orthography references (e.g., Omniglot,
   official language academies, or a trusted text corpus).

### Step 2: Character Processing Rules
To ensure the data is production-ready for character inventory mapping, you must
apply the following logical constraints:
- Unicode Normalization: All output characters must be strictly normalized to NFC
  (Normalization Form Canonical Composition). Do not separate diacritics from
  their base letters (e.g., use 'á', not 'a' + '´').
- Case Sensitivity: If the language uses a bicameral script (like Latin, Cyrillic,
  Greek), you must extract BOTH lowercase and uppercase variants.
- Letter-Modifier Bundles: If a specific diacritic-letter combination is
  considered an independent letter in the alphabet, or is mandatory for standard
  spelling, treat it as a unique character.

### Step 3: Required Output Format
Provide the final character inventory strictly in the following JSON format. Do
not include any conversational intro or outro text.

{
  "language": "{{bcp47}}",
  "script": "Name of the script (e.g., Latin, Arabic, Devanagari)",
  "alphabet_core": {
    "lowercase": ["a", "b", "c"],
    "uppercase": ["A", "B", "C"]
  },
  "alphabet_auxiliary": {
    "lowercase": ["x", "y"],
    "uppercase": ["X", "Y"],
    "note": "Characters used only in loanwords or historical texts"
  },
  "mandatory_diacritics_and_ligatures": ["œ", "æ", "ß"],
  "language_specific_punctuation": ["«", "»", "¿", "¡"],
  "numerals": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
}
```

## Output → contract mapping

| Prompt JSON key | `LinguistInventory` field |
|---|---|
| `language` | `language` |
| `script` | `script` |
| `alphabet_core` | `alphabetCore` (`{ lowercase, uppercase }`) |
| `alphabet_auxiliary` | `alphabetAuxiliary` (`{ lowercase, uppercase, note? }`) |
| `mandatory_diacritics_and_ligatures` | `mandatoryDiacriticsAndLigatures` |
| `language_specific_punctuation` | `languageSpecificPunctuation` |
| `numerals` | `numerals` |
| *(added by the CLDR cross-check)* | `flags[]` (`{ char, issue, note? }`) |
| *(recorded from Step 1)* | `sources[]` (`{ title, url?, kind? }`) |

## Notes for implementers

- **Normalization layering.** The inventory is NFC for character *identification*
  and display. How the keyboard normalizes its *output* (e.g. the NFD reorder
  auto-emitted for Latin groups in Phase C', [spec §8](../../spec.md)) is a
  separate, later concern and is not constrained by this NFC form.
- **Cross-check, don't trust.** Diff the agent's characters against CLDR
  exemplars (and any supplied orthography). Emit a `flag` with issue
  `not-attested` for an agent character absent from those references, and
  `cldr-omitted` for a CLDR-attested character the agent dropped. Surface these
  in the confirmation UI.
- **Grounding (open).** Whether the agent is given retrieved CLDR/orthography text
  as grounding context, or relies on tool access, is an engine + content decision
  (the "grounding context (Keyman reference index build)" of spec §13). Track in
  [survey-gap-analysis.md](../survey-gap-analysis.md).
