# Phase 0 Research: Per-Keyboard Facet Index

All NEEDS CLARIFICATION items from Technical Context are resolved below. Each decision cites the existing
repo precedent it mirrors, so implementation follows established conventions rather than inventing new
ones. Research was gathered by the KM crew (km-programmer, km-output, km-keyman, km-domain) read-only.

---

## D1 — Where the build tool lives, and its shape

**Decision**: A new standalone utility `utilities/facet-index/`, run via `tsx`, importing engine source
directly by relative path. Not a workspace package (stays out of `pnpm -r`).

**Rationale**: [utilities/supportability-scanner/scan.ts](../../utilities/supportability-scanner/scan.ts)
is the near-exact template — it already walks `resolve(REPO_ROOT, "..", "keyboards", "release")`, imports
`../../packages/engine/src/codec/index.js` and recognizer/placement modules directly, supports
`--limit`/`--check`/`--quiet` flags, and emits a machine-readable JSON + human `.md` companion to `docs/`.
This is the sanctioned way (CLAUDE.md "Standalone utilities") to run corpus-wide engine analysis without
tripping the monorepo build.

**Alternatives considered**:
- *Engine deliverable (a real package)* — rejected for v1: the spec's own Assumption says the schema is
  not a locked contract yet; a package implies contract discipline it hasn't earned. The tool can graduate
  later, exactly as `kbgen` is documented to.
- *kbgen shape* (own tsconfig + vitest + pinned fetch) — adopted **partially**: we take kbgen's
  own-`tsconfig.json` + `data/SOURCES.json` pin-manifest discipline (kbgen already vendors CLDR/Unicode
  with per-file SHA-256), but the corpus-walking core follows supportability-scanner.

---

## D2 — Reference-data acquisition (Unicode UCD), sourced from `lib/ucd/`

