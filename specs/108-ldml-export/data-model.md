# Data model: spec 108 LDML keyboard export

This feature adds one persisted value, the per-project `ldmlProfile` output setting. Everything
else is derived from the working copy each time it is needed (Constitution Art III). The
engine-side types live in `packages/engine/src/ldml-export/types.ts` and
`profiles/types.ts`. Contracts gains no type.

## TargetProfile (engine; spec FR-060)

| Field | Type | Notes |
|---|---|---|
| `id` | `LdmlProfileId` = `"46" \| "49"` | equals `conformsTo` |
| `namespace` | string | `https://schemas.unicode.org/cldr/<id>/keyboard3` |
| `tr35Revision` | string | `"CLDR 49, tr35-79 (2026-10-21)"` |
| `keymanRelease` | string \| null | `"19.0.240-alpha"` for 46. `null` means TR35-only |
| `keymanCompilable` | boolean | must equal "the pinned schema accepts `conformsTo`" (FR-065, H7) |
| `isDefault` | boolean | exactly one profile; the newest with `keymanCompilable` |
| `rows` | `ReadonlyMap<RowId, ProfileRow>` | profile 46: all rows. Later profiles: `resolveProfile` applies `deltas` to their base |
| `deltas` | `RowDelta[]` | empty for 46 |
| `writeAttribution` | `boolean` | the profile-level switch the lowering reads, derived from row 4.10. Set mappings are the same in every profile (spec FR-023). The lowering never compares profile ids |

**ProfileRow**: `{ id: RowId ("3.17"), status: "M"|"A"|"N"|"K"|"M/A"|"M/N"|"A/N", code?: LdmlCode,
severity: "warning"|"hint"|null, form: string, lift?: string, keymanCodes?: string[] }`.

- `keymanCodes` lists the Keyman message codes a K row is expected to raise (H1).
- `lift` is the FR-063 lift condition.

**RowDelta**: `{ id: RowId; status?; code?; form?; lift? }`. Validation: a delta must name an
existing base row (H7).

## LdmlBaseLayout (engine input; research R26)

| Field | Type | Notes |
|---|---|---|
| `id` | `"us" \| "us-intl" \| "azerty" \| "qwertz" \| "uk"` | the `referenceBaseLayouts` vocabulary |
| `label` | string | named in the report and the XML header |
| `source` | `"author" \| "primary-pick" \| "likely-base" \| "en-US"` | who chose it (spec FR-027): the author's per-export pick, the primary `windows-layout` pick, the likely-base resolution, or the final default |
| `family` | `"QWERTY" \| "AZERTY" \| "QWERTZ"` | goes to `info/@layout` |
| `isoFamily` | boolean | the table has a `K_OE2` cell |
| `layers` | `Record<"base"\|"shift"\|"altgr"\|"shiftAltgr", Record<VKey, string \| "deadkey">>` | copied from `REFERENCE_BASES` |

The engine derives the caps layers from these four layers (R26). It never reads the studio
tables directly.

## PositionProvenance (engine; spec FR-028)

| Field | Type | Notes |
|---|---|---|
| `layer` | string | the hardware layer's modifiers, e.g. `none`, `shift caps` |
| `vkey` | `VKey` | the main-block position |
| `provenance` | `"authored" \| "filled" \| "suppressed"` | from a rule; from the base keyboard; from a `nul`/`beep` rule (rows 3.15a, 3.16) |

Written to the `<special>` element under `<keyboard3>` and summarised in the report, together with
the base keyboard's id and its `source`. The "filled" set equals spec 109's enumerator output
minus the suppressed positions (spec 109 SC-005).

## LdmlExportMetadata (engine input)

| Field | Source in the studio (same values the KMN `.kps` writer reads) |
|---|---|
| `projectId` | `<kmnid>_ldml`, where `<kmnid>` is the output keyboard id (spec FR-040). Must match `/^[a-z_][a-z0-9_]*$/` |
| `name` | identity `displayName`, else `startIr.header.name` |
| `version` | `resolvePublishVersion(…)`. The original string goes to the header comment, and the normalised semver to `<version number>` (row 4.3) |
| `languages` | identity `bcp47`, else `startKeyboard.languages`. Each is reduced to its minimal likely-subtags form, with no `-k0-` (spec FR-041). The first goes to `@locale`, the rest to `<locales>`. When none exists: `und`, plus the row 4.16 `NO_LOCALE` hint |
| `author`, `authorEmail` | `attribution.authorName`, `authorEmail` |
| `copyright` | `effectiveHolder(attribution)`, rendered as the `.kps` does |
| `licenceName` | from the licence the package carries |
| `description` | `helpDocs.description` |
| `homePage` | `helpDocs.projectHomeUrl` |
| `attributionText` | the inherited holders line (`resolveInheritedHolders`) |
| `indicator` | the identity's short label, when set |

