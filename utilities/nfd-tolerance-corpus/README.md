# nfd-tolerance-corpus — NFC/NFD context-tolerance corpus harness

Standalone Node tool that runs the **real** context-tolerance transform (spec
[062](../../specs/062-canonical-context-tolerance/) —
[validator/context-tolerance.ts](../../packages/engine/src/validator/context-tolerance.ts) plus
[pattern-apply/context-variants.ts](../../packages/engine/src/pattern-apply/context-variants.ts))
over every keyboard in the sibling `keymanapp/keyboards` checkout, recompiles and
re-simulates the result, and reports **what each keyboard actually does afterwards**.

The goal it measures is narrow and deliberate: a keyboard should treat **decomposed and
composed text as equivalent _input_**. What the keyboard _outputs_ must not change. The
harness therefore only ever compares a keyboard against itself across the two canonical
forms of the same preceding context. It never proposes, applies, or scores a change to a
keyboard's output bytes.

This is a `utilities/*` tool: deliberately **out of `pnpm -r`**, no build step, imports engine
source by relative path (see [CLAUDE.md](../../CLAUDE.md) "Standalone utilities"). Do not move it
into `packages/*`.

## Why outcome buckets and not rule counts

A script that counts the decomposed-context rules the transform emitted will score
`sil_yoruba8` as fixed. It is not. Its dot-below rule is
`any(dot+nsl) + any(key.all) > index(dot+nsl,1) index(ac.all,2)` — one rule covering five
accent keys, whose output depends on **which** key was pressed. The transform resolves
`any(key.all)` to its first member only, measures the output for that one key, and bakes it
in as a literal. The result compiles, looks right, and silently emits a grave accent for
four of the five keys. In Yoruba, tone is phonemic: that is a different word.

So every bucket here is reached through a `simulate()` comparison of the **compiled**
before-and-after keyboards, and the harness enumerates its own probes rather than reusing the
engine's key resolution — see the header comment in [probes.ts](probes.ts).

### Probe outcomes

For one (preceding-context character, keystroke) pair, with `b*` the baseline keyboard's
output and `f*` the transformed keyboard's:

| outcome | condition | meaning |
| --- | --- | --- |
| `no-gap` | `bNFC == bNFD`, unchanged | already tolerant, left alone |
| `gap-fixed` | `bNFC != bNFD`, `fNFD == fNFC == bNFC` | repaired |
| `gap-remaining` | `bNFC != bNFD`, `fNFD == bNFD` | declined or missed; nothing broken |
| `gap-miscorrected` | `bNFC != bNFD`, `fNFD` moved and still disagrees | **new, well-formed, wrong output** |
| `regressed-composed` | `fNFC != bNFC` | a correct composed path changed |
| `regressed-decomposed` | `bNFC == bNFD`, `fNFD != fNFC` | a tolerant pair stopped agreeing |

