# Feature spec — Strategy selection (spec.md §7)

> **Status:** authoritative for §7. Extracted from monolithic `spec.md` on 2026-06-15 as the pilot of the section-by-section spec-kit migration. The root `spec.md` contains only a stub pointer to this file. On conflict, this file wins.
>
> **Cross-references** to other sections (e.g. "Sec 5", "§14", "Sec 17") still resolve against the monolithic `spec.md`. Internal cross-references inside §7 (e.g. "§7.5", "S-09") resolve within this file.
>
> **Grilling status:** `/speckit-clarify` Session 2026-06-15 — 3 of 5 questions answered (Q2 deferred, Q5 skipped). See `## Clarifications` below.

## 7. Strategy selection

*Revised 2026-06-08 (v1.1.0 KeyboardIR import). See [docs/spec-amendment-2026-06-08-keyboardir.md](../../docs/spec-amendment-2026-06-08-keyboardir.md).*
*Revised 2026-06-11 (v1.1.1 placement priors). See [docs/spec-amendment-2026-06-11-placement-priors.md](../../docs/spec-amendment-2026-06-11-placement-priors.md).*

Character coverage is **not** "simple substitution." Choosing how a character is output — a bare key swap, a deadkey-then-base composition, an ASCII transliteration, a tone cycle, a context-sensitive cluster, an OS IME callout — is the core decision the studio makes for the user. This section is that recommendation engine.

The survey does not emit output rules directly. It computes a seven-axis description of the keyboard's needs (Sec 7.1), runs a decision tree over those axes (Sec 7.2) to choose a **primary output strategy** (one of S-01..S-12) plus likely **secondaries**, and surfaces the matching gallery patterns for the user to confirm by example. The pattern library (Sec 5) is the implementation layer: each `Pattern` names the strategy it implements via `strategyId`, so a decision-tree result maps directly to the patterns the gallery shows first.

The decision-tree result is a **starting recommendation**, not the final output. The gallery (Sec 8 Mechanisms/Touch — formerly Phase C/E) lets the user accept it, override it per character class or per individual character, and assign **more than one** access mechanism to a single character. The gallery's output is modeled as a **scoped, multi-valued assignment map** (default → class → individual precedence; 1..N mechanisms per character; computed once per modality), DISCUS-guided (Sec 7.7) — the decision tree seeds the default scope; the gallery refines it. The *typed contract* for that map is **ratified** (2026-06-26 joint session, §18) and is being built **incrementally** ("along the way"): the gallery's flat `selectedPatternIds` is **migrating to the typed assignment map**, which is now the contracted target shape, not a deferred aspiration. The migration is staged — flat `selectedPatternIds` and the typed map coexist during the incremental build-out — but the assignment-map contract is no longer "deferred / not-yet-contracted."

**Scope note.** The strategy catalog (Sec 7.3) describes **physical-keyboard (desktop) KMN rules**. Touch counterparts are produced from each pattern's `touchLayoutFragment` and Phase E (Sec 8); packaging from Phase G. The catalog is the desktop-rule layer of the fuller v1 pipeline — not a separate, narrower product. (The strategy framework was originally drafted physical-keyboard-only; in the studio it is embedded in the full touch + packaging flow.) v1 is desktop-first by design (Decision 6, Sec 14); touch-first authoring is a v1.1 candidate.

**Monolingual scope.** The §7.2 decision tree and the §7.7 DISCUS heuristics are designed for **monolingual keyboards** — one language, one inventory, one coherent set of mechanisms.

**Why this is a scope, not a limitation.** Authoring a monolingual keyboard and authoring a massively multilingual (MML) keyboard are fundamentally different design disciplines, not different sizes of the same problem. A monolingual keyboard optimizes for **one** community's full needs: frequent characters get easy positions, simplicity wins (criterion 18.1), and the §7 tree's "best single mechanism per character" framing is sound. An MML keyboard optimizes for **movement between languages**: it accepts being measurably less efficient for any one of those languages in exchange for one device handling many. The expert author weighs dozens of partial needs, makes per-language compromises, and intentionally breaks the simplicity rules because no single mechanism choice fits the union. The two disciplines reach opposite answers from the same axis vector, and a wizard that serves the monolingual author well would actively mislead the MML author.

**Massively multilingual keyboards** (EuroLatin, SIL IPA, `sil_pan_africa_mnemonic`, `sil_cameroon_qwerty`, etc.) are therefore explicit exceptions: they intentionally break the simplicity rules because no single mechanism choice fits dozens of languages. **Authoring a new MML keyboard from scratch is out of scope for v1**, and not just deferred — a future MML authoring path would be a separate product surface (different elicitation, different heuristics, different gallery shape), not an extension of the monolingual tree. The supported v1 workflow for MML is **derivation, not authoring**: a user picks an MML keyboard as a Track 1 `instantiateFromBase` and *simplifies it down* to one language — the gallery and validator then evaluate the resulting monolingual subset against the §7.5 tree, which is the case the tree is designed for. MML-as-base is in scope; MML-as-target is not. This is the lens for §7.5's "Known mismatches" rows: they are not tree bugs — they are the expert-MML class the tree was never asked to serve.

## Clarifications

### Session 2026-06-15

- Q: How should §7.2 behave when the currently shipped survey can't elicit a required axis (A4=replacing-cycling, A5=two-orthography, A6=loud, A7a=full-remap)? → A: Default-fill missing axes from script-class priors so the tree always evaluates a full vector; the fills are observable on the survey result and remain confirmable by the author downstream.
- Q: What is the §7 design scope — does the §7.2 tree and the §7.7 DISCUS heuristics target monolingual keyboards, massively multilingual (MML) keyboards, or both? → A: v1 §7 targets **monolingual** keyboards. MML keyboards (EuroLatin, SIL IPA, `sil_pan_africa_mnemonic`, `sil_cameroon_qwerty`, etc.) are out of scope **for new authoring**; they remain supported **as Track 1 bases** to derive a monolingual keyboard from. The §7.5 EuroLatin "mismatch" is reclassified as out-of-scope, not a tree gap.
- Q: What does §7.6's "≥3 independent sources" threshold actually gate, and is the number 3 tunable? → A: The 3 is a **ranking/conflict pivot**, not a visibility floor — candidates with fewer than 3 sources still appear in the ranked list. The number is pinned in `placement-priors.json` metadata (`thresholds.corpusLead: 3`) with a rationale; data-tunable in a future corpus-pass amendment without a contracts version bump.

### 7.1 Discovery axes

Seven dimensions describe a keyboard-design need well enough to pick a strategy. Each is a value the **survey** computes — there is no separate interview script. The last column gives the survey phase that elicits the axis and the plain-language question used.

