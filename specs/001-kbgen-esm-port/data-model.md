# Phase 1 Data Model: kbgen ESM TypeScript port

This is a toolchain port — **no new domain entities or persisted schemas are
introduced**. The only "entities" are the existing kbgen artifacts, unchanged in
shape by the port. The typed contract artifact (`PlacementMap`) is explicitly
**out of scope** (#133, D-INT-1).

## Existing artifacts (shape preserved by the port)

### placement-map.json (kbgen output — behaviour-preservation oracle only)
- **Represents**: per-character placement proposals the survey would consume (§8 Phase B).
- **Shape**: kbgen's current ad-hoc JSON. NOT typed against `@keyboard-studio/contracts`
  in this issue. Used here purely as the byte-equivalence oracle (SC-003).
- **Successor**: the typed `PlacementMap` (D-INT-1) lands in `packages/contracts` via #133 —
  not modeled here.

### Vendored data (unchanged)
- `data/unicode/UnicodeData.txt`, `data/unicode/confusables.txt` — Unicode 16, SHA-256 pinned.
- CLDR 46.1 inputs.
- `data/supplement.json` — **content-team owned** (D-INT-4); read-only for this port.
- `data/SOURCES.json` — pinning manifest.

## Type work introduced by the port (internal only)

The port adds **internal** TypeScript types to satisfy strict mode — these are
module-local, not exported contracts:
- anchor-cascade signal types (NFD / NAME / CONFUSABLE / VISUAL / PHONETIC),
- layout / key-slot descriptors used by `place.ts`,
- the internal `placement-map` object shape (a local `interface`, NOT the contracts type).

These types exist only to typecheck the existing logic; they introduce no new
runtime behaviour and no cross-package contract.
