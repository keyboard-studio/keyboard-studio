# Feature Specification: Rule access tracks — unlocking Keyman rules for non-programmers

**Proposed feature branch**: `082-rule-access-tracks`

**Created**: 2026-09-28

**Status**: Draft (for review; companion to spec 076, does not amend it)

**Input**: Issue keyboard-studio/keyboard-studio#1812 ("epic: rule behaviours — manage reorder, blocking, and context rules as intents (spec 076)") plus author direction: *"In the same way we've revolutionized simplifying/adapting keyboards, I'd love to make Keyman rules easier to use/manage, especially ones that apply generally. Something visual would be great, but at the very least we could give people an editor that allows them to use the KM syntax."*

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product; propose-then-confirm; where no default is derivable, prompt-with-hint is the floor, never an empty box), §5a (the KeyboardIR is the spine; every mutation operates on the IR, never on `.kmn` text), §9 (reorder-priority routing), §10 (validator layering), §16 (a lower-level raw-KMN editor is a v1.1 candidate; opaque fragments stay view-and-remove until then). [076-rule-behaviours](../076-rule-behaviours/spec.md) (the foundation track: 7 closed behaviour kinds, codec closure FR-004, `ownedByBehaviour`, proposer + recogniser, validator extensions). [005-pattern-schema](../005-pattern-schema/spec.md) (Pattern contract; `reorderRules` consumed by 076). [007-strategy-selection](../007-strategy-selection/spec.md) (axes A1–A8, strategies S-01…). [064-keyboard-attribution](../064-keyboard-attribution/spec.md) (attribution machinery). 1802 ruling (named deadkeys stay opaque machinery beneath behaviours; carve suppression verbs). 1802 amendment A1 (2026-09-28, as corrected by A2's symmetric tradeoff copy and A3's likely-host data): the allow/block choice must be **visible and demonstrable, not silent** — two-tier choice architecture with a mandatory demonstration (host-layout selector, per-row host-consequence labels, honesty captions stating each option's own risk).

## Why this exists

Spec 076 answers the biggest half of #1812: it gives the studio a way to *manage* the rules that distinguish a Keyman keyboard from an OS layout — reordering, blocking, context output — as typed intents (behaviours) instead of hand-written `.kmn`. But 076 deliberately keeps its "no raw-KMN editor" stance: *"The author must not be handed a rule editor… A form where a non-programmer composes `any()`/`index()` rules is that blank decision point wearing a nicer shirt."*

The author's ask reframes that stance as a **sequencing decision, not a final one**. Two observations make a companion track coherent rather than contradictory:

1. **076 builds the substrate an editor needs.** An editor is only dangerous without it. 076 (plus the small extras below) delivers exactly the missing substrate: typed output vocabulary (`nul`/`context`/`context(N)`, FR-004), IR ownership with `ownedByBehaviour` (FR-002), validator gates that name owners (FR-014), and a simulator trace that names what fired (FR-011). With those in place, assisted KM-syntax editing is a small step, not a cliff — which is why §16 can keep raw-KMN editing as a v1.1 candidate *and* mean it this time.
2. **Root §3c already sanctions the floor the author asks for.** Where a default is genuinely not derivable, the floor is a *prompt-with-hint*, never an empty box. For every rule need no proposer can derive — anything beyond 076's 7 kinds, one-off context compositions, named-deadkey chains, option-gated variants — an assisted KM-syntax editor with hints, inventory-aware autocomplete, validation, and simulator proof is exactly the §3c-conformant floor. The defaults stay the product; the editor arrives only where the defaults run out.

This spec therefore defines **three access tracks** that sit on top of 076 as foundation. No track amends 076; all consume its outputs. Tracks are ordered by value-per-risk, and each is shippable alone:

- **Track A — Universal before/after demo pane.** The visual that matters most. Every rule representation (behaviour card, pack, assisted-syntax rule, even an opaque fragment) gets "type here, watch what happens" with a per-keystroke trace naming what fired. *Seeing what a rule does beats seeing the rule.* This is the substrate every other track gets safer on top of — build it first.
- **Track B — Rule builder tool.** An authoring surface for *developing* bundled rules: select rules in the rules step, bundle them as Behaviour records, attach provenance, and export a versioned pack. The one-click pack gallery for end users is the consumption surface fed by the packs this tool produces. Packs are **Behaviour records, never raw `.kmn` snippets**, with machine-generated per-idiom provenance and mandatory before/after demos.
- **Track C — Assisted KM-syntax editor.** Read-only first (highlight, explain, validate, inventory-aware autocomplete), then editable inside playground safety gates, with full raw-KMN editing landing in v1.1 per §16 as a now-small step.

What this spec does **not** do: node-graph visual rule builders. Keyman rules are ordered rewrite groups, and graph edges lie about group order and first-match-wins priority. The honest visual model is a two-view model — the demo pane as primary representation, plus a rule-order list rendered as a priority stack (top wins; each card: "matches when… → produces…"). A block composer may later be a *view* onto that list, never its own model, and only after the card model is proven. (See Out of scope.)

## User scenarios

### US-1 — The demo pane makes a rule legible (Track A, P1)

An author accepts the 076 "Closed keyboard" card on a Latin base and opens the demo pane. They type `5`, then the acute key, and see the stored result stay `5` with the trace line "Swallow mark after non-letter (card 2) — matched `5` + acute, re-emitted context". They switch the host-layout selector to AZERTY, press an undefined key, and see nothing emitted, with the per-row label "blocked: would have fallen through to host `²`" and the honesty caption stating both risks symmetrically — "Allow: the key always does something, but what it does varies by computer. Block: the key does nothing everywhere — predictable, unless your typists expected a character there" — followed by the one question only the author can answer: "Do your typists expect a character on this key?" (per 1802 amendments A2–A3; host examples are best guesses from likely-layout data, UK English included). They understand the rule without reading a line of KMN.

**Independent test**: on a fixture keyboard with a blocking behaviour, the pane's trace names the owning behaviour for a blocked keystroke and for a reordered one; switching host layouts changes the fall-through preview but not the stored result.

### US-2 — A bundled rule gets built with the rule builder (Track B, P1)

A field linguist maintaining several Cameroon keyboards notices they all need the same diacritic-blocking idiom. In the rules step they filter to the blocking rules of `sil_cameroon_qwerty`, select the mark-guard set, and choose "Save selection as rule pack". The builder pre-fills provenance from the source keyboard (id, author, copyright, license, corpus commit), lets them name the pack ("Cameroon diacritic blocking") and attach a canned before/after demo pair, and exports a versioned pack file. The pack re-imports cleanly as Behaviour records — no raw `.kmn` — and its card in the gallery shows the demo, which must run green before "accept" enables.

**Independent test**: build a pack from the blocking rules of the `sil_cameroon_qwerty` fixture; the exported pack validates against the pack schema, carries complete provenance, and installs on a second fixture base with a green canned demo.

### US-3 — The KM-syntax floor for what defaults can't reach (Track C, P2)

An author needs "after `n`, the `g` key produces `ŋ`" — one-hop context output their pack set doesn't cover. The step offers the "add a context rule" entry (076 US-5's opt-in affordance) backed by the assisted editor: they type `U+006E + "g" > U+014B`; the editor highlights the tokens, autocompletes `U+014B` from the confirmed inventory, flags a shadowing conflict with the plain `g` binding, and refuses commit until the before/after demo runs green on the author's own test strings. The rule is IR-owned by an author behaviour record with full provenance ("authored 2026-09-28, assisted").

