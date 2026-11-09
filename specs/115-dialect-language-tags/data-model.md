# Data model: Language tags that describe dialects and variants

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

## Bcp47Parts (contracts, R1)

The parsed form of a tag. Produced by `parseBcp47`, consumed by `formatBcp47` and every tag reader.

| Field | Type | Rule |
|---|---|---|
| `language` | string | 2-3 letters, or 4-8 (registered long form); lowercase on format |
| `extlang` | string[] | up to 3, 3 letters each |
| `script` | string? | 4 letters; title case on format |
| `region` | string? | 2 letters or 3 digits; uppercase on format |
| `variants` | string[] | each 5-8 alphanumerics, or a digit + 3 alphanumerics; no duplicates (case-insensitive); lowercase |
| `extensions` | `{singleton, subtags[]}[]` | singleton not `x`; each subtag 2-8 alphanumerics; no repeated singleton |
| `privateUse` | string[] | after `-x-`; each 1-8 alphanumerics; lowercase |
| `grandfathered` | string? | set only for the irregular registered tags (e.g. `i-klingon`) |

`parseBcp47` returns `{ ok: true, parts }` or `{ ok: false, reason, at }`. `reason` is one of: `empty`, `bad-language`, `bad-subtag`, `out-of-order`, `duplicate-variant`, `duplicate-singleton`, `empty-extension`, `bad-private-use`. `at` is the offending subtag index.

Reading rule (FR-024): script and region are read only from positions before the first variant, extension or private-use subtag. Nothing after a singleton is ever read as script, region or variant.

## LanguageChoice (studio, derived)

The author's identity answers that compose the tag. Derived from decisions by `deriveIdentityResult` (`identitySelectors.ts:74`). It is never stored as a separate record.

| Field | Source decision | Notes |
|---|---|---|
| `languageSubtag` | `language-code` | canonical shortest code (`canonicalLanguageSubtag`) |
| `targetScriptRaw` | `target-script` | unchanged |
| `region` | `language-region` | now offered for every language (FR-017) |
| `dialectSubtag` | `language-dialect` (new) | a variant (`gascon`) or private use (`x-rabinal`), or empty |
| `dialectSource` | `language-dialect-source` (new) | `registered-variant` \| `langtags` \| `from-name` \| `typed` |
| `glottocode` | `language-glottocode` (new) | e.g. `gasc1240`; empty when the dialect is not from Glottolog |
| `bcp47` | computed | `minimalTag(LanguageChoice)` (R2) |

`IdentityLiteResult` (`identityLiteResult.ts`) gains `dialectSubtag`, `dialectSource` and `glottocode`. `IdentityPatch` (`stores/identityPatch.ts`) gains `glottocode?` so it travels with the working copy's identity (FR-012).

## SearchMatch (contracts type, R7)

Attached to a chooser result (EthnoLib `ILanguage`, through its open index signature) when the result was reached through something other than the language's own name: a Glottolog dialect or langtags variety. It also holds the pending dialect name typed by the author on the "is a dialect" path (`source: "typed"`).

| Field | Type | Example |
|---|---|---|
| `name` | string | `Gascon` |
| `relation` | `alias` \| `dialect` \| `variety` | `dialect` |
| `source` | `langtags` \| `glottolog` \| `iana` \| `typed` | `glottolog` |
| `glottocode` | string? | `gasc1240` |
| `dialectTag` | string? | `oc-gascon` (set when langtags or the registry already gives one) |
| `countries` | string[]? | `["ES","FR"]`, from the parent when the dialect has none |

