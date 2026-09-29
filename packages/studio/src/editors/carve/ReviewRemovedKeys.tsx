// ReviewRemovedKeys — T017 (spec 076 FR-023, amendments A1/A2/A3).
//
// The "Review removed keys" panel: lists EVERY carved combination (from
// `carveDispositions` — created on carve, deleted on un-carve, FR-022) with:
//   - the carved key combination (key+modifiers label)
//   - its current disposition (Block / Allow host) and provenance
//   - the cross-host consequence: for each of the keyboard's likely hosts
//     (useLikelyHostLayouts, FR-023 order), what the host would produce for
//     that key+modifiers via lookupHostOutput — rendered "unknown" where the
//     reference data has no cell, never a guess (A3 honesty)
//   - the HOST_GUESS_CAPTION honesty caption ("best guess, not sight")
//   - the two-sided verdict line (A2 binding copy), closing with the prompt
//     only the author can answer: "Do your typists expect a character on
//     this key?"
//
// COPY (binding, A2 — verbatim, intentionally not wrapped in Trans so tests
// assert the exact mandated wording):
//   - Allow risk: "Allow the typist's own keyboard to decide — the key will
//     type something, but what varies by computer."
//   - Block risk: "Block it — the key does nothing on every computer. If
//     your typists expect a character here, they'll find a dead key."
//   - Verdict: "N allowed — those keys will type something different on
//     different computers. M blocked — silent everywhere (dead keys if your
//     typists expect output there)."
//   - The retired slogan "Allow means unpredictable; Block means
//     predictable." appears NOWHERE (asserted in ReviewRemovedKeys.test.tsx).
//
// Per-row disposition CHANGES are deliberately not built here — they belong
// to the gallery's per-row control (T016). This panel shows the current
// decision read-only, with provenance, so the two surfaces never duplicate
// the control.

import { useEffect, useMemo } from "react";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type {
  CarveDisposition,
  CarveDispositionProvenance,
} from "@keyboard-studio/contracts";
import { parseSlotId } from "@keyboard-studio/engine";
import {
  HOST_GUESS_CAPTION,
} from "../../lib/referenceHostLayouts.ts";
import type { HostLayoutId } from "../../lib/referenceHostLayouts.ts";
import { useLikelyHostLayouts } from "../../lib/layoutFamily.ts";
import type { HostLayoutRef } from "../../lib/layoutFamily.ts";
// T019: the host-outcome lookup is shared with CarvedHostConsequences (the
// expanded row) — one implementation of "what would this host produce",
// never duplicated. The shared CarvedCombo row type lives in ./carvedCombo.ts
// so the two modules never import each other.
import { hostOutcomeText } from "./CarvedHostConsequences.tsx";
import type { CarvedCombo } from "./carvedCombo.ts";

// ---------------------------------------------------------------------------
// Carved-combo resolution: comboId -> display row
// ---------------------------------------------------------------------------

export type { CarvedCombo } from "./carvedCombo.ts";

/** Provenance -> author-facing label (informational; does not affect compilation). */
export const PROVENANCE_LABELS: Record<CarveDispositionProvenance, string> = {
  "closed-keyboard-card": "From the closed-keyboard card",
  "closed-keyboard-card-declined": "From the closed-keyboard card (declined)",
  "bulk-default": "Suggested default",
  "author-override": "Your choice",
  "deadkey-requirement": "Required — deadkeys never allow host fallback",
};

/** "K_4" -> "4", "K_BKQUOTE" -> "BKQUOTE" — the K_ prefix is positional noise. */
function humanizeVkey(name: string): string {
  return name.startsWith("K_") ? name.slice(2) : name;
}

function humanizeChord(key: string, modifiers: readonly string[]): string {
  const mods = modifiers.map((m) => m.toUpperCase()).join(" + ");
  return mods === "" ? humanizeVkey(key) : `${mods} + ${humanizeVkey(key)}`;
}

/** The trigger key of a rule: the LAST vkey in its context (the key pressed). */
function triggerKeyOf(
  rule: { context: { kind: string; name?: string; modifiers?: string[] }[] },
): { key: string; modifiers: string[] } | undefined {
  for (let i = rule.context.length - 1; i >= 0; i--) {
    const el = rule.context[i]!;
    if (el.kind === "vkey" && el.name !== undefined) {
      return { key: el.name, modifiers: el.modifiers ?? [] };
    }
  }
  return undefined;
}

function storeItemLabel(item: { kind: string; value?: string; name?: string; id?: number; text?: string }): string {
  if (item.kind === "char" && item.value !== undefined) return `‘${item.value}’`;
  if (item.kind === "vkey" && item.name !== undefined) return humanizeVkey(item.name);
  if (item.kind === "deadkey" && item.id !== undefined) return `deadkey ${item.id}`;
  if (item.kind === "raw" && item.text !== undefined) return item.text;
  return item.kind;
}