**Independent test**: author a one-hop context rule in the assisted editor; commit is blocked while a validator diagnostic is open; the demo must pass on author-supplied test strings before the rule lands.

### US-4 — Reading someone else's opaque rules (Track C read-only, P2)

On a Track 2 import whose base carries a `nomatch > nul` idiom the recogniser won't lift (076 edge case: it would also swallow Backspace), the author selects the fragment in the Advanced view. The read-only assist shows token highlighting, a plain-language explanation ("this swallows every unmatched keystroke, including Backspace and Enter — three released keyboards use this idiom"), and a "replace with Closed keyboard behaviour" suggestion linking the 076 card. They can read it, but not edit it, until v1.1.

## Functional requirements

### Track A — demo pane

- **FR-001**: The studio MUST provide a before/after demo pane available from every rule representation: behaviour cards, pack cards, assisted-syntax rules, and Advanced-view opaque fragments. The pane reuses the working copy's single 300 ms compile cycle artifact (076 D3) and MUST NOT trigger its own compile or debounce.
- **FR-002**: The pane MUST render a per-keystroke trace naming the rule or behaviour that fired, in author language ("Swallow mark after non-letter (card 2)"), never bare rule indices. This requires the `simulate()` trace enrichment 076 FR-011 anticipates: each simulated step carries the fired rule's id and its owner (`ownedByBehaviour`, `ownedByPattern`, pack id, or opaque).
- **FR-003**: The pane MUST include the host-layout selector and per-row host-consequence labels wherever a blocking behaviour is demonstrated, per 1802 amendments A2–A3: each option states its own risk symmetrically (Allow — the key always does something, but what varies by computer; Block — the key does nothing everywhere, predictable, but a dead key if typists expected a character there); the prompt asks "Do your typists expect a character on this key?"; host examples are labeled as best guesses from likely-layout data (regional/layout-family or BCP 47 fallback, UK English included), never as observed behaviour.
- **FR-004**: On a compile error the pane MUST show the blocking diagnostic instead of stale output (076 §10 suppression rule); it MUST never present a green demo for a stale artifact.

