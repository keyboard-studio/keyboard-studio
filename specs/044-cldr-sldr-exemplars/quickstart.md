# Quickstart / Validation: CLDR/SLDR exemplars

**Feature**: 044-cldr-sldr-exemplars. Run from the repo root unless noted. Contracts:
[exemplar-sourcing.md](contracts/exemplar-sourcing.md),
[phase-b-prefill.md](contracts/phase-b-prefill.md).

## §0 Reproduce the Phase 0 measurements (no repo changes needed)

These are the numbers [research.md](research.md) is built on. They need network but touch
nothing in the working tree.

```bash
# R0 — the tier-key defect: CLDR publishes `auxiliary`, not `exemplarCharacters-type-auxiliary`
curl -s https://raw.githubusercontent.com/unicode-org/cldr-json/refs/heads/main/cldr-json/cldr-misc-full/main/ewo/characters.json \
  | python -c "import json,sys; print(list(json.load(sys.stdin)['main']['ewo']['characters'].keys()))"
# expect: ['exemplarCharacters', 'auxiliary', 'index', 'numbers', ...]

# R4 — coverage: SLDR tags vs CLDR misc-full locales
curl -s "https://api.github.com/repos/silnrsi/sldr/git/trees/master?recursive=1" \
  | python -c "import json,sys; t=json.load(sys.stdin); x=[b for b in t['tree'] if b['path'].startswith('sldr/') and b['path'].endswith('.xml')]; print('sldr xml:',len(x),'bytes:',sum(b.get('size',0) for b in x))"
# expect: ~2726 files, ~67 MB

# R1 — CLDR is npm-published (this is the pin mechanism)
curl -s https://registry.npmjs.org/cldr-misc-full | python -c "import json,sys; d=json.load(sys.stdin); print('latest:',d['dist-tags']['latest'])"
# expect: 48.2.0 or newer  (the repo was on 46.1.0)
```

## §1 Prerequisites

```bash
pnpm install          # brings in cldr-misc-full (new devDependency)
pnpm prebuild         # fetch-langtags, codegen-*, fetch-sldr, codegen-exemplars
```

`prebuild` must succeed on a clean checkout with no manual steps. `packages/engine/data/sldr/`
and the raw CLDR data are gitignored build artifacts — never hand-edit them.

## §2 Validate the offline index (US3 / FR-011–013)

```bash
# Determinism — SC-005. Must be byte-identical.
pnpm codegen-exemplars
sha256sum packages/engine/src/character-discovery/generated/exemplars.generated.json > /tmp/a
pnpm codegen-exemplars
sha256sum packages/engine/src/character-discovery/generated/exemplars.generated.json > /tmp/b
diff /tmp/a /tmp/b && echo "[OK] deterministic"

# Fail-loud on a corrupted pin — FR-012 / T9
#   temporarily edit scripts/sldr-version.json's sha256, re-run, expect a hard failure:
pnpm fetch-sldr        # expect [ERROR] and a non-zero exit, not a warning

# Offline authoring — SC-004 / T11
pnpm --filter @keyboard-studio/engine test src/character-discovery
#   the suite must pass with fetch stubbed to throw; no test may reach the network
```

Expected index properties: sorted keys, `< 2 MB`, `version.generated` derived from the
pins (**not** a timestamp), locales with no usable `main` set omitted.

## §3 Validate sourcing + precedence (US1 / FR-001–004)

```bash
pnpm --filter @keyboard-studio/engine test src/character-discovery
```