The axis vector is computed from the working IR (§5a), the patterns the recognizer has lifted from it, and the survey's confirmations. The survey augments the IR; it never substitutes for it. For a session starting from the US-English fallback the recognizer typically lifts no patterns and the axis vector comes almost entirely from survey answers; for a session adapting `sil_euro_latin` the recognizer lifts the deadkey families and the axis vector is largely pre-populated, with the survey confirming or correcting. The decision-tree firing order (§7.2) is unchanged.

| # | Axis | Allowed values | Meaning & survey elicitation |
|---|------|----------------|------------------------------|
| A1 | **Scale** | tiny (<5) / small (5–20) / medium (20–100) / large (100–300) / massive (1000+) | How many *new* characters the keyboard adds beyond a stock physical layout. **Phase B:** "Roughly how many new characters does your keyboard need — ones not already on a standard physical keyboard?" |
| A2 | **Script class** | alphabetic / abugida / abjad / syllabary / logographic | Structural class of the writing system; drives one-char-per-key vs. cluster-shaped output. **Phase A** (Three-group routing, Sec 9) detects this from the BCP47 script subtag + base; confirmed in plain language: "What writing system does the keyboard produce?" |
| A3 | **Phonetic intuition** | strong / weak | Strong = the user thinks "I'd type a Latin spelling of the sound." Weak = mapping is shape- or modifier-based. **Phase B/C:** "When you picture typing a special character — type the Latin spelling of the sound, or press a key that looks like it / a modifier + base key?" |
| A3a | **Mark-input order** | prefix / postfix | "prefix" = mark-then-letter; "postfix" = letter-then-mark. Gated on A2=alphabetic AND A3=strong. **Phase B:** "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?" |
| A4 | **Diacritic behavior** | none / stacking-combining / replacing-cycling / multi-family | How marks behave on a base. Cycling = a repeated mark key replaces the previous mark (Vietnamese-style). **Phase B/C:** "Do your characters have accent marks or tones — none, stacking, tone marks that replace on a second press, or many different accent families used together?" |
| A5 | **Multi-mode** | single / two-orthography | Whether the keyboard exposes a runtime toggle between two orthographic styles (e.g. dotted vs. bar-under Yoruba). **Phase A/C:** "Does your language have more than one written form users switch between?" |
| A6 | **Constraint enforcement** | none / soft / loud | What happens on an invalid sequence. Loud = audible beep; soft = silent suppression. **Phase C:** "Should the keyboard reject obviously invalid input — no, silently, or with a beep?" |
| A7 | **Spare-key availability** | many / RAlt only / fully booked | How crowded the base layout is; fully booked → need a modifier plane. **Phase B:** "What's the physical base layout, and does it have unused keys?" |

**A2a — cluster sensitivity (abugida/abjad only).** If A2 is abugida or abjad, one follow-up resolves whether output depends on prior context (Arabic positional forms, Indic reph/conjuncts, syllabary ligatures): "Does the keyboard need to choose different output based on what was typed before?" Yes → clusters needed; No → clusters not needed. The answer gates decision rule 2 (Sec 7.2).

**A7a — full-remap detection (alphabetic only).** If A2 is alphabetic, one follow-up resolves the keyboard's posture toward the base layout: "Will the keys on your keyboard mostly show the same letters as the base layout (with just a few additions or changes), or will every key display a different letter?" Full-remap → every key reassigned (Russian/Armenian/Greek mnemonic style); addition → most base keys unchanged (Akan-style additive layout). The answer gates the new decision rule 8 (Sec 7.2). For Latin-target alphabetic keyboards on a Latin base, the answer defaults to addition; non-Latin alphabetic targets on a Latin base (Cyrillic, Armenian, Greek, Coptic, Cherokee, Adlam, etc.) are the typical full-remap case.

**A3a — mark-input order (alphabetic only).** If A2=alphabetic and A3=strong, one follow-up resolves whether the community's mental model places the mark before or after the base letter: "When typing a letter with a diacritic, does the typist expect to press the diacritic key before the letter, or type the letter first and then the diacritic?" Prefix (mark-then-letter) → S-02 deadkey flow; postfix (letter-then-mark) → S-03 sequence-replace. This sub-axis closes the §7.5 IPA mismatch — IPA keyboard communities use postfix suffix sequences, not the mnemonic-spelling flow A3=strong would otherwise predict. When A3a=postfix and A4=stacking-combining both apply, rule 3a still fires (S-03 primary); implementations must emit base+combining mark in canonical NFC order to avoid normalization defects with stacking marks.

### 7.2 Decision tree

Ordered rules. The first matching rule fixes the **primary** strategy; rules 9–10 add **secondaries**; rule 11 is a late-primary fallback for tiny phonetic additions; rule 12 is the catch-all fallback.

**Input contract — full axis vector.** The decision tree evaluates against a *complete* A1..A7 (plus A2a/A3a/A7a) vector. When the currently shipped survey phases cannot elicit a given axis (see the phase-gated list in §7.5), the strategy selector **default-fills** the missing value from a script-class prior keyed on A2 (script class) and A1 (scale). The fills must be deterministic, pinned in `packages/contracts` data alongside the priors, and round-trippable — every fill is recorded on the survey result as `axisFills: [{axis, value, source: 'script-class-prior'}]` so it is visible in the gallery, confirmable by the author, and detectable downstream (the supportability scanner surfaces `axisFills` next to its existing `StrategyDivergence` records). Defaults must round-trip on the §7.5 exemplar table: replacing the elicited value with the script-class prior must not change the row's `Tree → strategy` column. New phases close the gap by replacing fills with elicited answers — the tree contract does not change as phases come online.

| # | Condition | Primary | Add secondaries |
|---|-----------|---------|-----------------|
| 1 | A1=massive AND A2=logographic | **S-12** DLL IME callout | — |
| 2 | A2=abjad OR (A2=abugida AND cluster sensitivity=yes) | **S-09** Context-sensitive cluster | + S-05 if A3=strong |
| 3 | A4=replacing-cycling | **S-07** Diacritic cycle | + S-04 |
| 3a | A2=alphabetic AND A3=strong AND A3a=postfix | **S-03** Sequence replace | + S-04 |
| 4 | A5=two-orthography | **S-11** Stateful option toggle | (wraps whichever strategy fits the per-mode rules) |
| 5 | A3=strong AND A1 ∈ {medium, large} | **S-05** Mnemonic spelling | + S-04 |
| 6 | A4=multi-family AND A1=large | **S-06** Chained deadkeys (two-tier) | + S-04 |
| 7 | A4=stacking-combining AND A1 ∈ {small, medium} | **S-02** Deadkey composition | + S-04 |
| 8 | A2=alphabetic AND A7a=full-remap | **S-06** Chained deadkeys (alt-plane mnemonic) | + S-04, + S-08 |
| 9 | A6=loud | (whatever above) | + **S-10** Constraints + beep |
| 10 | A7=fully booked | (whatever above) | + **S-08** RAlt modifier-layer |
| 11 | A1=tiny AND A3=strong | **S-01** Simple swap | — |
| 12 | (fallback) | **S-03** Sequence replace | — |

