# Phase 0 Research: CLDR/SLDR exemplars

**Feature**: 044-cldr-sldr-exemplars · **Date**: 2026-07-26

Every measurement below was taken live during this research pass (GitHub API / raw
fetch / npm registry / probes against the real `parseUnicodeSet`). Numbers are
reproducible with the commands in [quickstart.md](quickstart.md) §0.

---

## R0 (blocking finding) — three of the four exemplar tiers have never been read

**Status**: pre-existing defect, discovered during this research, **not** introduced by
PR #1366.

[`extractExemplarPair`](../../packages/engine/src/character-discovery/cldr.ts) reads:

| Code reads | CLDR JSON actually publishes |
|---|---|
| `exemplarCharacters` | `exemplarCharacters` ✅ |
| `exemplarCharacters-type-auxiliary` | `auxiliary` ❌ |
| `exemplarCharacters-type-punctuation` | `punctuation` ❌ |
| `exemplarCharacters-type-numbers` | `numbers` ❌ |

Verified key sets for `ewo` and `fr` on **both** the old `46.1.0` pin and current
`main`:

```
46.1.0 ewo: [exemplarCharacters, auxiliary, index, numbers, punctuation, ellipsis, ...]
main   ewo: [exemplarCharacters, auxiliary, index, numbers, numbers-auxiliary,
             punctuation, punctuation-auxiliary, punctuation-person, ...]
```

Consequences:

- `ExemplarResult.auxiliary` / `auxiliarySpecials` are **always empty**; the Phase B
  "Suggested auxiliary characters for loanwords" disclosure in
  [`PhaseB.tsx`](../../packages/studio/src/survey/PhaseB.tsx) can never populate.
  `ewo` really does have `"auxiliary": "[c j q x]"`.
- The `punctuation` / `numbers` plumbing added for surplus detection is inert, so the
  "locale punctuation/digits count as needed" behaviour it was written for does not
  actually hold.
- **FR-007 is mis-stated**: it says to *preserve* current `main`+`auxiliary` behaviour,
  but current auxiliary behaviour is "silently empty". FR-005/FR-006 (read punctuation
  and numbers) are therefore **not** additive-on-top-of-working — they are part of the
  same one-line-per-tier key fix.
- CLDR 48 adds `punctuation-auxiliary`, `numbers-auxiliary`, `punctuation-person`.

**Decision**: fix the key names as a **Foundational** task (before any SLDR work), with
a fixture asserting all four tiers non-empty for a locale that has all four. Recommend
also landing it as a standalone fix ahead of this feature, since it is a live data-loss
bug on `main` and touches the same function as the open PR #1366.

**Alternatives considered**: fold it into the SLDR ingestion work — rejected, it would
bury a user-visible bug fix inside a large feature and delay it behind SLDR vendoring.

---

## R1 — CLDR acquisition: use the npm-published `cldr-misc-full`

**Decision**: take CLDR exemplar data from the **npm package `cldr-misc-full`** as a
pinned devDependency, not a hand-rolled HTTP fetch of raw.githubusercontent.

Evidence:

- `cldr-misc-full` is published by Unicode; 71 versions; latest **48.2.0**; ~9.6 MB
  unpacked.
- Layout is byte-identical to the raw repo path we fetch today —
  `main/<locale>/characters.json`, same minimal locale-id directory naming
  (`main/ewo/characters.json`, no `ewo-Latn`).

Why this wins: the pnpm lockfile already carries an integrity hash, so **FR-012
(pinned version + integrity check, fail loudly on mismatch) is satisfied with zero
custom fetch/checksum code** — the same treatment `@keymanapp/kmc-kmn` gets for the
compiler wasm. A version bump is a normal dependency bump reviewable in a PR.

