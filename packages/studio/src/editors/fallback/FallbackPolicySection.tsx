// FallbackPolicySection — the keyboard-wide fallback policy (spec 076,
// specs/076-rule-behaviours/fallback-surface-design.md §3).
//
// ONE setting for the whole keyboard: when a key isn't in the keyboard, does
// it do nothing, or fall through to the computer's own layout? It replaces
// the retired per-carve Allow/Block control; it is never shown in the carve
// gallery. Interim host: the bottom of the Assign Mechanisms step (the
// Behaviours step that will own it has not landed).
//
// Copy rules (A2, binding): each option states its OWN risk; neither is
// framed as recommended. Host output is a best guess from reference layouts,
// never sight of the typists' machines ("unknown" where the data has no
// cell). Deadkey suppression is stated as a rule, not offered as a choice.

import { useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { FallbackPolicy } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useLikelyBaseLayouts } from "../../lib/layoutFamily.ts";
import { hostOutcomeText, resolveCarvedCombos } from "../../lib/carvedCombo.ts";
import type { BaseLayoutId } from "../../lib/referenceBaseLayouts.ts";

/** The key used for the host summary when nothing carved resolves to a key. */
const SAMPLE_KEY = { key: "K_Q", modifiers: [] as string[], label: "Q" };

export interface FallbackPolicySectionProps {
  /** Start with the disclosure open. Default closed (the section sits under the gallery). */
  defaultOpen?: boolean;
}

