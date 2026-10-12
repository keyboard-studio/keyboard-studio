// referenceBases/types — shared shapes for the spec-083 host-layout
// disclosure (1802 A1–A3).
//
// Keyed by key+modifiers (NOT deadkey-specific), per the 1802 A3
// amendment, so the later 1802 `likelyBaseLayouts` module can swap this
// module without interface churn.

/** A virtual key plus the modifiers held with it. */
export interface ReferenceBaseKey {
  /** Vkey name (e.g. "K_COLON") or literal char for custom triggers. */
  key: string;
  /** Modifier tokens, e.g. ["SHIFT"]. Empty for the bare key. */
  modifiers: readonly string[];
}

/** One row of the disclosure: a reference host and what the key does there. */
export interface ReferenceBaseEntry {
  /** Host label: one of the five reference layouts, or "Blocked". */
  host: "US" | "UK English" | "Intl" | "AZERTY" | "QWERTZ" | "Blocked";
  /** What pressing the key does on that host — the tradeoff, not a verdict. */
  consequence: string;
}

export interface ReferenceBasesResult {
  keyLabel: string;
  hosts: readonly ReferenceBaseEntry[];
}

/** The five reference layouts, in disclosure order. */
export const REFERENCE_BASE_ORDER = [
  "US",
  "UK English",
  "Intl",
  "AZERTY",
  "QWERTZ",
] as const;

export type ReferenceBaseName = (typeof REFERENCE_BASE_ORDER)[number];
