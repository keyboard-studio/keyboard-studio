# Feature Specification: Touch key identity criteria — when a touch key is K_, U_, or T_

**Feature Branch**: `km/104-touch-key-id-criteria`

**Created**: 2026-10-17

**Status**: Draft (proposal adopted by Matthew 2026-10-17; this spec carries the adopted criteria into buildable requirements)

**Input**: User description: "Adopt this and write a full-stack spec. We should use the criteria for defining new keys or when copying a keyboard. When Adapting (track 2), we should give the user the choice. I expect that T and U keys will now be seamlessly integrated in carve and creation." Source proposal (adopted as written, §5 recommendation included): the km-lead two-cycle proposal of 2026-10-17, archived as [research.md](research.md) in this directory, with its evidence base (corpus census of 962 keymanapp/keyboards layouts, upstream Keyman semantics, studio consumer audit, empirical rule-free-T_ verdict) summarised there.

**Governing authority** (Constitution precedence): this spec EXTENDS the key-id policy of [spec 063](../063-touch-key-editor/AS-BUILT.md) (touch key editor; `key-id-policy.md`: `T_<HEX>` does not self-output, `U_` is the no-rule form, minting paths in `keyIdMinting.ts`) and [spec 065](../065-touch-editor-parity/AS-BUILT.md) (inherit-first proposer, `proposeTouchKeyId`) — where this spec and the 063/065 policy differ, this spec wins for the cases it names (notably FR-013: the combining-mark minting path). It builds on spec 035 (mobile touch derivation / seed), spec 076 (rule behaviours; carve), spec 082/103 (rule access and first-class guards — severance transplants carry guarded rules verbatim), and spec 093 (derived keyboard; severance and repair are decision-spine records, not side state). Findings presentation follows the warnings-placement model adopted for #2145 (a finding lives at its owning step; no pane-top global region). Version and documentation behaviour are untouched (spec 102).

## Clarifications

### Session 2026-10-30 (re-ruling via #2374, km-lead ruling; supersedes the per-keyboard guard question)

- Q: Does the per-keyboard guard question survive? → A: No. The question ("A mark with no letter before it", FR-013 as written) is **retired**: its space half had already moved to the attachment station's space column (spec 106 FR-013), digits/punctuation were never governed by the answer, and the only part it ever mechanically controlled was buffer start. Its buffer-start role is replaced by a per-mark **"start of line"** column on the attachment station (spec 106 FR-015): unchecked by default; unticked = the mark is blocked at buffer start by the `nul` swallow rule and touch-mints guarded `T_`; ticked = the `nul` rule is omitted, `"\n"` joins the mark's allowed set, and touch-mints plain `U_`. Track 2's keyboard-wide guard seeding (`detectImportedGuardBehaviour`) is retired with it; the same classification feeds per-mark box seeding (unguarded-mark behaviour → ticked boxes, `origin: "imported"`). Only confirmed `GuardSpecification` records migrate to ticked boxes (`origin: "migrated-from-guard"`; `swallow` needs no migration); seeded-but-unconfirmed records are dropped, never adopted. Late-added marks (touch editor, marks step skipped) take the guarded default: unticked → `T_`, blocked — replacing FR-013's `GuardQuestionPrompt` tail. The Session 2026-10-20 empty-context clarification is re-ruled accordingly: buffer start is now offered per mark via the column, and the `nul` swallow rule is the buffer-start mechanism.
- Q: Why not keep the question for the three non-doubled consumers (touch minting, no-row marks, the touch-editor prompt)? → A: They are replaced, not kept: (1) minting reads the per-mark box (unticked → `T_`, ticked → `U_`); (2) own-key marks with no attachment row default to guarded `T_`, blocked; (3) the prompt is replaced by the guarded default.

### Session 2026-10-20

- Q: Does the guard question's "at the start of a word" include a tap at a truly EMPTY context (empty field, nothing typed yet)? → A (Matthew's directive to resolve main CI, lead ruling recorded 2026-10-20): No. "Start of a word" means the guard idiom's reachable cases — the ones the question itself lists: right after a space, a number, or punctuation. The spec'd mechanism (FR-013, the Cameroon idiom `any(guardstore) + [T] > context` plus a plain producing rule) can only match a character that exists; Keyman has no beginning-of-context primitive, and the shipped sil_cameroon_qwerty keyboards behave the same way at empty context. SC-002 already scopes its context probes to letter/space/deadkey for this reason. Walk 1's start-of-word probe is therefore the after-a-space tap. Giving STUDIO-MINTED guards an additional empty-context arm (letter-gated production) remains possible as a future amendment of this spec; it is NOT adopted here, because minted and transplanted guards would diverge at empty context and the parity fixtures and synthesis dedupe contract would need rework. **Re-ruled 2026-10-30 via #2374 — see Session 2026-10-30 above: the question is retired and buffer start is offered per mark through the start-of-line column.**

