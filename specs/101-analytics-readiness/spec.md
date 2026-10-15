# Feature Specification: Analytics readiness — learn where authors get stuck, without becoming a tracker

**Feature Branch**: `spec/privacy-suite` (suite branch for specs 095–100; this spec joins the suite by Matthew's direction, 2026-10-14)
**Created**: 2026-10-14
**Status**: Draft — planning only. This spec specifies the *readiness design*; it does not authorise shipping analytics. Implementation requires spec 100's Article XII ratified first (Sequencing).
**Input**: Matthew (2026-10-14): "We need to be ready for analytics… we want to know where they got stuck."

## Why this exists

The product question is specific and legitimate: authors begin a keyboard, travel a long multi-step flow (language → alphabet → carve → rules → touch → output), and some abandon mid-journey. Today the project learns this only anecdotally, when someone reports it. Funnel analytics — which step, how long, where exits cluster, which questions get revisited — is how the flow gets better instead of longer.

It is also exactly the processing the Kukie post warns about: the default way this gets built (drop in a general-purpose analytics SDK, events fire on load, identifiers stitch every session to an identity, data lands in a US cloud under a DPA nobody read) creates, in one PR, the project's first tracker, its first cookie/storage-consent problem, its first cross-session profiling, and a DSAR surface nobody can actually search. The difference between "analytics" and "surveillance with a dashboard" is a set of design decisions made **before** the SDK is chosen. This spec makes them, so that when analytics is built, it is built as the minimised thing — and so the rest of the suite (095's notice, 096's record, 097/098's rights machinery, 100's gate) already has its shape.

## Governing documents

- GDPR Art. 5(1)(c) (minimisation), Art. 25 (data protection by design), Art. 6 (lawful basis — assessed per design below), Art. 35 thinking (a light DPIA-style assessment is part of this spec's deliverable; a formal DPIA is not triggered by this scale, and the assessment says why).
- ePrivacy rule on storage/access on the user's device (the cookie rule, Art. 5(3) ePrivacy Directive and national implementations): the design goal is an architecture that stores/accesses nothing on the device beyond what the app already does, keeping the consent-banner question honestly answerable as "not triggered" — or, if the chosen design does trigger it, prior consent is built, not bolted.
- Spec 060 as the in-house precedent: structural context, identity redacted by design, self-contained capture — analytics events follow the same house discipline.
- Specs 095/096/097/098/100: notice update, record row (pre-registered in 096), DSAR/erasure integration, and the constitutional gate this spec must pass through.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The team can see where authors get stuck (Priority: P1)

A maintainer opens the funnel view and sees, per flow step: entries, completions, exits, median dwell, and the revisit loops (step A → B → A) that signal confusion — aggregated over a period, with small-number suppression so a "funnel" of three users is never a per-person trace in disguise.

**Independent Test**: With seeded test traffic completing scripted journeys (one clean pass, one abandoning at the carve step, one looping between two steps), the funnel shows all three patterns at the right steps, and no view in the tool can resolve the seeded journeys to named or account-identified individuals.

### User Story 2 — An author's content and identity are not in the events (Priority: P1)

Events carry **step ids and event kinds only**: step entered/exited, question answered (not the answer), validation-failure *class* (the lint/validation category, never the text), crash class (linking to spec 060's fingerprint, not its payload). No keyboard content, no exemplar text, no free text, no file names, no author name/email, no GitHub/Google identity. A signed-in user's events are NOT joined to their account identity; the funnel's unit is an anonymous visit.

**Independent Test**: Capture the full event stream of a scripted journey using a distinctive keyboard name, author name and answer text; grep the captured payloads and the stored events for those strings and for the account's login/email — zero hits. Event schema is enforced by a contract test: a payload carrying an undeclared field fails validation and is dropped, in the style of the crash-report zod schemas.

### User Story 3 — The identity that exists is a rotating pseudonym with a lifetime (Priority: P1)

Events are grouped within a visit by a pseudonymous id that: is generated per visit (or rotates at most daily), is not derived from any account identity, IP, or device fingerprint, is never combined with the drafts identity, and expires — raw events are retained on a short clock (proposed: 90 days) and only aggregates survive beyond it. Because the id is pseudonymous, the data is personal data in law — and specs 097/098 can therefore honour requests against it while the mapping exists; the design documents this honestly instead of claiming "anonymous, so rights don't apply".

**Independent Test**: Two visits from the same browser/account produce unlinkable ids; an erasure dry-run (spec 098) against the mapping removes the visit's events; events older than the retention clock exist only as aggregates in a retention test with aged fixtures.

### User Story 4 — The consent/ePrivacy posture is decided by the architecture, and respected (Priority: P1)

The implementation MUST satisfy one of two ruled postures, chosen at plan time with the assessment recorded: **(A) No device storage, no consent gate needed** — cookieless, no `localStorage`/device identifiers set for analytics, processing on legitimate interests with a plain-language notice line and an in-app opt-out that actually stops events; or **(B) Prior consent** — if any chosen tool stores/accesses device information for analytics, events do not fire until the user consents, rejection is one click and honoured, and the notice says so. Posture A is the recommended default (it matches the question being asked — aggregate stuck-points need neither identity nor device persistence); B exists so a tool constraint can be admitted honestly instead of laundering it into A.

**Independent Test**: Under posture A, a fresh profile shows zero analytics-related device storage and events flowing, with the opt-out demonstrably silencing them. Under posture B, a fresh profile shows zero events and zero analytics storage before consent, and zero after rejection.

### User Story 5 — The processor is chosen against criteria, not by default (Priority: P2)

The analytics host/tool is selected against a recorded scorecard: EU/EEA hosting or adequate safeguards (Art. 46) with a signed DPA (Art. 28); no data sale / no advertising reuse, contractually; no cross-site tracking capability enabled; raw-event retention configurable to FR-005's clock; export/deletion API adequate for specs 097/098; self-hosting costed honestly against hosted. Candidates exist across the spectrum (self-hosted lightweight counting, EU-hosted privacy-focused platforms, the hosting platform's own analytics) — the scorecard, not brand familiarity, decides, and the decision is written into the spec-096 record.

**Independent Test**: The plan for implementation contains the completed scorecard with the losing options' disqualifying or losing criteria visible; the record row names the winner, its DPA location, and its retention configuration.

## Requirements

### Functional Requirements

- **FR-001**: An event taxonomy MUST be defined as a versioned schema before any capture code: the closed list of event kinds and fields (step id, event kind, coarse duration bucket, validation/lint class, crash fingerprint, UI locale, viewport class). Fields not in the schema MUST be rejected at ingestion (contract validation, per User Story 2's test).
- **FR-002**: Events MUST NOT contain: keyboard content or answers, free text, file names/paths, author identity fields, account identifiers, IP addresses (beyond transient transport, which MUST NOT be stored), or precise timestamps finer than the minute. Duration is bucketed, not exact.
- **FR-003**: The visit pseudonym MUST satisfy User Story 3 (per-visit or ≤daily rotation, non-derived, never joined to account/draft identity, never fingerprinted from device signals).
- **FR-004**: Capture MUST be first-party only (our origin / our endpoint or the chosen processor's EU endpoint), MUST NOT load third-party tracker scripts with cross-site capability, and MUST respect the in-app opt-out (posture A) or prior-consent gate (posture B) per the ruled posture.
- **FR-005**: Raw events MUST be retained ≤ 90 days (proposed; ruling at plan) with aggregates-only survival beyond; the retention MUST be enforced by the platform configuration or a purge, and tested with aged fixtures.
- **FR-006**: Reporting MUST suppress small numbers (proposed threshold: groups < 5 visits are shown as "<5" or merged) in every maintainer-facing view.
- **FR-007**: Before implementation, a written assessment MUST be filed in this spec's folder: lawful basis per posture, the ePrivacy analysis, the processor scorecard (User Story 5), and the DPIA-screening conclusion. Implementation tasks MUST NOT be generated from this spec until that assessment exists.
- **FR-008**: On go-live, the same change MUST update: the spec-095 notice (analytics line, basis, opt-out/consent, processor), the spec-096 record row (from "not yet live" to live, with retention and DSAR hint), and the 097/098 procedures' search/deletion maps (pseudonym mapping).
- **FR-009**: Analytics MUST NOT be used to make decisions about an individual author (no per-person intervention, no account flagging from funnel data) — the purpose is flow improvement in aggregate, and the schema's inability to identify is the enforcement, not a usage promise.

### Edge Cases

- Guest (never signed-in) authors are the majority of stuck cases and the least identifiable — the design covers them by default; an events design that only worked for signed-in users would answer the wrong question *and* create the identity join FR-003 forbids.
- A crash mid-step emits spec 060's report through its own pipeline; analytics records only the step + crash fingerprint reference — the two systems MUST NOT be merged into one payload "for convenience".
- Ad-blocker / tracker-blocker prevalence means funnel numbers are a biased sample; the reporting view MUST carry that caveat where maintainers read it, so a blocked-tracker skew is never mistaken for a flow change.

## Success Criteria

- **SC-001**: The schema contract test rejects 100% of planted out-of-schema payloads (identity strings, answer text, extra fields) in the implementation's test run.
- **SC-002**: The seeded-journey test (User Story 1) reproduces all three journey patterns in the funnel and cannot be resolved to individuals by any view or query the tool offers.
- **SC-003**: A DSAR + erasure dry-run against analytics (with specs 097/098) completes: the visit's events are found by pseudonym for access and removed for erasure, inside the shared clock.
- **SC-004**: The pre-implementation assessment (FR-007) exists and names the ruled posture (A or B), the lawful basis, and the chosen processor with its scorecard — implementation demonstrably did not precede it.

## Design decisions

- **Answer the question asked, not every question**: the taxonomy is sized to "where do they get stuck" (steps, exits, loops, failure classes). Dwell-science, click heatmaps, and session replay are rejected by name — each would need its own spec, its own basis, and a much harder conversation.
- **Pseudonymous-and-honest over "anonymous"-and-false**: claiming anonymity we can't sustain would exempt us from rights we're actually able to honour cheaply; the rotating pseudonym keeps the funnel useful and the rights real.
- **Posture A preferred because it deletes a problem class**: no device storage means no banner, no consent fatigue, and a notice line instead of a consent flow — the same move as spec 095's fonts decision (remove the disclosure's cause where removal is cheap).

## Rulings (made 2026-10-14)

- **Posture A** — adopted as recommended (cookieless; legitimate
  interests + opt-out). Posture B (prior consent) was not taken.
- **Raw-event retention: 90 days** — adopted; aggregates indefinite.
- **Processor: Plausible** — adopted via the FR-007 scorecard; Umami
  self-hosted is the named fallback.

Implementation remains gated on Constitution Article XII
ratification.

## Out of scope

- Shipping any analytics in this suite's first landing — this spec is readiness: design, assessment, and the suite hooks. Implementation is a follow-on plan under Article XII's gate.
- Marketing attribution, A/B testing infrastructure, and per-user product personalisation — different purposes, different (harder) lawful-basis analysis, none of it implied by this spec.
- Replacing spec 060 crash reporting — adjacent, deliberately separate (see Edge Cases).

## Sequencing

Assessment (FR-007) may proceed any time. **Implementation MUST NOT start until spec 100 (Article XII) is ratified** and spec 095/096's update hooks exist — analytics is the designated first test of the constitutional gate, and arriving before the gate would repeat the pattern this suite exists to end.
