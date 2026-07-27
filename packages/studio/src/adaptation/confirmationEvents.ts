// Confirmation/override event recorder (spec 038 FR-007; contract §4).
//
// The single writer for the recorded resolution of a facet-derived prefill —
// the facet evaluation harness's predictive-lift input (SC-006). Exactly one
// event per resolved prefill; fallback-tier prefills carry their tier so the
// harness can weight them. NO aggregation here — `metrics` is the harness's job
// (per content/facets/README.md).
//
// The event log is a module-level, in-memory, harness-readable seam (no
// host-disk writes, Article V). `readConfirmationEvents` is what the harness
// consumes; `resetConfirmationEvents` gives tests and start-over a clean slate.

import type { AdaptationEvidence } from "./evidence.ts";

/** The recorded resolution of a single facet-derived prefill. */
export interface ConfirmationEvent {
  /** Catalog / survey question id whose prefill was resolved. */
  questionId: string;
  /** The facet(s) that supplied the prefill. */
  facetIds: string[];
  /** The derived default (null = the no-default form was shown). */
  prefilledValue: string | null;
  /** What the author accepted or entered. */
  finalValue: string;
  /** Whether the author kept the prefill or changed it. */
  action: "confirmed" | "overridden";
  /** The tier that produced the prefill — carried so the harness can weight it. */
  provenanceTier: AdaptationEvidence["provenanceTier"];
  /** ISO-8601, stamped by the writer. */
  at: string;
}

// One append-only log per session. Cleared by resetConfirmationEvents().
const _events: ConfirmationEvent[] = [];

/**
 * Record exactly one confirmation/override event, stamping `at`. Called at every
 * confirmation or override of a facet-derived prefill. Never aggregates.
 */
export function recordConfirmation(ev: Omit<ConfirmationEvent, "at">): void {
  _events.push({ ...ev, at: new Date().toISOString() });
}

/** Read the recorded events (a copy) — the facet evaluation harness's input. */
export function readConfirmationEvents(): ConfirmationEvent[] {
  return [..._events];
}

/** Clear the log — for start-over and test isolation. */
export function resetConfirmationEvents(): void {
  _events.length = 0;
}
