# Survey gap analysis — manual request form vs. automated process

> Audit of the legacy **Keyman Keyboard Request Form** (the Google Form used to
> gather client information for *manual* keyboard builds) against the automated
> studio's survey (spec [§7](../spec.md)–[§9](../spec.md)) and the
> [`@keyboard-studio/contracts`](../packages/contracts) data model. Goal: make
> sure every relevant question has a home in the automated process, and decide
> what to do with the ones that don't.

## The core finding: two kinds of question

The manual form mixes two fundamentally different things, and the automated
process was originally scoped to capture only the first:

1. **Authoring inputs** — answers that shape the `.kmn`. These are *already
   covered* by survey Phases A–C and the A1–A7 discovery axis vector
   ([§7.1](../spec.md), [§8](../spec.md)), in several cases more rigorously than
   the form. The form's Section 5 ("Mechanics") is essentially the question the
   whole [§7](../spec.md) strategy framework exists to answer.
2. **Intake / provenance metadata** — who is asking, the sociolinguistic context
   of the language, and who to contact. The authoring flow captured *none* of
   this, because the studio was scoped as a self-service authoring tool, not a
   request-and-assign queue.

## Decisions taken (2026-06-04)

- **Provenance, not a triage queue.** The intake fields become optional,
  **non-gating** metadata (`KeyboardProvenance`) persisted into the package /
  PR body for attribution and contact. No Phase-0 gate, no assignment workflow —
  that remains the out-of-scope triage tool ([§16](../spec.md)).
- **Character discovery is multi-method, not text-first.** A text sample is
  only *one* way to find the needed characters, and many requesters won't have a
  machine-readable corpus. Phase B offers a menu (`CharacterDiscoveryService`):
  list by hand, harvest from a pasted text sample, derive from the **linguist
  agent** (below), or **pick visually** from a script-scoped grid (seeded from
  CLDR exemplars, Unicode-block fallback). The picker is the always-available
  fallback. All methods feed the same confirmed inventory; none builds a wordlist
  or prediction model ([§16](../spec.md) stays deferred).
- **The orthography / authoritative path is an LLM linguist agent.** Instead of
  parsing one user-supplied document, the orthography method is realized as an
  agent (`synthesizeInventory`) that synthesizes a structured, NFC-normalized
  inventory from CLDR `exemplarCharacters` cross-referenced with orthography
  references — usually the single most reliable signal for which characters a
  language needs. A **deterministic CLDR cross-check** flags divergences
  (`not-attested` / `cldr-omitted`) and the result is always **user-confirmed**.
  The earlier web-search + single-doc-parse steps fold inside the agent; they are
  no longer public methods. The prompt template is content-owned and lives in
  [docs/prompts/character-inventory-linguist.md](prompts/character-inventory-linguist.md).
- **Localized name folded into provenance.** Phase A identity is modeled as
  untyped survey answers (no typed identity object), so the autonym lives on
  `KeyboardProvenance.localizedName` — flagged as the one provenance field that
  may also feed a build artifact (`.kps` / `welcome.htm`).

## Question-by-question mapping

Legend: ✅ covered · 🟡 partial / folded in · 🟣 new → provenance · 🟦 new → feature · ⬛ out of scope (intentional)

| Form question | Status | Where it lives / goes |
|---|---|---|
| Email (requester) | 🟣 | `KeyboardProvenance.requester.contact` |
| **§1** Language Name | ✅ | Phase A "language name" ([§8](../spec.md) step 3) |
| §1 Localized Name (autonym) | 🟡 | `KeyboardProvenance.localizedName`; may feed `.kps` / `welcome.htm` display |
| §1 Language Code (BCP-47) | ✅ | Phase A BCP47 tag + langtags.json lookup; drives A2 + routing |
| §1 Number of Speakers | 🟣 | `KeyboardProvenance.speakerCount` (free text — preserves "~12,000") |
| §1 Regions where spoken | 🟣 | `KeyboardProvenance.regions` (the BCP47 region subtag is *not* the same thing) |
| §1 Language status (EGIDS) | 🟣 | `KeyboardProvenance.languageStatus` |
| §1 Community Representative contact | 🟣 | `KeyboardProvenance.communityRep { name, role, email }` |
| **§2** Requester name / contact / affiliation / relation | 🟣 | `KeyboardProvenance.requester { name, contact, affiliation, relationToCommunity }` |
| **§3** Writing System Used | ✅ | A2 script class; auto-detected from BCP47, user-confirmed ([§9](../spec.md) routing) |
| §3 alphabet / syllabary / ideographs / abugida | ✅ | A2 `ScriptClass` ([axes.ts](../packages/contracts/src/axes.ts)) |
| §3 letters / punctuation / other chars | ✅ / 🟡 | Phase B target inventory. The form's 3-way split (letters / punctuation / symbols) is richer than §8's single "target characters" — keep the split as **prompt guidance**; all flow to one inventory |
| §3 regional keyboard to base on | ✅ | Phase A base-keyboard browser ([§8](../spec.md) step 1) |
| **§4** letters (incl. diacritic combos) | ✅ | Phase B; diacritic behavior → A4 |
| §4 punctuation / other chars | ✅ / 🟡 | Phase B (as above) |
| §4 upper/lowercase + casing rules | 🟡 | `&CasedKeys` derived automatically for Latin ([§14 D2](../spec.md)); the form asks explicitly → captured as `KeyboardProvenance.casingNotes` for the reviewer when behavior is non-default |
| §4 link to orthography | 🟦 / 🟣 | **Primary discovery signal**, realized as the **linguist agent** (`synthesizeInventory`): CLDR + orthography synthesis → NFC `LinguistInventory` → CLDR cross-check flags → user confirmation. A user-supplied link is also *recorded* as `KeyboardProvenance.orthographyUrl` |
| §4 text examples | 🟦 | **One discovery method** of several: corpus → `CharacterDiscoveryService.harvestFromText` seeds Phase B (NOT prediction; wordlists stay [§16](../spec.md)-deferred). Pointer stored as `KeyboardProvenance.textSampleRef` |
| §4 Existing Writing Tools | 🟣 | `KeyboardProvenance.existingTools` |
| §4 Base Keyboard | ✅ | Phase A base-keyboard browser |
| §4 Community Involvement | 🟣 | `KeyboardProvenance.communityInvolvement` |
| §4 Additional Notes | 🟣 | `KeyboardProvenance.additionalNotes` |
| **§5** How to produce chars without dedicated keys | ✅✅ | **The core of [§7](../spec.md)** — Phase B per-char key/modifier placement + A3 + the S-01…S-12 strategy selector. Covered more rigorously than the form |
| §5 Treatment of diacritics | ✅ | A4 `DiacriticBehavior` + deadkey / cycle patterns (S-02 / S-04 / S-06 / S-07) |