Expected, per [exemplar-sourcing.md](contracts/exemplar-sourcing.md#test-obligations):

| Input | Expected |
|---|---|
| `ewo-Latn` | resolves `ewo`; four tiers populated; `auxiliary` = `[c j q x]` |
| an SLDR-only tag (e.g. `ebk`) | non-null seed, `source: "sldr"`, confidence recorded |
| a both-sources tag (one of the 313) | `source: "cldr"` |
| `und`, `Latn`, `zh`, `ms` | `null` (gate) |
| `qaa`–`qtz` | gated for CLDR; allowed when SLDR-backed |
| unknown tag | `null`, no throw |

Regression floor (SC-006): no locale that produced a seed before this feature may lose it.
Compare against a baseline captured from `main` before the change.

## §4 Validate the Phase B prefill (**gated** — see the contract)

> Only run once FR-016/FR-017 are in the spec.

```bash
pnpm --filter @keyboard-studio/studio test src/survey
cd packages/studio && npx playwright test e2e/<prefill-walk>.spec.ts
```

Manual walk:

1. `pnpm dev`, start a new keyboard, pick a language CLDR covers (Ewondo, `ewo`).
2. Reach **Phase B — Add your whole alphabet**.
3. **Expect**: the alphabet is already populated with the CLDR main tier (`a á à â ǎ b d
   {dz} e é …`), each proposed character marked as *from CLDR*; `auxiliary` (`c j q x`),
   punctuation, and numbers appear in their 047 sections **unticked**.
4. Remove a proposed character, go back to prefill, re-enter Phase B → it stays removed.
5. Add a character by hand → it is attributed to the author and survives a re-seed.
6. Pick a language in neither source → empty draft, no error, existing suggestion panel.

## §5 Full gate before PR

```bash
pnpm typecheck && pnpm -r test && pnpm lint
```

`pnpm lint` includes the antipattern checker — no `expect(true).toBe(true)` tautologies,
and no hardcoded survey question-order snapshots.

## §6 Measured outcomes

Measured from the committed index (`exemplars.generated.json`, CLDR 48.2.0 + SLDR
`922a787`) against the committed pre-feature baseline
(`packages/engine/src/character-discovery/__fixtures__/cldr-baseline.json`).
Regenerate both with `pnpm run codegen-exemplars` and
`node scripts/gen-exemplar-baseline.mjs`, then recount with the snippet below.

### SC-003 — coverage increase

| | Pre-feature (CLDR only) | Now (CLDR + SLDR) |
|---|---|---|
| Distinct languages producing a non-fallback seed | **313** | **1,810** |
| Locale entries | 749 | 2,381 |

**+1,497 languages, a 5.8x increase**, attributable entirely to SLDR: 1,628 of the
2,381 locale entries have no CLDR side at all, covering 1,518 distinct languages
CLDR does not carry. The 313 figure corroborates [research.md](research.md) R4's
~323 estimate (R4 counted CLDR locale directories before the confidence gate and
the dozen `[]`-placeholder locales were excluded).

CLDR and SLDR overlap on 346 locale entries; CLDR wins precedence on all of them
(R5), which is what the regression floor asserts — no baseline locale silently
switches source.

### Other measured figures

| Measure | Value | Budget / expectation |
|---|---|---|
| Index size | 1,274,835 bytes (1.22 MB) | < 2 MB contract budget — committed, not gitignored |
| Regeneration | byte-identical | SC-005 |
| SLDR files read | 2,726 | 1,980 carry a usable `main` set |
| CLDR locales read | 766 | of which 12 ship an empty `[]` main set and are dropped |
| Upstream-malformed tiers skipped | 1 | `vut` main (`7`, a mistyped `̧`) — logged as `[WARN]`, pinned by exact text |

### Recount

```bash
node -e "
const idx=require('./packages/engine/src/character-discovery/generated/exemplars.generated.json');
const base=require('./packages/engine/src/character-discovery/__fixtures__/cldr-baseline.json');
const prim=(id)=>id.split('-')[0];
const idxLangs=new Set(Object.keys(idx.locales).map(prim));
const baseLangs=new Set(base.locales.map(prim));
const sldrOnly=Object.keys(idx.locales).filter(k=>idx.locales[k].c===undefined);
console.log('languages now:',idxLangs.size,'was:',baseLangs.size);
console.log('SLDR-only entries:',sldrOnly.length,'distinct langs:',new Set(sldrOnly.map(prim)).size);
"
```

## Rollback

The index is a committed artifact and the sourcing path is additive: reverting the studio
seeding commit restores today's empty-draft + tick-to-add behaviour without touching the
index. Reverting the pin bump is an edit to `scripts/{cldr,sldr}-version.json` plus
`pnpm prebuild`.
