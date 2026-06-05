# Corpus scan — 22 representative Keyman keyboards

## Purpose

This scan documents twenty-two real Keyman keyboards as the empirical groundwork for the keyboard
studio (plus a small set of deliberately rough keyboards, documented separately below). The goal is to show, in plain language, *which real-world keyboards solve which writing-system
problems and how* — so the pattern library and the strategy catalog in [spec.md](../spec.md) (§5, §7)
are built from observed practice rather than invented in the abstract. The notes are written for a
**linguist audience**: each keyboard's day-to-day behaviour is described in ordinary words, and the
keyboard-developer detail (strategy, axes, source lines) is confined to the small metadata block at
the top of each entry.

## Selection basis

The core set was **handpicked by popularity** — ranked by monthly download counts on
keyman.com — so the scan reflects the layouts people actually use. All twenty popularity picks were
nominated as "clean" examples to start from; two further AZERTY keyboards (French Basic, Akebu) were
added afterwards as targeted coverage, bringing the representative set to twenty-two. Each was then
read in full from the local source clone at `keymanapp/keyboards`
(`release/<bucket>/<id>/source/<id>.kmn`) and classified against the spec.

## Coverage summary

| Group (spec §9) | Count | Keyboards |
|---|---|---|
| QWERTY/QWERTZ | 9 | EuroLatin, Cameroon QWERTY, Naija Type, Philippines, Tchad QWERTY, Uganda-Tanzania, Eastern Congo, Umatilla Sahaptin, Yorùbá with Dot |
| AZERTY | 3 | Cameroon AZERTY, French Basic, Akebu |
| Non-Roman | 10 | GFF Amharic, SIL Ethiopic Power-G (syllabary); Tamil99, Remington GAIL (Indic); Myanmar3, Khmer NIDA, Nulisa Aksara Jawa (SEA Brahmic); Pak Urdu, Saraiki (Arabic/RTL); Plains Cree (Canadian syllabics) |

**Scripts represented:** Latin (Europe, Francophone & Anglophone Africa, the Philippines, Pacific
Northwest, West Africa); Ethiopic syllabary; Tamil and Devanagari (Indic abugida); Myanmar, Khmer and
Javanese (Southeast-Asian Brahmic abugida); Arabic abjad (right-to-left); and Canadian Aboriginal
Syllabics. **Strategies observed:** S-01 through S-10 from the spec §7 catalog all appear; S-11
(stateful orthography toggle) shows up only in passing as touch-layer state; S-12 (logographic IME
callout) does not appear because no CJK keyboard is in the popular set.

**Known-rough set (negative fixtures for `@keymanapp/keyboard-lint`):** 5 keyboards — 4 from
`experimental/` and 1 from `release/` (clavbur9, showing that hygiene issues reach release too) —
all Layer-A valid (they compile and run — rough, not broken). Criteria exercised:

| Criterion | Description | Keyboards |
|---|---|---|
| 1.11 | committed `.kpj.user` developer-state file | clavbur9 |
| 1.12 | compiled `build/` outputs committed in the source tree | clavbur9 |
| 3.6 | HISTORY.md top version != .kmn version | elfdalian |
| 4.5 | LICENSE.md copyright line malformed | elfdalian, gff_geez_emufi, wancho, alkelang, clavbur9 |
| 5.2 | Version string embedded in user-facing doc | elfdalian, gff_geez_emufi, wancho, alkelang |
| 6 | readme.htm missing from source/ | gff_geez_emufi, alkelang |
| 7.2 | targets lists platforms alongside `any` | elfdalian |

Groups covered: QWERTY/QWERTZ Latin (elfdalian), mobile-touch Latin (alkelang), AZERTY-mnemonic
(clavbur9), Non-Roman syllabary/abugida (gff_geez_emufi: Ethiopic; wancho: Wancho script).

### Two intentional gaps relative to the issue's literal coverage targets

The popularity-driven selection does not hit two of the originally suggested minimums. They are
recorded openly here rather than papered over, so a follow-up pass can fill them:

1. **AZERTY breadth.** This gap is now closed. The popularity cut surfaced only one AZERTY keyboard
   (Cameroon AZERTY), so two further AZERTY examples were added as targeted coverage beyond the
   original popularity-ranked twenty: **French Basic** (basic_kbdfr — the plain machine-imported
   French AZERTY base) and **Akebu** (sil_akebu — an AZERTY base extended for a Kwa language of Togo).
   Both are documented below alongside Cameroon AZERTY, bringing AZERTY coverage to three. A mnemonic
   Burkina Faso keyboard (clavbur9) is also documented, in the Known-rough section, as an AZERTY-region
   rough example.
2. **"Known-rough" examples.** All twenty-two clean keyboards were chosen as positive references; none
   is outright defective. This gap is now closed: four deliberately rough keyboards from
   `keymanapp/keyboards experimental/` — elfdalian, gff_geez_emufi, wancho, alkelang — have been
   scanned with `scan_hygiene.py` and documented in the [Known-rough keyboards](#known-rough-keyboards)
   section below. Together they exercise criteria {3.6, 4.5, 5.2, 6, 7.2} and serve as the
   negative-fixture corpus for `@keymanapp/keyboard-lint`. A fifth keyboard, hong_kong (3.6:
   HISTORY '2.1' != .kmn '2.2'), is reserved as a second version-skew example if additional
   coverage is needed.

### How to read each entry

Each keyboard has a short metadata block followed by a plain-English note:

- **Group** — the spec §9 routing bucket (QWERTY/QWERTZ, AZERTY, or Non-Roman).
- **Strategy** — the primary output strategy from the spec §7 catalog (S-01..S-12), plus secondaries.
- **Axes** — the discovery-axis values (spec §7.1) that explain the strategy choice: A1 scale,
  A2 script class, A3 phonetic intuition, A4 diacritic behaviour, A5 multi-mode, A6 constraint
  enforcement, A7 spare-key availability (A2a = cluster sensitivity, for abugida/abjad scripts).
- **Quality** — clean, or clean with a noted caveat.
- **Source** — the path to the keyboard's `.kmn` rule file; line references in the note point into it.

---

# Latin-script keyboards

## sil_euro_latin
- **Display name / downloads:** EuroLatin (SIL) — 4,978/mo
- **Language(s) / script:** Latin script for hundreds of European, African, Pacific and Indigenous-American languages (German, French, Welsh, Quechua, Zapotec, Guaraní, etc.)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store lookup, + S-03 sequence replace)
- **Axes:** A1=large · A2=alphabetic · A3=weak · A4=stacking-combining · A6=none · A7=many (punctuation keys used as prefixes)
- **Quality:** clean
- **Source:** release/sil/sil_euro_latin/source/sil_euro_latin.kmn

EuroLatin is SIL's general-purpose typing tool for anyone writing a Latin-script language, from major
European tongues to hundreds of minority and Indigenous languages (its package lists well over 400,
including dozens of Quechua and Zapotec varieties). It meets the need for a single keyboard that can
produce almost any accented Latin letter without forcing the user to switch layouts. In daily use the
typist presses a "prefix" punctuation key that stands for an accent and then the base letter: the
apostrophe followed by a vowel adds an acute accent, the backtick adds a grave, the colon adds a
diaeresis, the caret adds a circumflex, and so on (sil_euro_latin.kmn lines 128-151). Pressing the
same prefix twice simply produces the punctuation mark itself (lines 243-261), so nothing is lost.
The one distinctive design decision is the large parallel-list mechanism: each accent has a paired
"keys" list and "output" list, and the system matches the position of the typed letter in the first
list to pull the matching accented character from the second (lines 41-151), letting a handful of
rules cover thousands of combinations. It is a clean example because it declares cased-key behaviour
properly (line 25), carries a populated copyright and version, and even adds touch-device and
sentence-casing logic (lines 290-329).

