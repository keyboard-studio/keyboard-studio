# Spec 101 — processor scorecard (US5 / FR-007)

Compiled 2026-10-14. Facts are stated as verified on that date with the
source named, or marked **UNVERIFIED** — an unverified cell is a task for
the implementation plan, not a detail to assume. Criteria are spec 101's:
EU/EEA hosting or Art. 46 safeguards + DPA (Art. 28); no sale / no
advertising reuse; no cross-site tracking capability in the shipped
configuration; raw-retention configurable to the 90-day proposal;
per-pseudonym export/deletion adequate for specs 097/098; honest
self-host cost.

## Candidates

### Plausible (hosted cloud)
- **Hosting/ownership**: EU-owned (Estonian entity), all visitor data on
  EU-owned infrastructure — Hetzner (Falkenstein, Germany), UpCloud
  (Finland) for exports DB, Bunny (Slovenia) CDN; data never leaves the
  EU. *Verified 2026-10-14, plausible.io privacy/eu-hosting pages.*
- **Model**: subscription-funded, no advertising, no data resale,
  cookieless by design; DPA, data policy, subprocessor list and an
  independent GDPR legal assessment published. *Verified, same source.*
- **Fit to our taxonomy**: pageview + custom-event model can carry step
  events; it is a *web analytics* shape rather than a product-funnel
  shape — adequate for step funnels, less native for revisit-loop
  analysis. Pseudonymisation is theirs (daily-rotating salted hash of
  IP+UA, anonymised after 24h) — **stronger than our design requires**,
  which cuts both ways: excellent minimisation, but per-visit-id DSAR
  lookup/deletion by *our* pseudonym is not a feature of their model
  (they hold no per-visitor records to delete). DSAR posture: the honest
  answer becomes "events are anonymised within 24h by design" — arguably
  better than deletion-on-request, but it changes spec 097/098's rows and
  must be reflected there if chosen.
- **Retention**: configurable data retention on the account — *existence
  verified in their docs generally; the exact minimums/granularity
  UNVERIFIED at this pass.*
- **Cost**: paid subscription, modest at this traffic scale.

### Vercel Web Analytics
- **Hosting/ownership**: US company (Vercel); we already host there, so
  no *new* processor relationship — but analytics data residency and
  sub-processor facts for this product specifically are **UNVERIFIED**
  at this pass (must be read from Vercel's current DPA/analytics docs at
  plan time).
- **Model**: cookieless, no cross-site tracking in its standard pitch;
  custom events supported on paid tiers. *General product facts;
  specifics UNVERIFIED here.*
- **Fit**: weakest funnel semantics of the set (pageview-centric with
  custom events); retention is plan-bound and not freely configurable —
  **risk against the 90-day criterion, UNVERIFIED until read.**
- **Cost**: bundled tiers may make it cheapest in cash; the price is the
  criteria above.

### PostHog (EU Cloud)
- **Hosting/ownership**: US company (PostHog, Inc.); offers an EU-hosted
  cloud (data residency in the EU). *EU cloud existence widely
  documented; the entity/DPA specifics UNVERIFIED at this pass.*
- **Model/fit**: the most native product-analytics shape here (funnels,
  paths, retention analyses answer US1 directly, including revisit
  loops); per-person profiles, export and deletion APIs are first-class
  — DSAR/erasure integration the most straightforward of the hosted
  options.
- **Risk**: it is also the broadest surveillance-capable tool in the set
  (session replay, heatmaps, autocapture, feature flags, surveys ship in
  the same product). Every one of those must be **off and contractually/
  configurationally pinned off**; the minimisation story depends on
  disciplined configuration forever, where Plausible's depends on the
  product not having the features. That asymmetry is the main reason it
  is not the recommendation despite the best funnel fit.
- **DPA**: available on business terms; specifics UNVERIFIED here.

### GoatCounter (self-hosted)
- **Model**: open-source, deliberately minimal pageview/campaign
  counting, cookieless, no tracking of personal data as a design goal;
  self-host = we are the processor (SQLite/Postgres on our infra).
  *Design facts from the project's public materials; version-specific
  details UNVERIFIED at this pass.*
- **Fit**: weakest for step-funnel semantics (pageview-shaped; custom
  paths possible but revisit-loop analysis would be hand-built).
- **Cost**: near-zero cash, real maintainer-hours; retention/deletion
  entirely ours (full control, full responsibility).

### Umami (self-hosted)
- **Model**: open-source, cookieless, self-hosted (own database);
  event data with session ids hashed. *General product facts; specifics
  UNVERIFIED at this pass.*
- **Fit**: pageview + custom events, closer to the funnel need than
  GoatCounter; still dashboard-shallow for loop analysis without queries
  against our own tables (which, being ours, is feasible).
- **Cost**: as GoatCounter — our infra, our retention enforcement, our
  DSAR queries. Maximum control, maximum ownership of every obligation.

## Recommendation

**Plausible, if** the plan accepts its anonymisation model in place of
per-id DSAR handling (record/notice/procedure rows updated to say so) —
it is the only candidate whose minimisation is a property of the product
rather than of our configuration discipline, its EU posture is verified,
and its business model has no advertising gravity. **Umami self-hosted
is the runner-up** and the pick if per-pseudonym DSAR/erasure fidelity is
ruled more important than operational lightness, since our own tables
make specs 097/098 exact.

**What would change the pick**: funnel-loop analysis proving impossible
in Plausible's model during a plan-phase spike (→ Umami, or PostHog EU
with the feature-pinning regime written into the plan as tested
configuration, not intentions); Vercel producing verified EU residency +
configurable retention for Web Analytics (→ re-score; incumbency is a
real operational saving); traffic growth making any self-host's
maintenance the binding constraint.
