# Data Model: Help documentation generation from Phase F answers

## `HelpDocsAnswers` (new — `packages/contracts/src/help-docs.ts`)

The author-supplied side of "Help documentation answer" (spec Key Entities). Lives on the working
copy store as `helpDocs: HelpDocsAnswers | null` — `null` until Phase F's `onCommit` first fires
(mirrors `attribution: Attribution | null`'s own null-until-set convention). Every field except
`description` is optional; a field absent or blank means "the author left this out," rendered as
no section at all (FR-003), never an empty one.

```ts
export interface HelpDocsAnswers {
  /** pf_welcome_paragraph. The one required field (FR-001). */
  description: string;

  /** pf_usage_tip_1, pf_usage_tip_2 (only these two are reachable — research D-11). */
  usageTips: string[];

  /** pf_credits. */
  credits?: string;

  /** pf_contact_info. */
  contactInfo?: string;

  /** pf_project_url line 1 (required if any line is given). */
  projectHomeUrl?: string;
  /** pf_project_url line 2, when a second line is given. */
  projectHelpUrl?: string;

  /** pf_doc_language. Absent/blank means English (existing question default). */
  docLanguage?: "english" | "target" | "bilingual";

  // Opt-in "additional detail" battery (FR-011/FR-014) — order in research D-10.
  designRationale?: string;   // pf_design_rationale
  fontGuidance?: string;      // pf_font_guidance
  canonicalOrder?: string;    // pf_canonical_order (non-roman scripts only — existing gate)
  scriptGlossary?: string;    // pf_script_glossary
  exampleWords?: string;      // pf_example_words
  scopeVariety?: string;      // pf_scope_variety
  provenanceBasis?: string;   // pf_provenance_basis
  troubleshooting?: string;   // pf_troubleshooting
  knownLimitations?: string;  // pf_known_limitations
  relatedKeyboards?: string;  // pf_related_keyboards
  furtherReading?: string;    // pf_further_reading
}
```

**Validation rules**: None beyond what the live question modules already enforce (only
`description` is required, enforced by Phase F's own gate — this feature does not add a second
validation layer). `projectHelpUrl` is only meaningful alongside `projectHomeUrl`; a
`pf_project_url` answer with only one line populates `projectHomeUrl` alone.

**State transitions**: `null` → populated on Phase F's first `onCommit` → replaced wholesale on
every subsequent `onCommit` (an author revising an earlier answer and walking back through Phase F
overwrites the whole object, never merges partial patches — matches `setAttribution`'s own
replace-whole-value semantics). Never partially cleared field-by-field.

## Base-keyboard doc text (new — `workingCopyStore` fields)

Sibling fields to the existing `baseLicenseText: string | null`, same fetch-don't-write-yet
contract (research D-05):

```ts
baseWelcomeHtmText: string | null;  // the ADAPTED base's own source/welcome.htm, verbatim, or null
baseHelpPhpText: string | null;     // the ADAPTED base's own source/help/<id>.php, verbatim, or null
```

`null` on Track 1 (new-from-base — nothing to merge with, per spec Assumptions) and whenever the
base had no such file (fetch 404, non-fatal). Populated once, at instantiation, alongside
`baseLicenseText`; never mutated afterward.

## Design-derived metadata (existing — read, not introduced)

Already-established values this feature *reads* at render time; no new fields:

| Value | Source |
| --- | --- |
| Display name | `identity.displayName` / `baseKeyboard.displayName` (existing `identityForProjection` resolution in `serializeWorkingCopy.ts`) |
| Primary BCP47 tag | `identity.bcp47` / the composed tag already threaded into `identityForProjection` |
| Copyright holder | `attribution.copyrightHolder` (`effectiveHolder()`, already used for `LICENSE.md`) |
| Supported platforms | `store(&TARGETS)` parsed from the projected `.kmn` text — same regex `buildKpsContent` already runs (`build.ts:97-99`), reused for README's platform list (FR-008) rather than re-parsed a second way |
| Keyboard id | `resolvedKeyboardId` (`serializeWorkingCopy.ts`'s existing projection output) |

## Rendered output (new — `helpDocsRender.ts` return shapes)

Pure functions, not stored state — recomputed on every render/output call:

```ts
export interface DocSection {
  heading: string;
  /** Already HTML-escaped for the .htm/.php callers; plain text for the README caller. */
  body: string;
}

export interface HelpDocsRenderInput {
  answers: HelpDocsAnswers | null;   // null → placeholder fallback (research D-04)
  displayName: string;
  primaryBcp47?: string;
  platforms: string[];
  keyboardId: string;
}

export function buildDocSections(answers: HelpDocsAnswers | null): DocSection[];
export function renderReadmeMd(input: HelpDocsRenderInput): string;
export function renderReadmeHtm(input: HelpDocsRenderInput): string;
export function renderWelcomeHtm(input: HelpDocsRenderInput, baseWelcomeHtmText: string | null): string;
export function renderHelpPhp(input: HelpDocsRenderInput, baseHelpPhpText: string | null): string;
```

## `.kps` extension (existing type, one new field)

`PackageDescriptorIdentity` (`package-descriptor/build.ts`) gains:

```ts
websiteUrl?: string;  // sourced from HelpDocsAnswers.projectHomeUrl only (research D-06)
```
