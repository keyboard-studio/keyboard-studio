# Feature Specification: En-Masse Adaptation Preference Questions

**Feature Branch**: `038-adaptation-questions`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "We will want to use these facets to make 'en masse' decisions or prescriptions as we adapt keyboards. I need to know what questions should exist to tease out these preferences."

**Governing sections**: spec.md §3c (defaults are the product — propose-then-confirm, provenance chips, "no default is a defect"), §7.1 (axes the answers feed), §8 Phase A/B (where in the flow the questions live), [content/facets/README.md](../../content/facets/README.md) (consumers convention: every facet must name what it prefills and proposes). Sibling features: [specs/036-keyboard-facet-index](../036-keyboard-facet-index/spec.md) (the evidence), [specs/037-facet-classifiers](../037-facet-classifiers/spec.md) (how it is computed).

## Problem

Once the facet index exists, the studio can carry a base keyboard's classified decisions (its script, its input strategies, its device targets) forward into later steps' suggestions — making *en-masse* prescriptions rather than asking the author to re-decide everything per step. But per §3c, a derived preference is never a silent default: it must surface as an editable confirmation with provenance. Today the survey has **no questions that elicit these preferences** — the author's target script is asked once (identity-lite), and nothing asks whether corpus-derived facet values should be adopted, adapted, or overridden, nor at what confidence a classification should be trusted.

This feature specifies the **question catalog**: which questions must exist, what each teases out, which facet(s) prefill it, and which downstream proposal sites consume its answer. It is a content-team deliverable (survey text + facet record updates) with engine-team touchpoints only where a question needs a new confirmation surface.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Script alignment confirmations (Priority: P1)

An author has chosen a language and a target script during onboarding. When the studio proposes base keyboards (and later, whenever a step inherits from the base), the author is asked to confirm script alignment where the evidence is anything less than clean: the chosen base's classified script vs the target script, sibling keyboards existing in multiple scripts, and Latin sub-profiles (plain vs extended vs IPA) when the target is Latin.

**Why this priority**: Script misalignment is the observed defect that started this work. These confirmations are what prevent a wrong-script base from silently shaping every later decision, and they exercise the full §3c pattern (proposal + provenance chip + editable confirmation).

**Independent Test**: With a mocked index, walk onboarding for a language whose siblings exist in Arab and Latn; verify the script-spread question appears with corpus counts as evidence, the answer updates the working target, and a clean single-script case asks nothing extra (no confirmation spam).

**Acceptance Scenarios**:

1. **Given** sibling keyboards for the target language family exist in more than one script, **When** the author reaches base selection, **Then** a question presents the spread as evidence ("N keyboards in Arab, M in Latn for related languages") and asks which script community this keyboard serves, prefilled from the author's earlier target-script answer, with provenance naming the corpus evidence.
2. **Given** the author picks a base whose classified script is "mixed" or disagrees with the target script, **When** the base is confirmed, **Then** a confirmation states the base's script distribution and asks whether to proceed (adapt across scripts), pick a different base, or reclassify the intent — never proceeding silently.
3. **Given** a Latin target, **When** the base's sub-script profile (plain/extended/IPA) differs from the author's stated Latin flavor, **Then** the mismatch is surfaced as a confirmation, prefilled with the more specific of the two signals.
4. **Given** all signals agree confidently, **When** the author walks the same flow, **Then** none of these questions interrupt — the values render as pre-confirmed defaults with provenance chips (§3c: propose, don't interrogate).

---

### User Story 2 - Inheritance posture: what carries forward from the base (Priority: P2)

Having selected a base, the author sets — once — their **inheritance posture**: which of the base's classified facet values should be treated as prescriptions for later steps (keep), which as suggestions (propose but rank alternatives), and which to discard. This is the "en masse" lever: one answer per facet governs many later proposals, instead of per-step re-litigating.

**Why this priority**: This is the user's stated end goal — en-masse decisions. It depends on US1's vocabulary being established but delivers the batch-decision capability itself.

**Independent Test**: Set posture "keep base's input strategies, retarget devices" on a mocked session; verify later steps' proposal sites receive the posture (strategy proposals constrained to the base's fingerprint; device-target proposals opened up), each still rendered §3c-editable.

**Acceptance Scenarios**:

1. **Given** a confirmed base with a strategy fingerprint (e.g. predominantly deadkey composition), **When** the author reaches the inheritance step, **Then** a question asks whether the adaptation should keep the base's input strategies, prefilled "keep" with the fingerprint as provenance, and the answer feeds the strategy-selection proposal site.
2. **Given** a base classified desktop-only, **When** the author's stated device mix includes touch, **Then** a question surfaces the gap ("your base has no touch layout; your community types on phones") and asks whether touch derivation is in scope, feeding the §8 Phase B / mobile-touch-derivation flow.
3. **Given** an inheritance posture is set, **When** the author later overrides an individual proposal that posture generated, **Then** the override is local (the posture is not silently rewritten), and the provenance chip on that proposal reflects the override.
4. **Given** the author skips the inheritance step, **Then** defaults apply per §3c (posture "keep" for facets where base and target agree confidently; "propose" elsewhere) and render as editable confirmations at their consumption sites — a skipped step never yields blank defaults.

