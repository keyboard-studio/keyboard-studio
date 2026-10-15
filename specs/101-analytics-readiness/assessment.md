# Spec 101 — pre-implementation assessment (FR-007)

Filed 2026-10-14 as part of the suite build. Implementation tasks MUST NOT
be generated from spec 101 until the rulings at the end are made. This is
the readiness deliverable: the analysis the constitutional gate (spec 100)
will check for.

## The purpose, bounded

One question: **where do authors get stuck in the authoring flow?** The
data wanted is step-level funnel movement (entries, exits, revisits,
completion), validation-failure classes, and coarse dwell — in aggregate.
Not wanted, by name: per-person journeys as an end in themselves, content
analytics, marketing attribution, A/B infrastructure, session replay,
heatmaps. Anything beyond the one question is a new purpose and a new
assessment.

## Lawful basis (GDPR Art. 6)

**Legitimate interests (Art. 6(1)(f))** is the assessed basis, with the
balancing recorded here in brief:

- *Interest*: understanding abandonment points in a free tool whose entire
  value is authors completing keyboards; the flow cannot be improved
  responsibly without knowing where it breaks.
- *Necessity*: the taxonomy (event-taxonomy.md) is the minimum that
  answers the question — step ids and event kinds, bucketed durations,
  failure classes. No identity, no content, no answers. A less intrusive
  means that answers the same question was considered and does not exist:
  voluntary feedback reaches a self-selected fraction and cannot locate
  silent abandonment.
- *Balancing*: the data subject's footprint is a rotating pseudonymous
  visit id and aggregate-visible behaviour; no decisions are made about
  any individual (spec 101 FR-009 forbids it and the schema enforces it);
  an in-app opt-out stops capture entirely. On these facts the balance
  favours the interest — **provided the design stays as assessed**. Any
  change to fields, identity joins, or purposes voids this paragraph and
  re-opens the assessment.

Consent (Art. 6(1)(a)) is the fallback basis if the posture-B route is
ever ruled (below): it is weaker here, not stronger — consent-gated
funnels systematically lose exactly the stuck-and-left population the
question is about, and a basis that biases the data while adding a banner
serves nobody. It is used only if the architecture forces it.

## ePrivacy analysis (device storage / access)

The consent trigger in ePrivacy law is *storing information, or accessing
information already stored, on the user's device* for non-essential
purposes. The two postures:

- **Posture A (recommended)**: capture sets **no** analytics cookie, no
  `localStorage`/IndexedDB identifier, and reads no device signal beyond
  what the page request itself carries. The visit pseudonym is generated
  per page-load session and kept in memory (or, at most, in
  `sessionStorage` strictly for the tab session — to be settled at plan;
  the in-memory default is preferred and needs no storage analysis at
  all). On this design the analytics layer stores/accesses nothing on the
  device, the consent trigger is not engaged, and the honest public
  statement is "no tracking storage; aggregate funnel counting with an
  opt-out" — disclosed in the notice, with the opt-out honoured by
  actually not sending events.
- **Posture B**: any tool that persists a device identifier (cookie or
  otherwise) for analytics engages the trigger: events fire only after
  prior consent, rejection is one click, is honoured, and is as easy as
  acceptance. Posture B exists so a tool constraint is admitted and
  priced, never laundered into A.

**Ruled 2026-10-14**: Posture A adopted. If implementation cannot meet
A with the chosen processor, the plan returns here for a B ruling
before any code lands — that return is the gate working, not a
failure.

## DPIA screening (Art. 35)

A formal DPIA is **not** triggered by this design, with reasoning:
processing is not large-scale in the Art. 35 sense for a niche authoring
tool; no special-category or criminal data; no systematic monitoring of
publicly accessible areas; no evaluation/scoring of individuals (FR-009
forbids individual-level use and the schema cannot identify); the
pseudonym rotates per visit and raw retention is short. The screening
conclusion is conditional in the same way the lawful basis is: scale or
granularity growth past these assumptions re-opens screening — the
annual review (spec 100) carries that question by name.

## Data-subject-rights integration

Because the visit id is pseudonymous, events are personal data while the
id-mapping exists. The DSAR procedure (spec 097) gains one search row
(events by visit id, where the requester can supply or demonstrate it);
the erasure procedure (spec 098) gains one deletion row (events for a
visit id are deletable via the processor until raw expiry; beyond the
90-day raw window only aggregates survive, which are no longer the
requester's data in any identifiable sense — and the confirmation wording
says exactly that). If a processor cannot support per-id lookup/deletion,
that is a scorecard disqualifier (processor-scorecard.md), discovered
before contract, not after a request.

## Rulings (made 2026-10-14)

1. **Posture A** — adopted (B not taken).
2. **Raw-event retention: 90 days** — adopted; aggregates indefinite.
3. **Processor**: Plausible — adopted per processor-scorecard.md;
   Umami self-hosted is the fallback.