export function FallbackPolicySection({ defaultOpen = false }: FallbackPolicySectionProps) {
  const { t } = useLingui();
  const policy = useWorkingCopyStore((s) => s.fallbackPolicy);
  const setFallbackPolicy = useWorkingCopyStore((s) => s.setFallbackPolicy);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const { hosts } = useLikelyBaseLayouts(bcp47);

  // The representative undefined key: the first carved key that resolves to a
  // physical key (a carved key IS an undefined key afterwards), else a fixed
  // sample. The label names it so the table is never anonymous.
  const representative = useMemo(() => {
    if (startIr !== null) {
      const combo = resolveCarvedCombos(startIr, [...deletedNodeIds, ...deletedItemIds]).find(
        (c) => c.key !== undefined,
      );
      if (combo !== undefined) {
        return { key: combo.key, modifiers: combo.modifiers, label: combo.label };
      }
    }
    return SAMPLE_KEY;
  }, [startIr, deletedNodeIds, deletedItemIds]);

  const choose = (next: FallbackPolicy) => () => setFallbackPolicy(next);

  const unknownText = t({ id: "fallback.hosts.unknown", message: "unknown" });
  const deadkeyText = t({ id: "fallback.hosts.deadkey", message: "starts a deadkey" });
  const outcome = (hostId: string): string => {
    const text = hostOutcomeText(hostId as BaseLayoutId, representative);
    if (text === "unknown") return unknownText;
    if (text === "deadkey") return deadkeyText;
    return text;
  };

  const doNothingLabel = t({ id: "fallback.option.swallow.label", message: "Do nothing" });
  const passThroughLabel = t({
    id: "fallback.option.passThrough.label",
    message: "Use the computer's layout",
  });
  const keyLabel = representative.label;

  return (
    <details
      data-testid="fallback-policy-section"
      {...(defaultOpen ? { open: true } : {})}
      style={{
        borderTop: "1px solid var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        fontFamily: "var(--app-font)",
        padding: "8px 22px",
      }}
    >
      <summary className="ks-focus-ring" style={{ cursor: "pointer", font: "600 13px var(--app-font)" }}>
        <Trans id="fallback.section.summary">When a key isn't in your keyboard</Trans>
        {": "}
        <span
          data-testid="fallback-policy-current"
          style={{ fontWeight: 400, color: "var(--app-text-muted)" }}
        >
          {policy === "swallow" ? doNothingLabel : passThroughLabel}
        </span>
      </summary>

      <fieldset style={{ border: "none", margin: "10px 0 0", padding: 0 }}>
        <legend style={{ font: "600 13px var(--app-font)", padding: 0, marginBottom: 6 }}>
          <Trans id="fallback.policy.legend">When a key isn't in your keyboard</Trans>
        </legend>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              id="fallback-policy-swallow"
              className="ks-focus-ring"
              name="fallback-policy"
              value="swallow"
              checked={policy === "swallow"}
              onChange={choose("swallow")}
              aria-describedby="fallback-policy-swallow-desc"
              style={{ marginTop: 3 }}
            />
            <div>
              <label
                htmlFor="fallback-policy-swallow"
                style={{ font: "600 13px var(--app-font)", cursor: "pointer" }}
              >
                {doNothingLabel}
              </label>
              <div
                id="fallback-policy-swallow-desc"
                style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)", maxWidth: 640 }}
              >
                <Trans id="fallback.option.swallow.description">
                  Keys not in your keyboard do nothing. Silent on every computer — but if your typists expect a character on a key, that key will feel dead.
                </Trans>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="radio"
              id="fallback-policy-pass-through"
              className="ks-focus-ring"
              name="fallback-policy"
              value="pass-through"
              checked={policy === "pass-through"}
              onChange={choose("pass-through")}
              aria-describedby="fallback-policy-pass-through-desc"
              style={{ marginTop: 3 }}
            />
            <div>
              <label
                htmlFor="fallback-policy-pass-through"
                style={{ font: "600 13px var(--app-font)", cursor: "pointer" }}
              >
                {passThroughLabel}
              </label>
              <div
                id="fallback-policy-pass-through-desc"
                style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)", maxWidth: 640 }}
              >
                <Trans id="fallback.option.passThrough.description">
                  Keys not in your keyboard fall through to the computer's own layout. The key types something — but what it types varies by computer.
                </Trans>
              </div>
            </div>
          </div>
        </div>
      </fieldset>

      <p
        data-testid="fallback-policy-deadkey-rule"
        style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--app-text-muted)" }}
      >
        <Trans id="fallback.deadkeyRule">
          Deadkey combinations always do nothing — allowing fallback would leave the deadkey armed.
        </Trans>
      </p>

      <div data-testid="fallback-host-summary" style={{ marginTop: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
          <caption
            style={{ textAlign: "left", font: "600 12px var(--app-font)", color: "var(--app-text-muted)", paddingBottom: 4 }}
          >
            <Trans id="fallback.hosts.tableCaption">
              What the key {keyLabel} would do on the computers your typists likely use
            </Trans>
          </caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left", padding: "4px 12px 4px 0" }}>
                <Trans id="fallback.hosts.column.computer">Computer layout</Trans>
              </th>
              <th scope="col" style={{ textAlign: "left", padding: "4px 12px" }}>
                {doNothingLabel}
              </th>
              <th scope="col" style={{ textAlign: "left", padding: "4px 12px" }}>
                {passThroughLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => {
              const text = outcome(h.id);
              return (
                <tr key={h.id} data-testid={`fallback-host-row-${h.id}`}>
                  <th
                    scope="row"
                    style={{ textAlign: "left", fontWeight: 400, padding: "4px 12px 4px 0", color: "var(--app-text-muted)" }}
                  >
                    {h.label}
                  </th>
                  <td style={{ padding: "4px 12px" }}>
                    <Trans id="fallback.hosts.nothing">nothing</Trans>
                  </td>
                  <td
                    style={{
                      padding: "4px 12px",
                      fontFamily: "var(--app-font-mono)",
                      fontStyle: text === unknownText ? "italic" : "normal",
                    }}
                  >
                    {text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p
          data-testid="fallback-host-caption"
          style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--app-text-subtle)", fontStyle: "italic", lineHeight: 1.5 }}
        >
          <Trans id="fallback.hosts.caption">
            Shown layouts are the studio's best guess at your typists' machines, not sight of them.
          </Trans>
        </p>
      </div>
    </details>
  );
}
