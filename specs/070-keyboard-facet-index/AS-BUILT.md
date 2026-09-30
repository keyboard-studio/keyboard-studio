# Spec 070 Keyboard Facet Index: as built

**Status:** Retired 2026-09-29. Shipped in PR #1127 (squash `e2bec01a`, 2026-07-15; folder was numbered 036 until the #1644 renumber, so older code and commits say "036"). Tasks: 37/37 complete.
**Full docs:** [specs/_archive/070-keyboard-facet-index/](../_archive/070-keyboard-facet-index/) (spec, plan, tasks, research, quickstart, checklists). Not read by default.
**Pinned here:** [data-model.md](data-model.md) and [contracts/facet-definition.schema.md](contracts/facet-definition.schema.md) (linked by content/keyboard-facets/README.md as the schema reference; content/keyboard-facets/script.yaml cites data-model.md), [contracts/facet-index.schema.md](contracts/facet-index.schema.md) (cited by utilities/facet-index-lint and utilities/facet-index/types.ts).

## What shipped
- A standalone build tool, `utilities/facet-index/` (run with tsx, out of `pnpm -r`), that scans `../keyboards/release/<vendor>/<id>/` and writes a committed, offline, deterministic per-keyboard facet index.
- Artifact `docs/keyboard-facet-index.json` plus human audit companion `docs/keyboard-facet-index.md`; both have rows in `docs/MANIFEST.md`.
- Content-owned facet definitions, one YAML per facet under `content/keyboard-facets/` (30 today; 070 itself landed only `script`, later specs 037/040/041 added the rest on the same shell).
- `utilities/facet-index-lint/index.js`, wired into `pnpm lint` (`facet-index-lint` script), validating the committed JSON against the YAML definitions.
- Spec-count correction: `content/facets/**` has 12 `corpus:` derivations (10 planned, 2 available), not 14. No `sourceStatus` was flipped; wiring session facets to index fields is a separate later feature.

## Public contracts
- Facet definition (`content/keyboard-facets/<id>.yaml`): `id`, `valueType` (enum | set | scalar | histogram), `limits`, `derivation` (archetype plus fallback-tier chain), `feedsSessionFacets`. Types: `utilities/facet-index/types.ts`; loader `load-defs.ts`.
- Artifact shape: top-level `{ manifest, keyboards }`; `keyboards.<id>.facets.<facetId>` carries `value`, `confidence`, `confidenceClass`, `consistency`, `evidenceSize`, `analysisOutcome`, `analyzedCoverage`, `provenanceTier`, `notes`. Manifest carries `schemaVersion`, `scannerVersion`, `corpusCommit`, `corpusScope`, `unicodeVersion`, `referencePins`, `keyboardCount`, `facetCoverage`, `facetIds`. Field-level authority: the pinned contracts above.
- CLI (`utilities/facet-index/cli.ts`): `--limit N`, `--check`, `--incremental`, `--classified-only`, `--quiet`, `--out <path>`, `--corpus-root <path>`. Build with `pnpm --dir utilities/facet-index build` (tsx cli.ts); tests via `pnpm run test:facet-index`.
- Keyboard id is the directory name under `release/` (scope excludes experimental/legacy, so ids are unambiguous).

## Key decisions
- Standalone utility, not a package: the schema is content-owned data, not a locked contract, and does not graduate to `packages/contracts` until it survives an evaluation round (research D1, D3).
- Keyboard-level facets live in `content/keyboard-facets/`, separate from session-level `content/facets/`; linked only through `feedsSessionFacets` (D3).
- Artifact lives in `docs/` and is consumed offline through the `@docs/*` alias with graceful degradation, like `placement-priors.json` (D4).
- Freshness: per-record SHA-256 of source files; `--incremental` re-analyses only changed hashes and carries the rest byte-for-byte. A `unicodeVersion` or `scannerVersion` bump forces full recompute. No timestamps, sorted keys, so output is deterministic (D6).
- Two validation checkpoints: build fails loud on out-of-limit values or distributions not summing to about 1 (with `residue`, distribution plus residue); repo lint catches a hand-edited or stale committed artifact (D7).

## Gotchas and limits
- Corpus is the `keyboard-studio/keyboards` fork checked out at `../keyboards`; a different corpus commit changes `corpusCommit` and the artifact, and `--check` will fail until rebuilt.
- Not in `pnpm -r`: needs the sibling corpus, imports engine source by relative path.
- Per-script input-facet derivations (display-difficulty) are validated by `pnpm run facet-lint`, not `facet-index-lint`.
- `.spec-context`-era citations in code and commits say "spec 036"; it is this spec.

## Divergences from the spec
None found. Each pinned contract shape, the CLI flags, `docs/MANIFEST.md` rows, and the lint wiring match `origin/main`. The facet set (30 YAMLs) is far larger than the "script only" v1 the spec describes, by design of the follow-on specs.

## Follow-ups and open issues
- Flipping the four `corpus:` session-facet derivations from planned to available (`lineage.strategy-fingerprint`, `env.device-mix`, `community.multi-orthography`, `lineage.nearest-neighbors`) is the deferred wiring feature.
- Namespaced ids (`release:foo`) are needed only if the scan scope ever widens beyond `release/`.
- Inbound links to repoint at this stub: docs/tooling.md:386, docs/design-notes/survey-flow-rework.md:179, utilities/facet-index/README.md:3, content/keyboard-facets/README.md:79 (folder link, still resolves).