---

### User Story 3 - Trust and threshold policies (Priority: P3)

The author (or a regional content curator configuring defaults for a workflow) answers policy questions about how much to trust classifications: at what confidence a mixed-script base is treated as single-script, whether fallback-tier (non-content-derived) classifications may prefill at all, and whether named-orthography joins (e.g. "Arab-script keyboard for this language family → treat as Ajami candidate") should be applied.

**Why this priority**: Thresholds have sane defaults (spec 037 assumptions) and most authors never need to touch them; but when classifications drive batch prescriptions, the trust dial must be user-visible somewhere, or §3c's "editable" promise is hollow at the policy level.

**Independent Test**: Lower the confidence threshold in a mocked session and verify a previously-"mixed" base now prefills as single-script with the policy named in its provenance chip; raise it and verify the same base routes to a US1 confirmation instead.

**Acceptance Scenarios**:

1. **Given** the default trust policy, **When** a base classifies at a fallback tier (declared-metadata or language-default), **Then** its values may propose but are visually distinguished by provenance tier, and a policy question exists to restrict prefilling to content-derived classifications only.
2. **Given** an ambiguous classification near a threshold, **When** the author confirms or overrides it, **Then** the resolution is recorded with the session (feeding the facet catalog's evaluation metrics — confirmations and overrides are exactly the predictive-lift signal the catalog's lifecycle needs).

---

### Edge Cases