### Track B — rule builder

- **FR-005**: Packs MUST be shipped as Behaviour records (076 key entities), never raw `.kmn` snippets. A pack compiles through the IR codec so it stays auditable, simulatable, and removable. Raw-snippet packs are a spec violation: they reintroduce the opacity 076 shelves.
- **FR-006**: Every pack MUST carry machine-generated per-idiom provenance: source keyboard id(s), author/copyright line, license pointer, and corpus commit — wired to the facet index's `license-fork-eligibility`. Curated packs only; an uncurated pack store is out of scope (it kills one-click-apply trust).
- **FR-007**: The rules step MUST provide a rule builder with progressive disclosure: the author does three things — selects rule families, names the bundle (one field; id auto-derived), and records a proving demo pair. Everything else is automatic or hidden: script key and behaviour kind are detected from the rules, provenance is pre-filled from the source keyboard(s) and tucked under a collapsed "Details", and validation surfaces inline only when something is wrong. No JSON, no schema jargon, no mandatory metadata forms. The builder is how the v1 seed packs get made.
- **FR-008**: The v1 seed pack set is the five highest-leverage general idioms from the corpus survey: (1) closed keyboard, (2) marks attach only to letters, (3) tone/diacritic replace-on-repress, (4) precomposed diacritic composition (el_pasifika pattern, Latin pack), (5) pre-base vowel reorder (Myanmar E-sign U+1031, parametrizable across the Myanmar-script family — Shan, Karen, Mon). Each maps onto a 076 kind (`swallowUndefined`, `markOnNonBase`, `replace`, `contextOutput`, `reorderTable`).
- **FR-009**: Any local edit to a pack-installed behaviour MUST set a fork marker (pack ref + local delta) on the behaviour record; pack updates MUST NOT overwrite forked behaviours. The card offers revert-to-pack.
- **FR-010**: Every pack card MUST carry the Track A demo pane with at least one canned before/after pair; the demo MUST run green before the pack's "accept" enables.

### Track C — assisted KM-syntax editor

