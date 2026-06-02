# Keyboard Studio — `.kmn` Strategy Reference (v1)

A decision framework for choosing the right Keyman keyboard implementation strategy based on a user's input-method needs. Consumed by the Keyboard Studio recommendation engine.

> **v1 scope:** physical-keyboard input only. Touch/mobile concerns (longpress, multitap, flick, `platform('touch')` gating, `.keyman-touch-layout` design) are deferred to v2. The strategies below still work on touch — they just don't optimize for it.

---

## 1. Discovery axes

Seven dimensions describe a keyboard-design need well enough to pick a strategy. The interview elicits a value on each axis.

| # | Axis | Allowed values | What it means |
|---|---|---|---|
| A1 | **Scale** | tiny (<5) / small (5–20) / medium (20–100) / large (100–300) / massive (1000+) | How many *new* characters or character forms the keyboard adds beyond a stock physical layout. |
| A2 | **Script class** | alphabetic / abugida / abjad / syllabary / logographic | Structural class of the target writing system. Drives whether output is one-char-per-key or cluster-shaped, and whether follow-up cluster behavior matters for abugida/abjad scripts. |
| A3 | **Phonetic intuition** | strong / weak | Strong = the user thinks "I'd type a Latin spelling of the sound." Weak = mapping is arbitrary, shape-based, or modifier-based. |
| A4 | **Diacritic behavior** | none / stacking-combining / replacing-cycling / multi-family | How diacritics behave on a vowel/consonant. Cycling means a repeated mark key replaces the previous mark (Vietnamese-style). |
| A5 | **Multi-mode** | single / two-orthography | Whether the keyboard exposes a runtime toggle between two orthographic styles (e.g. dotted vs. bar-under Yoruba). |
| A6 | **Constraint enforcement** | none / soft / loud | What happens when the user types an invalid sequence. Loud = audible beep; soft = silent suppression; none = anything goes. |
| A7 | **Spare-key availability** | many / RAlt only / fully booked | How crowded the underlying physical layout is. Fully booked → need a modifier plane. |

---

## 2. Interview script

A linear question sequence the Studio asks. Each question maps to one axis. Phrasing is for a non-Keyman-expert user.

**Q1 (A1 Scale).** *Roughly how many new characters does your keyboard need to type — characters that aren't already on a standard physical keyboard?*
   - a few (1–5) → **tiny**
   - a couple dozen (5–20) → **small**
   - around a hundred (20–100) → **medium**
   - several hundred (100–300) → **large**
   - thousands → **massive**

**Q2 (A2 Script class).** *What writing system does the keyboard produce?*
   - Latin or Cyrillic with extra letters (for example Polish, Turkish, Serbian Latin) → **alphabetic**
   - An Indian, Tibetan, or Ethiopian-style script where consonants carry an inherent vowel (for example Devanagari, Amharic) → **abugida**
   - Arabic, Hebrew, or similar (consonants written, vowels optional or as diacritics) → **abjad**
   - Korean Hangul or Cherokee → **syllabary**
   - Chinese-style characters (Han) → **logographic**

**Q2a (cluster sensitivity, for abugida/abjad scripts).** *Does the keyboard need to choose different output based on what was typed before, such as Arabic positional forms, Indic reph/conjuncts, or syllabary ligatures?*
   - Yes → **clusters needed**
   - No → **clusters not needed**

**Q3 (A3 Phonetic intuition).** *When you picture typing one of the special characters, which is closer to how you'd reach for it?*
   - "I'd type the Latin spelling of the sound" → **strong**
   - "I'd press a key that looks like the character, or a modifier + base key" → **weak**

**Q4 (A4 Diacritic behavior).** *Do your characters have accent marks or tones?*
   - No accents → **none**
   - Accents stack on a base letter (e.g. macron + acute → ā́) → **stacking-combining**
   - Tone marks where pressing the mark key twice replaces the mark rather than stacking → **replacing-cycling**
   - Many different families of accent (grave, acute, macron, hook, dot, cedilla…) used together → **multi-family**

**Q5 (A5 Multi-mode).** *Does your language have more than one written form that users switch between (e.g. traditional vs. modernized orthography)?*
   - No → **single**
   - Yes, users should be able to toggle at runtime → **two-orthography**

