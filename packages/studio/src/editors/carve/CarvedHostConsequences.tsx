// CarvedHostConsequences — T019 (spec 076 FR-023, amendments A1/A2/A3).
//
// The expanded host-consequence block for ONE carved combination: the
// per-likely-host consequence table, the HOST_GUESS_CAPTION honesty caption,
// the expectation prompt, and each option's own risk (reusing
// DISPOSITION_COPY — the A2-symmetric copy the per-row control uses).
//
// The pure outcome lookup (`hostOutcomeText`) is shared with
// ReviewRemovedKeys.tsx (T017), whose private HostOutputCell now delegates
// to it — one implementation of "what would this host produce for this
// key+modifiers", never duplicated.
//
// COPY (binding, A2 — verbatim from DISPOSITION_COPY, intentionally not
// wrapped in Trans so tests assert the exact mandated wording):
//   - Prompt: "Do your typists expect a character on this key?"
//   - Allow risk: "Key does something, but output varies by computer."
//   - Block risk: "Key reliably does nothing, but becomes inaccessible/dead
//     if typists expected a character."
//   - The retired slogan "Allow means unpredictable; Block means
//     predictable." appears NOWHERE (asserted in CarvedHostConsequences.test.tsx).
//
// Mounted in the gallery's selected-character detail pane (CarveGalleryV2)
// for the selected carved combination; mount-ready for any other surface
// that has a CarvedCombo.

import type { CarvedCombo } from "./ReviewRemovedKeys.tsx";
import {
  DEADKEY,
  HOST_GUESS_CAPTION,
  lookupHostOutput,
} from "../../lib/referenceHostLayouts.ts";
import type { HostLayoutId } from "../../lib/referenceHostLayouts.ts";
import { useLikelyHostLayouts } from "../../lib/layoutFamily.ts";
import { DISPOSITION_COPY } from "./carveDispositionCopy.ts";

/**
 * What a host layout would produce for a carved combination's key+modifiers.
 * "unknown" where the reference data has no cell (never a guess — A3
 * honesty), "deadkey" where the host starts a deadkey, otherwise the
 * character. Undefined key (no resolvable trigger) is "unknown".
 */
export function hostOutcomeText(hostId: HostLayoutId, combo: CarvedCombo): string {
  if (combo.key === undefined) return "unknown";
  const out = lookupHostOutput(hostId, combo.key, combo.modifiers);
  if (out === undefined) return "unknown";
  if (out === DEADKEY) return "deadkey";
  return out;
}

export interface CarvedHostConsequencesProps {
  /** The carved combination to explain. */
  combo: CarvedCombo;
  /** bcp47 for likely-host resolution (from the keyboard's language tags). */
  bcp47?: string | undefined;
}

/**
 * Expanded host-consequence block for one carved combination: per-likely-host
 * outcomes, the honesty caption, the expectation prompt, and each
 * disposition option's own risk. Read-only — the Allow/Block control itself
 * lives on the gallery row (T016); this block explains the consequences.
 */
export function CarvedHostConsequences({ combo, bcp47 }: CarvedHostConsequencesProps) {
  const { hosts } = useLikelyHostLayouts(bcp47);

  return (
    <section
      data-testid={`carve-host-consequences-${combo.comboId}`}
      aria-label="Host consequences"
      style={{ marginTop: 16 }}
    >
      <div
        style={{
          fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em",
          color: "var(--app-text-subtle)", marginBottom: 6,
        }}
      >
        What a typist&apos;s own keyboard would do
      </div>

      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        {hosts.map((h) => {
          const outcome = hostOutcomeText(h.id as HostLayoutId, combo);
          const isUnknown = outcome === "unknown";
          return (
            <li
              key={h.id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8,
                fontSize: 12.5, padding: "4px 8px", borderRadius: 6,
                background: "var(--app-surface-2)", border: "1px solid var(--app-border)",
              }}
            >
              <span style={{ color: "var(--app-text-muted)" }}>{h.label}</span>
              <span
                style={{
                  fontFamily: "var(--app-font-mono)", fontWeight: 600,
                  color: isUnknown ? "var(--app-text-subtle)" : "var(--app-text)",
                  fontStyle: isUnknown ? "italic" : "normal",
                }}
              >
                {outcome}
              </span>
            </li>
          );
        })}
      </ul>

      <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--app-text-subtle)", fontStyle: "italic", lineHeight: 1.5 }}>
        {HOST_GUESS_CAPTION}
      </p>

      <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: "var(--app-text)" }}>
        {DISPOSITION_COPY.prompt}
      </div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, fontSize: 12, lineHeight: 1.45, color: "var(--app-text-muted)" }}>
        <div>
          <b style={{ color: "var(--app-text)" }}>{DISPOSITION_COPY.allowLabel}:</b> {DISPOSITION_COPY.allowRisk}
        </div>
        <div>
          <b style={{ color: "var(--app-text)" }}>{DISPOSITION_COPY.blockLabel}:</b> {DISPOSITION_COPY.blockRisk}
        </div>
      </div>
    </section>
  );
}