**Decision**: Pin the **Unicode 17.0.0** UCD release with a `scripts/ucd-version.json` pin file
(`unicodeVersion` + per-file `sha256` + license/notice) following the `langtags-version.json` shape.
Source the files from the already-present `lib/ucd/` tree (per the invocation's explicit instruction) —
the fetch/verify step reads `lib/ucd/<file>`, SHA-256-verifies against the pin, and a `codegen-ucd.mjs`
step derives a slim committed lookup into `utilities/facet-index/ucd/generated/scriptLookup.ts`. A
`data/SOURCES.json` manifest records the actual hashes + `unicodeVersion`.

**Minimal pinned file set** (4 files — km-domain confirmed the format + version of each in `lib/ucd/`):

| File | Provides | Why required |
|---|---|---|
| `Scripts.txt` | codepoint → single Script value (long names; incl. `Common`/`Inherited`) | primary per-character script evidence; FR-008 neutral-exclusion needs `Common`/`Inherited` |
| `ScriptExtensions.txt` | codepoint → Script_Extensions set (short codes) | FR-008 "shared chars strengthen, never dilute" — without it, shared punctuation/digits dilute distributions |
| `PropertyValueAliases.txt` | `sc` short↔long aliases (ISO 15924) | the two Scripts files disagree on case/form; one canonical table normalizes both to 4-letter codes (`Arab`, `Latn`, `Zyyy`, `Zinh`) |
| `Blocks.txt` | codepoint range → block name | Latin sub-profile (plain / extended / IPA) is a **block** distinction — Script property calls all three `Latn` |

Explicitly **not** pinned: all bidi/normalization/case/name/CJK-source/emoji files — none serve script
classification (full exclusion list in the km-domain research). Keep the pin minimal.

**Rationale**: FR-005 (spec 037 FR-004) mandates version-pinned, integrity-checked reference data recorded
in the manifest, following the repo's pinned-fetch + generated-lookup convention. `langtags-version.json`
→ `fetch-langtags.mjs` (SHA-256 verify, `PLACEHOLDER` gate) → gitignored raw + committed `SOURCES.json` →
`codegen-langtags.mjs` → committed generated TS is that convention verbatim. Sourcing from `lib/ucd/`
instead of the network is a one-line change to the fetch step's input (local read vs `https.get`), keeping
verify + codegen + manifest identical.

**Alternatives considered**:
- *Read raw `lib/ucd/*.txt` at build time, no codegen* — rejected: the codegen step is what makes the
  lookup deterministic, slim, and reviewable, and keeps the multi-MB raw files out of the tool's hot path.
- *Reuse langtags' script data* — langtags gives **default script per language** (a fallback tier), not
  **per-codepoint** script; both are needed (langtags for FR-011 tier 3, UCD for tier 1). Not either/or.

---

## D3 — Facet-definition location and schema

**Decision**: Content-owned YAML under `content/keyboard-facets/` (one file per facet, `id: script`, etc.),
mirroring the `content/facets/` catalog discipline. A **keyboard-level** facet definition declares:
`id`, `valueType` (enum | set | scalar | histogram), `limits` (closed value list for enum/set, or domain
for scalar/histogram), `derivation` (archetype + fallback chain reference — the algorithm is 037), and
`feedsSessionFacets` (the `content/facets/` derivations it feeds, FR-009).

**Rationale**: The spec's Assumption is explicit — "content-team-owned data, not a locked contract… like
`content/facets/`… does not graduate to `packages/contracts` until it survives an evaluation round." A
new directory (not `content/facets/`) because keyboard-level facets are a distinct vocabulary from the
session-level facet catalog (facets describe "who is asking"; keyboard-level facets describe "what this
corpus keyboard *is*"). The two are linked by `feedsSessionFacets`, not merged.

**Alternatives considered**:
- *Put definitions in `packages/contracts/data/`* — rejected: implies Day-1-contract status the spec
  explicitly withholds (km-programmer confirmed that dir is drift-guarded contract territory).
- *Reuse `content/facets/` directly* — rejected: would fork/blur two vocabularies; FR-009 says name the
  session facet a keyboard-level facet feeds, not merge them.

---

## D4 — Built-artifact location and studio consumption

**Decision**: `docs/keyboard-facet-index.json` (the index + embedded manifest) + `docs/keyboard-facet-index.md`
(human-readable audit companion). Consumed by the studio (in the later wiring feature) via the existing
`@docs/*` path alias and the `useEffect` + dynamic-`import()` + graceful-degradation idiom already proven
in [usePlacementPriors.ts](../../packages/studio/src/hooks/usePlacementPriors.ts). Add rows to
`docs/MANIFEST.md`.

**Rationale**: FR-007 requires the artifact be readable offline, without the sibling corpus checkout.
`docs/placement-priors.json` and `docs/import-corpus.json` are exact precedents — committed corpus-derived
JSON, imported at build time via `@docs/*` (aliased in both `vite.config.ts:28` and `tsconfig.json:10`),
degrading to `null` on absence. Static bundled import satisfies FR-007 by construction.

**Alternatives considered**:
- *`content/` or a new top-level `data/` dir* — rejected: no precedent for a large machine-generated
  per-keyboard JSON there; `docs/` already owns this artifact class and its consumption plumbing.

**Note (pre-existing gap surfaced)**: `docs/MANIFEST.md` currently lacks rows for `placement-priors.json`
and `import-corpus.json`. Flag to km-doc — add all three rows in the landing change while there.

---

## D5 — Analysis surface the record captures (owned by 037, inventoried here)

**Decision**: The tool derives values by calling the pure, VFS-free engine functions directly, not the
unwired `importKeyboard` pipeline:
- `parseKmn(kmnText, keyboardId)` → `{ ir, opaqueFeatures }` — wrap **only** `parse()` in try/catch;
  a throw ⇒ `analysisOutcome: fallback-only` (parse-failure).
- `buildProducedSet(ir)` → `Set<string>` (flat, NFC, VFS-free) — the script classifier iterates this to
  build its own per-script histogram (the function gives membership, not counts).
- `recognizePatterns(ir)` → `{ ir, recognizedRatio }`; the strategy fingerprint is derived from
  `ir.recognizedPatterns[].strategyId` weighted by owned rule count, with residue `= 1 − recognizedRatio`.
- Sibling source files discovered via `parseKmnHeaderStores(kmnText)` and read with `fs` by the tool
  (there is **no** existing fs-based loader; the browser loader is HTTP-based and not reusable).

**Analysis-outcome model (FR-010)**: reuse the shape and status-priority ordering of the existing
`ImportStatus` enum / `ImportReport` ([keyboard-ir.ts:378-408](../../packages/contracts/src/keyboard-ir.ts)):
`Clean → fully analyzed`, `CleanWithOpaque → partially analyzed`, `ParseFailure → fallback-only`. Do
**not** define a parallel enum. The **analyzed-coverage share** (a fraction) does not exist today and is
computed by the tool: opaque-fragment count (`ir.raw` entries lacking `producedOutput`) vs total node
count.

**Rationale**: Keeps the artifact record faithful to what the engine actually produces and avoids a third
divergent definition of "opaque." km-keyman confirmed `importKeyboard`/`buildImportReport` are implemented
+ tested but **not exported** from `@keyboard-studio/engine` — so this tool composes the primitives
directly (all already public), and does not depend on wiring that export (that can be a separate, optional
engine task).

**Open engine question (non-blocking)**: whether to export `importKeyboard` as an engine subpath for reuse.
Not required by this feature — recorded so the crew decides deliberately rather than by omission.

---

## D6 — Corpus scope, keyboard id, and freshness plumbing

**Decision**:
- **Scope**: `../keyboards/release/<vendor>/<id>/` only, matching the `KPS_PATH_RE`
  (`^release/[^/]+/([^/]+)/\1\.kps$`) in [base-browser.ts](../../packages/engine/src/base-browser/base-browser.ts)
  and the supportability-scanner default path. `id` = the directory name (unambiguous within `release/`).
- **Freshness (new plumbing — no in-repo precedent)**: each record carries SHA-256 hashes of the source
  files it was derived from (`.kmn` + siblings). The manifest carries `corpusCommit`, `unicodeVersion`,
  and `scannerVersion` (a combined schema+classifier+tool version stamp). Incremental (`--incremental`):
  re-analyze only keyboards whose file hashes changed vs the prior committed index; carry the rest forward
  byte-for-byte. Bumping `unicodeVersion` or `scannerVersion` forces a full recompute of all
  content-derived records (FR-005/US3).

**Rationale**: Scope resolves the id-ambiguity edge case exactly as the spec's Assumption states (by
scoping, not solving). Determinism (FR-006) requires sorted keys and no timestamps; freshness hashes are
the incremental-rescan gate. All three existing corpus scanners already assume `release/` only, so this is
consistent.

**Alternatives considered**:
- *Namespaced ids (`release:foo`)* — deferred: only needed if scope widens to `experimental/`/`legacy/`,
  which is explicitly out of v1 scope. Recording the decision so a future widening knows to namespace.
- *mtime-based freshness* — rejected: not deterministic across checkouts/CI; content hashes are.

---

## D7 — Schema validation: two checkpoints (FR-008)

**Decision**:
1. **Build-time**: `build-index.ts` fails loud (`process.exit(1)`) if any classifier emits a value outside
   its facet definition's `limits`, or a distribution that does not sum to ~1 (or, when the record carries a
   `residue` field — 037: facets over a closed recognized-value keyspace — `distribution` + `residue` does
   not sum to ~1) — never silently records it.
