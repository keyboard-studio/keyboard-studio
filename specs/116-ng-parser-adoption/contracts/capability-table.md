# Contract: format-capability table (FR-027 to FR-029b)

Home: `packages/contracts/src/capability/format-capability.ts` (data) and its test (the check).

## Shape

```ts
type Format = "kmn" | "cldr-legacy" | "ldml" | "klc" | "xkb" | "keylayout";
type ImportStatus = "produced" | "partly-produced" | "never-produced" | "reported-not-mapped" | "n/a";
type ExportStatus = "mapped" | "approximated" | "not-carried" | "n/a";

interface CapabilityRow {
  construct: string;            // an IR kind path, e.g. "OutputElement.layer", "IRRule.targetSelector"
  import: Partial<Record<Format, { status: ImportStatus; note: string; ref?: string }>>;
  export: Partial<Record<Format, { status: ExportStatus; note: string; ref?: string }>>;
}

interface UnhomedConstruct {     // FR-029a
  format: Format;
  construct: string;            // e.g. "LDML <reorder>", ".keylayout <actions> state"
  disposition: "tier-a-candidate" | "tier-b-candidate" | "reported-at-import";
  note: string;
}
```

- `cldr-legacy` has no `export` cells; it is input only.
- `ldml` export cells set `ref` to the row number in spec 108's
  [ldml-mapping.md](../../108-ldml-export/contracts/ldml-mapping.md) and don't restate the mapping.

## The check (FR-028)

- **Completeness.** The set of `construct` values equals the set of IR kind paths. That set is
  derived at test time from a hand-maintained list in the same file, which is bound to the contract by
  a compile-time exhaustiveness guard over each union's `kind`. A new union member with no list entry
  fails to compile. A list entry with no row fails the test.
- **KMN fidelity.** Every row has `export.kmn.status === "mapped"`.
- **Coverage.** Every row has an import and an export cell for each format, except `n/a`, which needs
  a note.
- **Importer policy (FR-029b).** No row may claim a non-KMN format imports a construct into
  `RawKmnFragment`. The `RawKmnFragment` row's import cells for non-KMN formats are `n/a`, with the
  policy note.

## Initial content

Rows are filled for the current IR plus the Phase 4 members. Cells for formats without an
implementation (`klc`, `xkb`, `keylayout`) are researched from each format's documentation (research
R7). They are planning data: they claim no code exists.
