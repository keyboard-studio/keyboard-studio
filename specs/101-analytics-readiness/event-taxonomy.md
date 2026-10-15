# Spec 101 — event taxonomy (US1 / FR-002 seed vocabulary)

The closed schema's vocabulary, seeded from the studio's real flow so the
implementation plan refines names rather than inventing the model. The
enumeration MUST be re-derived from the shipped flow at plan time (the
wizard's step registry is the source); where this list and the shipped
registry disagree, the registry wins and this file is corrected.

## Event envelope (the whole of it)

```
{ v: 1, visit: <rotating pseudonym>, step: <step-id>, kind: <kind>, props: <closed set> }
```

No other keys exist. `props` values come only from the per-kind closed
sets below. There is no free-text field anywhere in the design; adding
one is a spec amendment, not a plan decision.

## Step ids (seed)

`welcome`, `target-language`, `alphabet`, `base-keyboard`, `keys`,
`rules`, `touch-layout`, `metadata` (attribution step), `review`,
`submit`. The flow's later phases (lint review, managed submission) map
to `review` / `submit` unless the registry shows distinct steps with
their own abandonment signal.

## Kinds

| kind | meaning | allowed props |
|---|---|---|
| `enter` | step became active | — |
| `exit` | left the step (forward, back, or abandon) | `via`: `next` \| `back` \| `leave` |
| `revisit` | returned to a step already entered this visit | `n`: visit count bucket `2` \| `3-5` \| `6+` |
| `validation` | a validation blocked progress | `class`: lint severity/code class only (e.g. `error`, `warn`), never the message or the content |
| `complete` | the flow's terminal success (keyboard saved / submitted) | `route`: `save-local` \| `save-server` \| `submit` |
| `dwell` | time bucket emitted on exit | `bucket`: `<10s` \| `10-60s` \| `1-5m` \| `5-30m` \| `>30m` |

Client environment, if carried at all, is limited to `viewport-class`
(`narrow` \| `wide`) on `enter` — enough to test the mobile hypothesis
from the flow's own history, and nothing more granular.

## Forbidden, restated as test cases

The contract test (spec 101 FR-002) fails the build if an emitted event
contains: any string not in the closed vocabularies above; any key
outside the envelope; any value resembling an email address, a name, a
URL with query, typed text, a keyboard id, or a GitHub/Google identifier;
or a pseudonym that persists across visits or equals/derives-from an
account identity.

## Reading the results

Reports are aggregates with small-number suppression: any cell
(step × segment) representing fewer than 5 visits is reported as `<5`
or merged upward. The taxonomy answers "where" questions (which step,
which exit direction, which revisit loop); "why" questions go to
usability sessions, not to richer events (spec 101, non-goals).
