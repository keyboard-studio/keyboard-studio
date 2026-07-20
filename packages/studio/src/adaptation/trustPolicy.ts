// TrustPolicy — the user-visible trust dial (spec 038 US3; contract §3).
//
// Threshold + tier-permission answers that govern firing conditions and prefill
// eligibility. Q-TP1 sets the single-script threshold, Q-TP2 the fallback-tier
// prefill permission, Q-TP3 the named-orthography opt-in joins. Workflow-scoped
// fields persist per workflow id; they degrade to session scope where no
// workflow id exists (research Decision 6). Scope persistence lives in
// `resolveTrustPolicy` / the session-store binding added for US3 (T033).

import { recordConfirmation } from "./confirmationEvents.ts";

export interface TrustPolicy {
  /** 0–1; a base whose dominant script share ≥ this is treated as single-script. */
  singleScriptThreshold: number;
  /** Whether a fallback-tier base may PREFILL (it stays visible either way). */
  allowFallbackTierPrefill: boolean;
  /** Author-confirmed named-orthography joins — the ONLY path a label enters (FR-009). */
  orthographyJoins: Array<{ family: string; label: string }>;
  /** Where these answers are scoped. */
  scope: "session" | "workflow";
}

/**
 * The honest defaults — the no-evidence form of every dial (FR-004). A workflow
 * that never opens the trust step runs on exactly these.
 */
export const TRUST_POLICY_DEFAULTS: TrustPolicy = {
  singleScriptThreshold: 0.8,
  allowFallbackTierPrefill: true,
  orthographyJoins: [],
  scope: "workflow",
};

/**
 * Merge a partial override onto the defaults, producing a complete policy.
 * Pure — callers pass the answers gathered at the trust step (or `{}` for the
 * untouched default). `orthographyJoins` replaces rather than appends so the
 * confirmed set is exactly what the author opted into.
 */
export function resolveTrustPolicy(overrides: Partial<TrustPolicy> = {}): TrustPolicy {
  return {
    singleScriptThreshold:
      overrides.singleScriptThreshold ?? TRUST_POLICY_DEFAULTS.singleScriptThreshold,
    allowFallbackTierPrefill:
      overrides.allowFallbackTierPrefill ?? TRUST_POLICY_DEFAULTS.allowFallbackTierPrefill,
    orthographyJoins: overrides.orthographyJoins ?? TRUST_POLICY_DEFAULTS.orthographyJoins,
    scope: overrides.scope ?? TRUST_POLICY_DEFAULTS.scope,
  };
}

// ---------------------------------------------------------------------------
// Scope persistence (spec 038 US3, T033; research Decision 6).
//
// Workflow-scoped answers persist per workflow id so a second keyboard in the
// same workflow inherits the trust dial; they DEGRADE to session scope where no
// workflow id exists. In-memory only (no host-disk writes, Article V) — the live
// session-store binding is the follow-up wiring feature; this is the seam.
// ---------------------------------------------------------------------------

const _byWorkflow = new Map<string, TrustPolicy>();
let _sessionPolicy: TrustPolicy | null = null;

/**
 * Persist a resolved trust policy. With a workflow id the policy is workflow-
 * scoped (keyed by id, shared by later keyboards in that workflow); without one
 * it degrades to session scope. The stored policy's `scope` reflects where it
 * actually landed.
 */
export function persistTrustPolicy(policy: TrustPolicy, workflowId?: string): TrustPolicy {
  if (workflowId !== undefined && workflowId.length > 0) {
    const stored = { ...policy, scope: "workflow" as const };
    _byWorkflow.set(workflowId, stored);
    return stored;
  }
  const stored = { ...policy, scope: "session" as const };
  _sessionPolicy = stored;
  return stored;
}

/**
 * Load the persisted trust policy for a workflow, falling back to the session
 * policy and then the honest defaults (FR-004). Pure read.
 */
export function loadTrustPolicy(workflowId?: string): TrustPolicy {
  if (workflowId !== undefined && _byWorkflow.has(workflowId)) {
    return _byWorkflow.get(workflowId) as TrustPolicy;
  }
  return _sessionPolicy ?? TRUST_POLICY_DEFAULTS;
}

/** Clear persisted policies — for start-over and test isolation. */
export function resetTrustPolicyStore(): void {
  _byWorkflow.clear();
  _sessionPolicy = null;
}

// ---------------------------------------------------------------------------
// Policy-dial resolution recording (spec 038 US3, T034; FR-007 / SC-006).
//
// A trust-policy dial has no facet evidence — its honest default IS its
// no-evidence form (FR-004) — so its prefilledValue is the default and its
// finalValue is the author's choice. Recorded through the same single writer as
// every other confirmation (recordConfirmation) so the harness sees policy
// resolutions alongside facet-derived ones. `declared-metadata` tier: the dial
// is a stated preference, not corpus-derived.
// ---------------------------------------------------------------------------

/** The three trust-policy dials, by catalog id, and their default values. */
const POLICY_DEFAULTS: Record<string, string> = {
  q_tp1_confidence_threshold: String(TRUST_POLICY_DEFAULTS.singleScriptThreshold),
  q_tp2_fallback_tier_prefill: TRUST_POLICY_DEFAULTS.allowFallbackTierPrefill ? "allow" : "ask",
  q_tp3_orthography_join: "decline",
};

/**
 * Record the resolution of a trust-policy dial. Exactly one event; `confirmed`
 * when the author kept the honest default, `overridden` when they changed it.
 */
export function recordPolicyResolution(questionId: string, finalValue: string): void {
  const prefilledValue = POLICY_DEFAULTS[questionId] ?? null;
  recordConfirmation({
    questionId,
    facetIds: [],
    prefilledValue,
    finalValue,
    action: finalValue === prefilledValue ? "confirmed" : "overridden",
    provenanceTier: "declared-metadata",
  });
}