**Firing order — important.** The table is numbered 1-12 but rules do NOT fire in raw 1→12 sequence. The actual order an implementation runs is:

1. **Primary-fixing pass.** Try rules 1, 2, 3, 3a, 4, 5, 6, 7, 8 in order (rule 3a, when A3a is elicited, intercepts postfix-preference keyboards before rules 5 and 7 can claim them); the first matching rule sets `primary`. If none of 1, 2, 3, 3a, 4, 5, 6, 7, 8 match, try rule 11 (`A1=tiny AND A3=strong`); if it matches, primary is S-01. Otherwise rule 12 (catch-all) sets primary to S-03.
2. **Secondary-adding pass.** Regardless of which primary was chosen, rules 9 (A6=loud → +S-10) and 10 (A7=fully-booked → +S-08) fire to APPEND axis-conditional secondaries to `StrategyRecommendation.secondaries`. These rules never set the primary — see {@link PrimaryRuleNumber} in `packages/contracts` which excludes 9 and 10 from valid `triggeredRule` values.

An implementation that walked the table top-to-bottom and halted on the first match would mis-categorize keyboards where rule 9 (A6=loud) fires before any 1-8 match — they'd be left with no primary. The Mermaid diagram below shows the correct flow (R1-R8 → R11 → R12 chain for primary, then `Sec → R9 → R10` for add-ons).

```mermaid
flowchart TD
    Start([Survey complete: axis vector ready]) --> R1{A1=massive AND<br/>A2=logographic?}
    R1 -- yes --> S12[/"<b>S-12</b> DLL IME callout"/]
    R1 -- no --> R2{A2=abjad OR<br/>(A2=abugida AND clusters needed)?}
    R2 -- yes --> S09[/"<b>S-09</b> Context-sensitive cluster<br/>+ S-05 if A3=strong"/]
    R2 -- no --> R3{A4=replacing-cycling?}
    R3 -- yes --> S07[/"<b>S-07</b> Diacritic cycle<br/>+ S-04"/]
    R3 -- no --> R3a{A2=alphabetic AND<br/>A3=strong AND<br/>A3a=postfix?}
    R3a -- yes --> S03a[/"<b>S-03</b> Sequence replace<br/>+ S-04 (postfix mental model)"/]
    R3a -- no --> R4{A5=two-orthography?}
    R4 -- yes --> S11[/"<b>S-11</b> Stateful option toggle<br/>(wraps inner strategy)"/]
    R4 -- no --> R5{A3=strong AND<br/>A1 in medium,large?}
    R5 -- yes --> S05[/"<b>S-05</b> Mnemonic spelling<br/>+ S-04"/]
    R5 -- no --> R6{A4=multi-family AND<br/>A1=large?}
    R6 -- yes --> S06[/"<b>S-06</b> Chained deadkeys<br/>+ S-04"/]
    R6 -- no --> R7{A4=stacking-combining AND<br/>A1 in small,medium?}
    R7 -- yes --> S02[/"<b>S-02</b> Deadkey composition<br/>+ S-04"/]
    R7 -- no --> R8{A2=alphabetic AND<br/>A7a=full-remap?}
    R8 -- yes --> S06full[/"<b>S-06</b> Chained deadkeys<br/>+ S-04, + S-08"/]
    R8 -- no --> R11{A1=tiny AND<br/>A3=strong?}
    R11 -- yes --> S01[/"<b>S-01</b> Simple swap"/]
    R11 -- no --> S03[/"<b>S-03</b> Sequence replace<br/>(fallback)"/]

    S12 --> Sec
    S09 --> Sec
    S07 --> Sec
    S03a --> Sec
    S11 --> Sec
    S05 --> Sec
    S06 --> Sec
    S06full --> Sec
    S02 --> Sec
    S01 --> Sec
    S03 --> Sec

    Sec{{"Add-on rules"}}
    Sec --> R9{A6=loud?}
    R9 -- yes --> Add10[/"+ S-10 Constraints + beep"/]
    R9 -- no --> R10
    Add10 --> R10{A7=fully booked?}
    R10 -- yes --> Add08[/"+ S-08 RAlt modifier-layer"/]
    R10 -- no --> Done([Recommendation set])
    Add08 --> Done

    classDef primary fill:#dde9ff,stroke:#3060c0,color:#000
    classDef addon fill:#fff2cc,stroke:#b58900,color:#000
    classDef decision fill:#f5f5f5,stroke:#666,color:#000
    class S01,S02,S03,S03a,S05,S06,S06full,S07,S09,S11,S12 primary
    class Add08,Add10 addon
    class R1,R2,R3,R3a,R4,R5,R6,R7,R8,R9,R10,R11,Sec decision
```

**Prose summary.** Massive logographic → only the OS IME is fast enough; delegate (S-12). Indic/Arabic-shaped scripts need context-aware cluster rules (S-09); phonetic ones add mnemonic spelling. Tonal cycling (S-07) is neither stacking nor deadkey. Dual orthography (S-11) wraps a state toggle around the inner strategy. Big phonetic alphabets (S-05) — let the user type spellings, collapsed with `any`/`index`. Big diacritic palettes (S-06) — two-tier deadkey: first key picks the family, second the base. Small accent-heavy Latin (S-02) — classic deadkey composition. Non-Latin alphabetic full-remap (Russian/Armenian/Greek mnemonic) — chained deadkeys for case-and-diacritic alternates (S-06) plus an RAlt modifier plane (S-08) for the lesser-used letters. Loud feedback (S-10) and fully-booked layouts (S-08) are add-ons, never the whole answer. A handful of phonetic additions (S-01) — just swap them in. Otherwise (S-03) — short ASCII sequences expand to single chars.

**Encoding.** The tree may be encoded as JSON/TS rules in `packages/contracts` or reasoned over by the LLM directly against this table; both are valid (pick per studio architecture). The strategy selector returns `{ primary: strategyId, secondaries: strategyId[] }`, which the gallery resolves to patterns via the `strategyId` / `combinesWith` fields (Sec 5). This pair seeds the **default scope**; the gallery may then refine it per character class or individual character per the assignment-map model (Sec 7.7).

**Touch keyboards and S-13.** The rules above are desktop-oriented — they model character-entry strategies driven by the A1–A7 axis vector. Touch keyboards need an additional structural choice: a dedicated layer-switch key that swaps the entire visible keyboard layout (default, shift, numeric, symbol, alt-script). This is not an A1–A7 character-entry strategy; it is a touch layout feature. Any touch keyboard with more than one named layer uses **S-13 Touch layer switch** as a structural wrapper alongside whichever character-entry strategy (S-01–S-09) governs the content of each layer. S-13 is chosen outside this decision tree, triggered by the presence of multiple entries in the touch layout's `"layer":` array.