## sil_cameroon_qwerty
- **Display name / downloads:** Cameroon QWERTY — 2,371/mo
- **Language(s) / script:** Latin script with the extended General Alphabet of Cameroonian Languages (open vowels ɛ ɔ, hooked letters ɓ ɗ, eng ŋ, etc.)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-08 RAlt modifier-layer (+ S-02 deadkey composition, + S-04 parallel-store lookup, + S-10 constraints + beep)
- **Axes:** A1=medium · A2=alphabetic · A3=strong · A4=stacking-combining · A6=loud (beep) · A7=fully-booked (RALT plane heavily used)
- **Quality:** clean
- **Source:** release/sil/sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn

This keyboard serves the many language communities of Cameroon that write with the country's
Standardized/General Alphabet, which extends the familiar Latin set with special vowels and consonants
(lines 17-21). Built on a normal US QWERTY base so existing Cameroonian typists feel at home, it opens
a second "hidden" plane reached with the right-hand Alt key: holding AltGr and pressing A gives the
open vowel ɛ, B gives ɓ, O gives ɔ, and so on (sil_cameroon_qwerty.kmn lines 89-224). Accents are
added by pressing a dedicated tone or mark key after the letter, and a special prefix key (the
semicolon, line 226) opens a menu of further characters via a paired lookup table (lines 351-353). The
distinctive design choice is its insistence on guiding the user: keys with no valid special character
sound an audible beep rather than doing nothing (e.g. lines 47, 60, 188), so typists immediately learn
which combinations exist. It is a clean example, with a proper cased-keys declaration (line 10), a
populated copyright and visual-keyboard reference, and a helpful on-screen message telling users how to
reach the extra characters (line 4).

## sil_cameroon_azerty
- **Display name / downloads:** Cameroon AZERTY — 2,233/mo
- **Language(s) / script:** Latin script with the General Alphabet of Cameroonian Languages, on a French AZERTY base
- **Group:** AZERTY
- **Strategy:** S-08 RAlt modifier-layer (+ S-06 chained deadkeys, + S-02 deadkey composition, + S-04 parallel-store lookup, + S-10 constraints + beep)
- **Axes:** A1=medium · A2=alphabetic · A3=strong · A4=multi-family · A6=loud (beep) · A7=fully-booked
- **Quality:** clean (caveat: legacy NCAPS/CAPS rule pairs on the slash key, lines 264-267)
- **Source:** release/sil/sil_cameroon_azerty/source/sil_cameroon_azerty.kmn

This is the French-keyboard counterpart to Cameroon QWERTY, for the very large population of Cameroon
that learned typing on a French AZERTY layout. The base follows AZERTY conventions — A and Q are
swapped, Z and W are swapped, and the digit row produces French accented letters and symbols directly
(sil_cameroon_azerty.kmn lines 40-99, 101, 182). As with its sibling, the right-hand Alt key opens a
plane of African letters (lines 102-230), and special tone and accent marks sit on the bracket and
quote keys. Its most distinctive feature is a richer two-step "dead key" system inherited from French
typing: pressing a French accent key first, then a vowel, composes letters such as ã, ñ, ê or ä through
several paired lookup tables (lines 366-400), and an exclamation-mark prefix opens a large general
character menu. Invalid combinations beep (e.g. lines 43, 86, 233). It is well-built — proper cased
keys (line 11), populated copyright, named author and website — though it still carries a pair of older
explicit Caps-Lock-state rules on the slash key (lines 264-267) that modern keyboards usually handle
automatically, hence the minor caveat.

## el_naija
- **Display name / downloads:** Naija Type (package name "Naija NFD") — 1,010/mo
- **Language(s) / script:** Latin script for Nigerian languages (Igbo, Yoruba, Hausa, Efik, Tiv and many more), with tone marks and below-base dots
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-10 constraints + beep (+ S-02 deadkey-style mark composition, + S-08 Ctrl-Alt modifier-layer, + S-04 parallel-store lookup, + a reorder group)
- **Axes:** A1=medium · A2=alphabetic · A3=weak · A4=stacking-combining · A5=single · A6=loud (beep) · A7=RAlt/Ctrl-Alt only
- **Quality:** clean (caveat: desktop-only target, line 17; an apparent duplicate constraint at lines 113/119)
- **Source:** release/el/el_naija/source/el_naija.kmn

Naija Type is designed for the tone languages of Nigeria, where a vowel may need both a tone mark above
and a dot below. It serves writers of Igbo, Yoruba, Hausa, Efik, Tiv and dozens of related languages
who need accurate combinations of diacritics in correct Unicode order. In practice the typist types a
base letter and then presses punctuation keys that stand for marks: the hyphen adds a macron, the right
bracket an acute tone, the left bracket a dot below, the backslash a tilde, and so on (el_naija.kmn
lines 144-156). The keyboard also offers extra African letters such as ɛ, ɔ, ŋ and ɓ through Ctrl-Alt
key combinations (lines 61-76, 141). Its one truly distinctive decision is a built-in "grammar checker"
for diacritics: an entire opening group of rules (lines 81-137) refuses illegal sequences — too many
marks on one letter, a mark on a consonant that cannot take it, or a duplicated accent — and sounds a
beep instead, while a later reordering group quietly fixes the storage order of stacked marks
(lines 161-166). This careful enforcement of well-formed, normalized output makes it a strong, clean
example; the only notable limitation is that it targets desktop only.

## sil_philippines
- **Display name / downloads:** Philippines (SIL) — 1,100/mo
- **Language(s) / script:** Latin script for Tagalog, Cebuano, Ilocano and well over a hundred Philippine languages, with stress accents and phonetic letters
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store lookup, + S-06 chained deadkeys)
- **Axes:** A1=medium · A2=alphabetic · A3=weak · A4=multi-family · A6=none · A7=many (symbol keys used as prefixes)
- **Quality:** clean
- **Source:** release/sil/sil_philippines/source/sil_philippines.kmn

This keyboard equips writers of the more than one hundred languages of the Philippines — Tagalog,
Cebuano, Ilocano, Hiligaynon and many smaller languages — to mark vowel stress and to reach the special
phonetic letters used in dictionaries and language description. The typist works by pressing a "prefix"
symbol key that names an accent and then the vowel: the apostrophe before a vowel gives an acute
(stress) accent, the backtick gives a grave, the caret a circumflex, the percent sign a diaeresis, and
the tilde a macron (sil_philippines.kmn lines 28-41). The ampersand and underscore keys act as gateways
to a wide tray of extra symbols and letters — currency signs, the glottal-stop letter, the schwa, eng,
alpha and more (lines 86-137, 173-188). The distinctive design decision is its support for stacked
accents: pressing the tilde prefix and then the grave prefix before a vowel produces a letter carrying
both a macron and a grave at once, as Philippine stress-and-length notation requires (lines 160-171).
It is a clean example, declaring a mnemonic layout, carrying a populated version and copyright, naming
its author, and thoughtfully reproducing legacy "Phil Ansi SIL" character mappings so older documents
can be retyped faithfully.

## sil_tchad_qwerty
- **Display name / downloads:** Tchad QWERTY — 1,240/mo
- **Language(s) / script:** ~130 languages of Chad written in the Chadian National Alphabet (extended Latin)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store lookup, + S-03 sequence replace, + S-07 diacritic cycle for gliding tones)
- **Axes:** A1=large · A2=alphabetic · A3=weak (shape/punctuation-key based) · A4=stacking-combining · A6=none · A7=many (the `/` prefix opens a whole second plane)
- **Quality:** clean
- **Source:** release/sil/sil_tchad_qwerty/source/sil_tchad_qwerty.kmn

