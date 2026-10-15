# Contract: documentation forms (spec 095)

Content-owned data: `packages/contracts/data/doc-forms.json`. Loader and types: `packages/contracts/src/docForms.ts`, exported from `@keyboard-studio/contracts`. It loads like `axisPriors.ts` (`import data from "../data/doc-forms.json" with { type: "json" }`, zod-parsed at module init), so a malformed file throws at load.

## Types

```ts
export type DocFormId =
  | "readmeMd"   // README.md
  | "readmeHtm"  // source/readme.htm
  | "welcome"    // source/welcome/welcome.htm (wraps body)
  | "help"       // source/help/<id>.php (wraps body)
  | "body"       // shared welcome/help body
  | "history"    // HISTORY.md
  | "license";   // LICENSE.md

export type DocMechanismId = "deadkeys" | "rightAlt" | "repeatToCycle" | "combiningOrder";

export interface DocForms {
  forms: Record<DocFormId, string>;           // each joined from its JSON line array with "\n"
  mechanisms: Record<DocMechanismId, string>; // one paragraph per mechanism
}

export const DocFormsSchema: z.ZodType; // validates the JSON file shape below
export const DOC_FORMS: DocForms;
```

## File shape

```json
{
  "forms": {
    "readmeMd":  ["# {{displayName}}", "", "{{description}}"],
    "readmeHtm": ["..."],
    "welcome":   ["..."],
    "help":      ["..."],
    "body":      ["..."],
    "history":   ["..."],
    "license":   ["..."]
  },
  "mechanisms": {
    "deadkeys": "...",
    "rightAlt": "...",
    "repeatToCycle": "...",
    "combiningOrder": "..."
  }
}
```

- Every `DocFormId` and `DocMechanismId` key is required; extra keys fail the schema.
- Each form is an array of lines, which keeps diffs readable.
- Mechanism paragraphs render in the fixed order `deadkeys`, `rightAlt`, `repeatToCycle`, `combiningOrder`, and only for mechanisms the keyboard uses (FR-015).

## Form syntax

Two constructs only (FR-023), using the existing `{{slotId}}` placeholder syntax:

| Construct | Meaning |
|---|---|
| `{{id}}` | insert slot `id` |
| `{{#id}}` ... `{{/id}}` | keep the enclosed text only when slot `id` is non-empty; otherwise drop it and the newline after `{{/id}}` |

`id` must be in `DOC_SLOT_IDS` ([engine-api.md](engine-api.md)). A section's heading goes inside its block, so an empty section loses its heading (FR-024).

## Checks (`packages/contracts/src/docForms.test.ts`)

Run by `pnpm -r test` (FR-028). Each failure names the form id and the problem.

- Every form passes `parseDocForm` (balanced blocks, no unknown construct).
- Every referenced slot is in `DOC_SLOT_IDS`.
- `{{version}}` appears only in `history`; `{{year}}` only in `license` (FR-026).
- `typingGuide` does not appear in `readmeMd` (FR-029).
