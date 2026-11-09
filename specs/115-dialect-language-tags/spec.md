# Feature Specification: Language tags that describe dialects and variants

**Feature Branch**: `115-dialect-language-tags`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Language tags that describe dialects and variants. Today the studio composes only language + script + region; it cannot express a dialect. Dialect-aware language search over langtags and Glottolog; picking a dialect sets the parent language and proposes a variant or private-use subtag; emit the minimal tag, naming only what is not a default; validation parity with Keyman's package compiler; fix the existing tag-handling defects."

**Builds on**: spec 030 (langtags identity autocomplete, region step) and spec 068 (langtags defaults, `/review` tag rows), both shipped; their AS-BUILT files and the code are the authority for what exists today. Spec 036 (Glottolog catalog) supplies the dialect data.

**Adopts**: SIL's shared language chooser from [sillsdev/EthnoLib](https://github.com/sillsdev/EthnoLib), as used by Bloom (owner ruling 2026-11-09). Its search backend (`@ethnolib/find-language`) replaces the studio's language-name search, and its chooser component is adapted to the studio's React and design, without MUI.

**Governing authority** (Constitution v2 precedence): survey surface and ordering, Article IX; proposals and confirmation, Article X; done means reachable, Article XI. The tag rules follow BCP 47 (RFC 5646) and the SIL langtags data pinned in `scripts/langtags-version.json`.

## Why

- **A dialect cannot be expressed.** The studio builds a tag from language, script and region only. The one exception is the IPA variant `fonipa`. An author writing for Gascon, Valencian or Rabinal Achí gets the bare parent language tag, and nothing records which dialect the keyboard is for.
- **Dialect names are hard to find.** Glottolog lists 13,706 dialects, and 13,392 of them belong to a language with an ISO 639-3 code. Searching each of those names in today's language search returns the right parent language for only 931 (7%).
- **Search hides why it matched.** Typing "Valencian" shows "Catalan" with no explanation, so the author may think the search failed.
- **BCP 47 offers three places for a dialect, and the data says which ones matter:**

  | Where the dialect goes | Example | Count in pinned langtags |
  |---|---|---|
  | Its own ISO 639-3 language code | Gheg → `aln`; `hy-arevmda` → `hyw` | the usual case |
  | A variant registered with IANA | `ca-valencia`, `sl-rozaj` | 2 tagsets |
  | A private-use (`-x-`) subtag | `acr-x-rabinal`, `abt-x-maprik` | 227 tagsets |

- **Existing tag handling has defects, whatever this feature decides:**
  - script detection reads a four-letter subtag after `-x-` or `-u-` as a script, so `en-u-co-phon` reports script "Phon";
  - the LDML export strips everything from `-x-` or `-u-` onward;
  - the langtags codegen groups entries by region, so variant entries such as `ca-valencia` vanish, and it drops the `variants` and `windows` fields;
  - Open mode accepts language tags as free text with no validation.
- **Keyman's compiler already checks tags.** Keyman's package compiler reports an invalid tag as an error and a tag that is not minimal as a hint (`kmc-package`, `ERROR_LanguageTagIsNotValid` and `HINT_LanguageTagIsNotMinimal`). The studio should flag the same things before the author leaves the studio.
- **Evidence that this is rare today, but blocked rather than unwanted:** the keyboards corpus has 4,691 `.kps` language IDs; 156 carry a region, none carries a variant or a `-x-` subtag.

## Vocabulary

- **Language tag**: a BCP 47 tag, e.g. `oc-gascon`.
- **Default**: the script or region langtags lists for a tagset. A subtag equal to the default is implied and left out.
- **Minimal tag**: the tag naming only what is not a default, in BCP 47 subtag order (language, script, region, variants, private use). For any tag in langtags this is the tagset's `tag` field.
- **Dialect**: a named variety of a language. In this spec, a name that langtags gives a variant or `-x-` tagset, or that Glottolog classifies at the `dialect` level.
- **Parent language**: the ISO 639-coded language a dialect belongs to.
- **Dialect subtag**: the part of the tag that names the dialect: a registered variant (`gascon`) or a private-use subtag (`-x-rabinal`).
- **Copy**, **Open**: the two workflow paths, as in spec 111.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a language by a dialect name (Priority: P1)