/**
 * Find a rule consuming the store via any()/index() — the carved slot's
 * host consequence follows the consuming rule's key. Matches storeRef
 * against both the store name and nodeId (the IR does not guarantee which
 * the codec recorded).
 */
function findPairedRuleKey(
  ir: KeyboardIR,
  storeName: string,
  storeNodeId: string,
): { key: string; modifiers: string[] } | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const consumes = rule.context.some(
        (el) =>
          (el.kind === "any" || el.kind === "index") &&
          (el.storeRef === storeName || el.storeRef === storeNodeId),
      );
      if (!consumes) continue;
      const trigger = triggerKeyOf(rule);
      if (trigger !== undefined) return trigger;
    }
  }
  return undefined;
}

/**
 * Resolve every disposition to a display row. Stale comboIds (rule/store
 * gone — dispositions are pruned on un-carve, so this is belt-and-suspenders)
 * are dropped, never rendered as broken rows.
 */
export function resolveCarvedCombos(
  ir: KeyboardIR,
  dispositions: readonly CarveDisposition[],
): CarvedCombo[] {
  const rows: CarvedCombo[] = [];
  for (const d of dispositions) {
    const slot = parseSlotId(d.comboId);
    if (slot !== null) {
      const store = ir.stores.find((s) => s.nodeId === slot.storeNodeId);
      const item = store?.items[slot.itemsIndex];
      if (store === undefined || item === undefined) continue;
      const paired = findPairedRuleKey(ir, store.name, store.nodeId);
      rows.push({
        comboId: d.comboId,
        label: `store "${store.name}" slot ${slot.itemsIndex} — ${storeItemLabel(item)}`,
        key: paired?.key,
        modifiers: paired?.modifiers ?? [],
        disposition: d.disposition,
        provenance: d.provenance,
        isStoreSlot: true,
      });
      continue;
    }
    const rule = ir.groups.flatMap((g) => g.rules).find((r) => r.nodeId === d.comboId);
    if (rule === undefined) continue;
    const trigger = triggerKeyOf(rule);
    rows.push({
      comboId: d.comboId,
      label:
        trigger !== undefined
          ? humanizeChord(trigger.key, trigger.modifiers)
          : `rule ${d.comboId}`,
      key: trigger?.key,
      modifiers: trigger?.modifiers ?? [],
      disposition: d.disposition,
      provenance: d.provenance,
      isStoreSlot: false,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Binding copy (A2 — verbatim)
// ---------------------------------------------------------------------------

const ALLOW_RISK =
  "Allow the typist's own keyboard to decide — the key will type something, but what varies by computer.";
const BLOCK_RISK =
  "Block it — the key does nothing on every computer. If your typists expect a character here, they'll find a dead key.";
const EXPECTATION_PROMPT = "Do your typists expect a character on this key?";

/** The retired A1.3 slogan — must appear nowhere (asserted in tests). */
export const RETIRED_SLOGAN = "Allow means unpredictable; Block means predictable.";

function verdictLine(allowed: number, blocked: number): string {
  return (
    `${allowed} allowed — those keys will type something different on different computers. ` +
    `${blocked} blocked — silent everywhere (dead keys if your typists expect output there).`
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface ReviewRemovedKeysDialogProps {
  combos: CarvedCombo[];
  /** bcp47 for likely-host resolution (from the keyboard's language tags). */
  bcp47?: string | undefined;
  onClose: () => void;
}

function HostOutputCell({ hostId, combo }: { hostId: HostLayoutId; combo: CarvedCombo }) {
  // T019: shared with CarvedHostConsequences — the lookup + unknown/deadkey
  // handling live in hostOutcomeText, not here.
  const text = hostOutcomeText(hostId, combo);
  const isUnknown = text === "unknown";
  return (
    <td
      style={{
        padding: "6px 10px",
        fontSize: 12.5,
        fontFamily: "var(--app-font)",
        color: isUnknown ? "var(--app-text-subtle)" : "var(--app-text)",
        fontStyle: isUnknown ? "italic" : "normal",
        borderTop: "1px solid var(--app-border)",
        textAlign: "center",
      }}
    >
      {text}
    </td>
  );
}

/**
 * The review dialog: every carved combination, its disposition, the
 * cross-host consequence table, the honesty caption, and the two-sided
 * verdict. Rendered as a fixed overlay (FamilyApplyDialog convention).
 */
export function ReviewRemovedKeysDialog({ combos, bcp47, onClose }: ReviewRemovedKeysDialogProps) {
  const { hosts } = useLikelyHostLayouts(bcp47);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { allowed, blocked } = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const c of combos) {
      if (c.disposition === "allow-host") a += 1;
      else b += 1;
    }
    return { allowed: a, blocked: b };
  }, [combos]);

  return (
    <>
      {/* Fixed backdrop — click outside to close (FamilyApplyDialog convention). */}
      <div
        data-testid="review-removed-keys-backdrop"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, var(--sil-black) 50%, transparent)",
          zIndex: 299,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review removed keys"
        data-testid="review-removed-keys-dialog"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 300,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 20,
          minWidth: 420,
          maxWidth: 760,
          maxHeight: "84vh",
          overflowY: "auto",
          background: "var(--app-surface)",
          border: "1px solid var(--app-border-strong)",
          borderRadius: 12,
          color: "var(--app-text)",
          fontFamily: "var(--app-font)",
          boxShadow: "0 8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, font: "600 17px var(--app-font)", flex: 1 }}>
            Review removed keys
          </h2>
          <button
            type="button"
            data-testid="review-removed-keys-close"
            onClick={onClose}
            aria-label="Close review"
            style={{
              font: "600 12.5px var(--app-font)",
              cursor: "pointer",
              color: "var(--app-text-muted)",
              background: "var(--app-surface-2)",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              padding: "7px 14px",
            }}
          >
            Close
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.5, maxWidth: 640 }}>
          Every combination you carved, what you decided for it, and what a
          typist&apos;s own keyboard would do with that key instead.
        </p>

        {combos.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)" }}>
            No carved combinations yet — carve a character to review it here.
          </p>
        ) : (
          <table
            data-testid="review-removed-keys-table"
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--app-text-subtle)", padding: "6px 10px 6px 0" }}
                >
                  Carved key
                </th>
                <th
                  scope="col"
                  style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--app-text-subtle)", padding: "6px 10px" }}
                >
                  Your decision
                </th>
                {hosts.map((h: HostLayoutRef) => (
                  <th
                    key={h.id}
                    scope="col"
                    style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--app-text-subtle)", padding: "6px 10px", textAlign: "center" }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combos.map((combo) => (
                <tr key={combo.comboId} data-testid={`review-removed-keys-row-${combo.comboId}`}>
                  <td style={{ padding: "8px 10px 8px 0", borderTop: "1px solid var(--app-border)", verticalAlign: "top" }}>
                    <div style={{ font: "600 13px var(--app-font-mono)" }}>{combo.label}</div>
                    {combo.isStoreSlot && (
                      <div style={{ fontSize: 11, color: "var(--app-text-subtle)", marginTop: 2 }}>
                        Store entry — host consequence follows the rule that uses it
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", borderTop: "1px solid var(--app-border)", verticalAlign: "top" }}>
                    <span
                      style={{
                        display: "inline-block",
                        font: "700 11.5px var(--app-font)",
                        padding: "3px 10px",
                        borderRadius: 999,
                        color: combo.disposition === "block" ? "var(--app-danger-text-on-surface-2)" : "var(--app-accent-text)",
                        background: combo.disposition === "block"
                          ? "color-mix(in srgb, var(--sil-red) 14%, var(--app-surface-2))"
                          : "var(--app-accent-subtle)",
                        border: "1px solid var(--app-border-strong)",
                      }}
                    >
                      {combo.disposition === "block" ? "Block" : "Allow host"}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--app-text-subtle)", marginTop: 4 }}>
                      {PROVENANCE_LABELS[combo.provenance]}
                    </div>
                  </td>
                  {hosts.map((h: HostLayoutRef) => (
                    <HostOutputCell key={h.id} hostId={h.id as HostLayoutId} combo={combo} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p
          data-testid="review-removed-keys-caption"
          style={{ margin: 0, fontSize: 12, color: "var(--app-text-subtle)", fontStyle: "italic", lineHeight: 1.5 }}
        >
          {HOST_GUESS_CAPTION}
        </p>

        {/* Two-sided verdict (A2): each option states its own risk; the
            prompt asks the one question only the author can answer. */}
        <div
          data-testid="review-removed-keys-verdict"
          style={{
            border: "1px solid var(--app-border-strong)",
            borderRadius: 10,
            padding: "12px 14px",
            background: "var(--app-surface-2)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {verdictLine(allowed, blocked)}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)" }}>
              <b style={{ color: "var(--app-text)" }}>Allow host:</b> {ALLOW_RISK}
            </div>
            <div style={{ flex: "1 1 220px", fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)" }}>
              <b style={{ color: "var(--app-text)" }}>Block:</b> {BLOCK_RISK}
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>
            {EXPECTATION_PROMPT}
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: "var(--app-text-subtle)", lineHeight: 1.5 }}>
          To change a decision, use the Allow / Block control on that key&apos;s
          row in the gallery.
        </p>
      </div>
    </>
  );
}
