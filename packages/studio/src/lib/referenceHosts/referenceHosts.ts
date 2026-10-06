// referenceHosts — the real host-layout reference module for the
// spec-083 disclosure (1802 A1–A3), replacing the Phase-3 temporary stub.
//
// Keyed by key+modifiers (NOT deadkey-specific), per the 1802 A3
// amendment, so the later 1802 `likelyHostLayouts` module can swap this
// module without interface churn: same input shape, same six-row output.
//
// HOME DECISION (documented per the Phase-4 brief): this lives in
// packages/studio/src/lib/ because it is studio UI data — the disclosure
// panel's content, not engine behaviour. If a later engine phase needs it
// (e.g. the 1802 leak-handling reference module), it moves to
// packages/engine or packages/contracts then; the key+modifiers interface
// is deliberately engine-agnostic so the move is a file relocation, not a
// redesign.
//
// HONESTY IS LOAD-BEARING: a key with no tabled behaviour on a host
// returns "no data" for that host — unknown is not safe, and this module
// never invents behaviour. Copy follows the 1802 A2 principle: each row
// states its own tradeoff symmetrically, never a one-sided slogan.

import {
  HOST_FALLBACKS,
  HOST_TABLES,
  type HostBehaviour,
} from "./data.ts";
import {
  REFERENCE_HOST_ORDER,
  type ReferenceHostEntry,
  type ReferenceHostKey,
  type ReferenceHostName,
  type ReferenceHostsResult,
} from "./types.ts";

/** Normalize "SHIFT+K_QUOTE" lookup keys: modifiers sorted, all upper-case. */
function normalizedParts(key: ReferenceHostKey): string[] {
  const mods = [...key.modifiers].map((m) => m.toUpperCase()).sort();
  return [...mods, key.key.toUpperCase()];
}

function lookupKey(key: ReferenceHostKey): string {
  return normalizedParts(key).join("+");
}

function keyLabel(key: ReferenceHostKey): string {
  // Display the normalized form: vkey names are uppercase by convention,
  // so "k_quote"+shift and "K_QUOTE"+SHIFT label (and read) identically.
  return normalizedParts(key).join("+");
}

function behaviourFor(
  host: ReferenceHostName,
  lookup: string,
): { behaviour: HostBehaviour; viaFallback: boolean } | undefined {
  const direct = HOST_TABLES[host].get(lookup);
  if (direct !== undefined) return { behaviour: direct, viaFallback: false };
  const fallback = HOST_FALLBACKS[host];
  if (fallback !== undefined) {
    const fb = HOST_TABLES[fallback].get(lookup);
    if (fb !== undefined) return { behaviour: fb, viaFallback: true };
  }
  return undefined;
}

/**
 * Consequence copy for one host row. Symmetric tradeoff (A2): what the key
 * does there, and what the author risks — never a verdict, never the
 * banned one-sided "allow unpredictable / block predictable" phrasing.
 */
function consequenceFor(
  host: ReferenceHostName,
  lookup: string,
  label: string,
): string {
  const found = behaviourFor(host, lookup);
  if (found === undefined) {
    return (
      `no reference data — this key isn't measured on ${host}; ` +
      `unknown is not safe.`
    );
  }
  const { behaviour, viaFallback } = found;
  const sameAs = viaFallback ? " (same as US)" : "";
  if (behaviour.kind === "deadkey") {
    return (
      `host deadkey${sameAs} (${behaviour.purpose}) — what the key does ` +
      `varies by computer (unpredictable).`
    );
  }
  return (
    `types ${describeChar(behaviour.char)}${sameAs} — typists expecting ` +
    `${describeChar(behaviour.char)} lose single-tap access if ${label} ` +
    `becomes the trigger; double-tap still emits the accent.`
  );
}

/** Render a typed character for copy: quoted, with "space" spelled out. */
function describeChar(char: string): string {
  if (char === "space") return "space";
  return `“${char}”`;
}

const BLOCKED_CONSEQUENCE =
  "nothing — predictable everywhere, but inaccessible if a typist expected a character here.";

/**
 * What `key` (+modifiers) does on each of the five reference hosts, plus
 * the blocked row. Never throws: unknown keys, unknown modifiers, and
 * empty input all resolve to "no data" rows, never an exception.
 */
export function referenceHosts(key: ReferenceHostKey): ReferenceHostsResult {
  const lookup = lookupKey(key);
  const label = keyLabel(key);
  const hosts: ReferenceHostEntry[] = REFERENCE_HOST_ORDER.map((host) => ({
    host,
    consequence: consequenceFor(host, lookup, label),
  }));
  hosts.push({ host: "Blocked", consequence: BLOCKED_CONSEQUENCE });
  return { keyLabel: label, hosts };
}