### 7.3 Strategy catalog (S-01..S-13)

Each card is self-contained and citable by ID. Snippets are verbatim from `keymanapp/keyboards` (paths shown). The **Pattern mapping** line ties the card to the library: a pattern with that `strategyId` is what the gallery surfaces when the tree selects this strategy.

These cards are **mechanism templates**, not whole-keyboard verdicts. A single keyboard's assignment map (Sec 7.7) may draw on several of them at once — one strategy for the default scope, a different one for a character class, and additional mechanisms layered onto individual characters for discoverability. Read each card as "here is how *this* mechanism works," not "here is what the *whole* keyboard does."

#### S-01 Simple swap

**When to use:** A1=tiny, A3=strong, A4=none. 1–5 extra characters mapping cleanly onto unused keys.
**When to avoid:** More than ~5 characters; any case where the new character should *combine* with prior input.
**Combines well with:** Nothing — one rule per character by definition.
**Pattern mapping:** `strategyId: "S-01"`; `combinesWith: []`.

```
store(&VERSION) '9.0'
begin Unicode > use(main)
group(main) using keys

+ [K_Q] > 'ɛ'
+ [SHIFT K_Q] > 'Ɛ'
```

**Real exemplar:** `release/a/akan/source/akan.kmn` — Akan (Twi/Fante) adds exactly `ɛ` and `ɔ` on the unused `q` and `c` keys.

#### S-02 Deadkey composition

