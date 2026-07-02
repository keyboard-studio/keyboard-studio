// Base-derived prefill confirmation step (spec §5 "Base-derived pre-fill", §8
// "Workflow ordering"). After identity-lite resolves the (language, script)
// target and the author picks a base, this step shows the routing group, A2
// script class, and BCP47 script subtag as CONFIRMATIONS the author accepts or
// goes back to change — never blank asks. A7 (spare keys) and the full BCP47
// tag are resolved later (from the base IR diff / langtags / docs stage), so they
// are shown as deferred rather than guessed here. refs #369.

import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { IdentityLiteResult } from "./IdentityLite.tsx";

/** One labelled confirmation row in the prefill summary. */
export interface PrefillRow {
  label: string;
  value: string;
  /** Provenance hint shown beside the value (where the confirmation came from). */
  note?: string;
}

/**
 * Build the prefill confirmation rows from the identity-lite result and the
 * chosen base. Pure (no React) so it is unit-testable. Routing/A2/script follow
 * the chosen TARGET script, never the language's default (spec §8/§9).
 */
export function buildPrefillRows(
  identity: IdentityLiteResult,
  base: BaseKeyboard,
): PrefillRow[] {
  const { prefill } = identity;
  const scriptDisplay =
    prefill.variant !== undefined ? `${prefill.script} (${prefill.variant})` : prefill.script;
  return [
    { label: "Language", value: identity.english || identity.autonym },
    { label: "Script", value: scriptDisplay, note: "BCP47 script subtag (§5)" },
    { label: "Script class (A2)", value: prefill.scriptClass, note: "derived from script" },
    { label: "Routing group (§9)", value: prefill.routingGroup, note: "derived from script" },
    {
      label: "Starting keyboard",
      value: `${base.displayName} (${base.id})`,
      note: "your chosen base",
    },
  ];
}

export interface PrefillProps {
  identity: IdentityLiteResult;
  base: BaseKeyboard;
  onConfirm: () => void;
  onBack?: () => void;
}

export function Prefill({ identity, base, onConfirm, onBack }: PrefillProps) {
  const rows = buildPrefillRows(identity, base);

  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Confirm the basics
      </h2>
      <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#8b949e" }}>
        Based on your script and chosen keyboard, here is what we will assume.
        Confirm to continue, or go back to change a choice.
      </p>

      <dl
        style={{
          margin: "0 0 20px 0",
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "10px 16px",
          alignItems: "baseline",
        }}
      >
        {rows.map((row) => (
          <div key={row.label} style={{ display: "contents" }}>
            <dt style={{ fontSize: 13, color: "#8b949e", whiteSpace: "nowrap" }}>{row.label}</dt>
            <dd style={{ margin: 0, fontSize: 14, color: "#e6edf3" }}>
              <strong>{row.value}</strong>
              {row.note !== undefined && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#6e7681" }}>{row.note}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      <p
        style={{
          margin: "0 0 20px 0",
          fontSize: 12,
          color: "#6e7681",
          lineHeight: 1.5,
        }}
      >
        Spare keys (A7), the full BCP47 tag, display name, and copyright are
        confirmed later from your base keyboard and the documentation step.
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            data-testid="prefill-back"
            onClick={onBack}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
        )}
        <button
          type="button"
          data-testid="prefill-confirm"
          onClick={onConfirm}
          style={{
            padding: "8px 18px",
            background: "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Confirm and continue
        </button>
      </div>
    </div>
  );
}