This keyboard serves the very large family of languages spoken across Chad, which share a common
Roman-based national alphabet rich in special letters (such as ɓ, ɗ, ɛ, ŋ, ɔ) and a tone-marking
system. A typist works from an ordinary US QWERTY keyboard: to add an accent to a vowel they type the
vowel and then a punctuation key — for example a vowel followed by "[" yields the acute-accented form
and "]" the grave (sil_tchad_qwerty.kmn lines 39-45). Special phonetic letters are reached by pressing
a slash "/" before a base key, which swaps in the corresponding African letter from a paired lookup
table (lines 29-30, 104). The one distinctive decision is the careful handling of Chad's gliding
(contour) tones: typing two accent keys in succession on an already-accented vowel produces a single
combined tone mark such as low-rising or high-falling, rather than just stacking two separate accents
(lines 82-97). It is a clean example because it ships with a proper authored copyright and contact
(line 10), a bundled Andika font, and thoughtful touch-layout support for tablets (lines 126-155).

## sil_uganda_tanzania
- **Display name / downloads:** Uganda-Tanzania Bantu (SIL) — 647/mo
- **Language(s) / script:** ~110 Bantu languages of Uganda and Tanzania (extended Latin)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store lookup, + S-03 sequence replace)
- **Axes:** A1=large · A2=alphabetic · A3=weak (modifier-key based) · A4=stacking-combining (above and below) · A6=none · A7=many (a single ";" prefix key)
- **Quality:** clean (caveat: legacy header — bare `VERSION 9.0` form at line 9 rather than the modern `store(&VERSION)`, and a commented-out hotkey at line 12)
- **Source:** release/sil/sil_uganda_tanzania/source/sil_uganda_tanzania.kmn

This keyboard supports the broad sweep of Bantu languages across Uganda and Tanzania, including
Swahili, Ganda and many smaller tongues, which need modified vowels and consonants plus stacked tone
and quality marks. The everyday method is a single "modifier" key, the semicolon: pressing ";" before
a vowel turns it into its special form (for instance the open or barred vowels at lines 25-26, 59),
while accent keys such as backtick, apostrophe and brackets placed before a letter add marks above or
below it (lines 29-32, 66-70). The distinctive decision is letting marks above and below combine in
either order, so a writer can stack a tone mark and an underdot on the same vowel regardless of which
they type first (lines 70-75). It also offers a friendly "double-tap" shortcut where typing a letter
twice produces its hard or soft variant, such as i-i-i giving an underlined i for Ugandan orthographies
(lines 105-118). It is a solid clean example with broad documented language coverage, though its header
uses an older style worth modernizing.

## sil_eastern_congo
- **Display name / downloads:** Eastern Congo — 773/mo
- **Language(s) / script:** ~100 languages of the eastern Democratic Republic of the Congo (extended Latin)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store lookup, + S-03 sequence replace; uses a dedicated normalization group)
- **Axes:** A1=large · A2=alphabetic · A3=weak (prefix-key based) · A4=stacking-combining (multi-mark, NFC-composed) · A6=soft (composition silently halts on a block) · A7=many (";" prefix plus several accent prefix keys)
- **Quality:** clean
- **Source:** release/sil/sil_eastern_congo/source/sil_eastern_congo.kmn

This keyboard covers the many languages of the eastern DR Congo, from Lingala and Swahili to dozens of
smaller languages, which require a large inventory of special letters and richly accented vowels. In
daily use a typist reaches special letters by pressing semicolon before a base key (lines 96, 47-52)
and adds accents by pressing a prefix symbol such as "^", "`" or "'" before the letter to be marked
(lines 99-105). The standout design decision is a two-stage architecture: the main group produces a
base letter plus a combining accent, then a separate finishing group recomposes that pair into a single
precomposed Unicode character and even merges a second accent, so that, for example, a circumflex vowel
plus an acute becomes one fully-formed letter (lines 187-289). This keeps the visible text tidy and
font-friendly. A neat usability touch is the "stop" behaviour where doubling a punctuation key ends
accent processing so the raw symbol can be typed (lines 172-179). It is a clean, well-maintained
example, bundled with the full Charis font family and carrying an authored copyright.

## sahaptin_umatilla
- **Display name / downloads:** Umatilla Sahaptin/Ičiškíin — 1,080/mo
- **Language(s) / script:** Umatilla Sahaptin (Ičiškíin), a Sahaptian language of the Columbia Plateau, Oregon (extended Latin)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-01 simple swap (+ S-08 RAlt modifier-layer)
- **Axes:** A1=small · A2=alphabetic · A3=weak (positional key remap) · A4=none (precomposed/literal output, no live combining) · A6=none · A7=RAlt only (Alt used for three extra letters)
- **Quality:** clean
- **Source:** release/s/sahaptin_umatilla/source/sahaptin_umatilla.kmn

This keyboard serves the Confederated Tribes of the Umatilla Indian Reservation in Oregon, supporting
the community's standardized alphabet for Umatilla Sahaptin as used in their dictionary and
language-program materials. It is the simplest keyboard in this set: each special letter or marked
cluster sits on one key, so a writer simply presses a single key (sometimes with Shift or Alt) to get
the character they want. For example the dedicated punctuation and bracket keys directly produce
letters like č, ł, š and ɨ (sahaptin_umatilla.kmn lines 27-35), Shift adds the ejective and back-velar
series such as k̓ʷ and x̣ʷ (lines 22-26), and the Alt layer reaches the capital barred-I, lambda-bar and
barred-L (lines 15-17). The distinctive decision is that several outputs are whole multi-character
clusters (a base letter already paired with its modifier, as in c̓ and x̣ at lines 22, 26), letting a
typist enter a complete sound with one keystroke rather than building it up. It is a clean,
purpose-built example: compact, community-authored with a clear copyright, and tightly matched to a
single well-defined alphabet.

## sil_yoruba_dot
- **Display name / downloads:** Yorùbá with Dot — 704/mo
- **Language(s) / script:** Yorùbá (Latin), West Africa, using the modern under-dot convention for ẹ, ọ, ṣ
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-07 diacritic cycle (+ S-04 parallel-store lookup, + S-02 deadkey for literal pass-through, + S-08 RAlt modifier-layer)
- **Axes:** A1=small · A2=alphabetic · A3=weak (bracket/brace accent keys) · A4=replacing-cycling (one tone mark replaces the previous) · A5=single (no orthography toggle — confirmed single-mode) · A6=none · A7=fully-booked (overloads q/v/x/z keys, recovered via RAlt and a dead key)
- **Quality:** clean
- **Source:** release/sil/sil_yoruba_dot/source/sil_yoruba_dot.kmn

This keyboard is for Yorùbá, a major language of Nigeria and West Africa whose orthography marks three
letters with an under-dot (ẹ, ọ, ṣ) and marks tone with accents over vowels. To make the dotted letters
effortless, the keyboard places them directly on the home keys: pressing "v" gives ẹ, "x" gives ọ and
"z" gives ṣ, and the digraph "gb" is mapped onto "q" (sil_yoruba_dot.kmn lines 103, 125-131). Tone is
added afterward with the bracket and brace keys for grave, acute, circumflex, caron and macron. The
distinctive decision is tone cycling: the rule tables are built so that pressing a different tone key
replaces the accent already on a vowel rather than stacking a second one, which matches how Yorùbá tone
actually works (lines 30-34, 222-239). Because the dotted letters occupy the normal q/v/x/z positions,
the design thoughtfully provides recovery paths: a backtick dead key (lines 86, 126) and a Right-Alt
layer (lines 199-211) restore the literal q, v, x and z. It is genuinely single-mode — there is no
orthography toggle — so it is the single-orthography member of the dotted/barred Yorùbá pair. It is a
clean example with an authored copyright and a worked typing example in its package metadata.

