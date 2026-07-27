# Quickstart: Deterministic Facet Classifiers

Validation guide proving the three classifiers work end-to-end and produce the [spec 036](../036-keyboard-facet-index/spec.md)
index record correctly. The classifiers live inside the `utilities/facet-index/` build tool (036 D1); this
guide exercises them through the tool's fixtures and a full corpus run. Implementation detail lives in
[contracts/](contracts/) and [data-model.md](data-model.md).

## Prerequisites

- `pnpm install` (repo root); Node ≥ 20.
- The sibling corpus checkout at `../keyboards` (for the full run only — fixtures are self-contained).
- Pinned UCD files present at `lib/ucd/` (already in-repo) and the UCD slim lookup generated (036 build
  step `codegen-ucd.mjs`).

## Scenario 1 — Script classifier fixtures (US1, SC-001 unit slice)

```
pnpm --filter-none tsx utilities/facet-index/build-index.ts --fixtures --facet=script
# or the vitest slice:
pnpm exec vitest run utilities/facet-index/classifiers/script.test.ts
```

**Expected**: each fixture's `distribution` + dominant `value` matches the hand judgment recorded in the
test. Concretely:
- Arabic-script fixture ⇒ `value: "Arab"`, `confidenceClass: "confident"`, Common/Inherited punctuation
  present but excluded from the denominator, presentation-form characters counted toward `Arab`.
- Plain-Latin fixture ⇒ `value: "Latn"`, `subProfile.latin: "plain"`.
- IPA fixture ⇒ `value: "Latn"`, `subProfile.latin: "ipa"` (IPA Extensions / Phonetic Extensions share over
  the Latin-specific floor).
- Dual-script fixture ⇒ split `distribution` (e.g. ~55/45), `confidenceClass: "mixed"`.
- Symbols/punctuation-only fixture ⇒ `evidenceSize: 0`, `provenanceTier ≠ "content-derived"`,
  `confidenceClass: "undetermined"` — no divide-by-zero, no fabricated distribution.

## Scenario 2 — Strategy fingerprint fixtures (US2, SC-004)

```
pnpm exec vitest run utilities/facet-index/classifiers/strategy-fingerprint.test.ts
```

**Expected**:
- `akan` ⇒ dominant `S-01`, low residue, `confident`.
- `sil_euro_latin` / `basic_kbdfr` ⇒ `S-02` present (deadkey), plausibly mixed with `S-01`.
- `sil_yoruba8` ⇒ high `residue`, distribution names only recognized strategies (S-11 toggle
  unrecognized) — proves "never present partial recognition as full coverage" (FR-012). `residue` is a
  **distinct field**, never a `distribution` key.
- A deliberately parse-failing input ⇒ `analysisOutcome: "fallback-only"`, `distribution` omitted, `notes`
  states the reason.

## Scenario 3 — Target/device-mix fixtures (US3, SC-004)

```
pnpm exec vitest run utilities/facet-index/classifiers/target-mix.test.ts
```

**Expected**:
- Desktop-only fixture (`<Targets>` absent) ⇒ `value: ["desktop"]`, `provenanceTier: "default-fallback"`
  (defaulted, not declared).
- Touch-layout-sibling fixture ⇒ `value` includes `"touch"` even if declaration omits it, with a
  `notes` mismatch flag (artifact outranks declaration, FR-014 AC1).
- `web`-declaring fixture ⇒ `value` includes `"web"`.
- `&TARGETS 'any'` fixture ⇒ `value: ["desktop","touch","web"]` (sentinel expanded).

## Scenario 4 — Determinism (SC-003, FR-001)

```
pnpm --filter-none tsx utilities/facet-index/build-index.ts --fixtures --out /tmp/a.json
pnpm --filter-none tsx utilities/facet-index/build-index.ts --fixtures --out /tmp/b.json
diff /tmp/a.json /tmp/b.json && echo "[OK] byte-identical"
```

**Expected**: zero diff. No timestamps in the hashed payload; sorted keys throughout. The vitest
determinism test asserts the same for a fixed input set across two runs.

## Scenario 5 — Full corpus run + coverage report (SC-002)

```
pnpm --filter-none tsx utilities/facet-index/build-index.ts       # full run over ../keyboards/release/**
```

**Expected**: `docs/keyboard-facet-index.json` regenerates; the manifest's `facetCoverage.script` shows
**≥80%** of keyboards at the `content` tier (SC-002, measured not assumed). The three facets each appear in
`facetIds`. Adding a facet definition and rebuilding leaves prior facets' records byte-identical
(036 extensibility invariant).

## Scenario 6 — Artifact lint (FR-008 second checkpoint)

```
pnpm lint     # includes the facet-index-lint checkpoint (036 D7)
```

**Expected**: the committed `docs/keyboard-facet-index.json` validates against
`content/keyboard-facets/*.yaml` — any value outside `limits`, distribution not summing to ~1, or
`fallback-only` record claiming `content-derived` fails lint. The lint's self-check proves it rejects a
known-bad and accepts a known-good record.

## Auditability (SC-005)

For any single keyboard, the committed `docs/keyboard-facet-index.md` companion + the record's
`evidenceSize` / `analyzedCoverage` / `provenanceTier` / `residue` fields let a reviewer trace the value
back to its evidence (character set, recognizer output, or declaration) without re-running the tool.
