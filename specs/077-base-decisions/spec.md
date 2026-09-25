# Feature Specification: Base-keyboard decisions with knowledgeable consent

**Feature Branch**: `077-base-decisions`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Scan the chosen base keyboard for the decisions it has already made — axes and facets — use them as defaults, and let the survey confirm, strengthen, lessen, or overturn them with knowledgeable consent. Coupled decisions form bundles (AZERTY → QWERTY). Every finding and resolution is logged in the decision record and shown in the decision trail."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product: propose-then-confirm, "no default is a defect") and §5 "Base-derived pre-fill"; [007-strategy-selection](../007-strategy-selection/spec.md) (axes A1–A7, the decision tree, axis-fill precedence survey > import-derived > script-class prior); [008-data-flow](../008-data-flow/spec.md) (base-derived prefill; axis probes pruned to what the base did not settle); [038-adaptation-questions](../038-adaptation-questions/) (inheritance posture, evidence provider left unimplemented); [053-decision-audit](../053-decision-audit/spec.md) and [055-legible-decision-trail](../055-legible-decision-trail/spec.md) (decision record, `base-derived` agency, FR-032 proposal lookup); [070-keyboard-facet-index](../070-keyboard-facet-index/) and the facet classifier specs 037/041/043 (offline per-keyboard facets whose logic this feature brings to runtime). On conflict those documents win, except where this spec explicitly amends 007 (see Assumptions).

## Why this exists

The project was designed around a two-layer model. The base keyboard the author starts from has already made many decisions: how diacritics are typed, whether digits need Shift, which physical layout family it follows, whether marks are typed before or after the letter, how many keys are free. Those decisions are the *first* layer of defaults. The survey is the *second* layer. It adds to them, strengthens them, relaxes them, or overturns them.

Only the second layer exists today:

- **Almost nothing is learned from the base.**
  - One axis (mark input order) has a base-derived producer. It can only report one value, and no shipping keyboard triggers it.
  - Richer per-keyboard findings exist, such as the diacritic mechanism, spare-key budget, mnemonic vs. positional layout, reordering rules and primary strategy. They are computed only offline for the facet index and never reach the author.
- **The survey barely records axes either.** The questions that are meant to decide scale, typing approach, stacking marks and conjuncts do not write an axis. As a result the strategy recommendation never actually runs in the studio, and the mechanism gallery falls back to matching on script alone.
- **The decision trail shows only survey answers.** It shows almost all of them as "set by hand". Nothing the base decided, and nothing the tool inferred about strategy, is logged.

The result is the defect §3c names. Decisions inherited from the base pass through silently. The author never sees them, cannot tell a deliberate convention from an accident, and never consents to keeping them.

Two examples show why silent inheritance is wrong:

- **An inconsistent base.** Eleven of twelve vowels take their accent through a dead key typed first, and one vowel uses a key typed after it. That may be the original author's mistake, or a deliberate choice for that vowel. Either way the author adapting the keyboard should be told and asked.
- **A mismatched base.** A QWERTY keyboard is built from an AZERTY base. AZERTY puts digits on Shift, swaps A/Q and Z/W, moves M, and rearranges the punctuation row. These are right for French typists and wrong for most others. They belong together, and the author should be able to overturn them as a set while keeping any one of them deliberately.

### The invariant this feature names

> **Every decision inherited from the base keyboard is a default, and every default must be shown and consented to.** Each is explained in terms the author understands, with its evidence and any inconsistencies. The author may confirm, strengthen, lessen, or overturn it. The resolution is recorded, and no later step may silently contradict it.

## Clarifications

### Session 2026-09-23

- Q: Where are base decisions shown? → A: Inline at the survey point where each is relevant, and always listed (and revisable) on the Decisions tab. No single upfront review step.
- Q: How does the tool know what physical keyboard the target users type on? → A: Ask. A new survey question, allowing more than one keyboard, pre-filled from region and base. Its answer is a decision in its own right and may seed further defaults.
- Q: Which conversions ship first? → A: None. Settled 2026-09-23 by the crew's feasibility review: the first release ships no automatic conversions (see FR-014). Conversions are deferred to a follow-up feature gated on a per-letter rule-shape classifier spike and a mutate()-seam rewrite/permutation engine spike.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what the base keyboard already decided (Priority: P1)

