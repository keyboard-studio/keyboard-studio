# Quickstart: `@keyboard-studio/glottolog`

Validation/run guide. Implementation detail lives in [contracts/](contracts/) and [data-model.md](data-model.md); task breakdown comes from `/speckit-tasks`.

## Prerequisites

- pnpm 9, Node ≥ 20 (repo standard).
- Network access **once**, at build time only, to fetch the pinned CLDF file.

## Build (pin-and-regen)

The two new scripts append to the existing root `prebuild` chain (FR-004), so a normal build produces the catalog:

```bash
pnpm install
pnpm build            # runs prebuild → fetch-glottolog → codegen-glottolog → (existing steps)
```

Run the Glottolog steps alone:

```bash
pnpm run fetch-glottolog     # downloads + SHA-256-verifies cldf/languages.csv into packages/glottolog/data/glottolog/, writes SOURCES.json
pnpm run codegen-glottolog   # derives packages/glottolog/src/generated/index.ts
```

**Expected**: `[OK] N languoids, M ISO keys` from codegen; `SOURCES.json` records commit, sha256, bytes, recordCount. A placeholder or mismatched SHA-256 aborts with `[ERROR]` and a non-zero exit (FR-002, SC-005).

## Update to a newer Glottolog release (FR-005, SC-007)

1. Edit `scripts/glottolog-version.json`: bump `commit`/`tag`, set the new `sha256` (`node scripts/fetch-glottolog.mjs --compute-sha` prints it).
2. `pnpm run fetch-glottolog && pnpm run codegen-glottolog`.
3. Review `packages/glottolog/src/pseudo-families.ts` against the new release (normally unchanged — pseudo-family glottocodes are stable).
4. Commit the regenerated `src/generated/index.ts`. No code change required.

## Tests

```bash
pnpm --filter @keyboard-studio/glottolog test
```

Covers:
- **Catalog** — `getLanguoid`, `byIso639p3` (permissive: a multi-glottocode ISO returns >1), `ancestors` (root-first, `[]` for an isolate).
- **Relatedness** — a known related pair ranks related; a cross-family pair does not; two languages sharing only a pseudo-family (e.g. both under Sign Language) do **not** register as related (FR-012, SC-006).
- **Bridge** — with fixture `languagesById` + a stub `resolveLanguage`: a target with no keyboard but a same-script relative returns a genealogical candidate; a wrong-script relative is excluded; a keyboard covering two relatives appears once with `alsoSupports`; both-tiers-empty ⇒ `[]`.
- **Determinism** — `codegen-determinism.test.ts`: codegen twice ⇒ byte-identical `generated/index.ts` (FR-003, SC-005).

## End-to-end scenario (SC-001)

Target a language with no keyboard but a keyboard-backed, same-script relative (pick a concrete pair from the pinned data during implementation, e.g. a small language whose sibling has a Latin-script keyboard):

```ts
import { findKeyboardBaseCandidates } from "@keyboard-studio/glottolog/bridge";

const candidates = findKeyboardBaseCandidates(
  { bcp47: "<unsupported-lang>" },
  { resolveLanguage, languagesById, scriptFallback: suggestBasesFallback, getBase },
);
// Expect: non-empty, closest same-script relative's keyboard first; no wrong-script entry;
// each keyboard once. For a target with NO same-script relative and no fallback hit: [].
```

**Validated pair (pinned Glottolog 5.3, commit `072ca0d`)** — recorded from a run of this
scenario during Phase 6 (T029):

- Target: **Xhosa** (`xho`, glottocode `xhos1239`), Latin script — no keyboard.
- Closest relative: **Zulu** (`zul`, glottocode `zulu1248`), Latin script, `pathLength = 2`
  (both under Nuclear Nguni). `relatedIsoCodes("xho")` ranks it first, ahead of Ndebele
  (`nde`/`nbl`) and Swati (`ssw`) at `pathLength = 3`.
- `findKeyboardBaseCandidates({ bcp47: "xho" }, …)` with a phonebook giving Zulu a Latin
  keyboard returns exactly that keyboard at `tier: "genealogical"`, `closestRelative.distance = 2`.
  A Cyrillic-script Zulu keyboard in the same phonebook is excluded (FR-017b); a phonebook
  with **only** the wrong-script keyboard yields `[]`.

## Guardrails to verify manually

- No runtime network / host-disk access (grep the package for `fetch`/`fs` in `src/` — only the `scripts/` build files touch I/O).
- `pnpm depcruise` passes: `@keyboard-studio/glottolog` imports only `@keyboard-studio/contracts` (no engine/studio edge).
- `pnpm lint` / `pnpm crew-lint` clean; contributor-doc package-inventory row added (FR-019).
