# @keyboard-studio/glottolog

A local, offline, pinned copy of [Glottolog](https://glottolog.org)'s language
classification tree, plus the relatedness API that turns *"language X has no
keyboard"* into *"here are close relatives of X, ranked by closeness"* and a
bridge that maps those relatives to real keyboards.

Spec: [`specs/036-glottolog-catalog/`](../../specs/036-glottolog-catalog/).

## What it exports

- **`@keyboard-studio/glottolog`** — the catalog + relatedness surface:
  `getLanguoid`, `byIso639p3`, `ancestors`, `relatedLanguages`,
  `relatedIsoCodes`, and the shared types.
- **`@keyboard-studio/glottolog/bridge`** — `findKeyboardBaseCandidates`, the
  keyboard-base bridge (US2). It is a **pure function with injected
  dependencies** (`resolveLanguage`, `languagesById`, optional `scriptFallback`
  / `getBase`) so this package never imports engine or studio.

Everything is synchronous, pure, and offline over the checked-in generated index
([`src/generated/index.ts`](src/generated/index.ts)). Every function is total —
unknown or empty input yields `null` / `[]`, never a throw. No I/O, no network,
no host-disk writes at runtime.

## Invariants

- **Offline / no host-IO at runtime.** The catalog reads only the checked-in
  generated index. The bridge takes injected callbacks; it never reaches out to
  langtags, the base-browser, or the network itself (constitution: dependency
  leaf — imports only `@keyboard-studio/contracts`).
- **Deterministic codegen.** Identical vendored source ⇒ byte-identical
  `src/generated/index.ts` (sorted keys, sorted `byIso` arrays, fixed record key
  order, write-only-on-change). Guarded by
  [`src/codegen-determinism.test.ts`](src/codegen-determinism.test.ts).
- **Fail-loud fetch.** A placeholder or mismatched SHA-256 aborts the fetch with
  a non-zero exit and writes nothing. Guarded by
  [`src/fetch-guard.test.ts`](src/fetch-guard.test.ts).

## Updating to a newer Glottolog release (pin-and-regen)

The catalog is a **build artifact**. Regenerating it is a data refresh, not a
code change: the derivation scripts and the public API do not move. To bump the
pin:

1. **Edit the pin** — [`scripts/glottolog-version.json`](../../scripts/glottolog-version.json):
   set `commit` (and any `tag`/`notice`) to the new
   [`glottolog/glottolog-cldf`](https://github.com/glottolog/glottolog-cldf)
   release. Set each `files[].sha256` to a placeholder (e.g. `"PLACEHOLDER"`)
   for now.
2. **Compute the new hashes** —
   `node scripts/fetch-glottolog.mjs --compute-sha` downloads each pinned file
   and prints its SHA-256 without verifying or writing. Paste the printed hashes
   into `files[].sha256`.
3. **Fetch + verify** — `pnpm run fetch-glottolog` downloads and SHA-256-verifies
   each file, then writes the vendored CSVs (gitignored) and
   [`data/glottolog/SOURCES.json`](data/glottolog/SOURCES.json) (committed).
4. **Regenerate the index** — `pnpm run codegen-glottolog` derives
   `src/generated/index.ts` from the vendored CSVs.
5. **Review the pseudo-family set** —
   [`src/pseudo-families.ts`](src/pseudo-families.ts) is a curated,
   version-pinned set of roots (Sign Languages, Unclassifiable, Bookkeeping,
   Artificial, etc.) whose members never register genealogical relatedness.
   Confirm the glottocodes still exist in the new release and add any new
   pseudo-families the release introduces.
6. **Run the tests** — `pnpm --filter @keyboard-studio/glottolog test`. The
   determinism test confirms a fresh codegen reproduces the committed index
   byte-for-byte.
7. **Commit** the updated `glottolog-version.json`, `SOURCES.json`,
   `src/generated/index.ts`, and any `pseudo-families.ts` edits together.

The raw CLDF tables (`languages.csv`, `values.csv`) are **not** committed —
they are gitignored build inputs, reproducibly re-fetched from the pin. Only the
slim generated index, the manifest, and the pin travel in git.

## Clean-checkout build

`fetch-glottolog` + `codegen-glottolog` are wired into the root `prebuild` chain,
so a clean `pnpm build` produces the vendored data and regenerates the index
before any package compiles. (One-time network access is required for the fetch;
`codegen` is offline thereafter.)