- **FR-023**: The editor MUST ship read-only first: token highlighting, inline validation errors, and plain-language "explain this rule" for any IR-owned rule, built on the codec tokenizer (line/column info already exists in `tokenize.ts`) and the recogniser family (pattern-shape recogniser + 076 FR-012 behaviour recogniser). Read-only assist covers opaque fragments too, but MUST NOT offer edits there before v1.1.
- **FR-024**: Autocomplete MUST draw stores and characters from the working copy's confirmed inventory, never from free text alone; store names follow the corpus naming idiom (lowercase, descriptive).
- **FR-025**: Editable mode is gated on the playground minimum: (a) the studio's sandbox working-copy model, (b) the single-cycle validator gates — commit blocked while any diagnostic is open, (c) one-click revert with diff, (d) nothing commits until the author's own test strings pass the before/after demo. All four are load-bearing; editable mode MUST NOT ship with a subset.
- **FR-026**: Every rule authored in the editor MUST be IR-owned by an author behaviour record (kind `authored`, a new 076-family kind or a pack-kind instance with provenance `author`), carrying timestamp and the assist level used. Authored rules are first-class: recompilable, removable, traceable, and liftable by the 076 recogniser on reimport.
- **FR-027**: Full raw-KMN editing of opaque fragments remains v1.1 per §16; this spec's editable mode covers only IR-round-trippable rules. Non-round-trippable edits are flagged at authoring time, never silently dropped.

### Cross-cutting