2. **Repo lint**: a new `utilities/facet-index-lint/index.js` (CommonJS, facet-lint style — named checks +
   an F7-style self-check that proves it rejects a known-bad and accepts a known-good record) validates the
   committed `docs/keyboard-facet-index.json` against `content/keyboard-facets/*.yaml`. Appended to the
   `pnpm lint` chain after `facet-lint`.

**Rationale**: [utilities/facet-lint/index.js](../../utilities/facet-lint/index.js) is the exact template
for a content-data lint wired into `pnpm lint` (it's the last `&&` link today). Two checkpoints because
FR-008 requires both "build fails loud" and "artifact validated as part of repository lint" — a hand-edited
or drifted committed artifact is caught by lint even if the build wasn't re-run.

---

## D8 — Session-facet wiring target (FR-009 / SC-005) and a spec count correction

**Decision**: The v1 keyboard-level facets (script; and, via spec 037, strategy-fingerprint and
target/device-mix) can name concrete index fields as the source for these `planned` `corpus:` derivations:

| Session facet | `corpus:` signal | Fed by keyboard-level facet |
|---|---|---|
| `lineage.strategy-fingerprint` | `recognized-strategy-distribution` | strategy fingerprint (037) |
| `env.device-mix` | `sibling-keyboard-targets` | target/device mix (037) |
| `community.multi-orthography` | `sibling-script-spread` | **script** (this feature), aggregated per language family |
| `lineage.nearest-neighbors` | `fingerprint-knn` | strategy fingerprint vector, aggregated (plausible 4th) |

This clears SC-005's "≥4 of the planned derivations name a concrete index field" — they flip
`planned → available` in the follow-up wiring feature, not here.

**Spec correction to flag (km-doc)**: the spec says "**fourteen** `corpus:` derivations… every one is
`sourceStatus: planned`." The actual count in `content/facets/**` is **12** derivations whose `source:`
begins `corpus:`, of which **10 are `planned` and 2 already `available`** (`lineage.siblings`,
`lineage.placement-priors`). SC-005's threshold (≥4) holds under the corrected count; the prose "14 /
all planned" needs a one-line fix. Non-blocking for this plan; recorded for the doc pass.

---

## Cross-cutting resolved facts

- **Determinism recipe**: sort keyboards by id; sort facet keys; sort distribution keys; serialize with a
  stable JSON writer (2-space, sorted object keys); no `Date.now()` in output (a build timestamp, if any,
  lives outside the hashed payload). Mirrors `codegen-langtags.mjs` write-only-if-changed + sorted output.
- **glottolog bridge** (`packages/glottolog/`) is a *consumer* (`findKeyboardBaseCandidates`'s
  `scriptFallback`), currently untracked build-output only. Wiring the script facet into it is explicitly
  out of scope (later feature); recorded as the concrete US1 consumer.
- **The literal defect** this unblocks: `script: "Latn"` hardcode at
  [localKeyboards.ts:111-113](../../packages/studio/vite-plugins/localKeyboards.ts). Fixing the consumer is
  out of scope for 036; the index is the substrate that makes the fix possible.