- **No corpus evidence at all** (isolate language, no siblings, no same-language keyboards): every question in the catalog must degrade to its no-evidence form — asked plainly without corpus prefill — rather than being skipped (a §3c no-default is recorded where genuinely underivable).
- **Contradictory evidence tiers** (declared metadata says Latn, produced characters say Arab): the confirmation must show both signals and their tiers, not average them.
- **Question fatigue**: confident-agreement cases must not generate confirmations (US1 scenario 4); the catalog defines for each question its *firing condition*, and "always" is not an acceptable firing condition for any question in this catalog.
- **Mid-session base switch**: inheritance posture answers are per-base; switching bases re-fires only the questions whose evidence changed.
- **Batch context beyond one session** (a curator adapting a family of keyboards serially): answers marked as workflow-scoped policies (US3) persist across sessions in that workflow context; per-keyboard confirmations (US1/US2) never do.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The feature MUST deliver a question catalog in which every question record declares: id, the preference it elicits, its firing condition (evidence state that makes it appear), its prefill source (which keyboard-level facet(s) via which session facet), its §3c provenance-chip text, and its consumers (proposal sites that read the answer) — following the existing facet-catalog consumers convention.
- **FR-002**: The initial catalog MUST cover, at minimum, the three question families: **script alignment** (target-script vs base-script vs sibling-spread vs Latin sub-profile — at least 3 questions), **inheritance posture** (per-facet keep/propose/discard for script, input strategies, and device targets — at least 3 questions), and **trust policy** (confidence threshold, fallback-tier prefill permission, named-orthography join opt-in — at least 3 questions).
- **FR-003**: Every question MUST be §3c-conformant: prefilled whenever evidence exists, rendered as an editable confirmation with a provenance chip naming the evidence and its tier, and never applied silently when its firing condition is met.
- **FR-004**: Every question MUST have a defined no-evidence degradation (asked plainly, or recorded as a deliberate no-default) — the catalog may not contain questions that simply vanish when evidence is missing.
- **FR-005**: Inheritance-posture answers MUST be consumable en masse: one answer governs all downstream proposal sites for that facet in the session, while each governed proposal remains individually §3c-editable, and individual overrides MUST NOT silently rewrite the posture.
- **FR-006**: Trust-policy answers MUST be scoped (session vs workflow) explicitly in the catalog, and fallback-tier classifications MUST always be visually distinguishable from content-derived ones wherever they prefill.
- **FR-007**: Confirmations and overrides of facet-derived prefills MUST be recorded in a form the facet catalog's evaluation harness can consume (they are the predictive-lift measurements that promote facets from `candidate` per the catalog lifecycle).
- **FR-008**: The corresponding session-facet records (`content/facets/`) MUST be updated in the same change: each catalog question is added to the `prefills`/`proposes` consumer lists of the facet(s) that feed it, keeping the facet-lint coverage report honest.
- **FR-009**: Named-orthography prescriptions (e.g. Ajami) MUST only ever arise as an opt-in join (script classification × language identity) confirmed by the author — never emitted as an unconfirmed label (consistent with spec 037's classifier boundary).

### The initial question catalog *(the enumeration the user asked for)*

Script alignment (US1):

- **Q-SA1 target-script-vs-spread** — "Keyboards for related languages exist in {Arab: N, Latn: M}. Which script community is this keyboard for?" Fires when sibling-script-spread > 1. Prefill: author's target-script answer; evidence: script facet aggregated over glottolog-related keyboards. Consumers: base-suggestion ranking, community/multi-orthography (A5).
- **Q-SA2 base-script-mismatch** — "This base is classified {distribution}. Your target is {script}. Adapt across scripts / choose another base / adjust target?" Fires on dominant-script disagreement or "mixed" base. Consumers: base confirmation, working-copy target script.
- **Q-SA3 latin-flavor** — "Your target is Latin — plain, extended, or IPA? The base profiles as {profile}." Fires when target is Latn and profiles disagree. Consumers: character-discovery suggestions, inventory diff.

Inheritance posture (US2):

- **Q-IP1 keep-strategies** — "Keep the base's input approach ({fingerprint summary})?" keep / propose alternatives / discard. Consumers: strategy-selection proposals (§7.2), pattern-gallery ordering.
- **Q-IP2 keep-device-targets** — "The base supports {targets}. Keep, extend (add touch), or retarget?" Consumers: output targets, mobile/touch derivation flow, env/device-mix.
- **Q-IP3 keep-script-conventions** — "Keep the base's script-associated conventions (digits, punctuation) or adopt {target-language} conventions?" Fires when the base's neutral-character residue carries script-associated variants. Consumers: character placement proposals, community/input-conventions.

Trust policy (US3):

- **Q-TP1 confidence-threshold** — "Treat keyboards as single-script when the dominant share is at least {default 80%}?" Workflow-scoped. Consumers: all script-facet firing conditions.
- **Q-TP2 fallback-tier-prefill** — "Allow suggestions from keyboards classified only by declared metadata or language defaults (not verified from content)?" Workflow-scoped. Consumers: base-suggestion ranking filter.
- **Q-TP3 orthography-join** — "Treat Arab-script keyboards for {language family} as {Ajami} candidates?" Session-scoped opt-in. Consumers: base-suggestion labeling, gallery grouping.

This catalog is the v1 floor, not a ceiling; additions follow FR-001's record shape and the facet catalog's lifecycle (candidate → validated by measured lift).

### Key Entities

- **Question record**: id, elicited preference, firing condition, prefill facet(s), provenance text, consumers, no-evidence degradation, scope (session/workflow). Content-team-owned data alongside the survey question sources.
- **Inheritance posture**: the per-facet keep/propose/discard answer set for a session's base; consumed en masse by proposal sites.
- **Trust policy**: threshold and tier-permission answers, workflow- or session-scoped, governing firing conditions and prefill eligibility.
- **Confirmation/override event**: the recorded resolution of a facet-derived prefill; input to the facet evaluation harness.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The catalog ships with at least 9 questions (3 per family), each passing the facet-lint consumer checks (real question ids, real proposal sites, updated facet records).
- **SC-002**: In a scripted walkthrough of a clean single-script adaptation (all signals agree), zero catalog questions interrupt the author, yet every derived value displays an editable §3c confirmation with a provenance chip.
- **SC-003**: In a scripted walkthrough of a dual-script language, the author reaches base selection having answered at most 2 script-alignment questions (evidence consolidates into few questions; no per-keyboard interrogation).
- **SC-004**: One inheritance-posture answer demonstrably governs at least 3 downstream proposal sites in a session (measured in the walkthrough), with individual overrides leaving the posture intact.
- **SC-005**: 100% of catalog questions have a defined and exercised no-evidence degradation path.
- **SC-006**: Confirmation/override events for facet-derived prefills are captured for 100% of fired questions in walkthroughs, in a form the facet evaluation harness can read (enabling the first predictive-lift measurements).

## Assumptions

- **The survey/step infrastructure for confirmations exists** (identity-lite, Phase A/B steps, proposal sites with provenance chips per §3c); this feature adds question content and wiring, not a new questionnaire engine. Where a question needs a confirmation surface that doesn't exist (the inheritance-posture step is the likely case), that is the engine-team touchpoint and is called out in planning.
- **Specs 036 and 037 land first**; firing conditions and prefills read the index. The catalog can be authored and reviewed before the index exists, but cannot go live before it.
- **Workflow-scoped persistence** (US3, curator batch context) uses whatever session-store mechanism the studio already has for cross-step state; true multi-session curator profiles may be deferred by planning without breaking this spec (the questions still function session-scoped).
- **Content team owns** the catalog text, firing conditions, and facet-record updates; **engine team owns** any new confirmation surface and the recording of confirmation/override events. Mirrors spec §12.
- Question ids shown here (Q-SA1 etc.) are catalog working names; final survey question ids follow the existing survey id conventions at implementation time.

## Out of Scope

- Implementing the proposal sites' consumption logic (base ranking, strategy filtering) — this spec defines what the answers are and where they flow, not the ranking algorithms (follow-up wiring feature).
- Multi-keyboard batch UI (adapting many keyboards in one session) — the en-masse lever here is one-base-to-many-decisions within a session; many-bases workflows inherit these questions later.
- LLM-assisted question phrasing or localization of survey text.
- Any change to locked contracts or to the Phase-C-gated elicitations (e.g. full A5 elicitation remains gated; Q-SA1 feeds the same facet the cheaper way, as `community/multi-orthography` already anticipates).