After choosing a base keyboard, the author meets the decisions that keyboard embodies as the survey reaches each topic, stated in plain language. The full list is always on the Decisions tab. Examples:
- "Accents are typed with a dead key pressed before the letter."
- "Digits are typed by pressing Shift."
- "Follows the French AZERTY layout."
- "The accent mark is typed after pressing the letter it modifies."

Each decision shows how consistently the base applies it (for example "11 of 12 vowels") and names any exceptions, with the keys involved. A flagged exception is explained with a template such as "This vowel's accent works differently from the others: [mechanism], possibly because it also carries [tone/nukta]." or "This letter has no separate uppercase form."

**Why this priority**: Nothing else in the feature is possible until inherited decisions are surfaced. On its own this story already turns silent inheritance into visible inheritance, and it gives the decision trail its first base-layer entries.

**Independent Test**: Pick a known base keyboard with at least one dead-key convention and one known exception. Check that the list names the convention, gives the correct conforming/total count, and identifies the exception.

**Acceptance Scenarios**:

1. **Given** a base where every vowel uses the same accent mechanism, **When** the survey reaches that topic (or the author opens the Decisions tab), **Then** that decision is shown as *consistent* with no exceptions listed.
2. **Given** a base where all vowels but one share a mechanism, **When** the survey reaches that topic, **Then** the decision is shown as the *dominant* convention, the count reads "N of M", and the exceptional vowel is named with the keystroke it uses.
3. **Given** a base where no mechanism dominates, **When** the survey reaches that topic, **Then** the decision is shown as *mixed*, and the author is not offered a single "base value" as though it were settled.
4. **Given** a base for which a detector finds nothing (for example, no diacritics at all), **When** the survey reaches that topic, **Then** that decision is omitted rather than shown empty, and it is absent from the Decisions tab.
5. **Given** any shown decision, **When** the author asks for detail, **Then** they can see the specific keys and outputs that make up the evidence.

---

### User Story 2 - Confirm, strengthen, lessen, or overturn a decision (Priority: P1)

For each inherited decision the author chooses one of four resolutions. The consequences of each are explained before they choose.

| Resolution | What it means |
|---|---|
| **Confirm** | Keep it as it is, including any exceptions. |
| **Strengthen** | Make it consistent, bringing the exceptions into line with the convention. |
| **Lessen** | Relax it, so that more than one way is allowed. |
| **Overturn** | Replace it with a different choice. |

Confirm is preselected, so an author who agrees with everything moves on in one action. The action and its consequences stay visible, so this is not an unexamined default.

**Why this priority**: Consent is the point of the feature. Seeing decisions without being able to act on them only moves the silent default one screen later.

**Independent Test**: For one decision with an exception, apply each of the four resolutions in turn. Check that the working keyboard, the strategy recommendation, and the decision trail each reflect the choice.

**Acceptance Scenarios**:

1. **Given** a dominant decision with one exception, **When** the author chooses *Strengthen*, **Then** in the first release the resolution is recorded and listed as manual follow-up, and the author is told plainly the change must be made by hand; when a conversion ships, this is the conversion feature's acceptance instead: the exception is converted to the dominant convention in the working keyboard, and typing that key sequence in the preview produces the output the convention implies.
2. **Given** the same decision, **When** the author chooses *Confirm*, **Then** the exception is kept and the trail records that the exception was reviewed and accepted, not merely inherited.
3. **Given** a decision, **When** the author chooses *Lessen*, **Then** in the first release the resolution is recorded and listed as manual follow-up; when a conversion ships, this is the conversion feature's acceptance instead: the keyboard accepts both the base's way and the alternative, and the strategy recommendation reflects the relaxed choice.
4. **Given** a decision, **When** the author chooses *Overturn* and picks an alternative, **Then** in the first release the resolution is recorded and listed as manual follow-up; when a conversion ships, this is the conversion feature's acceptance instead: the working keyboard is converted where a conversion is available.
5. **Given** a resolution with no conversion available yet, **When** the author chooses it, **Then** the author is told plainly that the change must be made by hand, the resolution is still recorded, and the item appears as a manual follow-up in the output checklist. The tool never claims a conversion happened when it did not.
6. **Given** a resolved decision, **When** the author changes their mind, **Then** they can revise the resolution. The trail keeps both entries, with the later one superseding the earlier.

