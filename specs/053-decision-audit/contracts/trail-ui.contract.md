# Contract: Author-facing trail and developer flow-map overlay

The UI surface consumers and tests code against — routes, selectors, message ids, and the overlay's identity guarantee. The `data-testid` values and message ids below are the contract: renaming one breaks tests or orphans translations.

Related: [contracts/decision-record.contract.md](decision-record.contract.md) for the data, [research.md](../research.md) D-12 for the production/dev split.

---

## 1. Routes

`RouteId` in `packages/studio/src/lib/navigate.ts` gains one member:

```ts
export type RouteId =
  | 'welcome'
  | 'survey'
  | 'preview'
  | 'output'
  | 'flowmap'
  | 'trail'
  | 'profile';
```

| Route | Gate | Reason |
|---|---|---|
| `trail` | **none** — unconditionally in `VALID_ROUTES` | FR-017: the trail is a production surface, not a developer aid |
| `flowmap` | unchanged: `import.meta.env.DEV \|\| import.meta.env.VITE_SHOW_FLOWMAP === "1"` | FR-025: the map and its overlay stay absent from production builds |

The existing `SHOW_FLOWMAP` filter in `packages/studio/src/StudioShell.tsx` already excludes `flowmap` from `VALID_ROUTES` when the gate is off, so FR-025 needs no new mechanism — the overlay renders inside a route that is already unreachable in production.

### Entry points

| From | Affordance | Notes |
|---|---|---|
| Authoring surface (nav) | nav entry for the active keyboard | present in production; sits alongside the existing `output` / `preview` entries |
| `MyKeyboardsList` | per-row link to that project's trail | works for `status: "submitted"` rows too — the record is read-only and stays viewable (spec Edge Cases) |

---

## 2. Selectors

| `data-testid` | Element |
|---|---|
| `decision-trail` | the trail root |
| `decision-trail-empty` | the empty state, rendered when the record has no entries |
| `decision-trail-truncated` | the notice shown when `record.truncated` is non-null |
| `decision-trail-partial` | the notice shown when the record was read partially (`droppedCount > 0`) |
| `decision-entry` | one entry row; repeated |
| `decision-entry-headline` | the plain-language headline within a row |
| `decision-entry-expand` | the control that reveals the attributed change |
| `decision-entry-impact` | the revealed change region |
| `decision-entry-superseded` | marker on an entry that has been replaced |
| `decision-superseded-toggle` | the control that reveals collapsed superseded entries |
| `flowmap-path-overlay` | the overlay layer inside the flow map; **absent** when no keyboard is selected |

Every row carries `data-entry-id` set to its `entryId`, so a test can assert supersede pairing without relying on document order.

---

## 3. Message ids

Area prefix `trail.`, following the spec 046 convention (`area ( "." segment )+`, lowercase, dot-separated). An id is a permanent handle — rename only when the string's *meaning* changes.

| Id | Purpose |
|---|---|
| `trail.title` | view title |
| `trail.empty.title` / `trail.empty.body` | empty state — decisions will appear as they are made; never an error, never hidden |
| `trail.truncated.notice` | detail was dropped to stay within the save limit |
| `trail.partial.notice` | part of the record could not be read; showing what was readable |
| `trail.entry.headline.chose` | author-set value — "Chose …" |
| `trail.entry.headline.acceptedSuggested` | `agency: "tool-proposed"` — "Accepted suggested …" |
| `trail.entry.headline.fromBase` | `agency: "base-derived"` — carried from the base keyboard |
| `trail.entry.headline.editorStep` | aggregated editor activity, with counts interpolated |
| `trail.entry.superseded.label` | "Replaced by a later decision" |
| `trail.entry.impact.expand` / `trail.entry.impact.collapse` | expand control |
| `trail.entry.impact.none` | the decision changed nothing in the source — a positive statement, not an empty diff |
| `trail.entry.impact.unavailable.lockGate` | `reason: "lock-gate-dependency"` |
| `trail.entry.impact.unavailable.noWritePath` | `reason: "no-rederivable-write-path"` |
| `trail.entry.impact.shed` | this entry's detail was dropped (`impact` is `null`) |
| `nav.decisionTrail` | nav label, alongside the existing `nav.flowMap` |

Headlines are composed in the studio from the entry's structured payload and provenance — `packages/studio/src/decisions/headline.ts` — never from a string the engine pre-rendered. That is what makes FR-016 hold: the engine ships codes and counts, the studio ships the localized sentence.

Catalogues: `packages/studio/src/locales/en` and `packages/studio/src/locales/fr`, extracted by the existing lingui pipeline. `fr` may lag; the key-set parity lints apply as they do for every other catalogue.

---

## 4. Trail behaviour

| Requirement | Observable |
|---|---|
| FR-012 ordered trail | entries render in `entries` order, append order |
| FR-013 headline distinguishes provenance | `trail.entry.headline.acceptedSuggested` vs `trail.entry.headline.chose` for the same value with different `agency` |
| FR-014 expandable | `decision-entry-expand` reveals `decision-entry-impact` |
| FR-015 superseded stay visible | superseded entries present in the DOM, marked, collapsed by default behind `decision-superseded-toggle` |
| SC-007 no perceptible delay | the list renders from the record alone — no impact computation on mount; expanding one entry does not block further interaction |

The list mounts without computing any impact. `impact` is either already captured (editor steps, D-04) or derived when an entry is expanded (survey counterfactuals, D-05) — which is FR-010's "only when requested for a specific decision".

---

## 5. Flow-map overlay

The overlay is a projection over the existing `StepGraph` from `packages/studio/src/dashboard/buildStepGraph.ts`. New module `packages/studio/src/dashboard/pathOverlay.ts`:

```ts
export interface PathOverlay {
  /** Step ids the recorded keyboard traversed. */
  walkedSteps: ReadonlySet<string>;
  /** Traversed edges, as `${fromStepId}->${toStepId}`. */
  walkedEdges: ReadonlySet<string>;
}

export function buildPathOverlay(record: DecisionRecord): PathOverlay;
```

Wiring follows the established dashboard-layer boundary: `StudioShell` computes the overlay where the store is reachable and passes it into `FlowMapView` as a prop, exactly as `completenessReport` and `axisFills` are passed today. `packages/studio/src/dashboard/` gains no `stores/` import.

| Requirement | Observable |
|---|---|
| FR-023 walked path distinguished | traversed steps and edges styled distinctly from untraversed |
| FR-024 unchanged with no selection | overlay prop absent ⇒ `flowmap-path-overlay` is not in the DOM and the render output is identical to the current build — asserted as a snapshot-equality test against the no-overlay render |
| FR-027 no speculative computation | untaken branches render structural information only; nothing is derived for them |
| FR-026 one-branch-deep alternative | requesting an alternative at one inspected node returns that node's counterfactual and no other |
| FR-028 underivable alternative | structural information plus the localized reason, never a failure |

**ADR-0001 is not reversed.** The map remains a structural projection of the one set of step definitions the runtime executes; `buildStepGraph` is unchanged and stays the only source of nodes and edges. The overlay adds a per-keyboard *decoration* over that graph, read from a separate record — it contributes no node, no edge, and no ordering. With no keyboard selected there is no decoration, which is why FR-024 is an identity rather than a similarity.
