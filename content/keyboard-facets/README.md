# Keyboard-facet definitions

A **keyboard-level facet definition** declares one axis along which every corpus keyboard is
categorized — e.g. *script*: the ISO 15924 script(s) the keyboard actually produces. It answers
"what this corpus keyboard **is**," derived from the keyboard's own rules, metadata, or language
fallbacks.

This is a **different vocabulary** from the session-level facet catalog at
[content/facets/README.md](../facets/README.md), which answers "who is asking" (the author, the
typing community, the environment, the destination). The two are linked, not merged: a keyboard-level
facet's `feedsSessionFacets` field names the `content/facets/` id whose `corpus:` derivation it
supplies (e.g. the `script` facet feeds `community.multi-orthography`). No second copy of the
session-facet vocabulary is forked here — see that README for the session-facet record shape and
lifecycle.

The build reads these definitions to populate the committed per-keyboard facet index
(`docs/keyboard-facet-index.json`, [specs/036-keyboard-facet-index/data-model.md](../../specs/036-keyboard-facet-index/data-model.md)
Entity 3); the classification algorithms themselves belong to
[specs/037-facet-classifiers](../../specs/037-facet-classifiers/spec.md).

## Layout

One YAML file per facet, `content/keyboard-facets/<id>.yaml`. The `id` must match the filename stem
(`script.yaml` → `id: script`) — lint-enforced.

## Record schema (summary)

A facet definition declares: `id`, `title`, `description`, `valueType` (`enum | set | scalar |
histogram`), `limits` (the closed value list for enum/set/histogram, or the numeric domain for
scalar — stated explicitly, never implied by observed data), `likelihoodSemantics` (how the
likelihood/distribution is read), `derivation` (`archetype` + `classifierId` + `fallbackChain` — the
evidence a spec-037 classifier reads, and its ordered fallback tiers), `feedsSessionFacets` (the
`content/facets/` ids this facet's values feed), an optional `subProfiles` (facet-specific
sub-dimensions, opaque to the index shell), and `schemaVersion` (bump forces a recompute of this
facet's records).

The authoritative field-by-field shape, required/optional status, and JSON Schema live in
[specs/036-keyboard-facet-index/contracts/facet-definition.schema.md](../../specs/036-keyboard-facet-index/contracts/facet-definition.schema.md);
the illustrative full example lives in
[specs/036-keyboard-facet-index/data-model.md](../../specs/036-keyboard-facet-index/data-model.md) (Entity 1).

## Discipline

This is **content-team-owned data, not code** (spec §12) — the same discipline as
[content/facets/](../facets/README.md) and `packages/patterns/`. Definitions are validated by
`utilities/facet-index-lint` against the cross-checks C1–C5 (id/path match, id uniqueness,
limits-shape-matches-valueType, `feedsSessionFacets` resolving to real `content/facets/` ids, and a
self-check proving the lint rejects a known-bad definition and accepts a known-good one).

The schema is deliberately **not** a locked `packages/contracts` type. Per the spec's Assumption and
the graduation rule stated in [content/facets/README.md](../facets/README.md), it does not graduate
there until it survives a full evaluation round.

## Construction (`source.*`) facets

A further batch of keyboard-facet definitions — the **construction facets**
(design brief: [docs/source-facets-design.md](../../docs/source-facets-design.md))
— measure how a base's source was *built* (encoding style, combo mechanism,
normalization posture, reordering, caps handling, fall-through posture,
rule/store compaction, mnemonic-vs-positional) rather than what orthography it
targets. These feed the new `source/` session-facet family in
[content/facets/README.md](../facets/README.md), the same `feedsSessionFacets`
mechanism described above.

Most construction facets are further **rule-structure** classifiers reading the
same parsed-`.kmn` evidence as `strategy fingerprint` (see
[specs/037-facet-classifiers](../../specs/037-facet-classifiers/spec.md)).
**`source.touch-combo-mechanism` is the exception**: its classifier reads the
keyboard's **touch-layout JSON**, a distinct evidence source from the
KMN-rule-structure recognizer that feeds the other rule-structure classifiers —
touch mechanisms (longpress / flick / multitap) live entirely in that JSON and
are invisible to the KMN recognizer.

## Status

The `script` facet (`script.yaml`, spec 036) and the `source.*` construction facets described above
(encoding, casing, combo-mechanism, normalization, reordering, caps-handling, fall-through posture,
rule/store compaction, mnemonic-vs-positional, and the touch-specific variants) now exist in this
directory as candidate/planned classifiers — see [specs/036-keyboard-facet-index/](../../specs/036-keyboard-facet-index/)
and [specs/037-facet-classifiers](../../specs/037-facet-classifiers/spec.md).
