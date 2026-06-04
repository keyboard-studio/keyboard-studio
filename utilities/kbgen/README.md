# kbgen — logic-driven keyboard character placement

Decides **where each non-base character goes** on a keyboard — which key, and by what method — from objective Unicode/CLDR signals, and emits an explicit **placement mapping** for the physical and touch keyboards. The goal is to replicate the *intuition* a keyboard author uses, but from data that exists for every script, so the same engine works for
Latin ɓ, Arabic پ, or a Tamil vowel sign.

This step produces the **mapping only** — it does not build or compile. A downstream process consumes the mapping to generate/compile distributable packages.

**Milestone 1** covers Latin-extended scripts (African orthographies) on a US-QWERTY base.

## The idea

Each human placement instinct maps to an objective, cross-script signal:

| Instinct | Signal | Source | `via` |
|---|---|---|---|
| "looks like b" | canonical decomposition (NFD) | `String.normalize` | `DECOMPOSITION` |
| "B WITH HOOK" / "OPEN E" | Unicode character **name** | `UnicodeData.txt` | `NAME` |
| "looks like y" | confusable skeleton | `confusables.txt` (UTS #39) | `CONFUSABLE` |
| identity gap (ŋ→n, ʒ→z) | curated look-alike | `supplement.json` | `VISUAL` |
| "sounds like g" | phonetic / transliteration | `supplement.json` | `PHONETIC` |
| "v is unused" | exemplar characters | CLDR `characters.json` | → free keys |

The cascade ([analyze.js](analyze.js)) scores anchors by signal strength (highest wins), case-folding so a pair like ɣ/Ɣ always shares one key. The method ([place.js](place.js)):

- **anchor occupied** (its letter is used): special goes on **RALT + anchor** — the base
  letter is never lost. Touch: a **longpress** of the special on the unchanged key.
- **anchor free**: **direct remap** on that key (fast *and* logical), base letter restored
  on RALT. Touch: special on the slot (**base**), longpress restores the original.

A hard **completeness check** proves every base character is still typeable (your "you still need a literal `v` for URLs" rule). Unplaced specials (no anchor signal — e.g. the glottal-stop ʼ) are reported separately for a manual decision.

## Data sources — vendored, pinned, not fetched at runtime

A codegen tool must be deterministic and offline: the same inputs must always yield the same mapping, and an upstream Unicode/CLDR bump must not silently move a character. So the canonical machine-readable files are **vendored at pinned versions** (mirroring this repo's
SHA256-verified external-keyboard policy); the human-readable specs are linked for maintainers only. Fetch/refresh them with:

```bash node tools/kbgen/fetch-data.js ha ig yo ak     # locales to pull CLDR exemplars for
```

This writes `data/unicode/{UnicodeData.txt,confusables.txt}`, `data/cldr/<locale>.json`, and `data/SOURCES.json` (pin + checksums). Pinned: **Unicode 16.0.0**, **CLDR 46.1.0** (see
[fetch-data.js](fetch-data.js)). `data/supplement.json` is a tiny curated layer: an offline name fallback plus the letter-identity look-alikes UTS #39 omits. The engine runs without fetching (supplement-only), but `--locale` and full-codepoint coverage need the vendored data.

## Usage

```bash
# derive inventory + free keys from a CLDR locale: node tools/kbgen/cli.js --id hausa --name "Hausa" --locale ha --out ./out/hausa

# or specify the inventory explicitly: node tools/kbgen/cli.js --id demo --chars "ɓƁɗƊƙƘ" --used "abcd…z" --out ./out/demo
```

Writes `source/<id>.placement-map.json` — the per-character key+method mapping for the physical and touch keyboards, with anchor rationale, provenance, completeness, and unplaced items. Useful flags: `--locale`, `--chars`/`--used` (override the locale), `--corpus <touch-layout>` (diagnostic diff vs an existing keyboard), `--free-swap `(convenience route — relocate occupied-anchor specials onto free keys), `--emit-source `(also write `.kmn`/`.keyman-touch-layout`/`.kvks`, **not** compiled), `--dry-run`.

## On the corpus

[corpus-diff.js](corpus-diff.js) compares the engine against existing keyboards, but **the corpus is not ground truth** — many layouts were built for the designer's convenience, not user logic. It's a diagnostic for the future interactive tool. Example: real Hausa swaps ɓ→V, ɗ→X, ƙ→Q (arbitrary free keys); kbgen keeps ɓ→B, ɗ→D, ƙ→K (visual anchor, non-destructive). Running with `--free-swap` reproduces the convenience route.

## Files

- [layout.js](layout.js) — base layout model (add new bases here).
- [analyze.js](analyze.js) — stages 1–3: analysis, anchor scoring, availability.
- [place.js](place.js) — stages 4–5: method decision + completeness check.
- [map.js](map.js) — the physical + touch placement mapping (primary output).
- [emit.js](emit.js) — optional source-file generation (`--emit-source`).
- [corpus-diff.js](corpus-diff.js) — non-authoritative comparison.
- [fetch-data.js](fetch-data.js) — vendor the pinned Unicode/CLDR data.
- `sources/{ucd,confusables,cldr}.js` — adapters over the vendored data.
- `data/` — vendored data, `supplement.json`, `SOURCES.json`.
- [cli.js](cli.js) — entry point. [test/anchors.test.js](test/anchors.test.js) — `npm test`.

## Beyond milestone 1

The data is already the full UCD + confusables, so non-Latin coverage is mostly a matter of adding base layouts in [layout.js](layout.js) (an Arabic 101 layout, Tamil InScript, …) — the placement logic is unchanged because names, decompositions, confusables, and CLDR exemplars are defined over all scripts. Phonetic distance (PanPhon/PHOIBLE) can later replace the supplement's `ipa` hints.