### Session 2026-10-17

- Q: Are T_ keys a workaround studio should normalise away on import? → A: No (Matthew). A T_ key is a deliberate, first-class idiom: a touch-only key definition, used whenever the author wants to overwrite an entire key and all its modifier states with something different. Once a character is being redefined, continuing to link the touch key to a physical K_ key does not make sense.
- Q: May studio create new T_ keys, or only preserve imported ones? → A: Studio MUST be able to add T_ keys, under the criteria in this spec (the adopted proposal's P1–P9, carried as FR-001…FR-009 policy and the contracts in [contracts/key-id-criteria.md](contracts/key-id-criteria.md)).
- Q: Does the author's "U_ keys shortcut Keyman rules" model hold? → A: Refined by evidence (research.md §1): the U_ decode is a fallback that fires only when no rule matches — rules run first and a rule may name `[U_...]` — but the fallback itself performs no guard, context, or deadkey work. The criteria are written against the refined semantics.
- Q: When do the criteria apply automatically, and when does the author choose? → A (Matthew, adoption directive): defining NEW keys and COPYING a keyboard (Track 1) apply the criteria directly. ADAPTING (Track 2) gives the user the choice wherever the criteria would change an existing key's identity — the criteria supply the recommendation and the default; the author's answer stands (recorded per FR-016). Carve and creation MUST integrate T_ and U_ keys seamlessly in both tracks.
- Q: Partial redefinition (one modifier state differs)? → A: The adopted proposal's §5 recommendation applies: sever the whole key (FR-008), because `platform('touch')` confers no rule priority and Keyman has no rule negation. On Track 2 this is the recommended default in the author's choice, not an automatic act.
- Q: Which host layouts does FR-002's keep-K_ equality run against? → A (Matthew, /speckit-clarify 2026-10-17): the project's declared target hosts, defaulting to {US} when the project declares none. Not the author's own layout, and not a fixed reference set. Recorded in FR-002 rider (i).
- Q: On Track 2, what is the author's choice when a severance transplant refuses (FR-008)? → A (Matthew, /speckit-clarify 2026-10-17): the choice collapses to keep-the-link vs flag-for-manual-definition, with the refusing binding shown; severance is never offered when it cannot run, and shared rules are never duplicated to force it. Recorded in FR-016.
- Q: Is re-linking (severed key back to K_ when equality holds again) in scope for 104? → A (Matthew, /speckit-clarify 2026-10-17): yes — an offered, recorded action, never automatic. Recorded as FR-029 with task T027.
- Q: What happens at download if the author never visited the Copy repair list? → A (Matthew, /speckit-clarify 2026-10-17): repairs pass through unapplied, download is not blocked, warnings are recorded on the project and listed at the Output step. Preselected defaults never auto-apply. Recorded in FR-015.

**Ownership** (Constitution Art. VI): Contracts owns the production resolver (types AND implementation — it is the only home every consumer, including keyboard-lint, can import) and the criteria decision procedure as data. Engine owns the severance transplant, carve/creation integration, and scaffolder changes. Studio owns the Track 2 choice surfaces, the marks-step start-of-line column, and repair-proposal presentation. Content owns the author-facing copy named in the contracts (severance line, start-of-line column copy, repair wording) in en + fr.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Defining a new touch key follows the criteria (Priority: P1)

An author adds or redefines a touch key in the touch editor or the assign loop. The studio decides the key's id form from what the key must DO, per the criteria contract: a plain character becomes a `U_` key; a key that needs a guard, a context, a deadkey, different outputs in different states, or a fixed string below the version floor becomes a `T_` key minted together with its rules; a key that still does exactly what its physical key does keeps its `K_` id. When the author's edit makes a touch key stop matching its physical key in any state the key is used in, the studio severs the K_ link (whole key, rule-level transplant) and tells the author in plain language what happened.

**Why this priority**: This is the creation path every new keyboard passes through. Today the proposer mints by character class alone (every combining mark becomes a guarded T_, plain chars become U_) and nothing severs a K_ link when an author redefines a key — the redefined touch key silently keeps inheriting the physical key's rules, which is the exact failure the Cameroon author designed T_ keys to avoid.

**Independent Test**: In the touch editor, redefine the touch `K_1` key to type a combining mark with the keyboard's guard in force, and separately redefine a key to a plain character: the first produces a T_ key with its guarded rules and the severance line shown; the second produces a U_ key; a third key edited only in its label keeps its K_ id.

**Acceptance Scenarios**:

1. **Given** an author assigns a plain single character to a new touch key, **When** the key is created, **Then** it carries a `U_<HEX>` id and no .kmn rule is added for it.
2. **Given** an author assigns a character whose production needs rule logic (guard, context, deadkey, per-state outputs, conditional string), **When** the key is created, **Then** it carries a `T_` id and its rules are written in the same edit — the build never contains a producing T_ key without its rules, and never rules orphaned from their key.
3. **Given** a touch key linked to `K_1` and the author redefines what it types in any state it is used in, **When** the edit is applied, **Then** the key is severed: every rule naming `K_1` for that key's touch behaviour is transplanted to the new T_ id with context and output verbatim, and the author sees "This touch key is now on its own: it types only what you set here, and changing the 1 key on the typing keyboard won't change it." The line is delivered as a transient notice in the touch gallery's `role="status"` live region at commit (the studio has no toast system and this spec adds none), and the severance is durably recorded in the key's inspector findings and provenance (FR-025).
4. **Given** a redefinition whose rules bind the key to shared stores, deadkeys, or other keys' rules so a verbatim transplant is impossible, **When** the edit is applied, **Then** the transplant is refused, the key is flagged for manual definition at its owning step, and no half-copied rule set is emitted.
5. **Given** an author changes only a key's label, **When** the edit is applied, **Then** the id does not change and no severance occurs.
6. **Given** an author assigns a combining mark in the touch editor before the marks step is reached, **When** the marks step is reached, **Then** the mark's row carries its start-of-line box unticked (FR-013; the guarded default under which the key was minted `T_`); ticking the box re-evaluates the key to plain `U_` — and the re-evaluation is reported in the marks step's completion report, never applied as a silent re-mint after the author has seen the key.

---

### User Story 2 - Copying a keyboard (Track 1) applies the criteria and repairs dead keys (Priority: P1)

An author copies a keyboard whose touch layout uses T_ and U_ keys — including rule-defined T_ producers like sil_cameroon_qwerty's guarded tone marks. The copy keeps every working key's behaviour exactly: T_ producers keep their ids and rules, ruled U_ keys keep their rules, frame keys keep their navigation. Keys that cannot work — a producing T_ key with no rule, which types nothing in Keyman — are listed at the step that owns them with a repair choice whose default the criteria supply, and the copy is not silently shipped with dead keys.

**Why this priority**: Copy is the most common first-keyboard path, and it is where the current pipeline loses T_ keys: they are preserved as layout JSON but invisible to the machinery that later rewrites the keyboard, so the copy looks intact while its T_ producers are one carve away from going stale. Dead template keys (2,115 rule-free T_<HEX> pairs in the corpus, basic_* family) are the same story at import: they never worked, and the copy is the moment to surface that with a fix attached.

**Independent Test**: Copy sil_cameroon_qwerty to a new keyboard, change nothing, download, and simulate taps on the copy: every touch key produces exactly what the source keyboard produces, including the guarded marks (a mark after a space produces nothing) and the FCFA string key.

**Acceptance Scenarios**:

1. **Given** a source keyboard with ruled T_ producers, **When** it is copied, **Then** the copy's .kmn contains those rules copied unchanged and its touch layout carries the same ids, and a tap simulation over every touch key in every layer matches the source keyboard's simulation.
2. **Given** a source keyboard with a ruled U_ key (hindi_flick pattern), **When** it is copied, **Then** both the U_ id and its rules are carried; the key is not converted to T_.
3. **Given** a source keyboard with a producing T_ key that has no rule, **When** it is copied, **Then** the key appears in a repair list at its owning step with the criteria's default repair preselected (convert to `U_<HEX>` when the id suffix parses as the keycap's codepoint; otherwise mint id + rule, or blank the key), and the author can choose a different repair or keep the key as-is with the dead-key warning recorded.
4. **Given** a source keyboard whose T_ keys are all frame/spacer class, **When** it is copied, **Then** no repair is proposed and no rule is invented for them.
5. **Given** a copied keyboard, **When** the author later removes a character in the carve step, **Then** User Story 4 applies identically to the copied T_/U_ keys.