**Net:** every *authoring* question was already covered. The gaps were all
provenance (🟣), two small fold-ins (localized name, casing note), and the
character-discovery work (🟦). No form question is dropped silently.

One discovery method has *no* corresponding form question: the **visual picker**.
The form implicitly assumed the requester could enumerate characters (by listing
them, or via a text/orthography the builder would read). The automated process
can't assume that, so the picker — a script-scoped grid seeded from CLDR
exemplars — is added as the always-available fallback.

## What changed in this repo

- **New contract types** ([`provenance.ts`](../packages/contracts/src/provenance.ts)):
  `KeyboardProvenance`, `RequesterInfo`, `CommunityRepresentative`, and the
  `makeKeyboardProvenance` factory (strips `undefined` for
  `exactOptionalPropertyTypes`, including the nested objects).
- **New service contract**
  ([`characterDiscovery.ts`](../packages/contracts/src/characterDiscovery.ts)):
  `InventoryChar`, `DiscoveryMethod` (`manual | text-sample | linguist | picker`),
  and `CharacterDiscoveryService` with three methods — `harvestFromText`,
  `synthesizeInventory` (the linguist agent), and `pickerCandidates` (CLDR-exemplar
  / Unicode-block seed for the visual picker).
- **New structured-inventory contract**
  ([`linguistInventory.ts`](../packages/contracts/src/linguistInventory.ts)):
  `LinguistInventory` (+ `CasedLetters`, `AuxiliaryLetters`, `InventoryFlag`,
  `InventorySource`), the `makeLinguistInventory` factory, and the
  `linguistInventoryChars` flattener. Mirrors the agent's JSON 1:1.
- Fixtures ([`fixtures/provenance.ts`](../packages/contracts/src/fixtures/provenance.ts))
  and shape tests ([`provenance.test.ts`](../packages/contracts/src/provenance.test.ts),
  [`characterDiscovery.test.ts`](../packages/contracts/src/characterDiscovery.test.ts),
  [`linguistInventory.test.ts`](../packages/contracts/src/linguistInventory.test.ts));
  exported from the package + fixtures barrels.
- **Prompt template** (content-owned, spec §13):
  [docs/prompts/character-inventory-linguist.md](prompts/character-inventory-linguist.md).
- **Spec edits** (prose, single-reviewer): [§8](../spec.md) Phase A (localized
  name + non-gating provenance) and Phase B (multi-method discovery; orthography =
  linguist agent + CLDR cross-check + NFC/NFD note); [§12](../spec.md) (provenance
  in PR body / `NEXT_STEPS.md`); [§13](../spec.md) (prompt-template home);
  [§16](../spec.md) (character discovery in scope vs. wordlist deferred).

The locked [`Pattern`](../packages/contracts/src/pattern.ts) schema is
untouched, so the [§17](../spec.md) revision policy's major-version-bump /
joint-session requirement is **not** triggered — these are additive types and
prose edits.

## Online collection mechanism

The "online mechanism to collect the input" is the SPA survey itself: the
authoring inputs flow through Phases A–C as before; the provenance fields are an
optional, non-gating block in Phase A; and Phase B gains the multi-method
character-discovery UI (manual entry, paste-a-sample, the linguist agent, or the
visual picker). Nothing here requires a separate intake form or a triage backend.

## Still open / deferred

- **Predictive text / wordlists** — deferred post-v1 ([§16](../spec.md));
  discovery deliberately stops at character enumeration.
- **`CharacterDiscoveryService` implementation** — only the contract exists. The
  text grapheme-segmentation + base diff, the linguist agent (`synthesizeInventory`
  — LLM synthesis + the deterministic CLDR cross-check that fills `flags`), and the
  CLDR-exemplar picker seed (`pickerCandidates`) are engine work — they belong with
  the `engine` package and overlap the [kbgen seeder](../utilities/kbgen/INTEGRATION.md),
  which already reads the same pinned Unicode/CLDR signal.
- **Linguist-agent grounding** — whether the agent gets retrieved CLDR/orthography
  text as grounding context or relies on tool access (the "grounding context /
  Keyman reference index" of spec §13) is an engine + content decision.
- **Orthography parsing fidelity** — extracting a clean character set from an
  arbitrary orthography document (PDF/HTML/scan) is hard; the agent produces a
  best-effort inventory that the CLDR cross-check flags and the user confirms, not
  a guaranteed-correct one.
- **Provenance rendering** — the exact Markdown layout of provenance in the PR
  body / `NEXT_STEPS.md` is an output-team detail, not yet specified.