- **FR-015**: Behaviours compile to and from the KeyboardIR only (076 FR-003). **Decision (Matthew, 2026-09-28): through the spine alongside other work.** Pack/bundle installation adds Behaviour records to the KeyboardIR and flows through the normal IR→KMN compile; the legacy text-level `kmnFragment` injection path (`pattern-apply/applyAssignments.ts`) MUST NOT be used for behaviours. Shipping Track B or C on an unreconciled path is a spec violation.
- **FR-016**: Validation extensions from 076 FR-014 (Layer A #11 ownership-aware naming, Layer A' I6 covering `ownedByBehaviour`, Layer A #8 flagging output-position `nul` on context-bearing rules) are prerequisites for Track C editable mode, not optional hardening.
- **FR-017**: CJK, Ethiopic, and Hangul routing is unchanged (076 §16): the Behaviours step and the tracks never render for those scripts; the existing unsupported stub stands.
- **FR-018**: Rules MUST be presented and managed in families — collapsible groups of related rules sharing a guard store and output shape (e.g. all `any(diablock) + key > context`). Each group carries a group-level plain-language explanation, a rule count, and group-level management actions (test the group in the demo pane, bundle the group as a pack, disable the group as a unit). The demo trace names the group as well as the fired rule. In the rule builder, group-level selection bundles the whole family in one tap, with expansion to individual rules.
- **FR-019**: kmAssist MUST generate plain-language rule explanations deterministically (no LLM): parse the rule, resolve the guard store and summarize its contents from the characters themselves, find the counterpart emitting rule for the same key, look up the output codepoint's Unicode name/category, and compose from templates. The explanation must read like an author-to-author note ("why you'd want this"), not a syntax gloss. The Unicode lookups come from a pinned, in-repo generated table (FR-021), never hand-rolled ranges.
- **FR-020**: kmAssist MUST offer intent-gated guard suggestions: when the author signals diacritic-blocking intent (creates/edits/selects a rule in the guard family, opens the family card, or installs a pack containing a block behaviour), scan all keys emitting combining marks (Unicode category M*) for missing guard rules and offer them as one grouped, dismissable suggestion — never auto-applied, never shown without the intent signal.
- **FR-021**: The repo MUST ship a pinned Unicode data table as a checked-in generated module: parsed from an official UnicodeData.txt pinned to a recorded Unicode version, range-encoded for size, covering General_Category, Canonical_Combining_Class, and character names for the full range, with a regeneration script and attribution header. All Unicode property reads in engine/contracts (explainer, classifier, mark classes, validator) MUST use this table; new hand-rolled codepoint ranges are forbidden. This also retires the documented v1 gap in `mark-classes.ts` (ccc-based buckets replace the range approximations).
- **FR-022**: Guard analysis MUST be orthography-aware, not just mechanical. The Rules step runs after characters and diacritics are settled, so the suggestion engine MUST consume the confirmed alphabet and each mark's attachment set (which base letters the mark combines with, from character-discovery / 071 mark classes). Two directions: (a) *missing guards* — for each unguarded mark key, scope the suggested guard to that mark's actual non-base set rather than a one-size-fits-all non-letter store; (b) *over-broad guards* — flag a guard that blocks a mark after a character the orthography says IS a valid base ("you block acute after 'e', but your orthography attaches acute to e — intentional?"). The guard store itself (e.g. `diablock`) SHOULD be derivable/proposable from the inventory rather than hand-authored: characters that never appear as diacritic bases are the default block set, refined per-mark.

## Key entities

- **DemoPane**: the universal before/after simulator surface; input = working-copy artifact + test strings (+ host-layout selection); output = per-keystroke stored code points, rendered glyphs, and owner-named trace lines.
- **FiredRuleTrace**: per-step simulator enrichment — rule id, owner (behaviour/pack/pattern/opaque), matched context, emitted output.
- **RulePack**: a curated, script-keyed set of Behaviour records + canned demo pairs + provenance bundle; versioned; installed behaviours carry the pack id until forked.
- **RuleBuilder**: the authoring surface in the rules step that produces RulePacks — rule multi-select, metadata/provenance editing, demo-pair recording, schema-validated export.
- **ForkMarker**: pack ref + local delta on a behaviour record; blocks silent overwrite by pack updates.
- **AuthoredBehaviour**: behaviour record with provenance `author`, the IR owner of every editor-created rule.
- **Playground**: the four-gate commit envelope for editable mode (sandbox, validator gates, revert/diff, simulator proof).
- **KMAssist**: the language-service layer — highlighter, explainer, validator, inventory-aware completer — over IR-owned rules.

## Success criteria

- **SC-001**: An author who has never read KMN can explain what a blocking behaviour does after 60 seconds with the demo pane (measured: picks the correct before/after outcome in 4/5 blind trials on fixture keyboards).
- **SC-002**: The five v1 packs install on fixture bases with provenance shown, green canned demos, and zero new opaque fragments (076 SC-003 fixtures show no opaque-count increase); the rule builder exports a pack from a fixture keyboard that re-imports cleanly as Behaviour records.
- **SC-003**: A one-hop context rule authored in the assisted editor round-trips through the IR with an `AuthoredBehaviour` owner, passes the simulator on author-supplied test strings, and is lifted by the 076 recogniser on reimport.
- **SC-004**: With a validator diagnostic open, the assisted editor's commit is blocked and the demo pane shows the diagnostic, never stale output.
- **SC-005**: A hand-edited pack behaviour shows a fork marker; a pack update does not overwrite it; revert-to-pack restores the packed rules exactly.
- **SC-006**: No new debounce timer exists in the studio after any track lands (076 SC-007 audit).

## Assumptions

- Spec 076 Phases 0–2 (spec/framework, codec closure FR-004, behaviour types + `ownedByBehaviour` + compilers) are the foundation this spec builds on; track sequencing below assumes them.
- The fired-rule trace enrichment (FR-002) is small but required; it is the one simulator change this spec needs beyond 076.
- Named deadkeys stay opaque machinery beneath behaviours (076 out-of-scope; 1802 ruling). Pack candidates needing named-deadkey chains (composition chains, syllable state machines) are v2 packs pending either typed named deadkeys or an explicit opaque-carry decision — recorded as an open question, not a silent drop.
- The `simulate()` host-layout selector work from 1802 amendments A1–A3 is shared substrate with Track A; the two efforts coordinate on the pane rather than building two.
- Packs are curated by the studio team from MIT-licensed corpus keyboards with per-idiom attribution; community pack submission is a later proposal.
- Spelling follows CLAUDE.md house style ("behaviour" in prose); code identifiers decided once at plan time.

## Out of scope

- Node-graph visual rule builders (argued above; the two-view model is the specified visual surface).
- Block composers as an independent model (permitted later only as a view onto the rule-order list).
- Full raw-KMN editing of opaque fragments (v1.1 per §16; Track C read-only assist is the bridge).
- `if()`/`set()`/`platform()` chains, `outs()`, multi-hop context chains, touch-layer state machines, multitap as authorable kinds (stay opaque per 076 FR-015; *reading* them via KMAssist explain is in scope, editing is not).
- Synthesising visual-to-logical reorder tables from Unicode data (076 FR-008 stands).
- Uncurated/community pack stores; pack kinds beyond the v1 five (candidates recorded: named-deadkey composition chain, backspace unwrap, syllable state machine, option-gated variant).
- CJK/Ethiopic/Hangul (076 §16 unchanged).

## Open questions (for the plan to close)

1. **Text-injection reconciliation (FR-015).** RESOLVED 2026-09-28 (Matthew): **through the spine alongside other work** — the mechanism path moves to IR-first for behaviours; pack/bundle installation goes through the KeyboardIR, never the text-injection path. In scope for the current implementation cycle.
2. **Named-deadkey packs.** Type named deadkeys in the codec, or bless explicit opaque-carry for pack kinds that need chains? Blocks v2 packs only.
3. **Proposal-engine auditability.** Track B's per-script proposer (076 Phase 3) needs evidence thresholds and conflict resolution so a confidently wrong default never ships silently (§3c). What are the thresholds?
4. **`begin` entry modelling sufficiency.** FR-004 models NewContext/PostKeystroke entry points for fidelity while the emitter still rebuilds a single entry — is that enough for reorder packs on affected keyboards, or does emit need the topology too?
5. **Pack update channel.** How do installed packs learn about new pack versions (feed? step badge? silent)?

## Plan

**Phase I — Foundation (076 Phases 0–2 + trace).** Spec/framework amendments; codec closure (typed `nul`/`context`/`context(N)`, `context(N>1)`, `begin` entry modelling); behaviour types + `ownedByBehaviour`; one compiler per kind; simulator-backed unit tests; the FR-002 fired-rule trace enrichment; validator extensions (076 FR-014). Close open question 1 (text-injection reconciliation) here — it gates everything after.

**Phase II — Prove (076 Phases 3–4 + Track A + Track B).** Per-script proposer with provenance and none-needed entries; import recogniser; Behaviours step with cards; Track A demo pane (shared with 1802-A1 host-layout demonstration work) wired to every rule representation; Track B rule builder with the FR-007 export flow; pack gallery v1 (the five idioms) as Behaviour records with the FR-006 attribution machinery; fork markers.

**Phase III — Graduate (Track C).** KMAssist read-only (highlight/explain/validate/autocomplete) over all IR-owned rules; editable mode behind the four playground gates; `authored` behaviour kind; recogniser lifts authored rules on reimport.

**Phase IV — v1.1 per §16.** Full raw-KMN editing of opaque fragments (now a small step on the playground substrate); revisit the rule-order priority-stack list view once the card model is proven; v2 packs (named-deadkey chains, unwrap, state machines) pending open question 2.

## Risks

- **Playground gates treated as optional.** Editable KM syntax without all four gates is a faster way to brick keyboards. FR-025 makes the gates a single atomic requirement; reviewers should reject partial implementations.
- **Pack-vs-local drift.** Solved by fork markers (FR-008), but only if every write path sets them — audit the carve gallery and mechanism paths too.
- **Proposer overreach.** A confidently wrong default is a §3c failure. Closed kind set, evidence thresholds, explicit none-needed entries, slow growth.
- **Attribution debt.** Shipping pack text without per-idiom MIT attribution is a licensing bug, not a polish item. FR-006 wires it to `license-fork-eligibility` at install time, not as documentation afterthought.
- **The visual trap.** The demo pane is the specified visual surface because it shows *behaviour*. Any future block/node composer must be a view onto the ordered rule list, never a parallel model, or it will drift from the compiled rules exactly the way raw snippets would.