---

### User Story 3 - Overturn a coupled set of decisions together (Priority: P2)

Some decisions come as a set. On the physical-keyboard question, when the base follows a layout family that differs from the one the target users type on, the author sees one parent decision ("Your base follows the French AZERTY layout") with its members listed beneath it:
- digits on Shift
- A/Q and Z/W swapped
- M position
- punctuation row

Which members are listed depends on the reference-layout pair (FR-006): this is the AZERTY→QWERTY list; a QWERTZ→QWERTY bundle lists a different set (Y/Z swap, Ä/Ö/Ü positions, punctuation row — digits-on-Shift is not a discriminating member there). Overturning the parent proposes overturning every member. Each member can still be kept individually.

**Why this priority**: This is a high-value, frequent adaptation (a new language keyboard built from the nearest national keyboard). It needs the P1 machinery first.

**Independent Test**: Start from an AZERTY base, answer QWERTY on the physical-keyboard question, overturn the layout family to QWERTY but keep "digits on Shift". Check in the preview that letters sit in QWERTY positions and digits still need Shift.

**Acceptance Scenarios**:

1. **Given** an AZERTY base, **When** the physical-keyboard question is reached, **Then** the layout-family decision appears as a parent with its members grouped under it, and each member shows its own consistency.
2. **Given** that bundle, **When** the author overturns the parent to QWERTY, **Then** every member is proposed as overturned, and the author sees the full list of what will change before confirming.
3. **Given** that proposal, **When** the author keeps one member (for example "digits on Shift") and confirms, **Then** only the other members are converted, and each member's resolution is recorded separately.
4. **Given** a base that already departs from its layout family on one member, **When** the bundle is shown, **Then** that member appears as an exception within the bundle, in the same way as in User Story 1.
5. **Given** the author answers that the target users' physical keyboard matches the base's layout family, **When** the bundle is shown, **Then** the bundle is presented as consistent with the target, and overturning it is not suggested.

---

### User Story 4 - The survey reopens a decision instead of silently overriding it (Priority: P2)