**Alternatives considered**:
- Keep the raw-URL fetch with a SHA-256 manifest (kbgen's pattern) — rejected for CLDR:
  it reimplements what the package manager already guarantees, and needs one HTTP
  request per locale (766 locales).
- `cldr-core` too (availableLocales) — not needed; the locale list is derivable from the
  extracted index's own keys.

---

## R2 — SLDR acquisition: one tarball pinned by commit SHA

**Decision**: fetch **one** `codeload.github.com` tarball of `silnrsi/sldr` pinned by
commit SHA with a SHA-256 recorded in `scripts/sldr-version.json`; gitignore the raw
extract; commit only the derived slim index. This is the `fetch-langtags` +
`codegen-langtags` pattern, which is the precedent the spec names.

Evidence (live `git/trees?recursive=1`):

| Measure | Value |
|---|---|
| `sldr/**/*.xml` files | **2726** |
| Raw total size | **67.1 MB** |
| Layout | `sldr/<first-letter>/<tag>.xml` (e.g. `sldr/e/ewo.xml`) |
| Format | LDML XML, `<characters><exemplarCharacters …>` |

67 MB of raw XML must **not** be committed. Per-file HTTP (2726 requests) is also out.
One tarball = one download, one checksum, one thing to bump.

**Alternatives considered**:
- The `ldml.api.sil.org` REST service — rejected as the build-time source: a live API
  gives no reproducibility pin and no offline story. May be worth revisiting only for
  an opt-in refresh (R3).
- npm — SLDR is not published there.

---

## R3 — Pin vs latest (the #1366 conflict) — NEEDS USER RATIFICATION

**The conflict is real.** PR #1366 repointed the loader at `refs/heads/main` on explicit
user instruction ("we should be getting latest, not lock to a specific CLDR version").
US3 / FR-011 / FR-012 / FR-013 / SC-004 / SC-005 require the opposite: pinned,
checksummed, offline, byte-identical.

Both intents can hold, because they are about **different moments**:

| | Authoring (runtime) | Maintenance (build) |
|---|---|---|
| Requirement | offline, deterministic, no network | current data |
| Mechanism | committed slim index generated from pinned sources | bump the pin, regenerate, review the diff |

**Proposed resolution** (three parts):

1. **Authoring reads the committed index only** — no network at author time. Satisfies
   FR-011/012/013, SC-004/005, and Article V.
2. **Bump to current data as part of this feature**: CLDR `46.1.0` → **`48.2.0`**. The
   freshness complaint was justified — the repo was two CLDR releases stale, and 48.x
   adds real tiers (`punctuation-auxiliary`, `numbers-auxiliary`).
3. **Keep staleness visible and the bump cheap**: pins live in
   `scripts/{cldr,sldr}-version.json` (+ the npm dep), bumping is one edit plus
   `pnpm prebuild`, and a CI staleness check reports when upstream has a newer release
   (reports — never auto-bumps, so the index can't change under a review).

**What this gives up**: an author does **not** get a CLDR release published after their
checkout's pin. That is the deliberate trade for reproducible authoring — a keyboard
built twice from the same checkout must seed the same alphabet.

**Optional live-refresh path** (recommend deferring): the loader from #1366 could stay
as an explicit, author-initiated "check for newer exemplar data" action. It is genuinely
useful for a language whose CLDR/SLDR entry was *just* added — the exact minority-language
case this feature serves. Deferred because it doubles the sourcing paths (an FR-015
"one shared sourcing path" risk) and needs its own provenance UI. **Not planned here;
recorded as the follow-up.**

> **Escalation**: this partially reverses #1366's intent, so it must not be enacted
> silently. If instead "always latest, reproducibility second" is the standing
> preference, US3 / FR-011–013 / SC-004–005 must be amended or dropped from 044 and this
> plan's Phase 1–2 change shape. **Ratify before `/speckit-tasks`.**

---

## R4 — Coverage measurement: SLDR is the whole point (hard numbers)

Live comparison of SLDR tags vs CLDR `cldr-misc-full/main` directories:

| Measure | Value |
|---|---|
| SLDR tags | 2726 |
| CLDR misc-full locales | 766 |
| Exact-tag overlap | **313** |
| SLDR-only tags | 2413 |
| Language-subtag level: SLDR / CLDR | **1813 / 323** |
| Languages SLDR adds that CLDR lacks | **~1500** |
| Sampled SLDR files carrying a `main` exemplar set | 29/40 (**~72%**) |

So the realistic yield is **~1300–1500 additional languages** with a real exemplar seed
(72% of ~1800–2400), against a CLDR-only baseline of ~323. This is the SC-003 baseline;
precedence (R5) only ever matters for the **313** overlapping tags.

---

## R5 — CLDR-vs-SLDR precedence (spec defers this to planning)

**Decision**: `CLDR > SLDR` on exact-tag overlap; SLDR is sole source elsewhere; every
character records its source.

Rationale: CLDR entries are release-gated and human-vetted; SLDR entries carry explicit
draft markers (R6) including `generated` (machine-derived). Preferring the vetted source
where both exist, while letting SLDR own the 1500-language gap, gets the coverage win
with no regression risk against the CLDR-only baseline (SC-006). It is also trivially
explainable to an author: *"from CLDR"* / *"from SLDR"*.

**Rejected**: the spec's Assumption sketch ("SLDR preferred for languages CLDR
classifies as lesser-covered") — CLDR's coverage-level metadata is a separate dataset
(`coverageLevels.json`), and keying precedence on it adds a third pinned input and a
rule authors can't predict. Not worth it for 313 tags.

**Union rather than either/or** is deliberately **not** chosen for v1: merging two
inventories produces characters no single authority attests, which is exactly the
"silently merged" outcome the spec's source-disagreement edge case forbids. Union stays
available later as an explicit author action ("also show SLDR's extras"), since
per-character attribution makes it representable.

---

## R6 — SLDR internal quality markers (spec did not anticipate these)

Sampling 40 SLDR files found structure the spec's model omits:

```xml
<exemplarCharacters>[a á b c …]</exemplarCharacters>
<exemplarCharacters type="index">[A Á B …]</exemplarCharacters>
<exemplarCharacters type="punctuation">[! ' ( ) , \- . \: ; ? \[ \] ‘ ’ “ ”]</exemplarCharacters>
<exemplarCharacters type="punctuation" alt="proposed-dbl" draft="suspect">[…]</exemplarCharacters>
<special><sil:identity … draft="generated"/></special>
```

| Attribute | Observed values (sample of 40 files / 112 sets) |
|---|---|
| `type` | main 32, auxiliary 17, index 21, punctuation 22, numbers 2 |
| `draft` | *(none)* 80, suspect 5, unconfirmed 4, contributed 3, generated 2 |
| `alt` | `proposed-dbl` 5 |
| file-level `sil:identity/@draft` | *(none)* 28, `generated` 12 (**30%**) |

**Decisions**:

1. **Ignore any set carrying `alt`.** An `alt` set is an alternative proposal, not the
   locale's set. Naively parsing all `<exemplarCharacters>` elements would double-count
   — e.g. `ebk.xml` would yield its punctuation twice, once including ZWNJ/ZWJ.
2. **Deterministic rank when duplicates remain** for one `type`:
   `approved > contributed > tentative > unconfirmed > provisional > generated > suspect`,
   ties broken by document order. Record the winner's `draft` value.
3. **Surface `draft` as confidence, don't filter on it.** Dropping `generated` would
   discard ~30% of SLDR files — much of the coverage this feature exists to deliver. A
   generated set is a better starting point than the whole Unicode block. It must,
   however, be visibly attributed (R8, and FR-004's audit requirement).
4. All four in-scope tiers (`main`/`auxiliary`/`punctuation`/`numbers`) exist in SLDR, so
   FR-005/FR-006 are satisfiable from both sources. `index` stays out of scope
   (spec Assumption) — it is a titlecased collation-header set and would pollute the
   alphabet with uppercase duplicates.

---

## R7 — `qaa`–`qtz` private-use handling (spec flagged as a design decision)

**Decision**: make the confidence gate **per-source** — keep suppressing private-use
tags for CLDR, allow an SLDR-backed private-use entry through, attributed to SLDR.

Evidence that de-risks this: exactly **1** file in SLDR's whole corpus sits in the
`qaa`–`qtz` range (`sldr/q/qaz.xml`). The spec's worry ("a blanket suppression would
discard the data this feature exists to surface") is directionally right but has a blast
radius of one tag today, so the cheap correct rule needs no ISO-639-3 reassignment
lookup. Revisit only if that count grows.

`und`, script-only tags, and un-narrowed macrolanguages stay suppressed for **both**
sources (FR-008) — those are "we don't know which language" signals, not coverage gaps.

---

## R8 — Phase B prefill: **this is a spec delta, not an existing behaviour**

The driving request — *"if we start with proposed, we would be able to pre-fill Phase B —
Add your whole alphabet"* — is **not** satisfied today. Verified by reading the code:

- [`CharactersStep.tsx`](../../packages/studio/src/survey/CharactersStep.tsx) calls
  `resetPhaseBDraft()` on the `prefill → B` transition, so the build-list draft starts
  **empty** every time.
- [`PhaseB.tsx`](../../packages/studio/src/survey/PhaseB.tsx) `SuggestionPanel` renders
  CLDR characters as **unticked** chips — the visible copy is literally *"from CLDR
  exemplars — tick to add"* and *"tick suggested ones"*.
- Its data source is `suggestMissingChars`, which returns only characters **the base
  keyboard does not already cover** — a *missing-delta*, not the language's alphabet. It
  is the wrong input for pre-filling "your whole alphabet" (a base that already covers a
  character would cause that character to be absent from the proposed alphabet).

So the author is asked to assemble from zero what an authoritative source already knows.
That is precisely what spec v1.3.1 §3c ("Defaults are the product", propose-then-confirm,
*"no default is a defect"*) forbids, and 044's FR set never states the proposal
behaviour — its Assumptions even say *"No new UI surface required"*.

**Flagged, not silently designed in.** Required spec delta:

- **FR-016 (new)**: On entering Phase B for a language with a sourced exemplar set, the
  build-list alphabet MUST be **pre-populated** with that set (propose-then-confirm) rather
  than starting empty; the author confirms, removes, or adds.
- **FR-017 (new)**: A proposed character MUST be visually distinguishable from an
  author-entered one and carry its source (CLDR/SLDR + draft confidence), and an author's
  removal of a proposed character MUST persist across re-derivation (no re-proposing what
  the author rejected).
- **Amend the Assumption** "No new UI surface required" → no new *screen*; the existing
  build-list gains proposed-state affordances.
- **Amend FR-007** per R0 (auxiliary is currently broken, not working).

Design shape once ratified (details in [contracts/phase-b-prefill.md](contracts/phase-b-prefill.md)):

- Seed from the **full sourced `main` tier** (not the missing-delta), plus the uppercase
  counterparts 047 already derives via `caseCounterpart`.
- `auxiliary` / `punctuation` / `numbers` are surfaced **in their 047 breakdown sections
  but unticked** — they are secondary tiers, and loanword letters are a judgement call
  the author should make deliberately. *(This ticked/unticked split is the one genuinely
  content/UX-owned decision here — confirm with Content per Article VI.)*
- Feeds 047's existing `PhaseBDraftState` stores; no new screen.

**Alternative considered**: pre-tick the existing `SuggestionPanel` chips instead of
seeding the draft. Rejected — the panel's input is the missing-delta, so the "whole
alphabet" would silently omit anything the base already covers.

---

## R9 — `parseUnicodeSet` consolidation + a verified escape defect

The spec mandates consolidating, not tripling, the two copies
([engine](../../packages/engine/src/character-discovery/cldr.ts),
[kbgen](../../utilities/kbgen/sources/cldr.ts)).

**Decision**: the engine copy is canonical and gains SLDR's syntax needs; the SLDR
reader calls it (no third copy). kbgen's copy is left in place and its retirement stays
tracked in [INTEGRATION.md](../../utilities/kbgen/INTEGRATION.md) — kbgen is CommonJS
plain JS outside `packages/*` and cannot import the engine until it conforms, so forcing
it now would mean either rewriting kbgen (out of scope) or publishing a shim package
(more surface than it saves).

**Verified defect — `\uXXXX` escapes are not decoded.** Probed against the real
function:

| Input | Output | Verdict |
|---|---|---|
| `[! , \- . \: \[ \]]` | `! , - . : [ ]` | ✅ single-char escapes fine |
| `[a ‌ b]` (literal backslash-u) | `a`, **`u`**, **`2`**, **`0`**, **`C`**, `b` | ❌ injects ASCII garbage |
| `[[a-z]-[aeiou]]` | `[`, `]`, `a`…`z` | ❌ set-difference not evaluated |

SLDR uses `‌` / `‍` in real exemplar sets (`ebk.xml`), so ingesting SLDR
without fixing this would silently add `u`, `2`, `0`, `C`, `D` to authors' alphabets.
Both must be handled in the canonical parser: decode `\uXXXX`/`\x{…}`, and **fail
loudly** on unsupported set operations (FR: a malformed set must never emit a partial
inventory). Applies to the CLDR path too.

---

## R10 — Tag → locale-id resolution: reuse `cldrLocaleCandidates`

`cldrLocaleCandidates()` (added in PR #1366) minimizes a BCP47 tag to a locale-directory
id — `ewo-Latn → ewo` while keeping `sr-Latn` / `zh-Hant` / `pt-BR` correct — and is
already covered by tests.

**Decision**: promote it to the shared lookup key for **both** sources and the offline
index. The npm CLDR package uses the identical directory naming (verified), and SLDR is
the same shape (`ewo`, `ewo_CM` — note the `_` region separator, which the function
already normalizes). Generalize the name away from `cldr`-specific (e.g.
`exemplarLocaleCandidates`) and reuse; do not reimplement per source. This satisfies the
spec's "locale granularity" edge case for both sources with one deterministic rule.

---

## Resolved unknowns

| Spec item deferred to planning | Resolution |
|---|---|
| CLDR-vs-SLDR precedence | R5 — CLDR wins on the 313 overlapping tags, attribution per char |
| SLDR `qaa`-`qtz` handling | R7 — per-source gate; blast radius is 1 file |
| SLDR competing orthographies | R6 — ignore `alt` sets, deterministic `draft` rank, record winner |
| Offline/pinned mechanism | R1 (npm dep for CLDR) + R2 (SHA-pinned tarball for SLDR) |
| `parseUnicodeSet` duplication | R9 — engine canonical; kbgen retirement stays tracked |

## Open items requiring a decision before `/speckit-tasks`

1. **R3** — ratify pinned-index-with-bumpable-pin (partially reverses PR #1366).
2. **R8** — approve the FR-016/FR-017 spec delta (and the FR-007 correction from R0);
   confirm the ticked-vs-unticked tier split with Content.
3. **R0** — confirm whether the tier-key fix ships standalone (recommended) or inside
   this feature.
