# Article XII — canonical text for the constitution

Paste-ready source for the constitution branch (spec 100, FR-001/FR-002).
Target: constitution v2 text (PR #2072, Arts. I–XI), inserted after
Article XI, before "Authoring workflow". This file is the canonical copy
until ratification; on ratification the constitution itself becomes
canonical and this file is retired into the spec folder as the drafting
record. Principles and gates only — the procedures live in the documents
named in the text, and this article does not restate them.

---

### XII. Privacy is a design constraint, not a page

Keyboard Studio holds other people's work and, in a few places, their
identity. That processing is governed here, at the same rank as the state
model: a feature that needs personal data it cannot justify does not ship,
however good the feature is.

- **The record is a checked fact.** `docs/privacy/processing-record.md`
  names every processing activity — what personal data, where it lives,
  why, and for how long. Like a status header under Art. XI, it is a claim
  about the code, and it is kept true by check, not by memory. A change
  that creates a new store, a new recipient, or a new purpose updates the
  record and the published privacy notice in the same change. A store the
  record does not name must not exist.
- **Minimise by construction.** A field is collected only if a named
  purpose needs it. Identity credentials are session-scoped and are never
  persisted server-side; the studio has no user-profile store and gains
  none without amending this article. Local-first is the default: a user's
  work stays on their device unless they sign in or submit.
- **Telemetry is anonymous or it does not run.** Diagnostic reporting
  redacts author identity by design, ships structural context only, and
  offers retraction. Analytics, tracking, or advertising technology is
  added only under a design that satisfies spec 101 (closed event schema,
  no content, no identity) and only behind the consent or opt-out posture
  that design rules. The baseline this article protects is the current
  state: no analytics, no trackers, no advertising.
- **Public means public, and is said first.** Where a user action
  publishes personal data — a submission carries the author's name and
  email into public git history — the surface that takes the action
  discloses the permanence before the action, in the same view. We do not
  promise erasure we cannot perform; we disclose, and on request we
  perform every step actually available to us.
- **Requests are a feature, with an owner and a clock.** Access and
  erasure requests have a named owner (`docs/privacy/owner.md`), a
  private intake route, a register, and the one-month response discipline
  of `docs/privacy/dsar-procedure.md` and
  `docs/privacy/erasure-procedure.md`. A request is never blocked on a
  form, a fee, or the requester naming the law.
- **Retention is a decision, not a default.** Every server-side store
  names its retention rule in the record when it is created — a period, a
  criterion, or "until the user deletes it" — chosen, not inherited from
  nobody having decided. Indefinite-by-silence is a defect. Breaches are
  handled under `docs/privacy/breach-runbook.md`, on its 72-hour clock,
  and every breach is logged, notified or not.

This article changes by the constitution's normal amendment rule. A change
to any commitment above lands together with the spec, record, and notice
updates it implies — an amendment that only edits this text has not
happened.