An author types the name of the dialect they write, not the name of its parent language. The language search finds it, shows which language it belongs to and why it matched, and picking it sets the language. The search is SIL's shared language chooser (the one Bloom uses), extended with Glottolog dialect names.

**Why this priority**: today 93% of Glottolog dialect names lead nowhere. It is the entry point for every other story, and it is valuable alone: even without a dialect subtag, the author reaches the right language.

**Independent Test**: on the language step, search "Sursilvan", "Maprik", "Rabinal", "Gascon" and "Valencian". Each returns its parent language (Romansh, Ambulas, Achi, Occitan, Catalan) with a line naming the matched dialect. Picking it sets the language code. Searching "Cameroon" lists languages of Cameroon; searching "Bafutt" (a typo) still finds Bafut.

**Acceptance Scenarios**:

1. **Given** the language search, **When** the author types a Glottolog dialect name whose parent has an ISO code, **Then** the parent language appears in the results with the matched dialect name shown, e.g. "Gascon: a dialect of Occitan (oc)".
2. **Given** a name that is a language with its own ISO code (Gheg, Cajun French, Swiss German), **When** the author searches it, **Then** that language ranks first, ahead of any language that lists the name as a dialect.
3. **Given** a dialect name shared by dialects of different languages, **When** the author searches it, **Then** every parent language is listed, each with its country or countries.
4. **Given** a query that exactly matches one name and is a prefix of others ("Hakka", "Hakkari"), **When** results are shown, **Then** the exact match ranks first.
5. **Given** a query naming a country or a language code, **When** results are shown, **Then** languages of that country, or the language with that code, are listed.
6. **Given** a query with a small spelling error, **When** no closer match exists, **Then** the intended language is offered as a close match.
7. **Given** the author types "Ewondo" and does not click, **When** focus leaves the field, **Then** Ewondo is resolved and its code, script and autonym are proposed, as today (FR-038).
8. **Given** the author types a dialect and its language together, in either order and with or without punctuation ("Gascon Occitan", "Occitan - Gascon", "Ewondo (Yabekolo)", "Rabinal Achi", "Bafut Royal"), **When** results are shown, **Then** the first result is the language with the dialect attached ("Occitan, dialect: Gascon"). The search alone finds nothing, or the wrong language, for all of these today.
9. **Given** the author types a language with a place ("French Switzerland", "Switzerland French"), **When** results are shown, **Then** the language is offered with that country as its region.
10. **Given** the author types a language plus words that match no dialect or place ("Ewondo Mvog-Ada", "Swiss French"), **When** they pick that result, **Then** a small chooser asks what the extra words are:
    - "a dialect name" (kept for the dialect step);
    - "a place", with a country picker where countries whose names start like the words come first, so "Swiss" puts Switzerland first;
    - "a dialect I'll find in a list", which offers the language's known dialects and variants;
    - "leave them out".

    Nothing the author typed is silently dropped or silently guessed.
11. **Given** the author types a dialect name that exactly matches one dialect and no language (e.g. "Gascon"), **When** focus leaves the field, **Then** it resolves to the parent language with the dialect attached, as FR-038 does for language names.

---

### User Story 2 - The keyboard records the dialect in its tag (Priority: P1)

Having picked a dialect, the author sees a one-line proposal: the tag the keyboard will carry, built from the dialect. They confirm it, change it, or remove the dialect part. The tag then appears in every output that carries a language tag.

**Why this priority**: it is the user's stated goal. A keyboard for a dialect must be able to say so.

**Independent Test**: pick "Gascon" in search. The dialect step proposes `oc-gascon`; confirm it; the built `.kps` lists `oc-gascon`. Repeat with "Rabinal" (proposes `acr-x-rabinal`, from langtags) and with a Glottolog dialect that has neither a registered variant nor a langtags entry (proposes an editable `-x-` subtag made from the dialect name).

**Acceptance Scenarios**:

1. **Given** a dialect with a registered IANA variant whose allowed prefixes include the parent language, **When** the dialect step opens, **Then** it proposes that variant (Gascon → `oc-gascon`, Valencian → `ca-valencia`).
2. **Given** a dialect with no registered variant but a langtags `-x-` tagset, **When** the step opens, **Then** it proposes the langtags tag (Rabinal → `acr-x-rabinal`).
3. **Given** a dialect with neither, **When** the step opens, **Then** it proposes a private-use subtag derived from the dialect name: 1 to 8 ASCII letters or digits, lowercase. The author can edit it.
4. **Given** any proposal, **When** it is shown, **Then** it names its source (registered variant, langtags, or made from the name), and nothing is written until the author confirms.
5. **Given** a confirmed dialect, **When** the keyboard is built, **Then** the package, help documents and LDML export all carry the same minimal tag.
6. **Given** a confirmed dialect from Glottolog, **When** the working copy is saved, **Then** the dialect's Glottolog code is stored as metadata, so the tag can be revisited if the dialect later gets a registered variant.
7. **Given** an author who picked a language directly (not a dialect), **When** they open the dialect field under **Customize** (the dialect step is not shown unasked), **Then** it is offered as optional, lists that language's known variants and dialects, and accepts a private-use name. Skipping it leaves the tag as today.

---

### User Story 3 - The emitted tag names only what is not a default (Priority: P1)

Whatever the author picks, the studio emits the minimal tag. Script and region appear only when they differ from the defaults for that language, or for that dialect if it has its own entry. Any language may carry a region, not only languages with several regions in langtags.

**Why this priority**: the user ruled that the tag must describe the variant minimally. Keyman's compiler hints on any tag that is not minimal.

**Independent Test**: build keyboards with these choices and read the `.kps` language ID:

| Choice | Emitted tag |
|---|---|
| Catalan, Latin, Spain, Valencian | `ca-valencia` |
| Serbian, Latin, Serbia | `sr-Latn` |
| French, Latin, Canada | `fr-CA` |
| Bafut, Latin, Cameroon | `bfd` |
| Achi, Rabinal dialect | `acr-x-rabinal` |

**Acceptance Scenarios**:

1. **Given** a choice of language, script, region and dialect, **When** the tag is built, **Then** each of script and region is left out exactly when it equals the default of the most specific langtags tagset that matches the choice.
2. **Given** any language, **When** the author wants a region, **Then** they can choose one, even if langtags lists only one region for the language. A region equal to the default is still left out of the tag.
3. **Given** subtags in any order or case, **When** the tag is built, **Then** it is in BCP 47 order with conventional case (language lowercase, script title case, region uppercase, variants and private use lowercase).
4. **Given** a combination not in langtags, **When** the tag is built, **Then** the default script and region come from the parent language's tagset.

---

### User Story 4 - Tags are checked the way Keyman checks them (Priority: P2)

Every language tag in the working copy, on either path, is checked for well-formedness and minimality. An invalid tag is an error; a tag that is not minimal is a hint naming the minimal form, with a fix that applies it.

**Why this priority**: without it, an author can produce a package Keyman's compiler rejects or flags. Open mode accepts free text today.

**Independent Test**: in Open mode, enter `sq-AL-gheg` (invalid: `gheg` is too short to be a variant), `sr-Latn-RS` (not minimal) and `oc-gascon` (valid and minimal). The first is an error, the second a hint proposing `sr-Latn`, the third passes.

**Acceptance Scenarios**:

1. **Given** a tag that is not well-formed BCP 47, **When** validation runs, **Then** an error names the tag and where it is listed.
2. **Given** a well-formed tag that is not minimal, **When** validation runs, **Then** a hint names the minimal form, and applying its fix replaces the tag.
3. **Given** a registered variant used with a language it is not registered for (`en-valencia`), **When** validation runs, **Then** a warning says which languages the variant is registered for.
4. **Given** the set of tags Keyman's package compiler reports as invalid or not minimal, **When** the studio validates the same tags, **Then** it reports the same verdicts, except where the studio's pinned langtags and the compiler's runtime locale data disagree on a default. Those disagreements are listed in a test fixture.
5. **Given** two tags in one package with the same minimal form, **When** validation runs, **Then** a hint reports the duplicate, as Keyman's compiler does.

