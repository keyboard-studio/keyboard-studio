# Placement-intelligence review — learning from the keyboards corpus

> KM crew review cycle, 2026-06-09. Specialists run: km-strategy (spec gap audit),
> km-domain (linguistic placement principles), km-keyman (corpus extractability,
> evidence-grounded in `../keyboards/release/`), plus a corpus census.
> Status: **proposal** — spec amendment text below needs single-reviewer approval
> ([spec.md §18](../spec.md) revision policy); the placement-map type additions
> route through the kbgen joint session. No `Pattern` schema (§5) change is
> required by anything in this document.

## 1. The concern

The studio's strategy framework ([spec §7](../spec.md)) is strong at choosing *how*
characters are entered (S-01..S-13), but *where* each character lands — which key,
which modifier, which trigger key for a deadkey — is currently decided by the user
unaided ([§8](../spec.md) Phase B: "the user states which key it lives on and under
what modifier") with the kbgen anchor cascade as the only planned automation. The
anchor cascade is first-principles only (NFD base → Unicode name → confusable →
visual → phonetic). Meanwhile `../keyboards/release/` holds ~920 working keyboards —
imperfectly designed, but *adopted* — and the studio learns nothing from them.
This review answers: what can be learned, how, and where it plugs in.

## 2. What the corpus offers

Census of `../keyboards/release/` (2026-06-09):

| Fact | Value |
| --- | --- |
| Keyboards with `.kmn` source | ~920 |
| Use deadkeys (`dk(`) | 244 |
| Use `RALT` | 409 |
| Use `if(`/`set(` option toggles | 72 / 25 |
| Mnemonic layouts (`&MnemonicLayout`) | ~30 |
| `call()` DLL delegation | 6 |
| Distinct BCP47 tags across `.kps` | ~2,570 |
| Have HISTORY.md / `.kvks` / touch layout / help | 919 / 849 / 856 / 916 |

There is no central language registry; `.kps` XML is the metadata path (BCP47 tags,
name, author always present). `../keyboards/mobile-layout-report.csv` already
aggregates touch-layout structure for 916 keyboards.

### 2.1 Extractability of placement tuples

km-keyman sampled 12 keyboards of varying complexity. Target record:
`(codepoint → key, modifier set, mechanism/strategy, base layout, BCP47 context)`.

- **Tier 1 (~60% of keyboards): direct.** `+ [SHIFT K_Q] > 'Ɛ'` rules
  (e.g. [akan](keyboard-index.md), [bambara](keyboard-index.md)) extract losslessly.
  NCAPS/CAPS rule pairs ([armenian_mnemonic_r](keyboard-index.md)) just need dedup.
- **Tier 2 (~25%): store expansion.** `any(vowels) + 's' > index(vowels_sac, 1)`
  ([vietnamese_telex](keyboard-index.md)) and deadkey selectors
  `dk(003b) + any(dkf003b) > index(dkt003b, 2)` ([amazigh_latin](keyboard-index.md))
  expand fully once the parser builds a store symbol table — exactly what the
  KeyboardIR codec already does.
- **Tier 3 (~15%): opaque or hazardous.** `call()` DLLs ([cs_pinyin](keyboard-index.md)),
  mnemonic `T_xxxx` virtual keys ([enggano](keyboard-index.md)), deep `use()` chains.

### 2.2 Known traps (must be engineered, not hoped away)

1. **Mnemonic layouts** (~30 keyboards): character-literal rules bind to the user's
   OS base layout, not a physical key. Tag tuples `mnemonic: true` and exclude from
   the positional dataset.
2. **Undeclared non-US bases:** [anii](keyboard-index.md) is AZERTY-physical
   (`[K_Q] > "a"`, `[K_A] > "ɔ"`) without `&MnemonicLayout`. Detection heuristic:
   if >3 letter-key assignments deviate from their US-QWERTY ASCII equivalent,
   flag the keyboard `suspectedBase: non-US` and record placements relative to the
   inferred base.
3. **CAPS/NCAPS duplication:** collapse paired rules to one canonical tuple.
4. **Legacy `begin ANSI` groups** ([bu_phonetic](keyboard-index.md)): skip entirely.
5. **PUA output** (≥10 keyboards): filter U+E000–U+F8FF tuples; they are legacy-font
   artifacts, not placement evidence.
6. **Runtime `if()` gates:** extract under default option values; annotate variants.

## 3. Central recommendation: corpus-derived placement priors

### 3.1 Architecture — one parser, not two

Build extraction as a **post-pass over the KeyboardIR codec**, not a separate kbgen
corpus tool: `emitPlacementMap(ir: KeyboardIR): PlacementTuple[]`. The supportability
scanner CLI is the batch driver over `release/` (it already runs codec + Layer A'
there), so keyboards that fail import-fidelity checks are filtered before they can
pollute the dataset. kbgen consumes the codec's IR output instead of re-parsing raw
`.kmn`; the prototype remains the dry-run/regression harness. Output: a versioned,
pinned `placement-priors.json` aggregate (alongside kbgen's pinned Unicode/CLDR
data) — built offline, shipped as data, never computed in the SPA.

### 3.2 Aggregation and weighting (km-domain)

For each (codepoint, script-group) pair, score candidate placements:

- **Convergence is the signal:** weight ∝ number of *independent* keyboards placing
  the codepoint there. Independence matters — collapse fork-copy trees (clusters
  with near-identical rule sets) to one vote.
- **Bonus (×2)** for standards-body / major-program keyboards (national layouts,
  `sil_*` flagship families) and for keyboards with long maintenance histories
  (HISTORY.md depth is already in the corpus).
- **Discard** keyboards matching the "free keys filled left-to-right" anti-pattern
  (codepoint order correlates with QWERTY free-key order, r > 0.8): that placement
  was arbitrary, not designed.
- **Same-script-class only:** a Latin trick is not evidence for Arabic. Priors are
  bucketed by A2 script class and base-layout family (QWERTY/QWERTZ vs AZERTY —
  Francophone-Africa AZERTY conventions are real, prescriptive, and must not bleed
  into QWERTY recommendations).

### 3.3 Blending priors with first principles

The seeder's ranking becomes: corpus prior (when `priorCount` ≥ 3 independent
sources) → phonetic anchor → shift-pair consistency (hard constraint: case pairs
share a key) → visual/NFD anchor → base-key preservation → ergonomics tiebreak.
km-domain's ranked principles, in full, with script-class overrides:

1. **Phonetic/mnemonic anchoring** — dominant for Latin-extended, IPA, mnemonic
   Cyrillic/Greek; weak for abjads (shape/standard position dominates) and
   abugidas (consonant+matra topology dominates).
2. **Shift-pair consistency** — hard requirement, all scripts.
3. **Visual/NFD similarity** — tiebreaker (the existing kbgen cascade order is right).
4. **Base-key preservation** — never silently displace a needed base character
   (the existing "literal `v` for URLs" invariant generalizes).
5. **Deadkey-trigger discoverability** — triggers on keys users already associate
   with the diacritic (`'` acute, `` ` `` grave), not arbitrary free keys.
6. **Digraph adjacency** — same-hand/adjacent placement for high-frequency pairs.
7. **Frequency-weighted ergonomics** — last tiebreak only.

### 3.4 Precedent vs. first principles — the decision rule

When the corpus prior and the anchor cascade disagree:

- **≥3 independent keyboards converge** on a placement → precedent wins; the seeder
  proposes it and cites the sources.
- **Single-origin precedent** (one root, others copied) → first principles win, but
  the conflict is **surfaced to the user**: "Most existing keyboards put this on X;
  we suggest Y because it matches the sound. Which do you prefer?"
- **Abjads/abugidas:** community convention is effectively never overridden —
  shaping engines, fonts, and OS stacks assume the converged sequences. A
  first-principles suggestion diverging from script-community consensus is an
  escalation, not an auto-override.
- The studio **never resolves a conflict silently.** The author is the authority on
  what their community will adopt; the studio's job is to make the trade-off visible.

This same posture already governs the linguist agent (LLM proposal + deterministic
CLDR cross-check + user confirmation, §8 Phase B). Placement should mirror it:
LLM/heuristic proposals are advisory, deterministic corpus evidence is the
cross-check, the user confirms. That symmetry — *propose, cross-check, confirm* —
is the studio's answer to "how do we trust AI intuition."

## 4. Proposed spec amendments (G1–G4)

All prose-only; none touches the locked `Pattern` schema.

- **G1 — §8 Phase B placement-proposal protocol.** Add a paragraph after the
  "states which key it lives on" sentence: when a placement map is available, its
  entries pre-fill the per-character key/modifier questions; below a confidence
  threshold the proposal renders as an advisory chip, not a pre-fill; collisions
  (two characters proposed onto one key+modifier) are surfaced as a single
  resolve-one question; every proposal shows its provenance (corpus citation or
  anchor type) and is user-overridable.
- **G2 — new §7.6 "Corpus-derived placement priors."** Specify the extraction
  pipeline (§3.1 above), weighting (§3.2), blending (§3.3), and the precedence
  decision rule (§3.4). The placement-map contract type gains
  `priorSource: 'corpus' | 'unicode-decomp' | 'confusable' | 'phonetic' | 'manual'`
  and `priorCount: number` — settled at the kbgen joint session, since that type
  is not yet locked.
- **G3 — §7.5.1 "Corpus evaluation protocol."** The 13-row validation table becomes
  the seed fixture set; the automated pass runs recognizer → axis vector → decision
  tree over every importable `release/` keyboard and emits `StrategyDivergence`
  records. Divergence clusters are how v1.1 finds its next tree rules (the EuroLatin
  and IPA mismatches were found by hand; this finds the rest).
- **G4 — per-strategy "Placement semantics" notes on the §7.3 cards** for S-02
  (trigger-key choice), S-05 (mnemonic table seeding), S-06 (family-tier key
  choice), S-07 (cycle-key choice), S-09 (base-consonant slot allocation). Gives
  kbgen strategy expansion a design target instead of an open field.

## 5. Interview additions (Phase A/B/C survey)

Questions a keyboard-design linguist asks that the survey currently does not.
Checked against [survey-gap-analysis.md](survey-gap-analysis.md) (which covered
intake/provenance, not placement habits) and the Phase B inventory-gap work
(digraphs/nukta/etc.) — these are complementary, not duplicates:

1. **"What keyboard do users type this language on today — especially on phones?"**
   Existing community habits (Gboard custom layouts, an older Keyman keyboard,
   ASCII workarounds like `ng` for `ŋ`) are the strongest adoption predictor; the
   new layout should default to mirroring them. Feeds the placement prior directly.
2. **"What other keyboards are installed on the same machines?"** If French AZERTY
   is universal, AltGr conventions must not collide. Feeds base-layout choice and
   the S-08 layer plan.
3. **"Prefix or postfix mental model for marks?"** Whether the community thinks
   "mark then letter" or "letter then mark" decides deadkey (S-02) vs. sequence-replace (S-03) more reliably than A3 alone — and matches the IPA mismatch
   already documented in §7.5.
4. **"Which contact-language words must remain typeable?"** Loanwords, names,
   URLs — constrains which base keys may be displaced (principle 4 above).
5. **"Does existing community text use NFC or NFD (or PUA legacy fonts)?"**
   Normalization posture and migration warnings; currently decided silently by
   the Phase C' auto-NFD step.
6. **"Primary use case: literacy materials, SMS/chat, government documents?"**
   Weights frequency-vs-completeness in placement ranking.

Recommended shape: fold 1–3 into Phase B as axis-refining questions (1 and 2 also
populate the prior lookup: "communities like yours chose…"); 4–6 are Phase B/C'
advisories. None requires a new axis; 3 is the already-planned A3 sub-axis from the
§7.5 IPA note.

## 6. Issue-by-issue recommendations

| Issue | Recommendation |
| --- | --- |
| #130 (epic: kbgen integration) | Add corpus-priors workstream to the epic checklist (extraction post-pass, priors aggregate, blending). |
| #131 (joint session — blocker) | Add to agenda: `priorSource`/`priorCount` fields on the placement-map type; codec-post-pass architecture (one parser); priors-data ownership (engine builds pipeline, content curates weighting/blocklists — mirrors the supplement.json question already on the agenda). |
| #133 (placement-map contract type) | Include provenance fields above; include per-candidate ranked lists, not single answers, so the UI can render alternatives. |
| #134 (kbgen as Phase B defaults) | Adopt the G1 protocol: confidence-thresholded pre-fill vs. advisory, collision surfacing, provenance display, never silent. |
| #135 (kbgen strategy coverage) | Use the G4 placement-semantics card notes as the design target; corpus priors also tell you *which* trigger keys real S-02/S-06 keyboards chose. |
| #237 (supportability scanner) | Emit placement tuples as a scanner by-product (`--emit-placements`); the import-corpus report and the priors dataset come from the same pass. |
| #240 (recognizer curation) | Dual-use: recognizer output is also the axis-vector extractor for the §7.5.1 corpus evaluation; curate rules with that consumer in mind. |
| #84 (running axis vector) | The placement proposal consumes the merged vector (A2/A7/A7a at minimum); another reason to resolve the merge question. |
| #142 (linguist agent) | Extend the *propose → cross-check → confirm* symmetry: the agent may also propose placements, but the corpus prior + CLDR are the deterministic cross-check, same as inventory. |
| New issue A | `feat(tools): mine placement priors from release/ — emitPlacementMap post-pass + weighted aggregation` (blocks on #233; agenda item for #131). |
| New issue B | `feat(tools): automated §7.5 corpus evaluation — axis extractor + tree runner over release/, StrategyDivergence report` (blocks on #234/#237). |
| New issue C | `feat(flows): placement-habit survey questions (existing keyboards, contact-language collisions, NFC/NFD legacy, prefix/postfix marks)` (spec §5 above). |

## 7. Guardrails — what *not* to do

- **Don't fine-tune or free-prompt an LLM on the raw corpus** and trust its
  placement instincts. The corpus is part anti-pattern by construction; the value
  is in *weighted, deduplicated, script-bucketed aggregation* with the noise
  filters of §2.2/§3.2 applied — a deterministic dataset the LLM can cite, not
  vibes it absorbed.
- **Don't let the seeder auto-commit placements.** Every proposal is confirmable
  and provenance-labeled (G1). The §7.5 lesson generalizes: the framework earns
  trust by showing its mismatches, not by hiding them.
- **Don't cross script classes or base families** when applying precedent (§3.2).
- **Don't ship the priors pipeline inside the SPA.** Offline build, pinned data
  artifact, same policy as kbgen's vendored Unicode/CLDR.
