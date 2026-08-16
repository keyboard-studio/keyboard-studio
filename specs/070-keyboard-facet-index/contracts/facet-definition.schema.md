# Contract: Facet Definition Schema

Governs `content/keyboard-facets/*.yaml`. Content-team-owned data (spec Assumption) — validated by
`utilities/facet-index-lint` (D7), **not** a locked `packages/contracts` zod type until it survives an
evaluation round. Expressed here as JSON Schema (the lint may implement it directly in JS, matching the
`facet-lint` style).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "keyboard-facet-definition",
  "type": "object",
  "required": ["id", "title", "description", "valueType", "limits",
               "likelihoodSemantics", "derivation", "feedsSessionFacets", "schemaVersion"],
  "additionalProperties": false,
  "properties": {
    "id":          { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "title":       { "type": "string", "minLength": 1 },
    "description": { "type": "string", "minLength": 1 },
    "valueType":   { "enum": ["enum", "set", "scalar", "histogram"] },
    "limits": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "values": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "domain": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
        "open":   { "type": "boolean", "default": false }
      }
    },
    "likelihoodSemantics": { "type": "string", "minLength": 1 },
    "derivation": {
      "type": "object",
      "required": ["archetype", "classifierId", "fallbackChain"],
      "additionalProperties": false,
      "properties": {
        "archetype":     { "enum": ["character-content", "rule-structure", "declared-metadata"] },
        "classifierId":  { "type": "string", "minLength": 1 },
        "fallbackChain": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
      }
    },
    "feedsSessionFacets": { "type": "array", "items": { "type": "string" } },
    "subProfiles":        { "type": "object" },
    "schemaVersion":      { "type": "integer", "minimum": 1 }
  }
}
```

## Cross-checks (beyond JSON Schema shape)

- **C1 id↔path**: `id` matches the filename stem. (mirrors facet-lint F2)
- **C2 uniqueness**: no duplicate `id` across `content/keyboard-facets/`. (F3)
- **C3 limits↔valueType**: `enum`/`set`/`histogram` ⇒ `limits.values` present + non-empty; `scalar` ⇒
  `limits.domain` present. Loud failure otherwise (US2 scenario 3 — limits stated, not implied).
- **C4 feedsSessionFacets real**: every entry resolves to an existing `content/facets/**` facet id.
  (mirrors facet-lint F4 "real prefills" cross-reference)
- **C5 self-check**: the lint asserts it rejects a known-bad definition (out-of-shape) and accepts a
  known-good one — proving it is not a no-op. (mirrors facet-lint F7)