---

### User Story 5 - Existing tags survive intact (Priority: P2)

A keyboard opened in Open mode keeps any variant, extension or private-use subtag it already has. The studio never reads such a subtag as a script or region, and never removes it in any output.

**Why this priority**: these are defects in shipped code; they corrupt output for any keyboard that carries such a tag.

**Independent Test**: open a keyboard whose `.kps` lists `en-US-x-twain` and `fr-u-co-phonebk`. The script read for each is none; the LDML export, package and help documents keep both tags whole.

**Acceptance Scenarios**:

1. **Given** a tag with a four-letter subtag after `-x-` or `-u-`, **When** the studio reads its script, **Then** that subtag is not treated as a script.
2. **Given** a tag with an extension or private-use part, **When** any output is built, **Then** that part is kept unchanged.
3. **Given** the langtags data, **When** it is generated for the studio, **Then** variant and `-x-` tagsets are kept as their own entries with their names, and the `variants` and `windows` fields are kept.

---

### User Story 6 - Nothing matches, and the author still ends with a tag (Priority: P1)

An author types a name the lists do not know. The studio never stops at "no results". If the text is a code or tag, it resolves it. If the text is a dialect name, the author can say so and look for the language it belongs to, and the name is kept for the dialect step. If the language itself is unlisted, the author can enter its code if they know it, or the studio proposes a private-use tag. Every path ends in a proposal the author confirms.

**Why this priority**: a blank or unchecked language code is a defect under "defaults are the product" (Article X). Today a name that isn't listed leaves the code empty, and a typed code goes unchecked into the package.

**Independent Test**:
- Type `bft`: Balti is proposed, and the author is asked to confirm it.
- Type `oc-gascon`: Occitan is chosen with the Gascon dialect.
- Type a made-up dialect name, choose "*name* is a dialect: find its language", and pick Occitan: the dialect step proposes `oc-x-` plus a code made from the name.
- Choose "My language isn't listed" for a made-up name: the studio proposes `qaa-x-` plus the same kind of code, and review flags it as unusual.
- Enter the code `zzz`: the studio warns that it is not a registered code.

**Acceptance Scenarios**:

1. **Given** text that is a well-formed language code or tag, **When** the author searches it, **Then** the language (and any script, region or dialect in the tag) is proposed. A code is checked against the registered language subtags, and the registered name is shown for confirmation.
2. **Given** text that matches nothing, **When** results are shown, **Then** the list always ends with "*text* is a dialect: find its language" and "My language isn't listed".
3. **Given** the author chooses "*text* is a dialect", **When** they then pick a language, **Then** the dialect step proposes a dialect subtag made from the kept text (FR-008's third preference) and shows its source.
4. **Given** the author chooses "My language isn't listed", **When** they know the code, **Then** they can enter it. A well-formed registered code is accepted with its registered name; a private-use code (`qaa`–`qtz`) is accepted; a well-formed unregistered code is accepted with a warning; an ill-formed one is blocked with the reason.
5. **Given** "My language isn't listed" with no code, **When** the author gives a language name, **Then** the studio proposes `qaa-x-` plus a code made from the name (the FR-011 rule), says why, and points to how to request an ISO 639-3 code. Review flags the tag as unusual (row 10.4).
6. **Given** any of these paths, **When** the author confirms, **Then** the language code decision is set. No path leaves it blank.

---

### Edge Cases

- **The dialect has its own ISO code in langtags but Glottolog calls it a dialect.** The ISO code wins and no dialect subtag is proposed (User Story 1, scenario 2).
- **The parent language is a macrolanguage member.** The parent's canonical language code is used, as the language step does today (e.g. a dialect of `arb` resolves through the existing canonicalisation rule).
- **A Glottolog dialect's parent has no ISO code** (314 of 13,706). It is not offered in search; the author can still type a private-use dialect name after picking a language.
- **The proposed private-use subtag would collide** with an existing langtags `-x-` subtag of the same language that names a different dialect. The proposal adds a disambiguating digit and says so.
- **A dialect name is longer than 8 characters or has non-ASCII letters.** The proposed subtag folds accents to ASCII, drops spaces and punctuation, and truncates to 8 characters; the author can edit it.
- **The author edits the subtag to something ill-formed.** The step blocks confirmation and says why (length, characters).
- **A variant is registered for more than one language,** or for a language plus script (`1994` is registered for `sl-rozaj`). The prefix check follows the registry's recorded prefixes.
- **The author changes the language after confirming a dialect.** The dialect answer is re-proposed against the new language, never silently kept or dropped (Article X).
- **Extensions (`-u-`, `-t-`) in an opened keyboard.** They are preserved and validated for form, but the studio offers no way to author them.
- **Name matching ignores case and accents.** Spelling variants such as "Lengadocian" for "Languedocien" are left to the fuzzy tier (FR-003).
- **The chooser's language data and the studio's pinned langtags disagree.** The chooser's data is its own langtags snapshot. If they differ on a code or default script, the studio's pinned langtags decides the emitted tag (FR-014, FR-015), and the difference is listed in a test fixture (FR-034).
- **The author pastes a tag with extensions** (`fr-u-co-phonebk`) into the search. The language, script and region are resolved. The extension is not carried into the new keyboard's tag, with a note (FR-027). FR-025 governs the tags of keyboards that are opened, which keep their extensions.

## Requirements *(mandatory)*

### Functional Requirements

**Search**

- **FR-001**: The language search MUST use SIL's shared language search (`@ethnolib/find-language`), which matches language names, autonyms, alternate names, codes and countries, and MUST add the names of Glottolog dialects whose parent language has an ISO 639 code.
- **FR-002**: A result reached through a dialect name MUST show the matched name, its relation to the language ("a dialect of", "a variety of") and the language's code.
- **FR-003**: Language results MUST keep the shared search's order (complete, whole-word, start-of-word, substring, fuzzy). Dialect matches whose name matches the query fully or by word prefix MUST come after the language results that match the query that closely, and before the shared search's looser (fuzzy) results. A name that is a language with its own ISO code MUST rank above a dialect classification of the same name.
- **FR-004**: A dialect name with more than one parent MUST list each parent with the countries Glottolog gives for the dialect, or for its parent when the dialect has none.
- **FR-005**: Matching MUST ignore case and diacritics.
- **FR-006**: For a fixed sample of language-name queries, the top result's language code MUST match today's search. Every exception MUST be listed in a fixture with a reason; the fixture is reviewed when the shared search's data is updated.

**Dialect step**

- **FR-007**: The studio MUST provide an optional dialect step after the region choice, declared in the decision registry with typed inputs (language, script, region, chosen search match) and writes (dialect subtag, its source, Glottolog code), per Article IX. Its position MUST come from the dependency sort, not a stored order.
- **FR-008**: When the language was reached through a dialect name, the step MUST propose a dialect subtag in this order of preference: a registered IANA variant whose recorded prefixes allow the chosen language (and script, if the prefix requires one); the langtags `-x-` tagset for that dialect; a private-use subtag made from the dialect name. A dialect is linked to a registered variant when the variant's registry description matches the dialect's name (ignoring case and diacritics) and its prefixes allow the language; the link is a proposal the author confirms, like any other.
- **FR-009**: When the language was chosen directly, the dialect step MUST be shown only if the author asks for it (Customize), and MUST then list that language's registered variants (filtered by prefix) and langtags variant and `-x-` tagsets, and accept a typed dialect name, from which it proposes a private-use subtag.
- **FR-010**: Every proposal MUST show its source and the resulting full tag, and MUST take effect only when the author confirms it (Article X). The author MUST be able to remove the dialect part.
- **FR-011**: A made-from-name private-use subtag MUST be 1 to 8 ASCII letters or digits, lowercase, with accents folded and spaces and punctuation removed. The author MUST be able to edit it; an ill-formed edit MUST block confirmation with a reason.
- **FR-012**: The studio MUST store the chosen dialect's Glottolog code, when there is one, with the working copy's identity metadata.
- **FR-013**: Changing the language after a dialect is confirmed MUST re-propose the dialect answer against the new language.

**Tag composition**

- **FR-014**: The studio MUST build every language tag it emits in minimal form: script and region are omitted when they equal the defaults of the most specific matching langtags tagset (the dialect's own tagset if there is one, else the language's).
- **FR-015**: The minimal form MUST be derived from the pinned langtags data, so the same choices produce the same tag in every browser. A runtime locale library MAY be used to cross-check in tests, not to decide output.
- **FR-016**: Tags MUST be emitted in BCP 47 subtag order with conventional case.
- **FR-017**: The region choice MUST be available for any language. A region equal to the default MUST be omitted from the tag.
- **FR-018**: The package (`.kps`), help documents and LDML export MUST carry the same tag for the same choice. A keyboard with a confirmed dialect MUST list the dialect tag only, not the bare parent language as a second entry.

**Validation**

- **FR-019**: The studio MUST report a tag that is not well-formed BCP 47 as an error, on both paths, including tags typed in Open mode's language list.
- **FR-020**: The studio MUST report a well-formed tag that is not minimal as a hint naming the minimal form, with a fix that replaces the tag.
- **FR-021**: The studio MUST warn when a registered variant is used with a language or script its registry prefixes do not allow.
- **FR-022**: The studio MUST report two tags in one package with the same minimal form, as Keyman's compiler does.
- **FR-023**: The studio's verdicts for validity and minimality MUST match Keyman's package compiler on a test fixture of tags, with every disagreement listed and explained in the fixture.

**Preservation and data fixes**

- **FR-024**: Reading a tag's script or region MUST stop at the first extension or private-use singleton.
- **FR-025**: No output may remove or alter a tag's variant, extension or private-use part, except a fix the author applies.
- **FR-026**: The generated langtags data MUST keep variant and `-x-` tagsets as their own entries with their names, and MUST keep the `variants` and `windows` fields.
- **FR-027**: The studio MUST NOT offer a way to author `-u-` or `-t-` extensions.

**Nothing matches (US6)**

- **FR-028**: Text that parses as a language code or tag MUST resolve to a proposal of its parts. A language subtag MUST be checked against the registered language subtags (IANA registry, pinned as in FR-021), and the registered name shown for confirmation.
- **FR-029**: When no result matches the text closely (its name or code starts with the text, as a word; otherwise only the shared search's looser, fuzzy matches are present), or at any time on request, the result list MUST end with two choices: "*text* is a dialect: find its language" and "My language isn't listed".
- **FR-030**: Choosing "*text* is a dialect" MUST keep the text as the pending dialect name and return the author to the search to find the parent language. The dialect step then proposes from the kept name (FR-008, third preference; source `typed`).
- **FR-031**: "My language isn't listed" MUST take a language name (pre-filled with the text) and an optional code. A code MUST be checked as in FR-028: a registered code is accepted with its name, a private-use code (`qaa`–`qtz`) is accepted, a well-formed unregistered code is accepted with a warning, and an ill-formed code blocks confirmation with its reason.
- **FR-032**: With no code, the studio MUST propose `qaa-x-` plus a subtag made from the language name (FR-011 rule), explain why, and point to how to request an ISO 639-3 code. Row 10.4 MUST flag the tag at review.
- **FR-033**: The language code question MUST NOT accept unchecked free text. Every way of setting the code goes through FR-028 or FR-031, so the language code is never blank or unchecked once the author confirms.

**Shared language chooser**

- **FR-034**: The chooser's language data MUST be checked against the studio's pinned langtags by a test: every chooser language code (after macrolanguage mapping) exists in the pinned langtags and agrees on the default script. Every disagreement MUST be listed in a fixture with a reason.
- **FR-035**: The emitted tag MUST come from the studio's minimal-tag rule (FR-014) and dialect preference (FR-008), never from the chooser's own tag builder.
- **FR-036**: The chooser MUST be a renderer for the identity decisions (language name, language code, script, region, dialect), declared in the decision registry as today (Article IX). It adds no survey surface of its own.
- **FR-037**: The chooser's code and data MUST load only when the language step opens, not on the studio's first page load.
- **FR-038**: The chooser MUST keep the language field's existing behaviour:
  - suggestions appear in a dropdown as the author types;
  - typed text that matches exactly one language's name or alternate name resolves without a click;
  - picking or resolving proposes the code, script and autonym, and advances;
  - the headless author (spec 107) resolves typed names by the same rule.

  EthnoLib's card content is shown in the dropdown rows; the studio does not switch to a full-page card grid.

**Dialects typed in the language field**

Authors will often type their dialect, or their dialect together with their language, when asked for their language.

- **FR-039**: When the text has more than one word, the studio MUST also read it as a language part plus a remainder.
  - Words are split on spaces, hyphens, commas and parentheses.
  - The language part is a contiguous run of words at the start or end of the text.
  - A reading counts when the language part matches a language closely (its name or code; contract § merge rule).
- **FR-040**: The remainder of such a reading MUST be interpreted in this order:
  1. a dialect of that language: a Glottolog dialect whose parent is that language, a registered variant whose description matches and whose prefixes allow the language, or a langtags dialect tagset of the language;
  2. a country, by English name or code, which becomes a region proposal;
  3. otherwise, it is **unresolved**: picking the reading opens a chooser for the remainder. The chooser offers:
     - keep it as a dialect name (source `typed`);
     - pick a place, from a country picker that ranks first the countries whose names share the remainder's first three or more letters;
     - pick from the language's dialects and variants;
     - leave the words out.

     The studio never guesses which.
- **FR-041**: Each reading MUST appear as one result, labelled with how the text was read ("Occitan, dialect: Gascon"; "French, region: Switzerland"; "Ewondo, plus 'Mvog-Ada': choose what it is"). It MUST rank above the shared search's fuzzy results. No typed word may be dropped or interpreted without being shown to the author.
- **FR-042**: The FR-038 resolve-without-a-click rule MUST also resolve text that names exactly one dialect, or has exactly one *resolved* reading under FR-039 (step 1 or 2), and no language. It resolves to the parent language with the dialect or region attached. An unresolved reading (step 3) never resolves without a click; it waits for the chooser.

### Key Entities

- **Language choice**: language code, optional script, optional region, optional dialect subtag. The source of the composed tag.
- **Dialect match**: a search hit reached through a dialect name. Matched name, relation ("dialect of", "variety of"), parent language code, countries, Glottolog code, and the dialect subtag candidates found for it.
- **Dialect subtag proposal**: the proposed subtag, its source (registered variant, langtags, made from name) and the full tag it produces. Pending until confirmed.
- **Variant registry entry**: a registered IANA variant with its description and allowed prefixes.
- **Tag finding**: an error, warning or hint about one tag, naming where the tag is listed and, for a hint, the replacement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Of the Glottolog dialects whose parent has an ISO code, at least 95% return their parent language in the top five results when the dialect's name is searched (today 7%).
- **SC-002**: Every langtags variant and `-x-` tagset (229 at the pinned commit) appears in the results when one of its names is searched, and picking that result proposes exactly that tagset's tag. Where several tagsets share a name, each is listed as its own result.
- **SC-003**: For every langtags tagset, choosing its language, script, region and dialect produces exactly the tagset's minimal `tag`.
- **SC-004**: The studio's validity and minimality verdicts agree with Keyman's package compiler on all tags in the keyboards corpus (4,691 language IDs), apart from the disagreements listed in the fixture.
- **SC-005**: No output built from a keyboard whose tags carry variants, extensions or private use loses any part of those tags.
- **SC-006**: An author who knows only a dialect's name reaches a confirmed dialect tag in at most three actions after typing the name (pick the result, confirm or edit the proposal, continue).
- **SC-007**: For 200 sampled language-name queries, the top result's language code matches today's search, apart from the exceptions listed in the fixture.
- **SC-008**: For every one of these inputs, the author ends with a confirmed, non-blank language code in at most four actions after typing: a listed name, a dialect name, a code, a tag, a misspelled name, an unlisted dialect, and an unlisted language with or without a known code.
- **SC-009**: Every language in the chooser's data resolves in the studio's pinned langtags with the same default script, apart from the exceptions listed in the fixture.
- **SC-010**: Each query in this set returns the right language as the first result, with the dialect or region attached:
  - "Gascon Occitan", "Occitan Gascon", "Occitan - Gascon";
  - "Rabinal Achi", "Achi Rabinal";
  - "Royal Bafut", "Bafut Royal";
  - "Yabekolo Ewondo", "Ewondo (Yabekolo)";
  - "French Switzerland".

  And each unresolved query returns the right language first, with the remainder chooser offered:
  - "Ewondo Mvog-Ada";
  - "Swiss French", where Switzerland is the first place offered.

  Today none of these does. The set lives in a test fixture and grows as authors report misses.

## Assumptions

- **A dialect keyboard lists only its dialect tag** (Clarifications, 2026-11-09), not the bare parent language as well. Keyman shows only "language (script, region)", so the keyboard appears under its parent language in Keyman's lists. Whether keyman.com search for the parent code finds it is unverified.
- **Windows registration of `-x-` tags is unverified.** The langtags `windows` field is kept for a later decision; this spec does not change how the package registers input languages.
- **Glottolog alternate names are out of scope.** Search uses each dialect's primary Glottolog name; Glottolog's other names (a separate data file not fetched today) are a possible follow-up. The fuzzy tier catches some spelling variants.
- **The shared chooser's data is its own langtags snapshot** (EthnoLib's committed copy, langtags API 1.4, refreshed 2026-07). It is not pinned to the studio's langtags commit; FR-034 keeps the two honest.
- **Whether Keyman's keyboards repository accepts `qaa-x-` tags is unverified.** Row 10.4 flags them; the studio does not block them.
- **Places by country name; adjectives go to the chooser.** FR-040 matches country names and codes ("French Switzerland", "French CH") automatically. Adjectives such as "Swiss" have no data source, so they reach the remainder chooser (FR-040 step 3), where the shared-prefix ranking puts Switzerland first. No demonym data is needed (owner suggestion, 2026-11-09).
- **No separate display name.** Bloom asks for a display name; the studio already asks for the English name and the autonym, which serve that purpose.
- **Only Glottolog dialects with an ISO-coded parent are searchable.** The 314 others are not offered.
- **The IANA variant registry becomes a pinned prebuild input**, fetched and checksummed like langtags, so validation and proposals are reproducible.
- **Copy and Open both get the dialect step and validation.** Open's existing language list gains validation; the dialect step applies when an Open author adds or edits a language.
- **Performance:** the chooser's data (about 770 KB compressed) loads with the language step, and the Glottolog dialect data (about 165 KB compressed) only when a search needs it or the dialect step opens.

## Clarifications

### Session 2026-11-09

- Q: For a dialect keyboard (e.g. Gascon), should the package list only the dialect tag, or the parent language too? → A: Dialect tag only (`oc-gascon`). The keyboard claims exactly what it is for. How keyman.com matches a parent-language search against a dialect tag is unverified; recorded as an assumption, not a requirement.
- Q: What happens when the language or dialect is in no list? → A: Every path ends in a proposal (User Story 6). An unmatched dialect name is kept while the author finds its language; an unlisted language takes a code if the author knows one, else a proposed `qaa-x-` tag.
- Q: What if the extra words typed with a language match no dialect or place? → A: Ask, don't guess. A small chooser asks whether they are a dialect name, a place (country picker), a listed dialect, or should be left out (FR-040 step 3).
- Q: Build our own search or reuse Bloom's? → A: Reuse SIL's shared language chooser (EthnoLib, as in Bloom): adapt its component to the studio's React and use its search backend.

## Out of Scope

- Authoring `-u-` or `-t-` extensions (FR-027).
- Changing how Keyman, keyman.com or Windows display or register variant tags.
- Registering new IANA variants on an author's behalf.
- Survey-editing tags inside opaque (`RawKmnFragment`) source.
