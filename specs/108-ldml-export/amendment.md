# Proposed amendment: allow LDML export (Constitution 2.0.0 → 2.1.0)

**Status**: PROPOSED. Awaiting the product owner's ruling. **Not applied.** No governing file
changes until the ruling is recorded; `/speckit-plan`'s Constitution Check fails on Article VII
until it lands.
**Spec**: [spec.md](spec.md)

## Why this is a ruling, not a met condition

spec.md §16 deferred LDML output "until the LDML-to-touch build path lands in the Keyman
toolchain". That condition is **still unmet**: Keyman 19 compiles LDML touch layers but does
not deliver them to web, Android, or iOS (`&TARGETS` is hard-coded to `desktop`; the web engine
rejects `.kmx`) — research R11.

The deferral assumed LDML would replace KMN as an emission format. This feature does not do
that. The ruling proposed here is narrower:

> **LDML export is a secondary, source-only artifact.** KMN + `.keyman-touch-layout` remains
> the primary emission format and the only format on the `.kmp` and pull-request paths. The
> LDML download carries an export report that states, among other things, that Keyman 19
> delivers LDML keyboards to desktop only.

The purpose is **readiness**: produce spec-perfect LDML, touch half included, so that
keyboards built in the studio are already in the standard format when Keyman implements the
LDML touch pipeline. Versioned target profiles (spec FR-060–FR-065) handle later LDML versions.

On that reading the original reason for deferral — authors shipping a keyboard that silently
loses its touch layout — does not arise: the KMN keyboard ships as before, and the LDML file is
an additional, clearly labelled portability artifact.

## Proposed diffs

### `.specify/memory/constitution.md` — Article VII

```diff
 ### VII. Out of scope for v1 (spec §16)
-Plans MUST NOT implement: CJK/Ethiopic reorder patterns, LDML output,
+Plans MUST NOT implement: CJK/Ethiopic reorder patterns, LDML as an
+emission format (LDML *export* — a secondary, source-only download that
+never replaces KMN on the `.kmp` or pull-request paths — is in scope per
+spec 108),
 mobile-app integration, hosting, multi-language `welcome.htm` variants,
```

Footer: `**Version**: 2.1.0 | **Ratified**: 2026-10-14 | **Last amended**: <ruling date> (Art VII: LDML export, spec 108)`.
Minor version: it widens scope without changing any gate.

### `spec.md` §16

```diff
-- **LDML output** — deferred until the LDML-to-touch build path lands in the Keyman toolchain. Emission format is locked to KMN + `.keyman-touch-layout`.
+- **LDML as an emission format** — deferred until the LDML-to-touch build path lands in the Keyman toolchain. Emission format is locked to KMN + `.keyman-touch-layout`. *Amended <ruling date>:* a secondary, source-only LDML **export** is in scope — see [specs/108-ldml-export](specs/108-ldml-export/spec.md).
```

### `CLAUDE.md` — "Out of scope for v1"

```diff
-Spec §16. CJK and Ethiopic reorder patterns, LDML output, mobile-app integration, hosting,
+Spec §16. CJK and Ethiopic reorder patterns, LDML as an emission format (the secondary LDML
+export of spec 108 is in scope), mobile-app integration, hosting,
```

### `README.md`

```diff
-- Not yet supported: CJK, Ethiopic, and Hangul jamo-composition input methods, LDML output,
+- Not yet supported: CJK, Ethiopic, and Hangul jamo-composition input methods, LDML as the
+  primary output (an LDML export is available as a secondary download),
```

### Also update

- `specs/107-headless-scripted-author/spec.md:517` lists "LDML output" as out of scope for
  that feature; it stays correct for 107 and needs no change.
- `spec-trace` will flag the §16 and Article VII hash changes; acknowledge them in the same
  commit as the ruling (`node utilities/spec-trace acknowledge`).

## What the ruling does not change

- The `Pattern` schema and `KeyboardIR` contract (Article I/II): untouched.
- The validator layering and single D3 cycle (Article IV): the compatibility findings are a
  memoised scan joined into the existing findings array (spec FR-014).
- Team boundaries (Article VI): Engine owns the whole feature.