---

### User Story 3 - Adapting a keyboard (Track 2) gives the author the choice (Priority: P1)

An author adapts an existing keyboard in place. Wherever the criteria would change an existing key's identity — sever a K_ link because the adaptation redefines the key, repair a dead T_ key, convert a key's id form — the studio presents the choice at the owning step: what the criteria recommend, what each option does in author language, and the author's answer is recorded as a decision and stands. Nothing about a key's identity changes silently during an adaptation.

**Why this priority**: Track 2 is a modification of someone's working keyboard — often the author's own shipped keyboard. The criteria encode what SHOULD happen, but an adaptation's author may have reasons the criteria cannot see (a forthcoming desktop change, a deliberate dead key). Matthew's adoption directive is explicit: on Track 2, the user chooses. This is also the Constitution Art. X posture: defaults are proposals, presented and confirmed, never silent.

**Independent Test**: Adapt sil_cameroon_azerty, redefine one K_-linked touch key and trigger one dead-T_ repair: both changes appear as choices with the criteria's recommendation preselected; declining both leaves the downloaded keyboard's key identities byte-identical to the source.

**Acceptance Scenarios**:

1. **Given** an adaptation in which an edit redefines a K_-linked touch key, **When** the edit is made, **Then** a choice is presented at the owning step: sever to T_ (recommended, with the severance line as its explanation), keep the K_ link (with its consequence stated: the physical key's rules will keep applying to this touch key), and the author's answer is recorded as a decision with provenance.
2. **Given** the author declines a severance, **When** the keyboard is downloaded, **Then** the key keeps its K_ id and no transplanted rules are emitted; the decision is visible in the decision log and is re-offered if the key is redefined again.
3. **Given** an adaptation whose source has dead producing T_ keys, **When** the keyboard is imported, **Then** the repair choices (User Story 2, scenario 3) are presented the same way, defaulting to the criteria's repair, and "leave as-is" is an explicit answer, not an omission.
4. **Given** an adaptation where the criteria would change nothing, **When** the author works through the flow, **Then** no identity choice is presented — choices appear only where the criteria actually bite.
5. **Given** an author switches a project from Adapt to Copy late, **When** the track answer changes, **Then** pending Track 2 identity choices are discarded and the criteria apply directly, as on any Copy; switching back re-derives the choices from the criteria.

---

### User Story 4 - Carve treats T_ and U_ keys as first-class producers (Priority: P1)

An author removes a character from the alphabet. Every touch method that produces that character is found and dealt with — a K_ key, a U_ key, a longpress subkey, and a rule-defined T_ key alike. Removing U+0300 from a Cameroon-derived keyboard removes the T_0300 keys on the default and caps layers and suppresses their guarded rules; removing a character produced by a ruled U_ key removes the key AND handles its rule explicitly, because deleting only the rule would let the U_ fallback revive the character.

**Why this priority**: This is the originally reported defect (Matthew, 2026-10-17): the pipeline ignored renamed touch keys, so they were not rewritten when a keyboard was adapted. The carve step is where an unrewritten producer does the most damage — the author believes a character is gone while a live key still types it.

**Independent Test**: Carve U+0300 and U+002E out of a copy of sil_cameroon_qwerty: the touch layout no longer contains a producing T_0300 or T_002E key on any layer, the .kmn no longer contains a live rule producing either character from a touch key, and every other touch key's simulated output is unchanged.

**Acceptance Scenarios**:

1. **Given** a character produced only by a ruled T_ key, **When** the character is carved, **Then** the key is neutralised on every layer and platform where it occurs (T_BLANK/sp 10, the corpus spelling) and all its rules — bare, modifier, and guarded forms — are suppressed in the same operation.
2. **Given** a character produced by a ruled U_ key, **When** the character is carved, **Then** the key is neutralised and its rules are removed or suppressed with it; the output package contains no path by which the character can still be typed from that key (the fail-open trap is closed).
3. **Given** a character produced by the same key id on multiple layers and by a longpress subkey, **When** it is carved, **Then** all occurrences are handled in one operation, and the mechanisms gallery no longer reports the character as touch-producible.
4. **Given** a character produced by a T_ key whose rules also serve another kept character (shared store / pattern arm), **When** it is carved, **Then** the shared machinery is preserved for the kept character and only this character's production is suppressed — or the operation is refused with the binding named, per FR-008's refusal rule.
5. **Given** a carved character, **When** the author inspects the touch gallery, **Then** detection, enumeration, and coverage agree: no surface still credits the character to a touch key (the resolver parity of FR-003).

---

### User Story 5 - New layers and derived layouts keep T_/U_ identity (Priority: P2)

When the studio derives or extends a touch layout — seeding a phone layout from a tablet one, synthesising a modifier-combo layer (rightalt, caps), or scaffolding a layout for a keyboard that has none — existing T_ and U_ keys keep their identities and their rules. A combo layer cloned from the default layer does not blank a T_ key whose production the combo does not redefine, and a scaffolded layout for a keyboard whose .kmn already defines T_ keys reuses those ids instead of re-minting the same characters as new U_ longpresses.

**Why this priority**: Layer synthesis is where identity is lost quietly today (the cycle-1 audit's gaps 3 and 4): a cloned layer that blanks divergent T_/U_ slots manufactures dead keys out of working ones, and a reseed that discards producing-T_ identity forks one character into two production paths that later edits must chase separately.

**Independent Test**: Take sil_cameroon_qwerty (tablet only), seed a phone layout and synthesise its caps/rightalt layers from the criteria-driven pipeline: every producing key's simulated output on the derived layout matches its tablet counterpart state-for-state.

**Acceptance Scenarios**:

1. **Given** a default layer containing T_ and U_ producers, **When** a combo layer is synthesised by cloning, **Then** keys the combo does not redefine keep their ids and productions; only keys the combo redefines are changed.
2. **Given** a keyboard whose .kmn defines ruled T_ keys but which has no touch layout, **When** a layout is scaffolded, **Then** the scaffold places the existing T_ ids (with their rule linkage intact) rather than re-minting their characters under new ids.
3. **Given** a tablet-only keyboard, **When** a phone layout is seeded, **Then** T_/U_ producers survive the reseed with production intact (verified by simulation, User Story 2 scenario 1's method).

---

### User Story 6 - The criteria are inspectable (Priority: P3)

An author (or a reviewer) can see, for any touch key, why it has the id form it has: which criterion fired, what the key produces in each state, which of those productions come from a rule and which from a fallback, and — for a severed or repaired key — the recorded decision behind it.

**Why this priority**: The criteria only earn trust if their verdicts can be checked. This is also the review surface upstream Keyman reviewers will use when a studio-made keyboard is submitted.

**Independent Test**: Open the touch editor on sil_cameroon_qwerty, select T_0300: the panel names the criterion (rule-defined T_, per-mark guard in force — the mark's start-of-line box unticked), lists its per-state productions with their sources (rule / fallback), and shows the guard store it belongs to.

**Acceptance Scenarios**:

1. **Given** any touch key in the editor, **When** its property panel is opened, **Then** the panel shows the key's id-form criterion and its per-state production table, with fallback-supplied states marked as fallback.
2. **Given** a key whose identity came from a recorded decision (severance, repair, a Track 2 choice), **When** the panel is opened, **Then** the decision and its provenance are shown.

### Edge Cases

- **A layer whose name encodes no state** (`symbol`, `numeric`): keys there are unmodified keystrokes; the criteria evaluate them in state 0, and a K_ key there rides the US fallback — legitimate under FR-002 and not a severance trigger by itself.
- **Caps-layer fallback**: CAPITAL is an Lstate, not an Lmodifier — and KMW's base-key fallback does not inspect it. SETTLED by the T022 caps-fallback probe (research.md §1; contracts §5): the fallback fires for an unmatched K_ key in caps state, producing the US base character for the key's modifier state (state 0 → unshifted, SHIFT → shifted). Criteria may turn on caps-layer fallback behaviour on that basis, and the resolver reports caps-state K_ production as an ordinary, certain k-fallback.
- **Multi-codepoint U_ below the version floor**: a keyboard with `&VERSION` below 15.0 (or none) cannot use a multi-segment U_ id; the string routes to T_ + rule (FR-005c). Raising `&VERSION` is the author's separate decision and is never done silently as a side effect of minting a key.
- **Malformed imported ids** (`u_00D2`, `k_8`, mixed case): import tolerance stands (spec 063 import regime); the criteria apply to minting and rewriting, never as a retroactive rejection of an imported keyboard.
- **A T_ id that is also a desktop/visual-keyboard name** (sil_euro_latin's `[T_N_Dieresis]` in .kmn with no touch key): the namespace is shared; severance transplants and repair proposals consider only ids that occur in the touch layout, and a transplant target id must not collide with an existing .kmn-only T_ name.
- **The same character under two prefixes in one keyboard** (405 corpus keyboards): normal practice, not a finding. Criteria fire per occurrence; no diagnostic may flag mixed production as such.
- **A severed key on a mnemonic desktop layout**: the transplant copies the key's rules as authored; host-layout contingency (FR-002 rider i) is evaluated against the keyboard's target hosts at severance time and recorded with the decision.
- **Track 2 choice fatigue**: identity choices are batched per keyboard at their owning step (one list, per-key answers), never one modal per key.

## Requirements *(mandatory)*

### Functional Requirements

**Policy — the criteria (normative text: [contracts/key-id-criteria.md](contracts/key-id-criteria.md))**

- **FR-001**: All judgements under this spec MUST be made per key occurrence — one key, on one platform, on one layer, in the modifier state that layer's name encodes. No rule in this spec may be stated or implemented per character or per id in the abstract.
- **FR-002**: A touch key MUST keep its `K_` id if and only if its desired behaviour in every state it is exercised in equals the physical key's behaviour there — counting the physical key's explicit rules plus, in state-0/SHIFT layers, its US-base fallback (in any other-state layer the fallback behaviour is no output). Rider (i): the equality MUST hold across the keyboard's target host layouts, where that set is the project's declared target hosts — and {US} when the project declares none (clarified 2026-10-17). The set in force is recorded with each identity decision and shown in the FR-025 panel; changing the declared set re-opens equality evaluation for K_-linked keys but never severs or re-links anything by itself. Rider (ii): wherever studio asks an author to judge this equality, it MUST show which states are fallback-supplied.
- **FR-003**: There MUST be exactly one production resolver — "what does this key produce, in this state, from which source (rule / U_ decode / K_ fallback / nothing)" — and every consumer MUST use it: coverage and gallery detection, touch-method enumeration, character removal and carve, desktop→touch placement replay, combo-layer propagation, scaffolder seeding, the inherit gate of the key-id proposer, and diagnostics. (The resolver extends the spec 063 rule-join in contracts; per-consumer re-derivation of production is a defect under this spec.)
- **FR-004**: If a key's current behaviour already equals its desired behaviour, studio MUST NOT change its id form. Id form is not a defect; template-inherited keys are not "corrected". (The sole exception is FR-009's dead-key repair, which changes a key that has no behaviour.)
- **FR-005**: When a key is severed from K_ or created with no physical counterpart, its destination form MUST be the first matching arm: (a) needs rule logic (guard, context, deadkey, per-state outputs, string-with-conditions, option/store effects) and has no existing ruled identity → `T_` + rules; (b) needs rule logic but already carries a ruled `U_` identity → keep `U_`, rules written against the `U_` id; (c) plain character or fixed string with no rule logic → `U_` (a fixed multi-codepoint string only when the keyboard's `&VERSION` is 15.0+; below that it falls to arm (a)); (d) combining mark → `U_` when the mark's start-of-line box is ticked (FR-013) and no other guard/context is specified, otherwise arm (a) — the guarded default for an unticked box, and always arm (a) when the mark is the output of a deadkey composition; (e) all roles non-producing (frame / navigation / spacer) → `T_` frame class, no rules.
- **FR-006**: Classification under FR-005 MUST be by role set: any producing role puts the key in arms (a)–(d), with `nextlayer` and the subkey family carried as properties of the same key. A key that produces AND navigates AND hosts subkeys is one key under one arm, minted and severed atomically.
- **FR-007**: A producing `T_` key and its rules MUST be created, copied, severed, and removed atomically. Studio MUST never emit a producing T_ key without its rules, nor rules orphaned from their key, in any output package, intermediate serialisation, or preview compile.
- **FR-008**: Severance MUST be a rule-level transplant: every rule naming the source key that serves the touch key's behaviour is cloned and re-keyed to the T_ id with context and output preserved verbatim, including store memberships and shared pattern arms (syllable fans, `index()` pairings). Where a verbatim transplant is impossible because a rule's context binds the key to shared stores, deadkeys, or other keys' rules, the transplant MUST be refused and the key flagged for manual definition; a half-copied rule set MUST NOT be emitted.
- **FR-009**: A producing `T_` key with no rule (dead in Keyman — it types nothing) MUST be surfaced for repair wherever it is encountered (import, copy, adapt, resolver credit), with a criteria-supplied default: convert to `U_<HEX>` when the id suffix parses as the keycap's codepoint AND, for a combining mark, the mark's start-of-line box is ticked (converting a dead T_0300 to U_0300 with the box unticked would manufacture an unguarded mark — the default for a dead mark key is mint id + rule per FR-005(a), matching the column's guarded default); otherwise the choice of minting id + rule per FR-005(a) or blanking the key. Repair is proposed, never applied silently; on Track 1 and in creation it is presented with its default preselected, on Track 2 it is the author's explicit choice (FR-016).

**Creation**

- **FR-010**: The key-id proposer (spec 065) MUST implement FR-005 as its minting decision, replacing character-class-only minting. Its existing inherit-first gate MUST be evaluated through the FR-003 resolver, which MUST credit a U_ key's intrinsic production (a U_ key that already produces the wanted character is inherited, not re-minted).
- **FR-011**: When an author's edit redefines a K_-linked touch key's behaviour in any exercised state (per FR-002's equality), the creation/edit path MUST trigger the severance procedure (FR-008) — automatically on the creation and Copy paths, as a presented choice on Track 2 (FR-016).
- **FR-012**: A keycap relabel alone MUST NOT trigger severance, repair, or any id change.
- **FR-029**: Re-linking MUST be offered wherever a severed (T_) or converted (U_) key's desired behaviour once again satisfies FR-002's equality (arm 0): an author-invoked, recorded action (panel action; on Track 2 under FR-016's choice rules) that deletes the transplanted rules and restores the `K_` id via the contracts §3 mirror procedure. Re-linking MUST NEVER be automatic, and a manual id edit MUST NOT be able to produce the half-applied state (K_ id restored, transplanted rules left behind) that FR-007 forbids. (Added by /speckit-clarify 2026-10-17.)
- **FR-013**: The combining-mark guard MUST be a per-mark start-of-line box on the attachment station (spec 106 FR-015), unchecked by default, stored as a per-mark answer: unticked = the mark is blocked at buffer start by the `nul` swallow rule and mints guarded `T_`; ticked = the mark may start a line and mints plain `U_`. The ask-once per-keyboard question and Track 2's keyboard-wide guard seeding are RETIRED (re-ruled 2026-10-30 via #2374); their replacements are: the per-mark box, the per-mark minting rule (unticked → guarded `T_`, ticked → plain `U_`), the guarded default for late-added marks (a mark first added in the touch editor, or an own-key mark with no attachment row, is minted guarded `T_` and blocked at buffer start — never minted unguarded by default), and per-mark import seeding (unguarded-mark behaviour → ticked boxes, `origin: "imported"`, presented for confirmation, never silently adopted; an unseeded box that contradicts imported guarded behaviour MUST NOT mass-re-mint existing marks).

**Copy (Track 1)**

- **FR-014**: Copying a keyboard MUST carry every touch key's identity and production unchanged — ruled T_ ids with their rules, ruled U_ ids with their rules, frame keys with their navigation — verified by tap simulation parity between source and copy over every key in every layer (SC-002).
- **FR-015**: On Copy, FR-009 dead-key repairs MUST be listed at their owning step with defaults preselected before first download; an author MAY change or decline each, and a declined repair leaves the dead-key warning recorded on the project. "The step that owns the key" is defined for this spec: the touch step (TouchGallery, Phase E) owns every repair and identity finding not triggered by an edit made at another step; an edit-triggered finding is owned by the step where the edit was made. If the author reaches download without ever visiting the list, the repairs pass through UNAPPLIED — preselection is a presentation default, never consent (FR-009) — download is not blocked, and the unapplied repairs' warnings are recorded on the project and listed at the Output step (clarified 2026-10-17).

**Adapt (Track 2) — the author's choice**

- **FR-016**: On Track 2, any change the criteria would make to an existing key's identity (severance under FR-011, repair under FR-009, conversion under FR-005) MUST be presented as a choice at the owning step before it is applied: the criteria's recommendation, each option's consequence in author language, and the author's answer recorded as a decision with provenance (who/what proposed, what was chosen, when). Where the severance transplant REFUSES (FR-008), the choice collapses to the two options that can actually be executed — keep the K_ link, or flag the key for manual definition — with the refusing binding shown as the reason; a severance that cannot run MUST NOT be offered (clarified 2026-10-17).
- **FR-017**: A declined Track 2 choice MUST leave the key's identity and rules exactly as imported, and MUST be visible in the decision log. A recorded decline SUPPRESSES re-presentation: the choice's row stays visible-and-answered at its owning step (the DocumentationFixProposals pattern) so the author can revisit it, it is re-offered only if the triggering edit recurs or the underlying state changes (a new or changed dead key presents fresh; an unchanged declined one does not re-present on resume), and it MUST NOT block download; the recorded warning (where one exists, e.g. a dead key) travels with the project.
- **FR-018**: Track 2 identity choices MUST be batched per keyboard at their owning step (a per-key list), never presented as one modal per key, and MUST NOT be presented at all where the criteria change nothing. Batching governs import- and carve-triggered choice sets; a severance triggered by an edit in the touch editor is decided inline in the key property panel at commit, where the batch unit is the one key in front of the author.

**Carve and rewrite integration**

- **FR-019**: Character removal (carve) MUST resolve the character's touch producers through the FR-003 resolver and MUST handle every occurrence — all layers, all platforms, main keys and subkeys — in one operation, neutralising keys to `T_BLANK`/sp 10 and suppressing their rules (bare, modifier, and guarded forms) in the same operation.
- **FR-020**: Removing a character produced by a ruled `U_` key MUST neutralise the key together with its rules; an implementation that removes only the rule (reviving production via the U_ fallback) or only the key (leaving orphaned rules) is a defect under this spec.
- **FR-021**: Desktop→touch placement replay and combo-layer propagation MUST address keys through the resolver: a placement whose target slot is occupied by a T_ or U_ key MUST land on that key (or be reported), never silently append a duplicate key elsewhere in the layout; a cloned combo layer MUST preserve the ids and productions of keys the combo does not redefine.
- **FR-022**: The scaffolder MUST reuse existing ruled T_ ids from a keyboard's .kmn when scaffolding or reseeding its touch layout, and MUST NOT re-mint a character already produced by a ruled T_ key under a new id.

**Diagnostics and presentation**

- **FR-023**: A producing T_ key with no rule MUST be reported wherever production is credited (editor, gallery, carve, output) — studio's TOUCH_KEY_NO_RULE is the canonical finding; upstream kmc's warning 2092 MUST NOT be relied on (it does not fire in the verified toolchain build — kmc-kmn 19.0.240-alpha, minimal fixtures; research.md §1).
- **FR-024**: Findings and choices under this spec MUST live at their owning step (carve findings at the carve step, marks-guard at the marks step, repair lists at the step that owns the key, identity choices at the step where the edit happens). No pane-top or global banner surface may be added for them (warnings-placement model, #2145).
- **FR-025**: The touch key property panel MUST show, for the selected key: its FR-005 criterion, its production table with the source of each production (rule / U_ decode / K_ fallback / emulation / none, with fallback-supplied states marked), and any recorded decision behind its identity (severance, repair, Track 2 choice) with provenance. The table covers only the states in which the key actually occurs (conditional productions listed per condition, per the contracts §1 record), and lives in a disclosure closed by default — panel height is a functional constraint.
- **FR-026**: All author-facing copy introduced by this spec (severance line, start-of-line column copy, choice consequences, repair wording) MUST ship in en + fr through the i18n catalogue, as message descriptors — never as hard-coded template literals (the #1904 lesson).

**Verification**

- **FR-027**: The implementation MUST ship a corpus gate: adapting and copying every corpus keyboard that has a touch layout changes no touch key's simulated production except where a criterion in this spec mandates it, and the diff is reported per keyboard.
- **FR-028**: The implementation MUST ship tap-simulation fixtures for the named idiom keyboards: sil_cameroon_qwerty and sil_cameroon_azerty (guarded T_), hindi_flick (ruled U_), one gff_* keyboard (T_ producer + navigation + subkey host), one fv_* keyboard (store-grouped T_ fans), and one basic_* keyboard (dead T_ repair).

### Success Criteria *(mandatory)*

- **SC-001**: Carving any single character from sil_cameroon_qwerty leaves zero touch producers of that character on any surface (layout, gallery, coverage, enumeration) and zero live rules producing it from a touch key — verified by test, for at least one T_-produced mark, one T_-produced punctuation, and one ruled-U_-produced character (from the hindi_flick fixture).
- **SC-002**: Copy parity: for every corpus keyboard with a touch layout, the copy's simulated tap output equals the source's for 100% of keys in 100% of layers, excluding keys under a recorded repair or Track 2 decision — and, for every key whose bindings include context or deadkey rules, for the context probes in the FR-028 fixtures (letter+key, space+key, deadkey+key), since single taps with empty context cannot verify context-dependent production.
- **SC-003**: No output package, preview compile, or intermediate serialisation produced by any test in the implementing suites contains a producing T_ key without its rules or rules orphaned from their key (FR-007), checked mechanically over the suite outputs.
- **SC-004**: On Track 2, declining every presented identity choice yields a download whose touch-key identities and .kmn rules are byte-identical to the imported keyboard's; accepting the defaults yields exactly the criteria's changes and no others.
- **SC-005**: The proposer's minting decisions match the contracts' decision table on a table-driven test covering every FR-005 arm and every edge case in this spec, including the sub-15.0 string case and the deadkey-composed mark case.
- **SC-006**: Full CI is green on the implementing PRs, including the non-blocking Playwright e2e lane (Matthew's standing definition of resolved CI), with new e2e walks for: create-with-severance, copy-with-repair, adapt-with-choice (accept and decline), and carve of a T_-produced character.

### Key Entities

- **Touch key production**: for one key occurrence in one layer-state — the output (character, string, deadkey action, layer switch, or nothing) and its source (rule, U_ decode, K_ fallback, none). The resolver's unit of account; stored nowhere, always derived.
- **Key identity decision**: a decision-spine record that a key's id form was set, severed, repaired, kept by choice, or re-linked — carrying the criterion that fired, the track, the proposer (criteria / author), the author's answer where one was asked, and provenance. Surfaced by FR-025.
- **Guard specification**: the per-mark start-of-line box on the attachment station (FR-013; spec 106 FR-015) — unticked (default) the mark is blocked at buffer start by the `nul` swallow rule and mints guarded `T_`; ticked the mark may start a line and mints plain `U_`. (Re-ruled 2026-10-30 via #2374; replaces the retired per-keyboard guard question.)
- **Repair proposal**: a listed, per-key offer under FR-009 — the dead key, the criteria's default repair, the alternatives (convert / mint rule / blank / leave), and the recorded outcome.
- **Transplant record**: the set of rules cloned and re-keyed by a severance, or the refusal with the binding that made a verbatim transplant impossible.

## Assumptions

- The track question (`authoring-track` decision: Copy = Track 1, Adapt = Track 2, per spec 102's clarification) exists and is answered before any flow in this spec runs; switching tracks late re-derives this spec's surfaces (User Story 3, scenario 5).
- The spec 063 rule-join (`buildTouchKeyRuleIndex`) is the resolver's foundation; FR-003 extends it rather than replacing it.
- Keyboards are compiled with the studio's vendored kmc/kmcmplib toolchain; the empirical semantics in research.md §1 were verified against kmc-kmn 19.0.240 and the vendored KeymanWeb — a toolchain upgrade re-opens §1's verdicts and requires re-running the FR-028 fixtures.
- Authorship of the criteria's author-language copy follows the existing en/fr catalogue workflow (messages:extract), as in FR-026.
