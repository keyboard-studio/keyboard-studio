# Contract: Adaptation engine surfaces (firing, posture, events)

**Feature**: 038-adaptation-questions | Engine-owned TypeScript surfaces.

Three pure/injectable surfaces + one React step. All are mockable for the
"mocked index" Independent Tests. Names are illustrative TS; the locked
`packages/contracts` types are **not** touched (see Constitution Check).

## 1. Firing-condition evaluation (pure, injected evidence)

```ts
interface AdaptationEvidence {
  targetScript: string;
  baseScriptDistribution: Record<string, number>;   // script → share, sums ~1
  siblingScriptSpread: Record<string, number>;       // script → keyboard count
  latinSubProfile: "plain" | "extended" | "ipa" | null;
  strategyFingerprint: { distribution: Record<string, number>; residue: number };
  baseTargetMix: Array<"desktop" | "touch" | "web">;
  statedDeviceMix: Array<"desktop" | "touch" | "web">;
  provenanceTier: "content-derived" | "declared-metadata" | "language-default";
}

interface FiredQuestion {
  id: string;                 // catalog id
  prefilledValue: string | null;   // null → no-evidence form (FR-004)
  provenanceLabel: string;    // §3c chip text
  provenanceTier: AdaptationEvidence["provenanceTier"];
}

// Reads the catalog + trust policy; returns only questions whose firingCondition
// holds. Confident agreement returns NO FiredQuestion (SC-002) but still yields a
// pre-confirmed chip via prefilledValue on the consuming surface.
function evaluateFiringConditions(
  evidence: AdaptationEvidence,
  policy: TrustPolicy,
): FiredQuestion[];
```

**Guarantees**: pure and deterministic for a given `(evidence, policy, catalog)`;
never returns a question whose `firingCondition` is unmet; honors
`policy.singleScriptThreshold` and `policy.allowFallbackTierPrefill` (a
fallback-tier base with prefill disallowed yields `prefilledValue: null`, not a
silent drop).

## 2. Inheritance-posture builder + step (US2)

```ts
type Facet = "script" | "input-strategies" | "device-targets" | "script-conventions";
interface PostureEntry {
  facet: Facet;
  posture: "keep" | "propose" | "discard";
  source: "default" | "confirmed" | "overridden";
  provenance: string;
}
interface InheritancePosture { baseId: string; entries: PostureEntry[]; }

// Pure builder (unit-testable, mirrors buildPrefillRows in Prefill.tsx).
// A skipped step yields all-`default` entries (US2 sc.4) — never blank.
function buildPosture(evidence: AdaptationEvidence, baseId: string): InheritancePosture;

// En-masse read (FR-005): one entry governs many proposal sites for that facet.
function postureFor(posture: InheritancePosture, facet: Facet): PostureEntry;
```

**Guarantees (FR-005)**: an individual proposal-site override is local — it does
**not** mutate the `PostureEntry`; the override rides on the proposal and its chip
reflects it. Base switch resets only entries whose evidence changed.

The React `InheritancePostureStep` renders `entries` as §3c editable confirmations
(keep/propose/discard radio + provenance chip), following the `Prefill.tsx`
component pattern.

## 3. Trust policy

```ts
interface TrustPolicy {
  singleScriptThreshold: number;        // 0–1, default 0.80 (Q-TP1)
  allowFallbackTierPrefill: boolean;    // default true (Q-TP2)
  orthographyJoins: Array<{ family: string; label: string }>;  // default [] (Q-TP3)
  scope: "session" | "workflow";
}
```

Workflow-scoped fields persist via the existing session store keyed by workflow id
where present; degrade to session scope otherwise (Decision 6).

## 4. Confirmation/override event recorder (FR-007)

```ts
interface ConfirmationEvent {
  questionId: string;
  facetIds: string[];
  prefilledValue: string | null;
  finalValue: string;
  action: "confirmed" | "overridden";
  provenanceTier: AdaptationEvidence["provenanceTier"];
  at: string;   // ISO-8601, stamped by the writer
}

// Single writer; appends to the session store in a shape the facet evaluation
// harness reads (SC-006). Called at every confirmation/override of a
// facet-derived prefill.
function recordConfirmation(ev: Omit<ConfirmationEvent, "at">): void;
```

**Guarantees**: exactly one event per resolved facet-derived prefill; fallback-tier
prefills carry their tier so the harness can weight them; no aggregation here
(`metrics` is the harness's job, per the facet README).