---

# Non-Latin-script keyboards

## sil_cameroon_azerty
- **Display name / downloads:** Cameroon AZERTY — 2,233/mo
- **Language(s) / script:** Latin script with the General Alphabet of Cameroonian Languages, on a French AZERTY base
- **Group:** AZERTY
- **Strategy:** S-08 RAlt modifier-layer (+ S-06 chained deadkeys, + S-02 deadkey composition, + S-04 parallel-store lookup, + S-10 constraints + beep)
- **Axes:** A1=medium · A2=alphabetic · A3=strong · A4=multi-family · A6=loud (beep) · A7=fully-booked
- **Quality:** clean (caveat: legacy NCAPS/CAPS rule pairs on the slash key, lines 264-267)
- **Source:** release/sil/sil_cameroon_azerty/source/sil_cameroon_azerty.kmn

This is the French-keyboard counterpart to Cameroon QWERTY, for the very large population of Cameroon
that learned typing on a French AZERTY layout. The base follows AZERTY conventions — A and Q are
swapped, Z and W are swapped, and the digit row produces French accented letters and symbols directly
(sil_cameroon_azerty.kmn lines 40-99, 101, 182). As with its sibling, the right-hand Alt key opens a
plane of African letters (lines 102-230), and special tone and accent marks sit on the bracket and
quote keys. Its most distinctive feature is a richer two-step "dead key" system inherited from French
typing: pressing a French accent key first, then a vowel, composes letters such as ã, ñ, ê or ä through
several paired lookup tables (lines 366-400), and an exclamation-mark prefix opens a large general
character menu. Invalid combinations beep (e.g. lines 43, 86, 233). It is well-built — proper cased
keys (line 11), populated copyright, named author and website — though it still carries a pair of older
explicit Caps-Lock-state rules on the slash key (lines 264-267) that modern keyboards usually handle
automatically, hence the minor caveat.

*(This keyboard is listed here, alongside its script peers, as the first of the scan's three AZERTY
examples; it is Latin-script and shares the General Alphabet of its QWERTY sibling above. The two
keyboards below — French Basic and Akebu — complete the AZERTY coverage.)*

## basic_kbdfr
- **Display name / downloads:** French Basic — release; download count not checked
- **Language(s) / script:** French and other Western European languages; Latin script on a French AZERTY base
- **Group:** AZERTY
- **Strategy:** S-01 simple swap (machine-imported base) + S-02 deadkey composition
- **Axes:** A1=small · A2=alphabetic · A3=weak · A4=stacking-combining (precomposed NFC via four dead keys) · A5=single · A6=none · A7=few
- **Quality:** clean (caveat: machine import from Windows KBDFR.DLL — complete and correct, but carries no authored design comment and ships a generated rather than hand-designed touch layout)
- **Source:** release/basic/basic_kbdfr/source/basic_kbdfr.kmn

French Basic is Keyman's direct import of the French national keyboard (Windows KBDFR.DLL), giving
French speakers a faithful AZERTY layout on any platform. It is one of the simplest keyboards in this
set: each key maps to a fixed character and the only compositional mechanism is four dead keys. The
defining AZERTY signature is present — the physical Q key types *a* and the physical A key types *q*
(basic_kbdfr.kmn lines 65, 114) — and on the unshifted digit row the French accented vowels appear
directly: à on [0], é on [2], è on [7], ç on [9] (lines 26, 33, 53, 61), with Shift recovering the
numerals and Right-Alt carrying the programming symbols (braces, brackets, backslash) French coders
need. The dead keys follow French convention exactly: the circumflex dead (K_LBRKT, line 171)
composes â/ê/î/ô/û; the diaeresis dead (Shift+K_LBRKT, line 172) composes ä/ë/ï/ö/ü; the tilde
(RALT+K_2, line 35) and grave (RALT+K_7, line 55) deads cover ã/ñ/õ and à/è/ì. All output is
precomposed NFC. It is a clean, functionally complete baseline AZERTY example; its only limitation as
a reference is that, being machine-generated, it contains no authored rationale and demonstrates only
the simplest strategy.

## sil_akebu
- **Display name / downloads:** Akebu — release; download count not checked
- **Language(s) / script:** Akebu (ISO 639-3 keu), a Kwa language of the Ghana–Togo border; Latin script with IPA-based extension letters, on a French AZERTY base
- **Group:** AZERTY
- **Strategy:** S-08 RAlt modifier-layer (+ S-01 base swap, + S-06 chained `!` deadkey prefix, + S-04 parallel-store lookup)
- **Axes:** A1=small · A2=alphabetic · A3=weak · A4=stacking-combining (combining marks typed after the letter) · A5=single · A6=soft (selective beep on listed impossible combinations) · A7=fully-booked
- **Quality:** clean (caveat: README copyright reads "SIL Cameroon" though the language is Akebu of Togo; one unresolved "??" comment at line 54; HISTORY.md is a single-entry stub)
- **Source:** release/sil/sil_akebu/source/sil_akebu.kmn

Akebu is a Kwa language of the Ghana–Togo border region whose SIL orthography needs a set of IPA-based
vowels and consonants alongside the standard French AZERTY base. The keyboard keeps the full AZERTY
layout intact — the A/Q swap (sil_akebu.kmn lines 101, 181), the French digit-row accents and the RALT
programming symbols all behave as a French typist expects — so nothing familiar is lost. The
language-specific letters live on the Right-Alt plane: RALT+Q gives ɛ (line 102), RALT+O gives ɔ (line
173), RALT+N gives ŋ (line 168), RALT+I gives ɩ, RALT+D gives ɖ, RALT+U gives ʊ, with Shift+RALT
supplying the capitals. For characters that do not fit that plane, the slash key becomes a "!" dead-key
prefix (line 261) and the next keystroke is looked up in a large parallel store (lines 326-328),
opening dozens more characters in two keystrokes — a mechanism the French welcome.htm explains for
users. Tone and accent marks (grave, acute, caron, circumflex) are typed after the letter and stack as
raw combining marks rather than precomposed forms, which suits the language's tone-marking but means
downstream text must tolerate NFD sequences. It is a clean, well-built AZERTY example for a minority
African language.