There is no tier field. EthnoLib orders the language results. Dialect hits are placed by the query-and-names merge rule ([contract § merge rule](contracts/dialect-search-and-question.md#merge-rule)), which needs no stored tier.

`relation` is `variety` for registered variants and langtags variant tagsets, `dialect` for Glottolog dialects and langtags `-x-` tagsets, `alias` for a langtags alternate name of the language itself.

The chosen match is persisted as the decision `language-search-match` (new), holding `{ name, relation, source, glottocode?, dialectTag? }`. The dialect question proposes from it after a resume (R8).

## DialectTagset row (engine, generated, R3)

`packages/engine/src/langtags/generated/dialects.ts`, one row per langtags variant or `-x-` tagset (229 at the pinned commit).

| Field | Example |
|---|---|
| `tag` | `acr-x-rabinal` |
| `full` | `acr-Latn-GT-x-rabinal` |
| `language` | `acr` |
| `dialectSubtag` | `x-rabinal` |
| `names` | `["Achi - Rabinal", …]` |
| `localNames` | `[…]` |
| `variants` | `[]` (langtags `variants`) |
| `windows` | `acr-Latn-x-rabinal` (langtags `windows`) |

`generated/tagsets.ts` rows gain a sixth column, `windows`.

## GlottologDialect row (glottolog, generated, R4)

`packages/glottolog/src/generated/dialects.ts`: 13,392 rows, one per dialect whose parent has an ISO 639-3 code.

| Field | Example |
|---|---|
| `name` | `Gascon` |
| `folded` | `gascon` (lowercase, NFD, combining marks removed) |
| `glottocode` | `gasc1240` |
| `parentIso` | `oci` |
| `countries` | dialect's own `Countries`, else the parent's |

The main catalog's languoid record gains `countries?` for languages (FR-004).

## VariantEntry (engine, generated, R5)

`packages/engine/src/langtags/generated/variants.ts`: 134 rows from the IANA registry (`language-subtag-registry@0.4.2`, File-Date 2025-08-25).

| Field | Example |
|---|---|
| `subtag` | `gascon` |
| `descriptions` | `["Gascon"]` |
| `prefixes` | `["oc"]` (each a tag the variant may follow; `1994` → `sl-rozaj`, …) |
| `deprecated` | boolean |

Prefix rule (FR-021): a variant is allowed when some prefix's subtags are all present in the tag's language, script, region and earlier variants. A variant with no prefixes is allowed anywhere.

## RegisteredLanguage (engine, generated, R12)

`packages/engine/src/langtags/generated/registeredLanguages.ts`: about 8,200 rows from the same pinned registry, `{subtag, description, scope?, macrolanguage?}`. Includes the `qaa..qtz` private-use range entry.

## TypedTagProposal (studio, transient, R12)

What `resolveTypedTag` returns when the search text parses as a tag: `{ language, script?, region?, dialectSubtag?, registeredName?, warning? }`. The author picks it like a search result; it then writes the same decisions a chooser pick does.

## TypedReading (studio, transient, R14)

One reading of multi-word typed text as a language part plus a dialect, a region or a typed dialect name (contract § reading typed text). Picking it writes the same decisions as a chooser pick:
- `language-search-match` holds the dialect, or the typed name with `source: "typed"`;
- a region reading writes `language-region` as an asked answer, and the region question is not routed again.

## UnlistedLanguage (studio, transient → decisions, R12)

| Field | Rule |
|---|---|
| `name` | required; pre-filled with the search text; becomes `language-name` |
| `code` | optional; checked with `parseBcp47` + `registeredLanguage` (FR-031) |
| proposed tag | `code` if given, else `qaa-x-` + made-from-name (FR-032) |

## DialectProposal (studio, transient → decision)

Built by the dialect question's `lookupDefault`; becomes the `language-dialect` decision with `default` provenance, and is shown as pending until the author confirms (Article X).

| Field | Rule |
|---|---|
| `subtag` | from, in order (FR-008): a registered variant whose description matches the dialect name (folded) and whose prefixes allow the choice; the langtags dialect tagset's subtag; `x-` + made-from-name |
| `source` | which of the three supplied it |
| `fullTag` | `minimalTag` of the choice with this subtag |

**Made-from-name rule (FR-011)**: NFD; drop combining marks; ASCII letters and digits only; lowercase; first 8 characters. If it is empty, use `x-dialect`. If it collides with another langtags `-x-` subtag of the same language that names a different dialect, replace the last character with a digit 2-9. The author may edit it; confirming is blocked unless the result parses (R1) as private use.

## TagFinding (studio criteria)

| Field | Values |
|---|---|
| `rowId` | new well-formedness row (FR-019); `10.3-kps-tags-minimal` (FR-020, FR-022); new variant-prefix row (FR-021) |
| `severity` | `error` (not well-formed) \| `hint` (not minimal, duplicate) \| `warning` (variant prefix) |
| `tag` | the tag as written |
| `where` | `identity` \| `open-language-list[i]` |
| `replacement` | minimal form, for a hint |
| `reason` | parser `reason` or prefix text, for errors and warnings |

## State transitions

```text
language picked ──► search match recorded ──► dialect proposal (default, pending)
       │                                            │
       │                         author confirms ───┴──► language-dialect (asked)
       │                         author removes  ──────► language-dialect = "" (asked)
       ▼
language changed ──► recalculate: dialect re-proposed (asked → offered + reproposed)
```
