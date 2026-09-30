# Contract — Base-layout fall-through folding (spec 040)

Two contracts: the pinned **`base-layouts.json` data-file schema**, and the **leak-folding
behavior** the `script` classifier must exhibit. Identifiers copied verbatim from the spec /
existing data model are marked **[pinned]** — do not rename, recase, or pluralize them.

## 1. `base-layouts.json` data-file schema

Location: `utilities/facet-index/data/base-layouts.json`. Pinned by sha256, recorded in
`IndexManifest.referencePins` **[pinned field]**.

```jsonc
{
  "kbdus": {          // family key = normalized (lowercased) base-layout name
    "K_A": "a",       // vkey [pinned form: K_<X>] -> single unshifted BMP char
    "K_B": "b",
    // ... K_A through K_Z (v1 scope: alphabetic base layer only)
    "K_Z": "z"
  }
}
```

Rules:
- Family keys are lowercase. v1 ships exactly `"kbdus"`.
- Every value is exactly one BMP codepoint; never a C0 control, DEL, or SPACE.
- The file is pure data — no comments consumed at runtime, no environment reads.

## 2. Classifier behavior contract

Signature is **unchanged and pinned**: `classifyScript(ir: KeyboardIR, def: FacetDefinition):
Categorization | null`. No widening to `ParseResult` (would ripple into `ClassifierPair` and every
fixture — out of scope, mirrors the existing 037 TODO).

Given a parsed desktop keyboard IR, the classifier MUST:

1. **Resolve the leak set.** Leak source family = `kbdus` (environment default). For each vkey in
   the resolved family's table whose vkey is **named by no base-layer rule context**, the family's
   character for that vkey is a **leaked character**. "Named" = a `{ kind: "vkey"; name }` context
   element with base-layer modifiers (empty or `NCAPS`-only) matching the vkey; this covers remaps,
   `> nul` blocks, and guarded/group-routed rules uniformly. A named vkey never leaks.

2. **Fold leaked characters into `distribution` [pinned].** Each leaked character is mapped to its
   ISO-15924 script via the same pinned UCD lookup and added to the histogram, so a leaked script
   appears as a `distribution` entry and `evidenceSize` **[pinned]** increases by the leaked count.

3. **Never flip the dominant `value` [pinned].** The dominant `value` and the `confidenceClass`
   **[pinned]** threshold are computed from the **rule-produced (non-leaked)** histogram only.
   Property: for any keyboard, adding leaked evidence MUST NOT change `value` or worsen
   `confidenceClass` relative to the pre-leak result.

4. **Keep `provenanceTier: "content-derived"` [pinned enum value].** The leak is real desktop
   behavior, not a metadata fallback.

5. **Record the base layout in `notes` [pinned].** Format: `base-layout: <family> (default)`,
   optionally `; branches-on: <v1>,<v2>` when the rules carry `baselayout('...')` context guards.

### Invariants (testable)

- **Blocked contributes nothing:** a keyboard with `[K_X] > nul` for every base-layout key produces
  no leaked evidence (all keys are named).
- **Un-blocked leaks a sliver:** a non-Latin keyboard leaving `K_A` un-named yields `Latn` as a
  minor `distribution` entry, `value` still the non-Latin dominant script.
- **Touch keyboards unaffected:** an IR with no `group … using keys` desktop rules (touch-only)
  gets no leak and byte-identical records to pre-040 (regression).
- **Determinism:** identical `(IR, base-layouts.json)` inputs → identical `Categorization`, no
  environment reads.

## 3. Freshness / recompute contract

- `content/keyboard-facets/script.yaml` `schemaVersion` **[pinned field]** bumps `1 → 2`.
- `docs/keyboard-facet-index.json` is regenerated in full (`--classified-only` build) and re-linted
  via `pnpm run facet-index-lint`; `base-layouts.json` appears in the manifest `referencePins`.