The probe set includes context characters that are **not** decomposable (an unaccented
vowel, say). Those pairs were already correct, and a generated rule with a longer context can
out-rank a rule the transform never looked at — that is how a store-widening fix regressed
plain `o` + `` ` `` on `sil_yoruba8`. Probes that could never diverge are still the ones that
catch collateral damage.

### Keyboard buckets

One per keyboard, by worst-outcome precedence: `regressed` > `compile-failed` /
`harness-error` > `gap-remaining` > `gap-fixed` > `refused` > `no-gap`. A keyboard that
repairs forty pairs and corrupts one is `regressed` — the corrupted pair is the one a user
hits.

`refused` is an **unknown**, not a clean bill of health: nothing was probeable because every
candidate rule was declined by an internal gate. Every result carries a `refusals` map naming
those gates (`compound-context`, `multi-store-pairing`, `key-not-on-us-layout`, …) whatever
its bucket, so a shortfall always says why.

## The `&LAYOUTFILE` workaround

kmcmplib emits **zero artifacts** when a header store names a packaging asset it cannot open.
`stripAssetStoresForCompile`, which the engine applies before its own compiles, drops
`&BITMAP` and `&VISUALKEYBOARD` but **not** `&LAYOUTFILE` — and ~92% of the corpus declares a
touch layout. Uncompensated, the behavioural comparison silently reports "failed to compile"
for almost every keyboard and the harness's numbers would mean nothing.

That is an engine defect with its own tracking issue, and fixing it is **not** this tool's
job. The harness compensates locally instead: `prepare()` runs the repo's existing
[stripDanglingAssetStores](../../packages/engine/src/compiler/stripDanglingAssetStores.ts) over
the source **text** against an empty VFS (so every asset counts as absent) before parsing. The
engine's narrower strip then has nothing left to miss. Stripped store names are recorded per
keyboard in the report, and every node's `sourceLine` is shifted back onto the original file so
the report's line numbers point where a reader expects.

## Usage

```
pnpm run nfd-tolerance-corpus                       # whole corpus, ~8 min
pnpm run nfd-tolerance-corpus -- --keyboard sil_yoruba8,haroi
pnpm run nfd-tolerance-corpus -- --limit 25 --verbose
node utilities/nfd-tolerance-corpus/run.mjs --help
```

| flag | meaning |
| --- | --- |
| `--corpus-root <path>` | sibling `keymanapp/keyboards` checkout (default `../keyboards`) |
| `--keyboard <id>` | analyse only these; repeatable or comma-separated |
| `--limit <n>` | first `n` keyboards by id |
| `--max-probes <n>` | per-keyboard probe cap (default 400; truncation is reported) |
| `--out <path>` | JSON report (default `reports/nfd-tolerance-corpus.json`, gitignored) |
| `--verbose` | keep kmc-kmn's own console output |
| `--quiet` | JSON only, no human summary |

Corpus scope is the shared `release/<vendor>/<id>/[source/]<id>.kps` matcher from
[corpus-scope](../../packages/engine/src/base-browser/corpus-scope.ts), the same one
[facet-index](../facet-index/README.md) and base-browser use; the analysed `.kmn` is the
`.kps`'s sibling.

### Why `run.mjs` and not `tsx`

Every other `utilities/*` tool runs straight under `tsx`. This one reaches the engine's
**simulator**, whose vendored KeymanWeb sources are addressed by bare `keyman/engine/*`
specifiers and re-export types without `export type`. esbuild transpiles file by file and
cannot tell those from value re-exports, so Node throws before the harness runs. Vite's SSR
module runner resolves the aliases and tolerates the re-exports, and `vite` is already a root
devDependency — so `run.mjs` boots through it rather than adding `vite-node` as a dependency
just to get a loader. [vite.config.ts](vite.config.ts) holds the aliases and
[vitest.config.ts](vitest.config.ts) extends it, so the CLI and the suite resolve identically.

## Report

`--out` writes a `nfd-tolerance-corpus/1` JSON document: run metadata (corpus root and
commit, probe cap), corpus-wide bucket and refusal tallies, then one record per keyboard with
its bucket, stripped asset stores, refusal counts by gate, diagnosed gap rules, generated
variant count, probe tally, and every **notable** probe in full — the four measured outputs
rendered as `U+XXXX` sequences. Clean probes are counted, not listed.

Output defaults under `reports/`, which is gitignored: a sweep measures one checkout at one
commit, so re-run it rather than reading a stale copy.

## Tests

```
pnpm run test:nfd-tolerance-corpus
```

Hermetic and fast — no corpus checkout, no network.

- [probes.test.ts](probes.test.ts) — the pure half: outcome classification, bucket
  precedence, all-members key resolution, gate-id mapping.
- [ground-truth.test.ts](ground-truth.test.ts) — the two keyboards a human already fixed by
  hand for this exact bug, asserted against the hand fix's own measured behaviour.

A full-corpus sweep is the CLI, never a test.

### Ground-truth fixtures

`__fixtures__/<id>.{pre-fix,post-fix}.kmn` are vendored verbatim from the corpus at both
sides of the hand-fix commit:

| fixture | commit | source path |
| --- | --- | --- |
| `haroi` | `ed1c31f51` (2020) | `release/h/haroi/source/haroi.kmn` |
| `sil_kcho` | `b58b9e62a` (2025) | `release/sil/sil_kcho/source/sil_kcho.kmn` |

Regenerate with `git show <commit>^:<path>` / `git show <commit>:<path>` in the corpus
checkout.

The assertion is behavioural, not textual: the transform will never emit the human's source
shape (haroi's author wrote 2 rules and 8 partitioned stores where the transform writes
dozens of flat literal ones). For every input pair the **human** made canonically tolerant,
the transform must produce the same bytes the human's keyboard produces.

- **haroi** reproduces the hand fix on every pair the human repaired.
- **sil_kcho** reproduces **8 of 16**. The diaeresis-a family is repaired; the diaeresis-u
  family is not, because `store(vowelUK)` is read by `index()` against three separate output
  stores (`graveUO`, `acuteUO`, `macronUO`) and the engine's `multi-store-pairing` gate
  declines every rule that uses it as context. The transform leaves those pairs exactly as it
  found them — under-reach, not corruption. `ground-truth.test.ts` pins 8/16 exactly, as a
  characterization test: widening that gate turns the test red and forces a re-measurement
  rather than letting the change land unexamined.