Later in the survey the author may give an answer that implies a different value for a decision already resolved. For example, they may answer that marks are typed after the letter when the base types them before. The tool does not silently apply the new value. It points out that the answer departs from the base (or from the author's earlier resolution) and asks the author to choose a resolution. The survey answers also strengthen decisions: an answer consistent with the base's decision is recorded as confirming it.

**Why this priority**: Without this, the survey layer can quietly undo the consent captured in User Story 2. It depends on User Stories 1 and 2.

**Independent Test**: Confirm a base decision, then give a survey answer that contradicts it. Check that a reopen prompt appears, and that the trail records the chain of base finding, first resolution and revised resolution.

**Acceptance Scenarios**:

1. **Given** a confirmed base decision, **When** a later answer contradicts it, **Then** the author is shown the conflict (base value, prior resolution and new implication) and asked to choose a resolution before the change applies.
2. **Given** a base decision, **When** a later answer agrees with it, **Then** no prompt appears and the trail records the answer as confirming the decision.
3. **Given** a survey question whose answer the base already settled, **When** the survey reaches it, **Then** the question is presented pre-filled from the resolved decision (propose-then-confirm) or skipped as already settled. The author is never asked from a blank slate for something the base decided.
4. **Given** the set of resolved decisions, **When** enough axes are known, **Then** the tool recommends a strategy for the keyboard. The recommendation, and any later change to it, is visible to the author and recorded.

---

### User Story 5 - The decision trail tells the whole story (Priority: P3)

The decision trail and the submission summary show, for every inherited decision:
- where it came from (base keyboard, survey, or tool default)
- how consistent the base was
- the author's resolution

For example: "Accent input: base used a dead key for 11 of 12 vowels → strengthened to all 12."

**Why this priority**: Reviewers and future maintainers need this record. The data is produced by User Stories 1, 2 and 4; this story makes it legible.

**Independent Test**: Complete a walk that confirms one decision, strengthens another and overturns a bundle. Check that the trail and the submission summary list all three with their origin and resolution.

**Acceptance Scenarios**:

1. **Given** a completed walk, **When** the author opens the decision trail, **Then** every base decision appears with its origin, consistency and resolution, and superseded resolutions remain visible as history.
2. **Given** a submission, **When** the summary is generated, **Then** it includes the base decisions and their resolutions in plain language.
3. **Given** a decision record saved by an earlier version of the tool, **When** it is loaded, **Then** it still opens without loss. It simply has no base-decision entries.

### Edge Cases

- **Opaque constructs.** The base contains constructs the tool cannot model (opaque fragments). Decisions whose evidence lies wholly inside them are reported as "could not be determined", never guessed. Partial evidence is reported with that caveat.
- **Unfaithful conversion.** The author strengthens a decision, but the exception key also carries other behaviour. The conversion must not drop that behaviour; if it cannot be preserved, the conversion falls back to manual follow-up.
- **Changing base.** The author changes base keyboard mid-walk. The base decisions are recomputed for the new base. Earlier resolutions that no longer apply are shown as void in the trail, not silently carried over.
- **Target-dependent decisions.** Spare-key availability depends on the target inventory. It is shown from the base first, then re-evaluated and re-presented if the confirmed inventory changes it materially.
- **Import track.** For an author improving their own keyboard (the import track), the same decisions appear inline and on the Decisions tab, framed as "decisions your keyboard makes".
- **Too many decisions.** The base yields many decisions. On the Decisions tab, consistent low-stakes decisions collapse into one "confirm all" row; decisions with exceptions or mixed usage are always expanded. Inline, a survey point shows only the decisions relevant to it.
- **Survey conflicts with the base in a bundle.** A later survey answer conflicts with a member of a bundle. Only that member reopens, not the whole bundle.
- **Unrecognised layout family.** No reference layout matches the base. The layout family is reported as "other" and no layout bundle is offered.
- **Whole-layout replacement.** The target physical keyboard is Dvorak, Colemak, Turkish-F or similar. This is a distinct whole-layout-replacement decision kind, not a swap bundle, and does not use the member list of a reference-layout-pair bundle.
- **Non-Latin base on Latin hardware.** The base's script is non-Latin but the hardware is QWERTY-labelled. The layout bundle does not apply; the key-to-glyph mapping is a separate decision outside this bundle's scope.

## Requirements *(mandatory)*

### Functional Requirements

**Detecting base decisions**

- **FR-001**: When a base keyboard is chosen (copy/adapt track) or imported (improve track), the system MUST derive the set of decisions the keyboard embodies from its parsed form, before the author is asked about any of them.
- **FR-002**: The set of detectable decisions MUST be open-ended. Adding a new kind of decision MUST require only a new detector and its plain-language explanation, with no change to how decisions are presented, resolved or logged.
- **FR-003**: The first release detection set splits into what MUST be detected and what MAY be detected opportunistically but is never promised:
  - **MUST detect:**
    - A1 scale
    - A3a mark input order
    - A4 diacritic behaviour
    - A7 spare-key availability
    - per-letter diacritic input mechanism
    - physical layout family, including the layout-family member decisions (letter swaps, punctuation row)
    - digits requiring Shift
    - casing
    - the input strategies the base uses
  - **MAY detect opportunistically, never promised:**
    - A2 script class, as confirmation of the identity-derived value
    - A2a cluster sensitivity, via reordering rules
    - A3 phonetic vs. positional arrangement, via a mnemonic-vs-positional proxy
    - A5 multiple input modes
    - A6 constraint enforcement
    - A7a remap posture

  No evidence path exists today, in a base keyboard, for A3, A5 or A6; those entries under MAY are aspirational until such a path exists.
- **FR-004**: Each decision MUST carry:
  - its dominant value
  - its consistency (conforming count, total count, and the list of exceptions, each with the keys and outputs involved)
  - a derived strength: consistent, dominant or mixed
  - a plain-language explanation that is localisable
  - its counting unit, declared by the detector: diacritic mechanism and mark order count per (letter, mark) pair when a letter in the inventory can carry more than one mark type, collapsing to per-letter when the mapping is 1:1; layout-bundle members count per key
- **FR-005**: Decisions whose evidence the tool cannot read (for example, because it lies inside opaque constructs) MUST be reported as undetermined, not guessed.
- **FR-006**: A decision MAY belong to a bundle with a parent decision. Bundle membership MUST be explicit in the decision and not inferred by the presentation layer. Bundle membership is pinned per reference-layout pair, not per layout alone: the AZERTY→QWERTY bundle's members are digits-on-Shift, the A/Q swap, the Z/W swap, the M position and the punctuation row; the QWERTZ→QWERTY bundle's members are the Y/Z swap, the Ä/Ö/Ü positions and the punctuation row — digits-on-Shift is not a discriminating member of the QWERTZ→QWERTY bundle. Whole-layout replacements such as Dvorak, Colemak or Turkish-F are a distinct whole-layout-replacement decision kind, not a swap bundle. A layout bundle covers the Latin-hardware convention family only; a non-Latin base typed on QWERTY-labelled hardware is a separate key-to-glyph mapping decision, outside this bundle.
- **FR-007**: A decision that depends on target data (for example spare-key availability) MUST be re-evaluated when that data changes, and re-presented if its value changes.
- **FR-008**: The runtime detection logic MUST be the same logic that produces the offline keyboard facet index. There MUST be a single source for each classifier, so the index and the studio cannot disagree about a keyboard.

**Presenting and resolving**

- **FR-009**: The system MUST present each base decision to the author in plain language, with its consistency and exceptions, and with the underlying evidence available on request. Decisions are shown **inline, at the survey point where each is relevant** (the diacritic-mechanism decision on the marks questions, the layout-family bundle on the physical-keyboard question, and so on), not as one upfront review. The complete list, with current resolutions, is always available on the **Decisions tab** (the existing decision-trail view), where the author can also revise a resolution. A decision with no natural survey point MUST still appear on the Decisions tab and be resolvable there.
- **FR-010**: For every decision the author MUST be able to choose Confirm, Strengthen, Lessen or Overturn, subject to which resolutions apply to that decision's kind. The consequence of each choice MUST be shown before it is applied.
  - Strengthen is offered only when the decision has exceptions.
  - Lessen and Overturn are offered only when an alternative value exists.
  - **Facet decisions** with exceptions: all four resolutions apply.
  - **Axis decisions**: Confirm and Overturn always apply. Strengthen applies only if the axis decision has exceptions. Lessen applies only where the axis has a permissive superset value (A4, A6, A7a); Lessen MUST NOT be offered for A1, A2, A3 or A5.
  - The presentation MUST hide inapplicable resolutions rather than grey them out.
- **FR-011**: Confirm MUST be the preselected resolution. Consistent, low-stakes decisions MAY be confirmed together in one action. Decisions with exceptions or mixed usage MUST be presented individually.
- **FR-012**: Overturning a bundle parent MUST propose overturning each member. The author MUST be able to keep any member individually, and each member's resolution MUST be applied and recorded separately.
- **FR-013**: The survey MUST ask which physical keyboard(s) the target users type on. The question is pre-filled from the target language's region and the base's layout family (propose-then-confirm), allows more than one answer, and is declared in the step manifest (FR-021). Its answer is itself a recorded decision and MAY seed further defaults and decisions (for example the layout-family bundle, digits-on-Shift, and the expected punctuation row). The layout-family decision MUST be evaluated against this answer, and overturning is suggested only when the two differ. When several physical keyboards are given, the bundle is evaluated against each, and the author is told which of them the base matches. The offered answers are the Latin-hardware layout conventions (for example QWERTY, AZERTY, QWERTZ) plus a "phone/touch only" option; when the author selects only "phone/touch only", the layout bundle is shown as informational and overturning it is not suggested.
- **FR-014**: Strengthen, Lessen and Overturn MUST change the working keyboard where a conversion exists for that decision. The changed keyboard MUST remain valid under the existing validation layers. The first release ships no automatic conversions. Reasons: the existing base-derived detectors are read-only and cannot rewrite the working keyboard; the only prior mutator (`stub-mutator`) is a superseded text-substitution stub, not a conversion engine; the mark-order detector cannot see `if()`-guarded rules, which dominate real keyboards, so it cannot certify a conversion is safe; and no key-permutation or bundle-rewrite engine, nor AZERTY/QWERTZ reference tables, exist yet to drive a layout-family or digits-on-Shift conversion. Every Strengthen, Lessen or Overturn chosen in the first release is recorded as a resolution and handled under FR-015 as manual follow-up; it is never presented as done. Conversions are a follow-up feature. Before it ships it MUST first spike (i) a per-letter rule-shape classifier able to tell what a rule expresses, and (ii) a `mutate()`-seam rewrite/permutation engine, including closing the `if()`-guard opacity gap above. Any future "Lessen = add a secondary strategy" MUST route through the existing secondary-strategy pass of the decision tree (spec 007 §7.2 rules 9/10), not a new mutation path.
- **FR-015**: Where no conversion exists, the system MUST record the resolution, tell the author the change must be made by hand, and list it as a manual follow-up in the output checklist. It MUST NOT present the change as done.
- **FR-016**: The author MUST be able to revise any resolution at any time before output.

**Survey interaction**

- **FR-017**: Survey questions that decide an axis MUST record that axis, so that axis values reflect both the base layer and the survey layer. Survey answers take precedence over base values only through a resolution (FR-018), never silently. Axis precedence overall follows the four-tier order in FR-026.
- **FR-018**: When a survey answer implies a value different from a resolved decision, the system MUST reopen that decision, show the conflict (base value, current resolution and new implication), and apply the change only after the author chooses a resolution. An answer consistent with the decision MUST be recorded as confirming it.
- **FR-019**: A survey question whose answer is settled by a resolved decision MUST be pre-filled from it or skipped as settled. It MUST NOT be asked blank.
- **FR-020**: Once the needed axes are known from the base and survey layers, the system MUST produce a strategy recommendation and use it to rank the mechanism gallery. The recommendation MUST be visible to the author.
- **FR-021**: Any new survey surface introduced by this feature MUST be declared as a step in the step manifest, with typed inputs and writes, and all working-keyboard changes MUST go through the existing mutation seam (constitution principle IX).

**Recording**

- **FR-022**: The decision record MUST contain one entry per detected base decision (with its evidence summary), one entry per resolution (linked to the decision it resolves, with later resolutions superseding earlier ones), and the strategy recommendation whenever it changes.
- **FR-023**: Survey answers that were accepted proposals MUST be recorded with the proposal's real source (base keyboard, language data, prior answer), not as set by hand. This resolves spec 055 FR-032.
- **FR-024**: Decision records saved before this feature MUST still load without loss.
- **FR-025**: The decision trail and the submission summary MUST show each base decision's origin, consistency and resolution in plain language, with superseded resolutions visible as history.

**Precedence and deliberate exceptions**

- **FR-026**: Axis precedence MUST follow a four-tier order: (1) a survey-recorded answer; (2) a resolved base decision — one where the author has applied Confirm, Strengthen, Lessen or Overturn; (3) an unresolved import-derived fill; (4) a script-class prior. An unresolved base finding MUST NOT silently override a blank survey axis; it participates only at tier 3.
- **FR-027**: An exception MAY carry a "possibly deliberate" flag with a reason, set when the exception matches a known-asymmetric letter class in a content-owned, per-script table (for example: Vietnamese tone-bearing vowels; Turkish dotless/dotted i casing; letters lacking a precomposed form, which must compose base + combining mark while sibling letters have a precomposed codepoint; Devanagari nukta consonants; Hebrew shin/sin dot; casing asymmetries such as ß or ŉ). When an exception is flagged, its explanation reads "this exception matches a known pattern: ..."; Strengthen MUST NOT be preselected or visually emphasized ahead of the other resolutions for a flagged exception, and Confirm remains the default. Content owns the per-script table.

### Key Entities

- **Base decision**: a decision the base keyboard embodies. It has an identity, a kind (axis or facet), a dominant value, a consistency (conforming count, total count, exceptions), a strength (consistent, dominant or mixed), optional bundle membership, and a plain-language explanation.
- **Exception**: one place where the base departs from its own dominant decision. It names the subject (for example the vowel `ɛ`), the value observed there, the evidence (keys and output), and an optional "possibly deliberate" flag with a reason drawn from the content-owned per-script table (FR-027).
- **Decision bundle**: a parent decision (for example the layout family) and the member decisions that normally change together with it.
- **Resolution**: the author's response to a base decision (confirm, strengthen, lessen or overturn, plus the chosen alternative if any). It carries its origin (inline at a survey point, the Decisions tab, or a reopened survey conflict) and whether it was applied automatically or left as manual follow-up.
- **Decision detector**: a registered unit that examines the base keyboard and yields zero or one base decision of its kind. It optionally offers conversions for the non-confirm resolutions.
- **Strategy recommendation**: the strategy the tool recommends from the combined axes. It is recorded whenever it changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every base keyboard in the reference test set, 100% of the decisions the detectors can determine are shown to the author before any survey question about the same subject.
- **SC-002**: On a reference fixture with a known exception (12 vowels, 1 different), the inline decision reports "11 of 12" and names the exception. In the first release, after Strengthen the resolution is recorded and listed as manual follow-up; when the conversion feature ships, this is its acceptance instead: all 12 produce the expected output in the preview.
- **SC-003**: Starting from an AZERTY base, an author can switch to QWERTY while keeping one chosen member, in no more than three actions on the physical-keyboard question. In the first release the resolution is recorded and listed as manual follow-up; when the conversion feature ships, this is its acceptance instead: the preview confirms letter positions and the kept member.
- **SC-004**: No survey answer changes a resolved decision without a visible reopen prompt. This is verified by an automated walk that deliberately contradicts every resolved decision it can.
- **SC-005**: In a completed walk, 100% of base decisions and resolutions appear in the decision trail and the submission summary with origin and resolution. No accepted proposal is recorded as "set by hand".
- **SC-006**: The strategy recommendation is produced in 100% of walks where the base and survey layers together provide the needed axes. Today it is produced in none.
- **SC-007**: The offline facet index and the studio report identical values for every shared decision on every keyboard in the corpus.
- **SC-008**: An author who agrees with every inherited decision never needs more than one action per expanded decision inline, plus one action on the Decisions tab for all collapsed consistent decisions.

## Assumptions

- **Strength thresholds:** *consistent* = 100% conforming; *dominant* = at least 75% conforming AND at least 3 conforming instances AND every unflagged exception individually enumerable; *mixed* otherwise. For a total count M < 4, no strength label is shown — only the raw "N of M" count. km-domain flagged the thresholds themselves as a linguistic question to be settled during planning review, not a tuning knob to be picked arbitrarily.
- **Existing resolutions stay authoritative.** The existing axis precedence remains, applied through resolutions rather than silent overrides, and is superseded by the four-tier order in FR-026.
- **Axis-fill source vocabulary.** FR-026's new precedence tier adds a "resolved base decision" value to the axis-fill source vocabulary in `packages/contracts`. This is additive to the contracts' vocabulary, not a change to the locked `Pattern` schema.
- **Reference layouts** for layout-family matching, and the bundle membership list for each reference-layout pair (FR-006), are pinned datasets in the same style as the facet index's pinned base layouts. The first release covers at least US QWERTY, French AZERTY and German QWERTZ.
- **The decision-record change is additive.** It adds new entry kinds and bumps the record version with a migration. The locked `Pattern` schema is not touched.
- **No runtime index loading.** The studio derives base decisions from the keyboard itself. Loading the full offline facet index at runtime remains out of scope ([048-base-facets-in-ir](../048-base-facets-in-ir/spec.md)).
- **Spec 007 revision.** This feature amends [007-strategy-selection](../007-strategy-selection/spec.md)'s stance that spare-key availability is not seeded from the base. When this spec is accepted, the following amendment note lands verbatim in [007-strategy-selection/spec.md](../007-strategy-selection/spec.md)'s Revalidation record block, near the existing A7 note, and a matching decision is logged in [docs/spec-signoff.md](../../docs/spec-signoff.md) as a D10 entry in the D1–D9 prose format:

  > Amendment (077-base-decisions, 2026-09-23). Axis precedence gains a tier between 'import-derived fill' and 'survey-recorded': a resolved base decision, set only after the author applies Confirm/Strengthen/Lessen/Overturn to a detected base decision (077 FR-010/FR-022/FR-026). Order becomes: (1) survey-recorded axis, (2) resolved base decision, (3) unresolved import-derived fill, (4) script-class prior. A7 (spare-key availability): the 'no live producer today' stance is retired — 077 seeds A7 from the shared spare-key-budget classifier (077 FR-008), making A7 live for the first time and activating rule 10 on real selections; this is a first-time regression surface and needs corpus-regression coverage before the new axis-fill source ships. The 'confirm/override UI for filled axes' follow-up is subsumed by 077 FR-009/FR-010.

  Planning MUST also add three §7.5 self-check rows to 007: (a) A7 via a base-derived spare-key budget flowing through rule 10 end to end; (b) a Strengthen on A4 beating the script-class prior, while an unresolved finding does not override a blank survey axis; (c) an A7a AZERTY→QWERTY overturn bundle verifying rule 8 pre- and post-overturn.
- **Fixture provenance.** The "11 of 12" example in SC-002 is synthetic. Planning MUST also locate a real corpus keyboard with a genuine single-letter mechanism exception (consult [docs/keyboard-index.md](../../docs/keyboard-index.md)) and pin it as a second fixture alongside the synthetic one.
- **Team split.**
  - **Engine** owns detectors, conversions and the decision-record change.
  - **Content** owns the plain-language explanations, the decision ordering, which decisions are "low-stakes" enough to collapse, and the per-script deliberate-exception table (FR-027).

## Out of scope

- Automatic conversions in the first release (FR-014).
- Loading the offline facet index at runtime ([048-base-facets-in-ir](../048-base-facets-in-ir/spec.md)).
- Touch-layout-only decisions, deferred beyond what the desktop layout implies.
- The non-Latin key-to-glyph bundle: a non-Latin base typed on QWERTY-labelled hardware is a separate mapping decision, not a layout bundle (FR-006).
- Survey editing of opaque constructs and multi-source merge (both remain out of scope per spec §16).

## Dependencies

- [007-strategy-selection](../007-strategy-selection/spec.md) — axes A1–A7, the decision tree, axis-fill precedence; amended by this spec (see Assumptions).
- [008-data-flow](../008-data-flow/spec.md) — base-derived prefill and axis-probe pruning.
- The engine's `mutate()` seam (specs/014-mutate-seam-touch-propagation; constitution principle IX) — all working-keyboard changes this feature makes route through it.
- [053-decision-audit](../053-decision-audit/spec.md) and [055-legible-decision-trail](../055-legible-decision-trail/spec.md) — the decision record this feature extends.
- The offline facet classifiers from [070-keyboard-facet-index](../070-keyboard-facet-index/) and specs 037/041/043 — the single source of detection logic (FR-008).
- The langtags region data — seeds the physical-keyboard question's prefill (FR-013).

## Documentation updates at implementation

- [docs/workflow-model.md](../../docs/workflow-model.md), around line 41: the strategy selector's status moves from ABSENT to BUILT.
- The same document's PREFILL node, around line 105: expands beyond "A7 diff" to cover the full base-decision precedence tier.
- A sweep of [docs/architecture.md](../../docs/architecture.md) for any base-decision or strategy-selector references that need updating.
- A pointer added to [CLAUDE.md](../../CLAUDE.md)'s package inventory if a new engine subsystem lands.