## gff_amharic
- **Display name / downloads:** GFF Amharic — 5,362/mo
- **Language(s) / script:** Amharic (አማርኛ) in the Ethiopic / Geʾez (Fidel) syllabary, plus Ethiopic numerals and punctuation
- **Group:** Non-Roman (syllabary / abugida)
- **Strategy:** S-05 mnemonic spelling / transliteration (+ S-03 sequence replace for vowel/labiovelar chaining, + S-04 parallel-store lookup, + S-02 deadkey for the geʾez-vowel ambiguity)
- **Axes:** A1=large (full Fidel grid, hundreds of syllables) · A2=syllabary · A2a=yes (the second key's output depends on the consonant already on screen) · A3=strong (type the Latin sound) · A4=none (whole-syllable replacement, not combining marks) · A5=single · A6=soft (one beep guard on huge numerals, line 442) · A7=fully-booked
- **Quality:** clean
- **Source:** release/gff/gff_amharic/source/gff_amharic.kmn

This keyboard serves the Amharic-speaking community of Ethiopia, the country's working language,
written in the Ethiopic Fidel — a syllabary where each character bundles a consonant with one of seven
vowels. A typist works phonetically: they tap the consonant's Latin sound and then the vowel, and the
matching Ethiopic syllable appears. Typing "h" gives the base syllable ህ, and following it with "e",
"u", "i", "a" or "o" reshapes it into the correct vowel form (gff_amharic.kmn lines 336-342). The
keyboard keeps large parallel tables — one row per vowel column of the Fidel grid (lines 37-43) — and
swaps the on-screen syllable for its sibling when the next vowel is pressed. Its most distinctive design
choice is that almost every rule is context-sensitive: what you get depends on the syllable already
showing, which lets a handful of keys reach the entire grid, including labiovelars and Ethiopic numerals
(lines 430-457). It is a clean, mature example — proper copyright and author, Caps locked off, and
extensive touch-layout support. Note that Ethiopic is explicitly out of scope for v1 of the studio (a
v1.1 target, per spec §9), so it is documented here only as a corpus reference.

## sil_ethiopic_power_g
- **Display name / downloads:** SIL Ethiopic Power-G — 4,432/mo
- **Language(s) / script:** Ethiopic Saba Fidel covering many languages of Ethiopia (Amharic, Geez, Tigre, Bench, Dizin, Gumuz, Konso, Suri and more), using the familiar "Power Geʾez" phonetic sequences
- **Group:** Non-Roman (syllabary / abugida)
- **Strategy:** S-05 mnemonic spelling / transliteration (+ S-03 sequence replace for vowel reshaping, + S-04 parallel-store lookup, + S-02 deadkey to block unused capitals)
- **Axes:** A1=large (the full Fidel set across many languages) · A2=syllabary · A2a=yes (vowel key reshapes the preceding consonant) · A3=strong (romanized sound) · A4=stacking-combining (a separate combining-mark layer, lines 167-168, 259) · A5=single · A6=none · A7=fully-booked
- **Quality:** clean
- **Source:** release/sil/sil_ethiopic_power_g/source/sil_ethiopic_power_g.kmn

This keyboard is aimed at the many language communities of Ethiopia that share the Ethiopic Saba Fidel
script, from Amharic and Geez to smaller languages like Bench, Dizin and Suri. It deliberately mirrors
the keystroke habits of the long-popular commercial "Power Geʾez" phonetic keyboard, so existing typists
can switch without relearning. Day to day a user types the Latin sound of a consonant and then a vowel
letter: pressing a consonant produces its base form, and a following "u", "i", "a", "y", "e" or "o"
rewrites it into the matching vowel column (sil_ethiopic_power_g.kmn lines 233-239). The standout design
decision is how the whole script is laid out as seven parallel vowel tables plus extra diphthong and
"eighth-form" tables (lines 31-159), so one phonetic rule per vowel reaches every language's letters at
once; a dot-key even opens a dedicated diacritics layer (lines 259, 167-168). It is a clean reference —
clear copyright and SIL Ethiopia authorship, web and desktop targets, and unused capital keys safely
absorbed (lines 195-197). As with all Ethiopic, this script is out of scope for v1 of the studio (a
v1.1 target, per spec §9) and appears here only as corpus documentation.

## pak_urdu_phonetic
- **Display name / downloads:** Pak Urdu Phonetic — 2,415/mo
- **Language(s) / script:** Urdu in the Arabic (Nastaʿliq/Naskh) script, right-to-left, as used in Pakistan
- **Group:** Non-Roman (abjad)
- **Strategy:** S-01 simple swap (+ S-08 RAlt modifier-layer for the extra diacritics, honorific phrases and Eastern Arabic digits)
- **Axes:** A1=medium (one full Urdu letter set plus marks and digits) · A2=abjad · A2a=no (no context rules; each keystroke emits its character independently) · A3=weak (fixed key positions) · A4=none at the engine level (marks placed as standalone characters) · A5=single · A6=none · A7=fully-booked (base, Shift, RAlt and Shift+RAlt layers all populated)
- **Quality:** clean
- **Source:** release/p/pak_urdu_phonetic/source/pak_urdu_phonetic.kmn

This keyboard serves Urdu writers in Pakistan, where Urdu is the national language written in a flowing
right-to-left Arabic script. It is a faithful cross-platform port of the widely used "Pak Urdu
Installer" layout, so typists who already know that arrangement keep their muscle memory. Usage is
direct and positional: each physical key is mapped to a fixed Urdu letter, and holding Shift or the
right-Alt key reaches a second or third character on the same key — for example the right-Alt layer
carries the Eastern Arabic digits and a set of Quranic annotation marks (pak_urdu_phonetic.kmn lines
26-65, 102-104). A nice touch is that a few keys output entire honorific phrases in one stroke, such as
the blessing typed on Shift+right-Alt of the "E", "L" and "R" keys (lines 85, 113, 142). The one
defining design decision is the explicit right-to-left flag that tells the system to lay text out
correctly for Arabic script (line 9). It is a clean example: right-to-left handling declared, proper
copyright with a named author, every modifier layer deliberately filled, and a display map supplied for
the on-screen keyboard.

## sil_myanmar_my3
- **Display name / downloads:** Myanmar3 (SIL) — 1,914/mo
- **Language(s) / script:** Burmese (Myanmar) in the Myanmar script, a Brahmic abugida
- **Group:** Non-Roman (abugida)
- **Strategy:** S-09 context-sensitive cluster formation (+ S-04 parallel-store lookup, + S-03 sequence reordering via a zero-width filler, with backspace-aware unwinding)
- **Axes:** A1=medium (the Burmese consonant, medial, vowel and tone set) · A2=abugida · A2a=yes (the e-vowel is buffered and re-emitted after the consonant) · A3=weak (key positions follow the legacy Myanmar3 layout) · A4=stacking-combining (medials, vowel signs and the virama stack onto the base) · A5=single · A6=soft (silent reordering, no beep) · A7=fully-booked
- **Quality:** clean
- **Source:** release/sil/sil_myanmar_my3/source/sil_myanmar_my3.kmn

This keyboard serves Burmese speakers in Myanmar, writing the rounded Myanmar script, and follows the
well-known Myanmar3 layout originally created by Myanmar NLP. Burmese stacks vowel signs, medial
consonants and tone marks around a base letter, and the typed order does not always match the stored
Unicode order. The keyboard's defining design decision is how it handles the front vowel "e": when typed
it is buffered behind an invisible placeholder, and once the following consonant arrives the two are
silently swapped into correct storage order (sil_myanmar_my3.kmn lines 108-111, with backspace rules at
162-167 that cleanly unwind the buffer). For the typist this is invisible — they type in the natural
visual sequence and the engine arranges the underlying characters correctly. A second distinctive layer
is the rich set of context rules that combine medials in the right order, for instance when "w"/"h"
medials precede a "y" or "r" medial (lines 142-158). It is a clean example: copyright present, Caps
locked off, a touch layout supplied, and deprecated older Burmese packages explicitly superseded.

## thamizha_tamil99_ext
- **Display name / downloads:** Thamizha Tamil99 — 1,681/mo
- **Language(s) / script:** Tamil in the Tamil script (a Brahmic abugida), the Tamil99 standard approved by Tamil Nadu, plus Grantha letters and Tamil symbols
- **Group:** Non-Roman (abugida)
- **Strategy:** S-09 context-sensitive cluster formation (+ S-04 parallel-store lookup, + S-03 sequence replace for consonant doubling, + S-02 deadkey for vowel-sign reveal)
- **Axes:** A1=medium (Tamil consonants, vowels, Grantha letters and symbols) · A2=abugida · A2a=yes (a consonant on screen reshapes when the next vowel or consonant is typed) · A3=weak (Tamil99 layout: vowels on the left, consonants on the right) · A4=stacking-combining (consonant + virama, consonant + vowel sign) · A5=single · A6=none · A7=fully-booked
- **Quality:** clean
- **Source:** release/t/thamizha_tamil99_ext/source/thamizha_tamil99_ext.kmn

This keyboard serves Tamil speakers in Tamil Nadu and the wider Tamil diaspora, using the official
Tamil99 standard layout. Tamil writing is consonant-and-vowel based: a bare consonant carries an
inherent "a", and other vowels are written as signs attached to it. In daily use the typist presses a
consonant key, then a vowel key, and the engine forms the combined letter — pressing a consonant then a
vowel produces the consonant with the matching vowel sign (thamizha_tamil99_ext.kmn lines 105-106),
while a separate key adds the dot (puḷḷi) that strips the vowel (line 101). The most distinctive design
decision is the "auto-puḷḷi" feature: pressing a consonant key twice automatically inserts the virama
between the two, so common doubled clusters form with a natural repeated keystroke, and pressing again
cycles back (lines 112-164). It also models linguistically meaningful soft/hard consonant pairs the same
way (lines 203-214). It is a clean, well-documented example: named authors, a Tamil-and-English keyboard
name, a caret dead key that reveals raw vowel signs for teaching (lines 221-234), and full Grantha and
Tamil-symbol coverage.

## remington_gail
- **Display name / downloads:** Remington GAIL (SIL) — 1,668/mo
- **Language(s) / script:** Hindi (and other Devanagari-script languages), Devanagari abugida, emulating the legacy Remington-GAIL mechanical typewriter layout
- **Group:** Non-Roman (abugida)
- **Strategy:** S-03 sequence replace (+ S-04 parallel-store lookup, + S-08 RAlt modifier-layer)
- **Axes:** A1=large · A2=abugida · A2a=yes (output depends on prior character) · A3=weak (fixed typewriter layout) · A4=stacking-combining · A5=single · A6=none · A7=RAlt only
- **Quality:** clean
- **Source:** release/r/remington_gail/source/remington_gail.kmn

This keyboard serves Hindi typists in India who learned to type on the old Remington-GAIL mechanical
typewriter and want their muscle memory to carry over to Unicode Devanagari. The key positions do not
follow the sound of letters; instead they reproduce the fixed positions of the typewriter, so a typist
reaches for the same physical keys they always have. In daily use, pressing a key emits a consonant or
vowel sign, and the keyboard quietly rewrites what is already on screen as you continue: for example,
typing certain follow-on keys converts a short vowel into its long form or builds a conjunct, and a
dedicated key adds the joining mark that stacks two consonants (remington_gail.kmn lines 88-99, 66-69).
The one distinctive decision is its faithfulness to the typewriter while bolting a whole second layer of
modern characters and ligatures onto the Right-Alt key (lines 117-193), bridging an old layout to
today's full character set. It is a clean example: it declares a proper copyright with author, a real
version, and organizes its many mappings into readable lookup tables (lines 3-6, 22-52).

## fv_plains_cree
- **Display name / downloads:** ᓀᐦᐃᔭᐍᐏᐣ (Plains Cree) — 774/mo
- **Language(s) / script:** Plains Cree (nêhiyawêwin, Y-dialect), Canadian Aboriginal Syllabics
- **Group:** Non-Roman (syllabary)
- **Strategy:** S-09 context-sensitive cluster formation (+ S-05 mnemonic transliteration, + S-08 RAlt modifier-layer)
- **Axes:** A1=large · A2=syllabary · A3=strong (type the romanized sound) · A4=replacing-cycling (vowel rotates the glyph) · A5=single · A6=none · A7=RAlt only
- **Quality:** clean
- **Source:** release/fv/fv_plains_cree/source/fv_plains_cree.kmn

This keyboard is for the Plains Cree community of the Canadian Prairies, part of the FirstVoices family
of Indigenous-language keyboards. Cree syllabics work by orientation: a single consonant symbol rotates
or flips to show which vowel follows it, so the typist spells phonetically and the keyboard chooses the
correctly oriented character based on what was just typed. A person types a consonant and then a vowel,
and the keyboard replaces the bare consonant with the proper rotated syllable; typing the vowel again
lengthens it, and backspace steps back down the chain (fv_plains_cree.kmn lines 92-96, 64). The
distinctive decision is handling the "w" series and long vowels as live transformations of the preceding
glyph rather than separate keys (lines 86-90), keeping the layout small and intuitive. It also
thoughtfully tucks plain English letters and punctuation onto the Right-Alt layer and blocks stray Latin
letters from leaking through (lines 198-209). It is a clean example: a dated multi-party copyright, a
real version, and an orderly bank of syllabic tables (lines 1-7, 15-60).

## jawa
- **Display name / downloads:** Nulisa Aksara Jawa — 739/mo
- **Language(s) / script:** Javanese and related Indonesian languages (Sundanese, Madurese, Sasak, Kawi, etc.), Javanese script (Aksara Jawa) abugida
- **Group:** Non-Roman (abugida)
- **Strategy:** S-09 context-sensitive cluster formation (+ S-05 mnemonic transliteration, + S-04 parallel-store lookup, + S-10 constraints + beep)
- **Axes:** A1=large · A2=abugida · A2a=yes (heavy prior-context dependence) · A3=strong (type the romanization) · A4=stacking-combining · A5=single (a Sundanese option toggle is present but commented out) · A6=loud (beep) · A7=many
- **Quality:** clean
- **Source:** release/j/jawa/source/jawa.kmn

This keyboard, by Benny Lin, lets people write Javanese script by simply typing the sounds in the Latin
alphabet, and it serves a wide circle of Indonesian languages that share the script. The promise is that
every Latin keypress yields a Javanese letter or stack without memorizing arbitrary key positions, so a
typist spells a word phonetically and the keyboard assembles the correct conjuncts, vowel signs and
stacked consonants as it reads what came before (jawa.kmn lines 243-254, 322-344). The one distinctive
decision is how aggressively it tracks context to model real Javanese spelling rules, including inserting
an invisible separator to avoid illegal triple-stacks and reshaping vowel sequences like "ia" into "iya"
(lines 232-237, 277-282). It also actively guards correctness: invalid combinations trigger an audible
beep rather than producing malformed text (lines 421-426). It is a clean example: it carries a proper
copyright with named author, a real version, richly documented stores, and worked keying examples in its
package metadata (lines 7-11).

## saraiki
- **Display name / downloads:** Saraiki — 760/mo
- **Language(s) / script:** Saraiki (Pakistan), Arabic script, right-to-left
- **Group:** Non-Roman (abjad)
- **Strategy:** S-01 simple swap (+ S-08 modifier-layer via Shift and Ctrl+Alt)
- **Axes:** A1=medium · A2=abjad · A2a=no (each key emits a fixed character; no prior-context rules) · A3=weak (fixed national/phonetic key layout) · A4=none (combining marks are themselves keyed, not auto-applied) · A5=single · A6=none · A7=fully-booked
- **Quality:** clean
- **Source:** release/s/saraiki/source/saraiki.kmn

This keyboard serves the Saraiki-speaking community of Pakistan, who write in an extended Arabic script.
It is deliberately straightforward: each physical key maps to exactly one Arabic letter or mark, with
the Shift layer and a Right-Ctrl+Right-Alt layer providing additional letters and Quranic/honorific
symbols, so a typist who knows the layout simply presses keys to lay down right-to-left text (saraiki.kmn
lines 71-117, 16-70). There is no behind-the-scenes recombination — even vowel and diacritic marks are
placed by their own keys rather than being auto-attached to a preceding consonant. The one distinctive
decision is the explicit right-to-left declaration plus the use of a shared Arabic keyboard display map
so the on-screen keyboard renders correctly for the script (lines 9, 11). It is a clean example: it names
its author with a working contact, declares right-to-left handling and a display map, and carries a real
version (lines 3-11). No rough signals such as leftover caps artifacts or a malformed copyright were
found.

## basic_kbdkni
- **Display name / downloads:** Khmer (NIDA) Basic — 1,072/mo
- **Language(s) / script:** Central Khmer (Cambodia), Khmer abugida; auto-generated from the Windows 10 NIDA standard layout
- **Group:** Non-Roman (abugida)
- **Strategy:** S-03 sequence replace (machine import; direct key-to-codepoint mapping with a handful of multi-character outputs — effectively S-01-style direct mapping at larger scale)
- **Axes:** A1=large · A2=abugida · A2a=no (no prior-context rules; each key emits fixed code point(s)) · A3=weak (fixed NIDA national layout) · A4=none (subscript joiner and vowels are keyed directly, not auto-stacked) · A5=single · A6=none · A7=RAlt only (full base, Shift and RAlt layers used)
- **Quality:** clean (caveat: minimal machine import — its own package notes recommend the smarter Khmer Angkor keyboard for error correction)
- **Source:** release/basic/basic_kbdkni/source/basic_kbdkni.kmn

This keyboard provides Khmer typing for Cambodian users following the official NIDA national layout,
produced automatically by importing the Windows 10 Khmer keyboard. In daily use it behaves exactly like
the familiar government-standard layout: each key, plus its Shift and Right-Alt variants, emits a fixed
Khmer letter, vowel or sign, and a few keys output two code points at once (for example the combined
vowel-plus-sign on Shift+A), but nothing is reshaped based on what came before (basic_kbdkni.kmn lines
67-68, 96, 158-159). The one distinctive characteristic is that this is a faithful, mechanical mirror of
the Windows layout rather than a hand-crafted design, which is why it makes no attempt to correct common
keying mistakes. The honest caveat is that, being a minimal machine import, its own package notes steer
users toward the smarter Khmer Angkor keyboard, which auto-corrects errors. Technically it is still tidy
— proper copyright, real version and a Khmer display map (lines 16-18).

---

# Known-rough keyboards

These four keyboards are approved as negative-fixture references for the keyboard-lint validator
(`@keymanapp/keyboard-lint`). Each is Layer-A valid — the keyboard compiles and runs correctly —
but carries one or more hygiene flags that the linter's Layer-C checks should catch and FAIL.
They come from `keymanapp/keyboards experimental/` and were detected with `content/tools/scan_hygiene.py`,
which encodes the green-band (deterministic) checks of [criteria.md](../docs/criteria.md); flag
strings below are quoted verbatim from `content/hygiene_report.csv`.

The lint fixtures themselves are deferred until `@keymanapp/keyboard-lint` is scaffolded (the package
does not yet exist). When it is, each fixture's `criterionId` must match the criteria catalog exactly
(e.g. `3.6`, `4.5`, `5.2`, `6`/`6.1-readme-htm-exists`, `7.2`), one finding per tripped criterion.

## elfdalian
- **Display name / downloads:** Övdalsk — experimental; no keyman.com download count
- **Language(s) / script:** Elfdalian (Övdalsk), a conservative North Germanic variety spoken in Älvdalen, Dalarna, Sweden; Latin script with a large inventory of ogonek and ring-ogonek letters (ą, ą̊, ę, į, ų and capitals) plus eth (Đ)
- **Group:** QWERTY/QWERTZ
- **Strategy:** S-08 Alt modifier-layer (+ S-01 simple swap on the remapped bracket key)
- **Axes:** A1=small · A2=alphabetic · A3=weak (positional Alt-layer) · A4=none (precomposed output) · A6=none · A7=Alt layer only
- **Quality:** rough
- **Rough:** 3.6 — HISTORY.md top version '1.05' != .kmn version '1.0.5'
- **Rough:** 4.5 — LICENSE.md has no well-formed copyright line
- **Rough:** 5.2 — version string 'Version 1.05' embedded in README.md
- **Rough:** 7.2 — targets lists `mobile` alongside `any`
- **Scan flag:** green · `HISTORY.md top version '1.05' != .kmn version '1.0.5'`
- **Scan flag:** green · `LICENSE.md has no well-formed 'Copyright © <year> <holder>' line`
- **Scan flag:** green · `version number embedded in user-facing README.md ('Version 1.05')`
- **Scan flag:** green · `targets lists platforms alongside 'any': 'any mobile'`
- **Lint expectation:** FAIL `3.6`, `4.5`, `5.2`, `7.2`
- **Source:** experimental/e/elfdalian/source/elfdalian.kmn

Elfdalian is a highly archaic North Germanic variety spoken by a few thousand people in the Älvdalen
municipality of Dalarna, Sweden. Its orthography preserves vowels and consonants lost from standard
Swedish, including several ogonek letters, a ring-ogonek (ą̊) and the eth (Đ). The keyboard maps these
special letters onto Alt-modified positions of an otherwise standard QWERTY layout (elfdalian.kmn
lines 27-40), and reassigns the bracket key to produce å directly. Because each key emits a single
precomposed character, the design is effectively a positional swap reached through an Alt plane — close
to S-01 in spirit, layered via S-08. The header records that it began as a Google Input Tools
conversion (line 1). It is a perfectly usable keyboard, but it shows four independent hygiene problems
at once, which makes it the richest single negative fixture: the changelog version '1.05' is written
differently from the source's '1.0.5'; the licence file lacks the exact `Copyright © <year> <holder>`
line; the README repeats the version number; and the targets line says `any mobile`, where `any`
already covers mobile.

## gff_geez_emufi
- **Display name / downloads:** Geʾez EMUFI — experimental; no keyman.com download count
- **Language(s) / script:** Geʾez (Classical Ethiopic, ISO 639-2 gez) in the Ethiopic Fidel syllabary; companion to the EMUFI "Geʾez Manuscript Zemen" font, which carries manuscript letter-forms not yet in Unicode
- **Group:** Non-Roman (syllabary / abugida)
- **Strategy:** S-05 mnemonic transliteration (+ S-03 sequence replace for consonant+vowel reshaping)
- **Axes:** A1=large · A2=syllabary · A2a=yes · A3=strong (phonetic Latin input) · A4=none · A5=single · A6=none · A7=fully-booked
- **Quality:** rough
- **Rough:** 4.5 — LICENSE.md has no well-formed copyright line
- **Rough:** 5.2 — version 'Version 1.0' in README.md *and* 'v1.2' in source/welcome.htm (two-source inconsistency)
- **Rough:** 6 — readme.htm missing from source/
- **Scan flag:** green · `LICENSE.md has no well-formed 'Copyright © <year> <holder>' line`
- **Scan flag:** green · `version number embedded in user-facing README.md ('Version 1.0')`
- **Scan flag:** green · `version number embedded in user-facing source/welcome.htm ('v1.2')`
- **Scan flag:** green · `readme.htm missing from source/ (shown on package install)`
- **Lint expectation:** FAIL `4.5`, `5.2` (×2 — README and welcome.htm), `6`
- **Source:** experimental/gff/gff_geez_emufi/source/gff_geez_emufi.kmn

Geʾez is the classical liturgical language of the Ethiopian and Eritrean Orthodox Tewahedo churches,
written in the Ethiopic Fidel syllabary shared with Amharic and Tigrinya. This keyboard accompanies the
EMUFI manuscript-font project, which supplies punctuation, numeral forms and letter variants found in
manuscripts but not yet standardised in Unicode. Input follows the standard Geʾez Frontier Foundation
mnemonic convention: the typist enters a consonant's Latin sound followed by a vowel, and the keyboard
replaces the pair with the correct Ethiopic syllable. Because the target font uses some Private Use Area
codepoints for manuscript-only forms, the keyboard belongs in `experimental/`. Its roughness is mostly
documentary: the licence file lacks the exact copyright line, and the version number is stated in two
user-facing places that disagree — the README says 'Version 1.0' while welcome.htm says 'v1.2'. It is
also missing `source/readme.htm`, so the package-install splash would be blank.

## wancho
- **Display name / downloads:** Wancho — experimental; no keyman.com download count
- **Language(s) / script:** Wancho, a Tibeto-Burman language of Arunachal Pradesh and Nagaland, NE India; Wancho script (Unicode U+1E2C0–U+1E2FF, added in Unicode 12.0)
- **Group:** Non-Roman (alphabetic, direct map)
- **Strategy:** S-01 simple swap (one Wancho character per key, no context rules)
- **Axes:** A1=small · A2=alphabetic · A3=weak (positional map) · A4=none · A6=none · A7=fully-booked
- **Quality:** rough
- **Rough:** 4.5 — LICENSE.md has no well-formed copyright line
- **Rough:** 5.2 — version string 'Version 1.0' embedded in README.md
- **Scan flag:** green · `LICENSE.md has no well-formed 'Copyright © <year> <holder>' line`
- **Scan flag:** green · `version number embedded in user-facing README.md ('Version 1.0')`
- **Lint expectation:** FAIL `4.5`, `5.2`
- **Source:** experimental/w/wancho/source/wancho.kmn

Wancho is spoken by roughly fifty thousand people in the hill districts of Arunachal Pradesh and
Nagaland in northeast India. Its script was devised by community scholar Banwang Losu and added to
Unicode in version 12.0 (2019). The keyboard is a straightforward direct mapping — each physical key
produces a fixed Wancho letter, digit or punctuation mark, with Shift giving variant forms — so it is
pure S-01 with no context rules or dead keys. That simplicity makes it a clean negative fixture for
file-level hygiene without any engine-complexity noise. Two issues are present: the licence file lacks
the required `Copyright © <year> <holder>` line, and the README embeds the version string 'Version
1.0'. The `.kmn` copyright store reads `© 2020 Banwang Losu` — the symbol is there but the literal word
"Copyright" is absent, exactly the pattern the 4.5 check targets.

## alkelang
- **Display name / downloads:** Àlkèláŋg — experimental; no keyman.com download count
- **Language(s) / script:** Bafut (bfd) and related Cameroonian Grassfields languages; Latin script with IPA extensions (ɓ, ɗ, ɛ, ɔ, ŋ and others) for tone-language phonetics
- **Group:** QWERTY/QWERTZ (mobile-first; the header calls it an AZERTY mobile/tablet layout, but the `.kmn` is a touch-layout keyboard with no hardware base rules)
- **Strategy:** S-08 modifier/layer (touch layers: default, shift, numeric, IPA) with an S-10 layer-state PostKeystroke group
- **Axes:** A1=small · A2=alphabetic · A3=strong (phonetic IPA layer) · A4=none · A5=multi (numeric + IPA layers) · A6=soft · A7=fully-booked (touch layers)
- **Quality:** rough
- **Rough:** 4.5 — LICENSE.md has no well-formed copyright line
- **Rough:** 5.2 — version string 'Version : 1.0' embedded in README.md
- **Rough:** 6 — readme.htm missing from source/
- **Scan flag:** green · `LICENSE.md has no well-formed 'Copyright © <year> <holder>' line`
- **Scan flag:** green · `version number embedded in user-facing README.md ('Version : 1.0')`
- **Scan flag:** green · `readme.htm missing from source/ (shown on package install)`
- **Lint expectation:** FAIL `4.5`, `5.2`, `6`
- **Source:** experimental/a/alkelang/source/alkelang.kmn

Àlkèláŋg is a touch-first keyboard for Bafut, a Grassfields Bantu language of the North West Region of
Cameroon, and related languages of the same area. The `.kmn` header describes it as an "AZERTY mobile
et tablet" layout with suggestions, authored by SOSA Developments under the MIT licence. In practice it
is primarily a touch keyboard: it provides a full IPA extension layer reached by a dedicated layer key,
giving typists the phonetic letters (ɓ, ɗ, ɛ, ɔ, ŋ and others) that the General Alphabet of Cameroonian
Languages requires (alkelang.kmn stores `ipa_keys` / `ipa_shift_keys`), and a PostKeystroke group keeps
the keyboard on the correct layer after each keypress. As the second Latin-script keyboard in the rough
set it complements elfdalian. Three documentary issues are present: the licence holder is written
`(C) NIBANN ENGINEERING` with no `©` and no year; the README embeds 'Version : 1.0'; and
`source/readme.htm` is missing.

## clavbur9
- **Display name / downloads:** Clavier du Burkina — release; download count not checked
- **Language(s) / script:** Languages of Burkina Faso (Mooré, Dioula, Fulfuldé, Gulmancema and others); Latin script with a large IPA extension inventory
- **Group:** AZERTY (mnemonic / layout-agnostic — see note)
- **Strategy:** S-02 deadkey composition (+ S-04 parallel-store prefix lookup, + S-11 schwa-choice toggle, + S-10 mark-ordering constraints + beep)
- **Axes:** A1=large · A2=alphabetic · A3=weak (mnemonic) · A4=multi-family (stacking combining marks) · A5=multi (schwa-convention toggle) · A6=soft (beep) · A7=fully-booked
- **Quality:** rough — and notably a `release/` keyboard, showing hygiene issues are not confined to `experimental/`
- **Rough:** 1.11 — committed `.kpj.user` developer-state file
- **Rough:** 1.12 — committed `build/` outputs in the source tree
- **Rough:** 4.5 — LICENSE.md has no well-formed `Copyright © <year> <holder>` line
- **Scan flag:** green · `committed user-state file: clavbur9.kpj.user`
- **Scan flag:** green · `compiled/build output in source tree: build/clavbur9.js; build/clavbur9.kmx; build/clavbur9.kvk`
- **Scan flag:** green · `LICENSE.md has no well-formed 'Copyright © <year> <holder>' line`
- **Lint expectation:** FAIL `1.11`, `1.12`, `4.5`
- **Source:** release/c/clavbur9/source/clavbur9.kmn

Clavier du Burkina is a mature, much-revised keyboard (nine version generations) serving the many
language communities of Burkina Faso, whose languages share a common extended-Latin alphabet from the
Africanist phonetic tradition. Its defining design choice is the mnemonic-layout declaration
(clavbur9.kmn line 8, `store(&mnemoniclayout) '1'`): rather than hard-coding AZERTY scancodes, it
follows whatever character is printed on each physical key, so the one file works on French AZERTY and
US QWERTY machines alike — its own README says "AZERTY or QWERTY," and it is bucketed here as AZERTY
because its primary audience and French-language welcome page assume an AZERTY keyboard. Special
letters are reached through two prefix systems: the semicolon prefix (lines 87-91) reaches IPA letters
(ɓ, ɗ, ɛ, ɔ, ŋ, ʃ, ʋ, ʒ …) and the comma prefix (lines 92-93) reaches rarer ones; diacritics are typed
after the base letter and a 13-mark system stacks under an ordering group (lines 120-126), including
the mid-level tone marks Gulmancema needs. A schwa-choice toggle (line 41) lets a community pick
between the reversed-E and open-E conventions. The keyboard logic is rich and well-commented, but the
repository state is not clean: it commits binary build outputs (`build/clavbur9.js`, `.kmx`, `.kvk`)
and a developer-local `clavbur9.kpj.user`, and its LICENSE.md lacks a well-formed copyright line — the
kind of green-band issues the linter is meant to catch even on a long-published release keyboard.