**Q6 (A6 Constraint enforcement).** *Should the keyboard reject obviously invalid input (e.g. an accent on a consonant that can't take it)?*
   - No, accept anything → **none**
   - Yes, but silently → **soft**
   - Yes, with an audible beep → **loud**

**Q7 (A7 Spare-key availability).** *What's the physical base layout, and does it have unused keys?*
   - Plenty of spare keys → **many**
   - Base layout is full but AltGr/RAlt is free → **RAlt only**
   - Every key is already assigned → **fully booked**

If Q2 was abugida or abjad, answer Q2a before walking the decision tree (§3) to a **primary strategy** plus likely **secondaries**, and surface the matching cards (§4) for the user to confirm.

---

## 3. Decision tree

Ordered rules. First matching rule fixes the **primary** strategy. Rules 8–9 add **secondaries**. Rule 11 is the fallback.

| # | Condition | Primary | Add secondaries |
|---|---|---|---|
| 1 | A1=massive AND A2=logographic | **S-12** DLL IME callout | — |
| 2 | A2=abjad OR (A2=abugida AND cluster sensitivity=yes) | **S-09** Context-sensitive cluster | + S-05 if A3=strong |
| 3 | A4=replacing-cycling | **S-07** Diacritic cycle | + S-04 |
| 4 | A5=two-orthography | **S-11** Stateful option toggle | (wraps whichever strategy fits the per-mode rules) |
| 5 | A3=strong AND A1 ∈ {medium, large} | **S-05** Mnemonic spelling | + S-04 |
| 6 | A4=multi-family AND A1=large | **S-06** Chained deadkeys (two-tier) | + S-04 |
| 7 | A4=stacking-combining AND A1 ∈ {small, medium} | **S-02** Deadkey composition | + S-04 |
| 8 | A6=loud | (whatever above) | + **S-10** Constraints + beep |
| 9 | A7=fully booked | (whatever above) | + **S-08** RAlt modifier-layer |
| 10 | A1=tiny AND A3=strong | **S-01** Simple swap | — |
| 11 | (fallback) | **S-03** Sequence replace | — |

### Flowchart

```mermaid
flowchart TD
    Start([User finishes interview]) --> R1{A1=massive AND<br/>A2=logographic?}
    R1 -- yes --> S12[/"<b>S-12</b> DLL IME callout"/]
    R1 -- no --> R2{A2=abjad OR<br/>(A2=abugida AND clusters needed)?}
    R2 -- yes --> S09[/"<b>S-09</b> Context-sensitive cluster<br/>+ S-05 if A3=strong"/]
    R2 -- no --> R3{A4=replacing-cycling?}
    R3 -- yes --> S07[/"<b>S-07</b> Diacritic cycle<br/>+ S-04"/]
    R3 -- no --> R4{A5=two-orthography?}
    R4 -- yes --> S11[/"<b>S-11</b> Stateful option toggle<br/>(wraps inner strategy)"/]
    R4 -- no --> R5{A3=strong AND<br/>A1 in medium,large?}
    R5 -- yes --> S05[/"<b>S-05</b> Mnemonic spelling<br/>+ S-04"/]
    R5 -- no --> R6{A4=multi-family AND<br/>A1=large?}
    R6 -- yes --> S06[/"<b>S-06</b> Chained deadkeys<br/>+ S-04"/]
    R6 -- no --> R7{A4=stacking-combining AND<br/>A1 in small,medium?}
    R7 -- yes --> S02[/"<b>S-02</b> Deadkey composition<br/>+ S-04"/]
    R7 -- no --> R10{A1=tiny AND<br/>A3=strong?}
    R10 -- yes --> S01[/"<b>S-01</b> Simple swap"/]
    R10 -- no --> S03[/"<b>S-03</b> Sequence replace<br/>(fallback)"/]

    S12 --> Sec
    S09 --> Sec
    S07 --> Sec
    S11 --> Sec
    S05 --> Sec
    S06 --> Sec
    S02 --> Sec
    S01 --> Sec
    S03 --> Sec

    Sec{{"Add-on rules"}}
    Sec --> R8{A6=loud?}
    R8 -- yes --> Add10[/"+ S-10 Constraints + beep"/]
    R8 -- no --> R9
    Add10 --> R9{A7=fully booked?}
    R9 -- yes --> Add08[/"+ S-08 RAlt modifier-layer"/]
    R9 -- no --> Done([Recommendation set])
    Add08 --> Done

    classDef primary fill:#dde9ff,stroke:#3060c0,color:#000
    classDef addon fill:#fff2cc,stroke:#b58900,color:#000
    classDef decision fill:#f5f5f5,stroke:#666,color:#000
    class S01,S02,S03,S05,S06,S07,S09,S11,S12 primary
    class Add08,Add10 addon
    class R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,Sec decision
```

### Prose summary of the tree

- **Massive logographic** → only the OS IME is fast enough; delegate.
- **Indic/Arabic-shaped** scripts need context-aware cluster rules; phonetic ones add mnemonic spelling on top.
- **Tonal cycling** (Vietnamese, Yoruba tone variants) is its own beast — neither stacking nor deadkey.
- **Dual orthography** (two written styles, one keyboard) wraps a state toggle around the inner strategy.
- **Big phonetic alphabets** (IPA, ITRANS) — let the user type spellings; collapse the rule table with `any`/`index`.
- **Big diacritic palettes** (pan-African Latin) — two-tier deadkey: first key chooses the diacritic family, second chooses the base.
- **Small, accent-heavy Latin** — classic deadkey composition.
- **Loud feedback** is an add-on, never the whole answer.
- **Fully-booked layouts** add an RAlt plane.
- **A handful of phonetic additions** — just swap them in.
- **Otherwise** — short ASCII sequences expand to single chars.

---

## 4. Strategy cards

Each card is self-contained and citable by ID. Snippets are verbatim from this repo (paths and line numbers shown).

### S-01 Simple swap

**When to use:** A1=tiny, A3=strong, A4=none. The user wants 1–5 extra characters that map cleanly onto unused or rarely-used keys.

**When to avoid:** More than ~5 characters (rule conflicts mount), any case where the new character should *combine* with something already typed.

**Combines well with:** Nothing — by definition a one-rule-per-character pattern.

**Canonical `.kmn` template:**
```
store(&VERSION) '9.0'
begin Unicode > use(main)
group(main) using keys

+ [K_Q] > 'ɛ'
+ [SHIFT K_Q] > 'Ɛ'
```

**Real exemplar:** `release/a/akan/source/akan.kmn` — Akan (Twi/Fante) adds exactly two letters, `ɛ` and `ɔ`, on the otherwise-unused `q` and `c` keys.
```
+ [K_Q] > 'ɛ'
+ [SHIFT K_Q] > 'Ɛ'
```

---

### S-02 Deadkey composition

**When to use:** A1 ∈ {small, medium}, A4=stacking-combining, A3=strong. User types a diacritic-naming key (`'` for acute, `` ` `` for grave, `:` for diaeresis) and then a base letter.

**When to avoid:** When the diacritic should *replace* a previous one (see S-07); when there are many families and the deadkey table explodes (see S-06).

**Combines well with:** S-04 (collapse the post-deadkey rule table); S-08 (when the trigger key isn't available without RAlt).

**Canonical `.kmn` template:**
```
store(graveK) 'aeiouAEIOU'
store(graveO) 'àèìòùÀÈÌÒÙ'

+ '`' > dk(grave)
dk(grave) + any(graveK) > index(graveO, 2)
dk(grave) + any(keys)   > '`' context(2)    c restore on miss
```

**Real exemplar:** `release/sil/sil_euro_latin/source/sil_euro_latin.kmn` — 92 deadkey rules cover virtually every European Latin diacritic.
```
store(graveK)    'aeinouwyAEINOUWY'
store(graveO)    'àèìǹòùẁỳÀÈÌǸÒÙẀỲ'
"`" dk(1) + any(graveK) > index(graveO, 3)
```

---

### S-03 Sequence replace

**When to use:** A1 small to medium, the user prefers short ASCII suffixes (`<`, `>`, `=`) to a deadkey-then-base flow. Common for IPA-style alphabets where there's no obvious "diacritic" naming key.

**When to avoid:** When the user must see the intermediate state visually (deadkey is better — it commits nothing until the second key). When the sequence is more than 2–3 keys (mnemonic spelling S-05 is more legible).

**Combines well with:** S-04 (parallel lookup tables for the modifier suffix). S-05 (for longer sequences in the same keyboard).

**Canonical `.kmn` template:**
```
store(equalD) 'a' 'e' 'i' 'o'
store(equalU) U+1D43 U+1D49 U+1DD0 U+1D52    c superscript variants

any(equalD) + '=' > index(equalU, 1)
```

**Real exemplar:** `release/sil/sil_ipa/source/sil_ipa.kmn` — `<`, `=`, `>` modifiers attach to a preceding base letter to select IPA variants.
```
store(greatD) "A"    "E"    "G"    "H"    "I"  ...
store(greatU) U+1D02 U+0276 U+029B U+0267 U+1D7C ...
"=" + ">" > index(equalU, 3)
```

---

### S-04 Parallel-store lookup (`any` + `index`)

**When to use:** Any time you have a positional mapping table of more than ~6 entries. This is a **building block**, not usually a primary strategy — it makes S-02, S-03, S-05, S-06 maintainable.

**When to avoid:** When the mapping is sparse / non-positional (e.g. only some letters take a given diacritic). Define separate stores for each subset instead of leaving gaps.

**Combines well with:** Everything except S-01 and S-12.

**Canonical `.kmn` template:**
```
store(K_lc1)  "a"    "b"    "c"    "d"
store(lc1)    U+0251 U+0253 U+0188 U+0257

dk(family) + any(K_lc1) > index(lc1, 2)
```

**Real exemplar:** `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn` — a single rule paired with two stores replaces what would otherwise be dozens of swap rules.
```
store(K_lc1)     "a"              "b"              "c" ...
store(lc1)       U+0251           U+0253           U+0188 ...
"[" dk(1) + any(K_lc1) > index(lc1, 1)
```

---

### S-05 Mnemonic spelling / transliteration

**When to use:** A3=strong, A1 ∈ {medium, large}. User types an ASCII transliteration of the target script; common for IPA, ITRANS, Sanskrit, romanized Greek.

**When to avoid:** When the target user doesn't know the romanization scheme (then S-02/S-06 with visual deadkey feedback is gentler).

**Combines well with:** S-04 (collapse the table), S-09 (when the script also needs cluster rules), S-11 (when there are two romanization schemes).

**Canonical `.kmn` template:**
```
+ "a"      > "अ"
"अ" + "a"  > "आ"        c second 'a' lengthens
+ "A"      > "आ"
```

**Real exemplar:** `release/itrans/itrans_devanagari_hindi/source/itrans_devanagari_hindi.kmn` — typing `saMskRRta` produces `संस्कृत`.
```
+ "a"     >  "अ"
"अ" + "a" >  "आ"
+ "A"     >  "आ"
```

---

### S-06 Chained deadkeys (two-tier)

**When to use:** A4=multi-family AND A1=large. Or alphabetic scripts where one base key has multiple legitimate outputs and the next key disambiguates. Two-tier means: first key picks the *family* (diacritic class, capital-vs-small, etc.), second picks the *base*.

**When to avoid:** When you have only one diacritic family — a single deadkey suffices (S-02). When the user can't predict which family key to press (single-tier with a mnemonic key is gentler).

**Combines well with:** S-04 (essential for managing the per-family table), S-08 (RAlt to host the family keys).

**Canonical `.kmn` template:**
```
+ [K_LBRKT]                > dk(family_grave)
+ [SHIFT K_LBRKT]          > dk(family_acute)

dk(family_grave) + any(K_vowels) > index(grave_out, 2)
dk(family_acute) + any(K_vowels) > index(acute_out, 2)
```

**Real exemplar:** `release/a/armenian_mnemonic_r/source/armenian_mnemonic_r.kmn` — `C` enters a deadkey whose next press selects the specific Armenian letter shape.
```
+ [NCAPS SHIFT K_C] > dk(capital_co)
+ [CAPS K_C]        > dk(capital_co)
+ [K_SLASH]         > dk(slash)
```

A pan-African example with two-tier diacritic-family selection: `release/sil/sil_pan_africa_mnemonic/source/sil_pan_africa_mnemonic.kmn`.

---

### S-07 Diacritic cycle

**When to use:** A4=replacing-cycling. Tonal languages where the same mark key, pressed again, should **replace** the existing tone rather than stack a second one — typically because each vowel has a small finite set of legal tones.

**When to avoid:** When the language genuinely uses stacked diacritics (then S-02). When the cycle order isn't obvious to users (consider explicit tone keys instead).

**Combines well with:** S-04 (parallel stores per tone state are essential). Smart-backspace (Building Block §5.A) to delete a marked vowel as a unit.

**Canonical `.kmn` template:**
```
store(vowels)       'aeiou'
store(vowels_sac)   'áéíóú'      c acute
store(vowels_huyen) 'àèìòù'      c grave

any(vowels)     + 's' > index(vowels_sac, 1)
any(vowels_sac) + 's' > index(vowels, 1) 's'      c second press cancels
any(vowels_sac) + 'f' > index(vowels_huyen, 1)    c f swaps acute → grave
```

**Real exemplar:** `release/v/vietnamese_telex/source/vietnamese_telex.kmn` — the canonical TELEX cycling pattern.
```
any(vowels)     + 's' > index(vowels_sac, 1)
any(vowels)     + 'f' > index(vowels_huyen, 1)
any(vowels_sac) + 's' > index(vowels, 1) 's'
any(vowels_sac) + 'f' > index(vowels_huyen, 1)
```

---

### S-08 RAlt modifier-layer

**When to use:** A7=fully booked (or RAlt only). Always an **add-on** — provides a second plane of characters without disturbing the primary layout. Common for symbols, currency, math, and rare letters.

**When to avoid:** As a primary strategy. Discoverability is poor; users need a printed cheat sheet. On macOS, AltGr/RAlt collides with Option-key system shortcuts.

**Combines well with:** Every primary strategy.

**Canonical `.kmn` template:**
```
+ [RALT K_SLASH]   > U+0301
+ [RALT K_PERIOD]  > '·'
+ [RALT K_COMMA]   > '''
```

**Real exemplar:** `release/r/russian_mnemonic_r/source/russian_mnemonic_r.kmn` — RAlt opens a plane of symbols and combining marks on top of the Cyrillic mnemonic layout.
```
+ [RALT K_SLASH]    > U+0301
+ [RALT K_PERIOD]   > '·'
+ [RALT K_COMMA]    > '''
+ [NCAPS RALT K_M]  > '‰'
```

---

### S-09 Context-sensitive cluster formation

**When to use:** A2 ∈ {abugida, abjad}. The output character depends on what was already typed: Indic *reph* / conjuncts, Arabic hamza-bearing alif variants, positional letter forms.

**When to avoid:** For purely alphabetic Latin/Cyrillic scripts (S-02 / S-05 are simpler).

**Combines well with:** S-05 (when the user types a romanized form), S-04 (essential for managing the consonant/matra tables), Building Block §5.A (smart-backspace to remove a cluster atomically).

**Canonical `.kmn` template:**
```
any(ConsonantsU) + "R" > U+0930 U+094D index(ConsonantsU, 1)
any(BaseLetter) + 'g' > index(BaseLetter_modified, 1)
```

**Real exemplar (abugida — Indic *reph*):** `release/sil/sil_devanagari_phonetic/source/sil_devanagari_phonetic.kmn`.
```
any(ConsonantsU) + "R" > U+0930 U+094D index(ConsonantsU, 1)
any(ConsonantsU) any(MatraVsU) + "R" > U+0930 U+094D index(ConsonantsU, 1) index(MatraVsU, 2)
any(ConsonantsU) U+093c any(MatraVsU) + "R" > U+0930 U+094D index(ConsonantsU, 1) U+093c index(MatraVsU, 3)
```

**Real exemplar (abjad — Arabic hamza):** `release/a/arabic_izza/source/arabic_izza.kmn`.
```
"ا" + "g" > "أ"   c Hamza fouk alif
"و" + "," > "ؤ"   c Hamza fouk waw
"ء" + "g" > "آ"   c Alif elmad
```

---

### S-10 Constraints + beep

**When to use:** A6=loud. Multi-language clusters where users need active feedback that they typed something illegal (e.g. an acute on a consonant that can't take it).

**When to avoid:** When the invalid combination is genuinely rare — the constraint group adds rule-engine overhead and a separate group to maintain. When `beep` would be annoying (long-form typing).

**Combines well with:** Every primary strategy — implemented as a separate `group(constraints)` invoked before `group(main)`.

**Canonical `.kmn` template:**
```
begin Unicode > use(constraints)

group(constraints) using keys
any(nonBaseChar) + any(diacriticsKeys) > context beep
nomatch > use(main)

group(main) using keys
... real rules ...
```

**Real exemplar:** `release/el/el_pasifika/source/el_pasifika.kmn` — Polynesian languages share Latin + macron / acute / diaeresis; the constraint group beeps on invalid base+diacritic combinations.
```
group(constraints) using keys
any(nonBaseChar) + any(diacriticsKeys) > context beep
any(nonBaseDiaeresisChars) + any(diaeresisKeys) > context beep
```

---

### S-11 Stateful option toggle

**When to use:** A5=two-orthography. One keyboard, two written conventions, runtime toggle. Examples: Yoruba dotted vs. barred, IPA before-vs-after diacritic placement, Hindi vs. Sanskrit implicit-final-a.

**When to avoid:** When the modes differ widely enough that one shared rule set becomes unmaintainable — ship two keyboards instead.

**Combines well with:** Any primary strategy (S-11 wraps `if(style='X')` around its rules).

**Canonical `.kmn` template:**
```
store(style) 'dot'

if(style='dot') + [CTRL '.'] > set(style='bar')
if(style='bar') + [CTRL '.'] > set(style='dot')

if(style='dot') + 'Z' > U+1E62
if(style='bar') + 'Z' > U+0053 U+0329
```

**Real exemplar:** `release/sil/sil_yoruba8/source/sil_yoruba8.kmn` — `Ctrl+.` toggles between dotted-below and bar-below diacritic styles.
```
store(style) 'dot'
if(style='dot') + [CTRL '.'] > set(style='bar')
if(style='bar') + [CTRL '.'] > set(style='dot')
```

---

### S-12 DLL IME callout

**When to use:** A1=massive AND A2=logographic. The character inventory (tens of thousands of Han characters) is too large for Keyman rules to handle efficiently; delegate to a native IME.

**When to avoid:** Anywhere else. Locks the keyboard to a single OS (almost always Windows) and a single shipped DLL — incompatible with modern cross-platform Keyman targets.

**Combines well with:** Nothing — this is a thin shim.

**Canonical `.kmn` template:**
```
store(DLLFunction) "KeymnIMX.DLL:FindGlyph"

+ any(VKeys)  > call(DLLFunction)
nomatch       > call(DLLFunction)
```

**Real exemplar:** `release/c/cs_pinyin/source/cs_pinyin.kmn` — 100k+ Han characters via Pinyin lookup, fully delegated to a Windows DLL.
```
store(DLLFunction) "KeymnIMX.DLL:FindGlyph"
+ any(VKeys)  > call(DLLFunction)
+ any(NPKeys) > call(DLLFunction)
```

---

## 5. Building blocks (appendix)

These techniques are not chosen independently — they're applied **inside** the strategies above. The Studio should know to invoke them as the user's keyboard grows.

### 5.A Smart-backspace / atomic cluster deletion

Recognise a composed cluster in context and delete it as one unit, so one Backspace removes a whole composed vowel+tone or consonant+matra instead of one codepoint.

```
any(bar) U+0329 + [K_BKSP] > nul
any(dot+nsl) any(ac.all) + [K_BKSP] > nul
```

Use whenever a strategy produces multi-codepoint output (S-02, S-06, S-07, S-09).

### 5.B `nul` swallow

Disables a key entirely. Used to suppress unused QWERTY keys on a layout that re-purposes most of them, or to silently drop an invalid sequence (the soft-constraint counterpart to S-10).

```
store(disabled) "QWRYUIPASFGHKLZCVBM"
+ any(disabled) > nul
```

### 5.C `outs()` store composition

Expand one store inside another to build composite tables without repetition. Essential when a strategy needs "all decorated vowels" or "everything-but-the-grave-set".

```
store(grv.all) outs(base) outs(grv) outs(acu) outs(crc) outs(mac)
```

### 5.D `notany()` + `context(N)` deadkey fallback

When the key after a deadkey isn't one of the expected continuations, emit the bare base character and put the typed key back into the input stream. Graceful degradation — essential for any deadkey strategy (S-02, S-06).

```
dk(grave) notany(graveK) > '`' context(2)
```

### 5.E `nomatch` group routing

Catch-all at the end of a group that routes unmatched input to another group (constraints → main, main → NFC normalization, main → DLL). Used in every multi-group strategy.

```
nomatch > use(main)
```

### 5.F Multi-group pipeline

Structural pattern: `begin Unicode > use(constraints)`; `constraints` filters, then `nomatch > use(main)`; `main` does the work, then `nomatch > use(NFC)`. Compose this around any combination of primary strategies.

---

## 6. Self-check pass (validation)

The decision tree must be consistent with the strategy actually used by each exemplar. The table below records the round-trip — if any column "Tree → strategy" disagrees with "Actual primary," the tree is wrong, not the keyboard.

| Exemplar | A1 | A2 | A3 | A4 | A5 | A6 | A7 | Tree → strategy | Actual primary |
|---|---|---|---|---|---|---|---|---|---|
| `release/a/akan/` | tiny | alphabetic | strong | none | single | none | many | rule 10 → S-01 | S-01 ✓ |
| `release/sil/sil_euro_latin/` | large | alphabetic | strong | multi-family | single | none | RAlt only | rule 6 → S-06 | S-02 with S-04/S-08 ✗ — see note |
| `release/sil/sil_ipa/` | medium | alphabetic | strong | none | single | none | many | rule 5 → S-05 + S-04 | S-03 + S-04 ✗ — see note |
| `release/sil/sil_devanagari_phonetic/` | medium | abugida | strong | none | single | none | many | rule 2 → S-09 + S-05 | S-09 + S-05 ✓ |
| `release/v/vietnamese_telex/` | medium | alphabetic | strong | replacing-cycling | single | none | many | rule 3 → S-07 + S-04 | S-07 ✓ |
| `release/sil/sil_yoruba8/` | medium | alphabetic | strong | multi-family | two-orthography | none | many | rule 4 → S-11 wrap | S-11 ✓ |
| `release/a/armenian_mnemonic_r/` | medium | alphabetic | weak | none | single | none | RAlt only | rule 11 fallback → S-03 ✗ | S-06 + S-08 ✗ — see note |
| `release/el/el_pasifika/` | small | alphabetic | strong | stacking-combining | single | loud | many | rule 7 → S-02 + rule 8 → +S-10 | S-02 + S-10 ✓ |
| `release/c/cs_pinyin/` | massive | logographic | weak | none | single | none | many | rule 1 → S-12 | S-12 ✓ |
| `release/itrans/itrans_devanagari_hindi/` | large | abugida | strong | none | two-orthography | none | many | rule 2 → S-09 + S-05 (then rule 4 wraps with S-11) | S-09 + S-05 + S-11 ✓ |
| `release/sil/sil_pan_africa_mnemonic/` | large | alphabetic | weak | multi-family | single | none | many | rule 6 → S-06 + S-04 | S-06 + S-04 ✓ |
| `release/a/arabic_izza/` | medium | abjad | weak | none | single | none | many | rule 2 → S-09 | S-09 ✓ |
| `release/r/russian_mnemonic_r/` | medium | alphabetic | weak | none | single | none | RAlt only | rule 11 fallback → S-03 ✗ | S-06 + S-08 ✗ — see note |

### Known mismatches and intended follow-ups

Four exemplars don't round-trip cleanly. Each points to a tree gap to fix in v1.1:

- **EuroLatin** and **Armenian/Russian mnemonic**: when A2=alphabetic, A1=large, A4=multi-family, the tree should prefer **S-02 with broad parallel-store tables** (EuroLatin's actual approach) or **S-06 + S-08** (Armenian/Russian) depending on whether the user has phonetic intuition. Add a tie-breaker on A3 inside rule 6/7.
- **IPA**: A3 is strong but the user prefers *sequence modifiers* (`<`, `=`, `>`) to mnemonic spelling. Add an axis or sub-question distinguishing "spell the sound" from "decorate with suffix keys."
- **Armenian / Russian fallback**: A3=weak alphabetic-with-collisions currently falls through to S-03; should route to S-06 + S-08. Add a rule between 7 and 8: `if A2=alphabetic AND A3=weak AND collisions=yes → S-06 + S-08`.

These four mismatches are **the value of the validation pass** — they identify exactly where v1 needs work before the Studio is released.

---

## 7. Studio integration notes

- The Studio should load this whole file as system context. ~3,000 words.
- The interview script (§2) is a *starting point* — the Studio can branch or skip questions based on prior answers (e.g. Q4 is moot if A1=tiny).
- The decision tree (§3) can be encoded as Python/JSON rules **or** consumed by an LLM reasoning over the table. Both work; pick based on Studio architecture.
- Each strategy card (§4) ends with a canonical template and a real exemplar. The Studio adapts the template by substituting the user's character inventory into the parallel stores.
- The validation table (§6) is the regression suite. Re-run it after any tree edit.

## 8. Out of scope (v1)

- Touch / mobile (`.keyman-touch-layout`, `platform('touch')`, longpress, multitap, flick).
- Generation of `.kmp` package files, `.kvks` visual layouts, `.keyboard_info` metadata.
- Predictive text and wordlists (`.model.ts`).
- Migration of legacy binary keyboards.
- Localization of the Studio interview itself.