**When to use:** A1 ∈ {small, medium}, A4=stacking-combining, A3=strong. User types a diacritic-naming key (`'`, `` ` ``, `:`) then a base letter.
**When to avoid:** When the diacritic should *replace* a previous one (S-07); when many families explode the table (S-06).
**Combines well with:** S-04 (collapse the post-deadkey table); S-08 (when the trigger needs RAlt); S-11 (when the keyboard toggles between orthographic variants at runtime).
**Pattern mapping:** `strategyId: "S-02"`; `combinesWith: ["S-04", "S-08", "S-11"]`. (This is the Sec 6 worked example, `latin_deadkey_acute_single`.)
**Placement semantics:** the trigger key is the placement decision. Prefer the key users already associate with the diacritic family (`'` acute, `` ` `` grave, `^` circumflex, `"` diaeresis, `~` tilde); when that key is occupied or absent on the base layout, fall back along the anchor cascade to nearby low-frequency punctuation. A corpus prior (Sec 7.6) overrides the default when independent same-script-class keyboards converge on a different trigger.

```
store(graveK) 'aeiouAEIOU'
store(graveO) 'àèìòùÀÈÌÒÙ'

+ '`' > dk(grave)
dk(grave) + any(graveK) > index(graveO, 2)
dk(grave) + any(keys)   > '`' context(2)    c restore on miss
```

**Real exemplar:** `release/sil/sil_euro_latin/source/sil_euro_latin.kmn` — 92 deadkey rules cover virtually every European Latin diacritic.

#### S-03 Sequence replace

**When to use:** A1 small to medium; user prefers short ASCII suffixes (`<`, `>`, `=`) to a deadkey flow. Common for IPA-style alphabets with no obvious "diacritic" key.
**When to avoid:** When the user must see intermediate state (deadkey commits nothing until the second key); sequences of more than 2–3 keys (S-05 is more legible).
**Combines well with:** S-04 (parallel lookup tables); S-05 (longer sequences in the same keyboard).
**Pattern mapping:** `strategyId: "S-03"`; `combinesWith: ["S-04", "S-05"]`.

```
store(equalD) 'a' 'e' 'i' 'o'
store(equalU) U+1D43 U+1D49 U+1DD0 U+1D52    c superscript variants

any(equalD) + '=' > index(equalU, 1)
```

**Real exemplar:** `release/sil/sil_ipa/source/sil_ipa.kmn` — `<`, `=`, `>` modifiers attach to a preceding base letter.

#### S-04 Parallel-store lookup (`any` + `index`)

**When to use:** Any positional mapping table of more than ~6 entries. A **building block**, not usually a primary — it makes S-02/S-03/S-05/S-06 maintainable.
**When to avoid:** Sparse / non-positional mappings; define separate stores per subset instead of leaving gaps.
**Combines well with:** Everything except S-01 and S-12.
**Pattern mapping:** `strategyId: "S-04"`; offered only as a secondary (never a tree primary).

```
store(K_lc1)  "a"    "b"    "c"    "d"
store(lc1)    U+0251 U+0253 U+0188 U+0257

dk(family) + any(K_lc1) > index(lc1, 2)
```

**Real exemplar:** `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn`.

#### S-05 Mnemonic spelling / transliteration

**When to use:** A3=strong, A1 ∈ {medium, large}. User types an ASCII transliteration; common for IPA, ITRANS, Sanskrit, romanized Greek.
**When to avoid:** When the user doesn't know the romanization scheme (S-02/S-06 with visual deadkey feedback is gentler).
**Combines well with:** S-04, S-09 (script also needs cluster rules), S-11 (two romanization schemes).
**Pattern mapping:** `strategyId: "S-05"`; `combinesWith: ["S-04", "S-09", "S-11"]`.
**Placement semantics:** the key→character table *is* the placement. Seed it from the romanization scheme the community already knows (corpus priors from same-script transliteration keyboards, e.g. the ITRANS family); never invent a novel scheme when an established one exists. Case pairs must stay on one key (shift-pair consistency is a hard constraint).

```
+ "a"      > "अ"
"अ" + "a"  > "आ"        c second 'a' lengthens
+ "A"      > "आ"
```

**Real exemplar:** `release/itrans/itrans_devanagari_hindi/source/itrans_devanagari_hindi.kmn` — `saMskRRta` → `संस्कृत`.

#### S-06 Chained deadkeys (two-tier)

**When to use:** A4=multi-family AND A1=large; or alphabetic scripts where one base key has multiple legitimate outputs and the next key disambiguates. First key picks the *family*, second the *base*.
**When to avoid:** A single diacritic family (S-02 suffices); when the user can't predict the family key.
**Combines well with:** S-04 (essential for the per-family table), S-08 (RAlt to host the family keys), S-11 (when the keyboard toggles between orthographic variants at runtime).
**Pattern mapping:** `strategyId: "S-06"`; `combinesWith: ["S-04", "S-08", "S-11"]`.
**Placement semantics:** the first-tier *family* keys are the placement decision; second-tier base keys follow the base layout. Choose family keys the same way as S-02 triggers (diacritic-mnemonic punctuation first), hosting them on RAlt when the base plane is booked. The corpus prior (Sec 7.6) reports which family keys real S-06 keyboards chose for the same script class.

```
+ [K_LBRKT]                > dk(family_grave)
+ [SHIFT K_LBRKT]          > dk(family_acute)

dk(family_grave) + any(K_vowels) > index(grave_out, 2)
dk(family_acute) + any(K_vowels) > index(acute_out, 2)
```

**Real exemplar:** `release/a/armenian_mnemonic_r/source/armenian_mnemonic_r.kmn`; pan-African two-tier family selection in `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn`.

#### S-07 Diacritic cycle

**When to use:** A4=replacing-cycling. Tonal languages where the same mark key, pressed again, **replaces** the existing tone rather than stacking.
**When to avoid:** Genuinely stacked diacritics (S-02); when cycle order isn't obvious (use explicit tone keys).
**Combines well with:** S-04 (parallel stores per tone state), smart-backspace (Sec 7.4.A).
**Pattern mapping:** `strategyId: "S-07"`; `combinesWith: ["S-04"]`.
**Placement semantics:** the cycle key is pressed at very high frequency, so ergonomics outranks mnemonics here — prefer strong-finger, home-adjacent keys. Where an established convention exists (TELEX `s`/`f`/`r`/`x`/`j` for Vietnamese tones — context-guarded bindings: the tone rule fires only after a vowel, so plain consonant typing is unaffected), it is effectively mandatory; diverging from a community's existing cycle keys is an escalation, not a default.

```
store(vowels)       'aeiou'
store(vowels_sac)   'áéíóú'      c acute
store(vowels_huyen) 'àèìòù'      c grave

any(vowels)     + 's' > index(vowels_sac, 1)
any(vowels_sac) + 's' > index(vowels, 1) 's'      c second press cancels
any(vowels_sac) + 'f' > index(vowels_huyen, 1)    c f swaps acute → grave
```

**Real exemplar:** `release/v/vietnamese_telex/source/vietnamese_telex.kmn` — the canonical TELEX cycling pattern.

#### S-08 RAlt modifier-layer

**When to use:** A7=fully booked (or RAlt only). Always an **add-on** — a second plane of characters (symbols, currency, math, rare letters).
**When to avoid:** As a primary strategy. Discoverability is poor; on macOS, RAlt collides with Option-key shortcuts.
**Combines well with:** Every primary strategy.
**Pattern mapping:** `strategyId: "S-08"`; offered only as a secondary (rule 10).
**Placement semantics:** none of its own (intentionally — S-08 is an add-on layer, not a placement-driving strategy); character placement *within* the RAlt layer follows the primary strategy's semantics and the Sec 7.6 priors.

```
+ [RALT K_SLASH]   > U+0301
+ [RALT K_PERIOD]  > '·'
+ [RALT K_COMMA]   > '''
```

**Real exemplar:** `release/r/russian_mnemonic_r/source/russian_mnemonic_r.kmn`.

#### S-09 Context-sensitive cluster formation

**When to use:** A2 ∈ {abugida, abjad}. Output depends on prior input: Indic *reph*/conjuncts, Arabic hamza-bearing alif variants, positional forms.
**When to avoid:** Purely alphabetic Latin/Cyrillic (S-02 / S-05 are simpler).
**Combines well with:** S-05 (romanized input), S-04 (consonant/matra tables), smart-backspace (Sec 7.4.A).
**Pattern mapping:** `strategyId: "S-09"`; `combinesWith: ["S-05", "S-04"]`.
**Placement semantics:** allocate base-consonant slots first, on the phonetic grid the script community already uses (corpus priors from same-script keyboards dominate; shaping-engine and font expectations make divergence costly — see the precedence rule in Sec 7.6). Vowel signs / matras are secondary and ride post-base keys or deadkeys; cluster triggers (reph, halant) follow the script's established convention.

```
any(ConsonantsU) + "R" > U+0930 U+094D index(ConsonantsU, 1)
any(BaseLetter) + 'g' > index(BaseLetter_modified, 1)
```

**Real exemplar (abugida — Indic *reph*):** `release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn`.
**Real exemplar (abjad — Arabic hamza):** `release/a/arabic_izza/source/arabic_izza.kmn`.

#### S-10 Constraints + beep

**When to use:** A6=loud. Clusters where users need active feedback that they typed something illegal (e.g. an acute on a consonant that can't take it).
**When to avoid:** When the invalid combination is rare (the constraint group adds overhead); when `beep` would annoy in long-form typing.
**Combines well with:** Every primary strategy — a separate `group(constraints)` invoked before `group(main)`.
**Pattern mapping:** `strategyId: "S-10"`; offered only as a secondary (rule 9).

```
begin Unicode > use(constraints)

group(constraints) using keys
any(nonBaseChar) + any(diacriticsKeys) > context beep
nomatch > use(main)

group(main) using keys
... real rules ...
```

**Real exemplar:** `release/el/el_pasifika/source/el_pasifika.kmn` — Polynesian Latin + macron/acute/diaeresis; beeps on invalid base+diacritic combinations.

#### S-11 Stateful option toggle

**When to use:** A5=two-orthography. One keyboard, two written conventions, runtime toggle (Yoruba dotted vs. barred, Hindi vs. Sanskrit implicit-final-a).
**When to avoid:** When the modes differ widely enough that one shared rule set becomes unmaintainable — ship two keyboards.
**Combines well with:** Any primary strategy (S-11 wraps `if(style='X')` around its rules).
**Pattern mapping:** `strategyId: "S-11"`; wraps an inner strategy named in `combinesWith`.

```
store(style) 'dot'

if(style='dot') + [CTRL '.'] > set(style='bar')
if(style='bar') + [CTRL '.'] > set(style='dot')

if(style='dot') + 'Z' > U+1E62
if(style='bar') + 'Z' > U+0053 U+0329
```

**Real exemplar:** `release/sil/sil_yoruba8/source/sil_yoruba8.kmn` — `Ctrl+.` toggles dotted-below vs. bar-below styles.

#### S-12 DLL IME callout

**When to use:** A1=massive AND A2=logographic. Tens of thousands of Han characters — too large for Keyman rules; delegate to a native IME.
**When to avoid:** Anywhere else. Locks the keyboard to one OS (Windows) and a shipped DLL — incompatible with cross-platform Keyman targets.
**Combines well with:** Nothing — a thin shim.
**Pattern mapping:** `strategyId: "S-12"`; `combinesWith: []`.

```
store(DLLFunction) "KeymnIMX.DLL:FindGlyph"

+ any(VKeys)  > call(DLLFunction)
nomatch       > call(DLLFunction)
```

**Real exemplar:** `release/c/cs_pinyin/source/cs_pinyin.kmn` — 100k+ Han characters via Pinyin lookup, delegated to a Windows DLL.

#### S-13 Touch layer switch

**When to use:** Any touch keyboard with more than one named layer (numeric, symbol, alt-script, shift-alternate). The switch key uses `"nextlayer":` in the Keyman touch layout JSON to swap the visible layer — no KMN rules are required for the layer switch itself.
**When to avoid:** Desktop-only keyboards; single-layer touch keyboards.
**Combines well with:** S-01, S-02, S-03, S-05, S-06, S-07, S-08, S-09 — whichever character-entry strategy governs the content within each layer. S-13 is structural: it wraps the content strategy rather than replacing it.
**Pattern mapping:** `strategyId: "S-13"`; `combinesWith: []` (the pattern document leaves the choice of content strategy to the author — any S-01–S-09 combination is valid).

```json
{
  "layer": [
    { "id": "default", "row": [
        { "id": 1, "key": [
            { "id": "K_A", "text": "a" },
            { "id": "T_switch_num", "text": "123", "sp": 1, "nextlayer": "numbers" }
          ]
        }
      ]
    },
    { "id": "numbers", "row": [
        { "id": 1, "key": [
            { "id": "T_1", "text": "1" },
            { "id": "T_switch_def", "text": "ABC", "sp": 1, "nextlayer": "default" }
          ]
        }
      ]
    }
  ]
}
```

**Real exemplar:** `release/sil/sil_ipa/source/sil_ipa.keyman-touch-layout` — five named layers (`default`, `shift`, `numeric`, `diacritic`, `supersub`); dedicated switch keys on each layer use `"nextlayer":` to navigate the full layer set.

### 7.4 Building blocks

Applied **inside** the strategies above, never chosen independently. The studio invokes them as a keyboard grows.

**7.4.A Smart-backspace / atomic cluster deletion** — recognise a composed cluster in context and delete it as one unit. Use whenever a strategy produces multi-codepoint output (S-02, S-06, S-07, S-09).
```
any(bar) U+0329 + [K_BKSP] > nul
any(dot+nsl) any(ac.all) + [K_BKSP] > nul
```

**7.4.B `nul` swallow** — disables a key entirely; suppress unused QWERTY keys, or silently drop an invalid sequence (the soft-constraint counterpart to S-10).
```
store(disabled) "QWRYUIPASFGHKLZCVBM"
+ any(disabled) > nul
```

**7.4.C `outs()` store composition** — expand one store inside another to build composite tables without repetition ("all decorated vowels", "everything-but-the-grave-set").
```
store(grv.all) outs(base) outs(grv) outs(acu) outs(crc) outs(mac)
```

**7.4.D `notany()` + `context(N)` deadkey fallback** — when the key after a deadkey isn't an expected continuation, emit the bare base and put the typed key back. Essential for any deadkey strategy (S-02, S-06).
```
dk(grave) notany(graveK) > '`' context(2)
```

**7.4.E `nomatch` group routing** — catch-all that routes unmatched input to another group (constraints → main, main → NFC, main → DLL). Used in every multi-group strategy.
```
nomatch > use(main)
```

**7.4.F Multi-group pipeline** — `begin Unicode > use(constraints)`; `constraints` filters then `nomatch > use(main)`; `main` works then `nomatch > use(NFC)`. Compose around any combination of primaries.

### 7.5 Self-check / validation table

The decision tree must agree with the strategy each exemplar actually uses. This round-trip is the **regression suite**: if "Tree → strategy" disagrees with "Actual primary," the tree is wrong, not the keyboard. Re-run it after any edit to 7.1/7.2/7.3.

**Scope of this table.** It validates the tree's **default-scope** recommendation — the single `{primary, secondaries}` the tree picks for the keyboard as a whole. Per-class and per-individual overrides, and characters reached by more than one mechanism, are the gallery's concern (Sec 7.7); they are not represented here and do not change a row's expected value. (Rows that list more than one strategy — e.g. `itrans_devanagari_hindi` → S-09 + S-05 + S-11 — are axis-driven tree secondaries from rules 2/4, **not** per-class overrides; the distinction matters.) The table answers "did the tree seed the right default?", not "what did the author finally assign to every character?"

| Exemplar | A1 | A2 | A3 | A3a | A4 | A5 | A6 | A7 | A7a | Tree → strategy | Actual primary |
|----------|----|----|----|-----|----|----|----|----|-----|-----------------|----------------|
| `release/a/akan/` | tiny | alphabetic | strong | — | none | single | none | many | addition | rule 11 → S-01 | S-01 ✓ |
| `release/sil/sil_euro_latin/` | large | alphabetic | strong | — | multi-family | single | none | RAlt only | addition | rule 5 → S-05 (fires before rule 6 in array order) | S-02 + S-04/S-08 ✗ |
| `release/sil/sil_ipa/` | medium | alphabetic | strong | postfix | none | single | none | many | addition | rule 3a → S-03 + S-04 | S-03 + S-04 ✓ |
| `release/sil/sil_devanagari_phonetic/` | medium | abugida | strong | — | none | single | none | many | — | rule 2 → S-09 + S-05 | S-09 + S-05 ✓ |
| `release/v/vietnamese_telex/` | medium | alphabetic | strong | — | replacing-cycling | single | none | many | addition | rule 3 → S-07 + S-04 | S-07 ✓ |
| `release/sil/sil_yoruba8/` | medium | alphabetic | strong | — | multi-family | two-orthography | none | many | addition | rule 4 → S-11 wrap | S-11 ✓ |
| `release/a/armenian_mnemonic_r/` | medium | alphabetic | weak | — | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |
| `release/el/el_pasifika/` | small | alphabetic | strong | — | stacking-combining | single | loud | many | addition | rule 7 → S-02 + rule 9 → +S-10 | S-02 + S-10 ✓ |
| `release/c/cs_pinyin/` | massive | logographic | weak | — | none | single | none | many | — | rule 1 → S-12 | S-12 ✓ |
| `release/itrans/itrans_devanagari_hindi/` | large | abugida | strong | — | none | two-orthography | none | many | — | rule 2 → S-09 + S-05; rule 4 wraps S-11 | S-09 + S-05 + S-11 ✓ |
| `release/sil/sil_pan_africa_mnemonic/` | large | alphabetic | weak | — | multi-family | single | none | many | addition | rule 6 → S-06 + S-04 | S-06 + S-04 ✓ |
| `release/a/arabic_izza/` | medium | abjad | weak | — | none | single | none | many | — | rule 2 → S-09 | S-09 ✓ |
| `release/r/russian_mnemonic_r/` | medium | alphabetic | weak | — | none | single | none | RAlt only | full-remap | rule 8 → S-06 + S-04 + S-08 | S-06 + S-04 + S-08 ✓ |

Note: S-04 (`any`/`index` table mechanism) is structurally embedded in every S-06 deployment; rows that list S-06 implicitly include S-04.

**Known mismatches (intended v1.1 work, not bugs).** Rule 8 (added in v1.0.1) closed the alphabetic full-remap gap; Armenian and Russian mnemonic now round-trip correctly. Rule 3a (added in v1.1.1) closed the IPA postfix-sequence gap. One exemplar still doesn't round-trip; it marks a tree gap to fix in v1.1:

- **EuroLatin**: A2=alphabetic, A1=large, A4=multi-family, A3=strong, A7a=addition. Tree picks **S-05 (mnemonic spelling, rule 5 — fires before rule 6's A4=multi-family match since A3=strong AND A1∈{medium,large} is checked first in array order)** but the actual keyboard uses **S-02 with broad parallel stores**. *Reclassified 2026-06-15 as out-of-scope (MML), not a tree gap.* See the **Monolingual scope** note above: EuroLatin is a massively multilingual keyboard, an expert per-language compromise the §7.2 tree was not designed to reproduce. The tree's S-05 recommendation still produces a working keyboard for any MML-shaped axis vector that reaches it; matching SIL's S-02 choice would require modeling per-language sub-inventories the v1 axis vector doesn't carry. The supported workflow for EuroLatin is *derivation*: instantiate it as a base and simplify to one language, at which point the §7.5 tree validates against the resulting monolingual subset.
- **IPA**: ~~A3=strong but the user prefers sequence modifiers~~ — closed in v1.1.1 by rule 3a (A3a=postfix → S-03 + S-04). See §7.1 A3a. (The §7.5 IPA row tests the *axis logic*; the actual `sil_ipa` keyboard is itself MML and falls under the Monolingual-scope note for new-authoring purposes.)

The EuroLatin row remains in §7.5 as a regression fixture for the MML-derivation path, not as a v1 closure target.

**Phase-gated elicitation gaps (intended phased-delivery omissions, not tree bugs).**  The following §7.2 rules cannot be reached from a *user-supplied* axis in the currently shipped survey phases (A, B, F) because the required axis is not yet elicited.  Each is gated on Phase C delivery.  The §7.5 validation rows for these exemplars confirm the *tree logic* is correct when a full axis vector is supplied — the gap is upstream in the survey layer.

In the shipped survey today, the strategy selector evaluates against the script-class default-fill (§7.2 input contract) for each missing axis, so the tree always fires on a full vector. The fill appears on the survey result as `axisFills` and is surfaced read-only in the Flow Map (`StrategyTreeView.tsx`'s `DefaultFillProvenance`); an interactive confirm/override UI for the author to accept or change a filled axis is a remaining follow-up, not yet built. Replacing a fill with an elicited answer when a later phase lands is a value substitution, not a contract change.

- **Rule 3 / S-07 (A4=replacing-cycling):** `phase_b_characters.yaml` elicits A4=stacking-combining and A4=multi-family but defers A4=replacing-cycling to Phase C (see YAML engine-notes TIMING NOTE).  The `vietnamese_telex` §7.5 row confirms the tree fires correctly when supplied A4=replacing-cycling; it cannot be reached through the live survey until Phase C adds a replacing/cycling probe.

- **Rules 4 and 9 / S-11, S-10 (A5=two-orthography, A6=loud):** Neither A5 (multi-mode orthography) nor A6 (constraint enforcement) is elicited by any current phase.  The `sil_yoruba8` (rule 4) and `el_pasifika` (rule 9) §7.5 rows confirm correct tree behaviour given a full vector; they are Phase C-gated.

- **Rule 8 / S-06 (A7a=full-remap for alpha-nonlatin users):** `phase_b_characters.yaml` routes the `alpha-nonlatin` sub-branch of `pb_non_roman_branch` directly to `pb_special_letters` without asking about remap posture (A7a).  Keyboards like `armenian_mnemonic_r` and `russian_mnemonic_r` that use a Latin base but replace nearly every key (A7a=full-remap) cannot be correctly classified until an A7a probe is added to that branch.  Spec §7.1 notes this as a Phase B follow-up; it is outstanding.

Once import lands, the validation pass also runs against each exemplar's *imported* IR — the round-trip emit must produce the same strategy attribution. A mismatch here surfaces as an `ImportStatus.RoundTripDivergence` for that exemplar in the supportability scanner output (§13).

**Touch strategy validation (S-13).** S-13 is not reached by the desktop decision tree above — it is selected whenever a touch keyboard's layout JSON defines more than one named layer. The A1–A7 axes do not apply; the confirmation criterion is simply the presence of `"nextlayer":` on one or more keys.

| Exemplar | Touch layers | S-13 confirmed |
|----------|--------------|----------------|
| `release/sil/sil_ipa/` | 5 layers: `default`, `shift`, `numeric`, `diacritic`, `supersub` | ✓ |
| `release/sil/sil_khmer/` | 4 layers: `default`, `shift`, `ctrl-alt`, `shift-ctrl-alt` | ✓ |
| `release/sil/sil_hebrew/` | 4 layers: `default`, `shift`, `rightalt`, `rightalt-shift` | ✓ |

#### 7.5.1 Corpus evaluation protocol

The hand-enumerated table above is the **seed fixture set**; once the KeyboardIR codec (§5a) and pattern recognizer (§8 step 2) land, the same round-trip runs at corpus scale. For every `release/` keyboard that passes the Layer A' import-fidelity checks: parse to IR, run the recognizer, derive the axis vector from the lifted patterns and IR structure, run the decision tree (§7.2), and compare the tree-selected primary against the dominant `strategyId` among the recognized patterns. Disagreements are emitted as `StrategyDivergence` records in the supportability scanner output (§13). Divergence *clusters* — many keyboards mis-routed the same way — are how the tree finds its next rules: the EuroLatin and IPA mismatches above were found by hand; the corpus pass finds the rest. Isolated divergences are triaged the same way as the known mismatches: the tree may be wrong, or the keyboard may be idiosyncratic — the record carries enough provenance to decide.

### 7.6 Corpus-derived placement priors

*Added 2026-06-11 (v1.1.1). Full analysis: [docs/placement-intelligence-review.md](docs/placement-intelligence-review.md).*

Strategy selection (Sec 7.2) decides **how** characters are entered; this section governs **where** they land — which key, modifier layer, and trigger the seeder proposes. The seeder's first-principles signals (the anchor cascade: NFD base → Unicode name → confusable → visual → phonetic) are complemented by an **empirical prior** mined from `keymanapp/keyboards/release/`: the placements that ~900 working, community-adopted keyboards actually chose.

**Extraction.** A post-pass over the KeyboardIR codec — `emitPlacementMap(ir)` — recovers `(codepoint → key, modifier set, mechanism, BCP47 context, base-layout family)` tuples; the supportability scanner drives it in batch over `release/`, so keyboards failing Layer A' never enter the dataset. Mandatory filters: tag and exclude mnemonic-layout keyboards from the positional dataset; detect undeclared non-US bases (more than 3 letter-key assignments deviating from their US-QWERTY ASCII equivalents — a tunable threshold, calibrated to catch AZERTY's four remapped letter keys without flagging QWERTZ's single Z↔Y swap) and record their placements relative to the inferred base; collapse CAPS/NCAPS rule pairs to one canonical tuple; skip legacy `begin ANSI` groups (rare in current `release/` — mostly a `legacy/` and pre-2010 concern, and usually co-occurring with the mnemonic-layout tag); drop PUA output (U+E000–U+F8FF). The result is a versioned, pinned `placement-priors.json` built offline and shipped as data — never computed in the SPA (same policy as the seeder's vendored Unicode/CLDR data).

**Aggregation and weighting.** For each (codepoint, script class, base-layout family): weight a candidate placement by the number of *independent* keyboards choosing it — fork-copy trees (near-identical rule sets under different names) collapse to one vote; standards-body and long-maintained flagship keyboards earn a bonus; keyboards matching the "free keys filled left-to-right" anti-pattern (codepoint order correlating with QWERTY free-key order) are discarded from the consensus pool. Priors never cross script classes or base families: AZERTY conventions (Francophone-Africa) are real and prescriptive *within* AZERTY, and must not bleed into QWERTY recommendations.

**Blending with first principles.** The seeder ranks candidates: corpus prior (when ≥3 independent sources agree; otherwise the phonetic anchor leads) → phonetic anchor → shift-pair consistency (hard constraint: case pairs share a key) → visual/NFD anchor → base-key preservation (never silently displace a needed base character) → ergonomics tiebreak. Each per-character proposal carries its provenance (`priorSource`, `priorCount` on the placement-map type — fields settled at the same joint session that locks that type) and a ranked candidate list, not a single answer.

**Precedence rule (precedent vs. first principles).** When the prior and the anchor cascade disagree: ≥3 independent converging keyboards → precedent wins, sources cited. Single-origin precedent (one root keyboard everyone copied) → first principles win, but the conflict is shown to the user with both options.

**The threshold value 3 is not a visibility floor.** Candidates with fewer than 3 sources still appear in the seeder's ranked list — the author always sees them. The 3 only decides which signal *leads* the ranking and which side *wins* a conflict. The number is pinned in `placement-priors.json` metadata (`thresholds.corpusLead: 3`) with the rationale "smallest pool that beats a single-author fluke without demanding broad adoption that small-language scripts can't supply." Holding it data-side rather than as a code constant lets a future corpus-pass amendment re-pin without a contracts version bump. For abjads and abugidas, community convention is effectively never overridden — shaping engines, fonts, and OS text stacks assume the converged sequences; a divergent first-principles suggestion is an escalation, not an auto-override. The studio **never resolves a placement conflict silently**: the author is the authority on what their community will adopt, and every proposal is confirmable, provenance-labeled, and overridable (the same *propose → cross-check → confirm* posture as the linguist agent, §8 Phase B).

### 7.7 Gallery output and assignment-map precedence

*Added 2026-06-13 (v1.2.0 hybrid workflow). Full model: [docs/workflow-model.md](docs/workflow-model.md).*

The gallery (Sec 8 Mechanisms physical — formerly Phase C; Touch — formerly Phase E) does not emit one strategy for the keyboard. Its output is a **scoped, multi-valued assignment map** from a key-scope to the mechanism(s) that produce it.

**Scopes and precedence.** Three granularities, resolved most-specific first:

- **keyboard-default** — the strategy the §7.2 selector resolves for the whole inventory; the seed.
- **character-class** — a named group (e.g. "tone vowels", "nukta consonants") assigned its own mechanism, overriding the default for its members.
- **individual** — a single character, overriding its class and the default.

Precedence is **individual > character-class > keyboard-default**. A character with no more specific assignment inherits its class's; a class with none inherits the default.

**Multi-valued.** The target→mechanism relation is **many-to-many**: one character may be reachable by several mechanisms at once (e.g. a direct key *and* a deadkey sequence *and* a rota position). This is deliberate, not a conflict — multiple access paths raise discoverability.

**Per modality.** The map is computed **once per modality**. The physical gallery (Mechanisms / formerly Phase C) assigns desktop mechanisms (modifiers, dead keys, combos, rotas) and emits `.kmn` rules + `.kvks`; the touch gallery (Touch / formerly Phase E), seeded from the locked desktop layout, assigns touch mechanisms (modifiers+layers, long-press, flicks, multitap) and emits `.keyman-touch-layout`. The two maps are independent (see the Mechanisms/Touch mechanism-mapping table in Sec 8).

**DISCUS arbitration.** The studio pre-selects a sensible mechanism per scope, ranked by the DISCUS principles already half-encoded in the §7.1 axes ([docs/discus-principles-integration.md](docs/discus-principles-integration.md)): **Simplicity** (A1 scale gates mechanism complexity; warn on key overload / long-press > 8, criterion 18.1), **Consistency** (frequent characters onto easy, script-consistent positions, 18.10), **Discoverability** (rare characters stay findable; flag any reachable only via deep long-press or > 2 modifier hops, 18.6/18.9). Multi-access is the explicit **Discoverability-vs-Simplicity** tension: more paths raise D but cost S, and DISCUS is the arbiter — it *suggests* a second path for a hard-to-reach rare character and *warns* on overload. The heuristics rank; they never gate. The author may override either way.

**Coverage is the dead-end check.** A confirmed-inventory character with **zero** assigned mechanisms is uncoverable — a dead-end. Criterion **18.6 `KM_LINT_INVENTORY_UNCOVERED`** verifies that every inventory character resolves to ≥ 1 reachable mechanism after precedence is applied. The assignment map must cover the inventory.

**Contract status — RATIFIED, built incrementally (2026-06-26 joint session).** The *typed* form of this map is **ratified** at the 2026-06-26 joint engine+content session (§18 / Sec 17 revision policy) and is being built **incrementally** ("along the way"), not deferred. The migration runs in stages: `SurveyPhaseResult` gains the typed `assignments` field, and the gallery's flat `selectedPatternIds` **migrates into** the typed assignment map — the two coexist during the incremental build-out, with `selectedPatternIds` being progressively subsumed. This is part of the ratified `packages/contracts` major bump (v2.0.0, spec §5a/§18); the assignment-map shape is now the contracted target, not a "not-yet-contracted" aspiration. The full target shape is captured in `docs/proposal-assignment-map-contract.md`.

---