## CompatibilityItem (engine; spec Key Entities)

| Field | Type | Notes |
|---|---|---|
| `siteKey` | string | `${code}\|${rowId}\|${nodeKey}`. This is the identity used for FR-012/SC-005 (R25) |
| `rowId` | `RowId` | the mapping-contract row |
| `status` | `"M" \| "A" \| "N" \| "K"` | an `M/A` row resolves to one status per item |
| `code` | `LdmlCode \| null` | `null` for an M item without a hint; an M item with a hint (row 3.16) carries its code |
| `severity` | `"warning" \| "hint" \| null` | FR-010; the rule-vs-non-rule split is computed per item |
| `nodeKey` | string | `group:<name>#<ordinal>`, `fragment#<ordinal>`, `store:<NAME>`, `touch:<platform>/<layer>/<key>`, `header:<field>`, `base:<layer>/<vkey>` for row 2.26, or `behaviour:<name>` for FR-026's per-behaviour items |
| `line` | number \| null | `sourceLine` from the IR that was classified |
| `owner` | string \| null | the group and its owning pattern or behaviour, for items with no line (FR-017) |
| `construct` | string | a short English construct label, e.g. "`set()` in rule" |
| `consequence` | string | an English sentence: what LDML does instead |
| `params` | `Record<string, string>` | values the studio's translated message interpolates (`group`, `option`, `default`, `reason`, …) |
| `side` | `"hardware" \| "touch" \| "package"` | which report section the item belongs in (FR-031) |

**Rules**:

- one item per classified site;
- an M item without a code is kept only for the report counts and is never shown as a finding; an M item with a hint (row 3.16) is both a finding and a report row (spec FR-012, FR-031);
- an `M/A` row (1.8) resolves to M or A per item, an `M/N` row (3.26) to M or N, and an `A/N` row (2.23) to A or N.

## LdmlClassification (engine)

`{ profileId, items: CompatibilityItem[] (sorted by siteKey), counts: Record<Status, number>,
baseLayout: { id, label, source }, ansiOnly: boolean, touchPresent: boolean }`. It is a
frozen value. The findings view and the report view are both projections of it.

## LdmlDocument (engine, internal)

The lowered model the serializer writes:

- `keys`, `flicks`, `displays`;
- one hardware `layers` (form plus layers);
- zero to two touch `layers`;
- `variables` (`string`, `set`, `uset`);
- `transforms.simple` and `transforms.backspace`, each a list of groups with their transforms.

Each group and each transform carries a `comment` (FR-042). The model is not exported.

## ExportPackage (engine output; spec Key Entities)

`LdmlExportResult` ([contracts/exporter-api.md](contracts/exporter-api.md)). It has no state and
is recomputed on every download.

## Studio state

| Field | Store | Class | Persisted | Notes |
|---|---|---|---|---|
| `ldmlProfile` | `workingCopyStore` | EDITOR-AUTHORED (`derivedSurfaceRegistry`) | yes, in `WorkingCopySnapshot` inside the draft envelope; no `DRAFT_VERSION` bump | `LdmlProfileId \| null`. `null` = the default profile. It is reset with the other per-project output settings (the same reset points as `chartPreference`). Setter: `setLdmlProfile`. It is never written to the 088 DecisionSet or the 053 record (FR-062, Art IX) |
| `ldmlBaseLayout` | `workingCopyStore` | EDITOR-AUTHORED | yes, beside `ldmlProfile` | `BaseLayoutId \| null`. `null` = the FR-027 default. The author's per-export base-keyboard pick from the Output page. Read by the download **and** by `useLdmlFindings`, so the warnings use the same base keyboard as the export. Setter: `setLdmlBaseLayout` |
| `previewProjection` | `workingCopyStore` | EPHEMERAL | no | `{ ir: KeyboardIR; touchLayoutText: string \| null; kvksText: string \| null; keyboardId: string } \| null`. Set by `useKeyboardArtifact` when a run reaches `ready` and its IR parse succeeded. Cleared on base change. Superseded runs never write it (runId check) |

**State transitions**:

- `ldmlProfile` changes only through the Output-page picker.
- `previewProjection` follows the preview's run lifecycle. A failed parse leaves the previous
  value, which keeps the findings stable while the author's edit fails to parse. The validator
  already reports the parse failure.
