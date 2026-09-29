// referenceHostsStub — TEMPORARY stub for the spec-083 host-layout
// disclosure (1802 A1–A3).
//
// !!! DO NOT SHIP AS REAL DATA !!!
// Phase 4 replaces this file with the real reference-hosts module backed by
// `likelyHostLayouts` (per-keyboard likely hosts through a versioned
// region→layout mapping, keyed by key+modifiers generally so the later
// `swallowUndefined` phase reuses it). This stub exists so the Phase-3
// Deadkeys step can render the HostDisclosure UI with the right shape and
// the honest "best guess, not sight." caption — every consequence below is
// a hand-written placeholder, NOT measured host behaviour.
//
// Shape contract (pinned for the Phase-4 swap):
// - keyed by key+modifiers: referenceHosts({ key, modifiers })
// - returns five reference hosts + the blocked row, in a fixed order
// - each host states its own tradeoff symmetrically (A2): what the key
//   DOES there and what the author risks — never a verdict.

export interface ReferenceHostKey {
  /** Vkey name (e.g. "K_COLON") or literal char for custom triggers. */
  key: string;
  /** Modifier tokens, e.g. ["SHIFT"]. Empty for the bare key. */
  modifiers: readonly string[];
}

export interface ReferenceHostEntry {
  /** Host label: one of the five reference layouts, or "Blocked". */
  host: "US" | "UK English" | "Intl" | "AZERTY" | "QWERTZ" | "Blocked";
  /** What pressing the key does on that host — the tradeoff, not a verdict. */
  consequence: string;
}

export interface ReferenceHostsResult {
  keyLabel: string;
  hosts: readonly ReferenceHostEntry[];
}

/**
 * TEMPORARY STUB — see the file header. Returns five reference hosts plus
 * the blocked row for any key. The per-host consequences are placeholders;
 * the SHAPE (key+modifiers in, six rows out, symmetric tradeoff copy) is
 * what Phase 4's real module must preserve.
 */
export function referenceHostsStub(key: ReferenceHostKey): ReferenceHostsResult {
  const label =
    key.modifiers.length > 0
      ? `${key.modifiers.join("+")}+${key.key}`
      : key.key;
  // Placeholder: punctuation-like keys get the "often a host deadkey itself"
  // line on Intl; everything else gets the plain typing line. Deliberately
  // coarse — this is a STUB heuristic, not data. Phase 4 replaces it.
  const deadkeyProne = /^[`'^~]$/.test(key.key) || key.key === "K_BKQUOTE";
  return {
    keyLabel: label,
    hosts: [
      {
        host: "US",
        consequence: `types ${label} — typists expecting ${label} lose single-tap access; double-tap still emits the accent.`,
      },
      {
        host: "UK English",
        consequence: `types ${label} — same tradeoff as US.`,
      },
      {
        host: "Intl",
        consequence: deadkeyProne
          ? "often a host deadkey itself — what the key does varies by computer (unpredictable)."
          : `types ${label} on most Intl variants — but deadkey behaviour varies by computer (unpredictable).`,
      },
      {
        host: "AZERTY",
        consequence: `position differs from US — what ${label} types varies by computer (unpredictable).`,
      },
      {
        host: "QWERTZ",
        consequence: `position differs from US — what ${label} types varies by computer (unpredictable).`,
      },
      {
        host: "Blocked",
        consequence:
          "nothing — predictable everywhere, but inaccessible if a typist expected a character here.",
      },
    ],
  };
}
