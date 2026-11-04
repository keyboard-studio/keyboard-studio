# Contract: LDML export package, report and determinism

**Spec**: FR-004, FR-030, FR-031, FR-040–FR-042 · **Research**: R11, R26, R28

## Package layout

The zip root is the Keyman LDML project, in the layout `kmc generate ldml-keyboard` uses. The
project and package id is `<kmnid>_ldml`, where `<kmnid>` is the KMN keyboard id (spec FR-040). Entries
are written in this order, sorted by path within each group.

| Path | Content | Source |
|---|---|---|
| `<kmnid>_ldml.kpj` | Keyman project v2.0 (`<KeymanDeveloperProject><Options><Version>2.0</Version>…`) | generated |
| `source/<kmnid>_ldml.xml` | the keyboard3 document | exporter |
| `source/<kmnid>_ldml.kps` | package: `<Info>` (name, copyright, author, description, website), `<Keyboards>` with languages, `<Files>` listing `..\build\<kmnid>_ldml.kmx`, `..\build\<kmnid>_ldml.kvk`, the readme/welcome, icon and fonts | generated from the same identity, attribution and help-docs values the KMN `.kps` writer reads |
| `source/readme.htm`, `source/welcome.htm` | the KMN package's documents, unchanged in content | projected VFS |
| `LICENSE.md`, `README.md`, `HISTORY.md` | the KMN package's texts | projected VFS |
| `source/<icon>`, `source/<font files>` | the files the KMN `.kps` lists | projected VFS (binary, stored) |
| `LDML-EXPORT-REPORT.md` | the report (below) | exporter |

There is no `NEXT_STEPS.md`, no `.kmn`, no `.keyman-touch-layout`, no `build/` output and no
`.studio/` metadata. The Story 5 compiled `.kmx`/`.kvk` go only into the separate LDML `.kmp`
(FR-074, FR-076).

## `source/<kmnid>_ldml.xml` shape

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!--
  <name> (<id>) version <original version string>
  <description>
  Copyright: <copyright>   Licence: <licence name>
  Author: <author>   Attribution: <attribution>   Home page: <url>
  Exported by Keyboard Studio <studioVersion> under LDML profile <profileId> (TR35 <rev>).
  Base keyboard resolved against: <host label> (<host id>).
  What did not carry over: LDML-EXPORT-REPORT.md
-->
<keyboard3 xmlns="…/cldr/<profileId>/keyboard3" locale="<first tag>" conformsTo="<profileId>">
  <locales>…</locales>
  <version number="<major.minor.patch>"/>
  <info name="…" author="…" layout="<family>" indicator="…"/>   <!-- attribution in profile 49 -->
  <displays>…</displays>
  <keys>…</keys>
  <flicks>…</flicks>
  <layers formId="us|iso|jis|abnt2">…</layers>
  <layers formId="touch" minDeviceWidth="1">…</layers>
  <layers formId="touch" minDeviceWidth="150">…</layers>
  <variables>…</variables>
  <transforms type="simple">
    <!-- KMN group: <groupName> -->
    <transformGroup>
      <!-- source/<id>.kmn:<line> -->
      <transform from="…" to="…"/>
    </transformGroup>
  </transforms>
  <transforms type="backspace">…</transforms>
  <special xmlns:ks="https://keyboard-studio.github.io/ns/ldml-export/1">   <!-- FR-028; research R32 -->
    <ks:baseKeyboard id="<host id>" source="author|primary-pick|likely-base|en-US"/>
    <ks:position layer="<modifiers>" key="<vkey>" provenance="authored|filled|suppressed"/>
  </special>
</keyboard3>
```

**Element order** follows the DTD content model:
`keyboard3 ( import*, locales?, version?, info, settings?, displays?, keys?, flicks?, forms?,
layers*, variables?, transforms*, special* )`. `flicks` is a sibling of `keys`, not a child of
it. **Attribute order** is fixed per element, as in
the sketch above. Empty containers are omitted. Line endings are `\n`, indentation is two
spaces, and the file ends with a newline. Text is NFC in comments and NFD in `from`/`to`/`output`
(row 3.1).

## `LDML-EXPORT-REPORT.md`

The report is always English and contains no timestamp. Sections, in order:

1. **Title and authority**: keyboard name, id and version. Profile id, namespace and TR35 revision.
   For profile 46, the pinned Keyman version that compiles it. For profile 49, "TR35-only
   (awaiting Keyman)".
2. **Base keyboard**: the host label and id the export used (research R26), who chose it
   (author / primary pick / likely-base / `en-US`, FR-027), the provenance counts per layer
   (authored, filled, suppressed; FR-028), and, when row 2.7 applies, the mnemonic caveat.
3. **Summary**: counts per status (M, A, N, K), and the sentence "Nothing was lost." when A and N
   are both zero.
4. **Delivery note**: Keyman 19 delivers LDML keyboards to desktop only. When touch forms are
   present, a single statement for row 5.15: written to TR35, ready for Keyman's touch pipeline,
   not yet run by any Keyman.
5. **What did not carry over: physical keyboard**: one table row per coded item (A, N, K, and M with a hint) on the
   hardware side. Columns: Location, Construct, Code, Status, What LDML does instead.
6. **What did not carry over: touch**: the same columns, for touch items.
7. **Other items**: header, metadata and package-only hints.
8. **Version change** (FR-064), only when the profile is not 46: the rows this profile moved to M
   relative to 46.

**Location** is `source/<id>.kmn:<line>` when the item has a line in the output projection.
Otherwise it is `group <name> (<owner>)` for synthesised rules (FR-017), or
`touch <platform>/<layer>/<key>`. Rows are sorted by section, then location line, then code, so
the order never depends on traversal. Many rules with the same code each keep their own row: the
report has no cap (Edge Cases).

## Determinism (FR-030, SC-009)

- `toZip(vfs, { nextSteps: false, fixedMtime: new Date(1980, 0, 1) })`. Text entries use deflate
  level 6, binary entries level 0, as today.
- `LdmlExportInput` includes the export's base keyboard (FR-027): a different base keyboard is a
  different input, so FR-030 compares exports under the same profile **and** base keyboard.
- No input other than `LdmlExportInput` affects any byte: no clock, no locale, no random source,
  no environment.
- The SC-009 test exports the same working copy twice, once with the interface locale `en` and
  once with `fr`, and once with `TZ=Pacific/Auckland`. It asserts that the zips are equal byte
  for byte.
