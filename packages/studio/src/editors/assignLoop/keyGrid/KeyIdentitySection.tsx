/**
 * KeyIdentitySection — spec 104 FR-025 / T020: the selected key's identity,
 * rendered inside the key property panel.
 *
 * Three blocks, all fed by {@link KeyIdentityViewModel} (which is fed by the
 * contracts resolver — this component holds NO production logic of its own):
 *
 *  (a) the key's FR-005 criterion — the recorded decision's criterion when
 *      one exists, else the decision table's verdict on the key as it stands,
 *      with the resolver's own reason text;
 *  (b) the production table — one row per layer the key actually occurs on,
 *      conditional productions listed per condition, the source of each
 *      production named (rule / U_ decode / K_ fallback / emulation / none),
 *      fallback-supplied productions marked — inside a disclosure CLOSED BY
 *      DEFAULT (FR-025: panel height is a functional constraint);
 *  (c) the identity-decision provenance: the spine records for this key,
 *      the start-of-line box state when the key types a combining mark,
 *      and the transplant record when its rules were copied from a
 *      physical key.
 *
 * Plus the FR-029 action (T020b): when the view model offers a re-link
 * (a completed transplant whose arm 0 holds again), the author can invoke
 * it here — behind an inline explainer + confirm (the FR-018 pattern),
 * never automatic. The engine call and the commit live with the caller
 * (`onRelink`); this component only presents and confirms.
 *
 * Presentational and store-free, like the rest of the panel (spec 065
 * FR-001/FR-003): the section renders only when the caller supplies
 * `info`, and the re-link affordance only when it also supplies `onRelink`.
 */

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type {
  KeyIdentityDecision,
  TouchKeyProduction,
  TransplantRecord,
} from "@keyboard-studio/contracts";
import { BG_CARD, BORDER } from "../../../lib/galleryTheme.ts";
import {
  PANEL_HINT_STYLE,
  PANEL_LABEL_STYLE,
  PANEL_SECTION_STYLE,
  PANEL_SPAN_STYLE,
} from "./panelGrid.tsx";
import type { KeyIdentityViewModel, KeyProductionRow } from "./keyIdentityViewModel.ts";

const SMALL_BUTTON_STYLE: React.CSSProperties = {
  padding: "2px 8px",
  fontSize: 11,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  background: BG_CARD,
  cursor: "pointer",
};

const TABLE_STYLE: React.CSSProperties = {
  borderCollapse: "collapse",
  fontSize: 11,
  width: "100%",
};

const CELL_STYLE: React.CSSProperties = {
  borderTop: `1px solid ${BORDER}`,
  padding: "2px 4px",
  textAlign: "left",
  verticalAlign: "top",
};

export interface KeyIdentitySectionProps {
  readonly info: KeyIdentityViewModel;
  /** FR-029: author-confirmed re-link of the offered transplant record. */
  readonly onRelink?: (record: TransplantRecord) => void;
}

type I18n = ReturnType<typeof useLingui>["i18n"];

/** One production entry as the author reads it: what, under which condition. */
function ProductionEntries({
  i18n,
  production,
}: {
  i18n: I18n;
  production: TouchKeyProduction;
}) {
  if (production.productions.length === 0) {
    return <>{i18n._("editor.assignLoop.keyGrid.identity.production.nothing")}</>;
  }
  return (
    <>
      {production.productions.map((entry, idx) => {
        const what =
          entry.output.kind === "text"
            ? entry.output.text
            : entry.output.kind === "deadkey"
              ? `deadkey(${entry.output.name})`
              : entry.output.kind === "layerSwitch"
                ? `→ ${entry.output.layerId}`
                : entry.output.kind === "none"
                  ? i18n._("editor.assignLoop.keyGrid.identity.production.nothing")
                  : "—";
        return (
          <div key={idx}>
            <span>{what}</span>
            {entry.viaFallback === true && (
              <span style={{ opacity: 0.75 }}>
                {" "}
                ({i18n._("editor.assignLoop.keyGrid.identity.production.viaFallbackMarker")})
              </span>
            )}
            {entry.condition !== undefined && (
              <div style={{ opacity: 0.75 }}>
                {i18n._("editor.assignLoop.keyGrid.identity.production.conditionLabel")}:{" "}
                {entry.condition}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** The named source of a row's production (FR-025: sources are named). */
function sourceLabel(i18n: I18n, row: KeyProductionRow): string {
  const { production } = row;
  switch (production.source) {
    case "rule":
      return i18n._("editor.assignLoop.keyGrid.identity.production.ruleSource");
    case "u-decode":
      return i18n._("editor.assignLoop.keyGrid.identity.production.fallbackMarker", {
        form: "U_",
      });
    case "k-fallback":
      return i18n._("editor.assignLoop.keyGrid.identity.production.fallbackMarker", {
        form: "K_",
      });
    case "emulation":
      return i18n._("editor.assignLoop.keyGrid.identity.production.emulationSource");
    case "unclassified":
      return i18n._("editor.assignLoop.keyGrid.identity.production.unclassifiedSource");
    case "none":
      return "—";
  }
}

function DecisionLine({ decision }: { decision: KeyIdentityDecision }) {
  const date = new Date(decision.recordedAt).toISOString().slice(0, 10);
  return (
    <div>
      <span>
        {decision.action} · {decision.criterion} · {date}
      </span>
      {decision.authorAnswer !== undefined && (
        <div style={{ opacity: 0.75 }}>{decision.authorAnswer}</div>
      )}
    </div>
  );
}

export function KeyIdentitySection({ info, onRelink }: KeyIdentitySectionProps) {
  const { i18n } = useLingui();
  const [confirmingRelink, setConfirmingRelink] = useState(false);
  const recordedDecision = info.decisions[0];
  const relink = info.relink;

  return (
    <div style={PANEL_SECTION_STYLE} data-testid="key-identity-section">
      <span style={PANEL_LABEL_STYLE}>
        {i18n._("editor.assignLoop.keyGrid.identity.sectionLabel")}
      </span>

      {/* (a) The criterion. */}
      <span style={PANEL_LABEL_STYLE}>
        {i18n._("editor.assignLoop.keyGrid.identity.criterionLabel")}
      </span>
      <span style={PANEL_SPAN_STYLE}>{info.criterion.detail}</span>
      <span style={PANEL_HINT_STYLE}>
        {info.criterion.source === "recorded"
          ? i18n._("editor.assignLoop.keyGrid.identity.recordedNote")
          : i18n._("editor.assignLoop.keyGrid.identity.derivedNote")}
      </span>
      {recordedDecision !== undefined && (
        <span style={PANEL_HINT_STYLE}>
          {/* The ternary sits OUTSIDE i18n._ on purpose: Lingui's extractor
              only sees a direct string-literal first argument, so an
              i18n._(cond ? idA : idB) call is invisible to messages:extract
              and its ids get pruned as "stale" by i18n-catalog-lint. */}
          {recordedDecision.hostSet.length > 1
            ? i18n._("editor.assignLoop.keyGrid.identity.hostsLabelPlural", {
                hosts: recordedDecision.hostSet.join(", "),
              })
            : i18n._("editor.assignLoop.keyGrid.identity.hostsLabel", {
                hosts: recordedDecision.hostSet.join(", "),
              })}
        </span>
      )}

      {/* (b) The production table — disclosure closed by default (FR-025). */}
      <details>
        <summary style={{ ...PANEL_LABEL_STYLE, cursor: "pointer" }}>
          {i18n._("editor.assignLoop.keyGrid.identity.production.toggle")}
        </summary>
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={CELL_STYLE}>
                {i18n._("editor.assignLoop.keyGrid.identity.production.layerHeader")}
              </th>
              <th style={CELL_STYLE}>
                {i18n._("editor.assignLoop.keyGrid.identity.production.stateHeader")}
              </th>
              <th style={CELL_STYLE}>
                {i18n._("editor.assignLoop.keyGrid.identity.production.producesHeader")}
              </th>
              <th style={CELL_STYLE}>
                {i18n._("editor.assignLoop.keyGrid.identity.production.sourceHeader")}
              </th>
            </tr>
          </thead>
          <tbody>
            {info.productionRows.map((row) => (
              <tr key={row.layerId}>
                <td style={CELL_STYLE}>{row.layerId}</td>
                <td style={CELL_STYLE}>{row.stateLabel}</td>
                <td style={CELL_STYLE}>
                  <ProductionEntries i18n={i18n} production={row.production} />
                  {row.viaSubkey && (
                    <div style={{ opacity: 0.75 }}>
                      {i18n._("editor.assignLoop.keyGrid.identity.production.subkeyMarker")}
                    </div>
                  )}
                </td>
                <td style={CELL_STYLE}>{sourceLabel(i18n, row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* The key's combining-mark "start of line" box state (#2374): the
          per-mark replacement for the retired guard specification. Present
          only when the key types a combining mark and the caller supplied
          the box map. */}
      {info.bareMarkAllowed !== undefined && (
        <>
          <span style={PANEL_LABEL_STYLE}>
            {i18n._("editor.assignLoop.keyGrid.identity.startOfLineLabel")}
          </span>
          <span style={PANEL_SPAN_STYLE}>
            {/* Ternary outside i18n._ — see the hostsLabel note above:
                the extractor cannot see ids chosen inside the call. */}
            {info.bareMarkAllowed
              ? i18n._("editor.assignLoop.keyGrid.identity.startOfLineValue.allowed")
              : i18n._("editor.assignLoop.keyGrid.identity.startOfLineValue.blocked")}
          </span>
        </>
      )}

      {/* The transplant record, when this key's rules were copied (FR-008). */}
      {info.transplant !== undefined && (
        <>
          <span style={PANEL_LABEL_STYLE}>
            {i18n._("editor.assignLoop.keyGrid.identity.transplantLabel")}
          </span>
          <span style={PANEL_SPAN_STYLE}>
            {info.transplant.outcome === "completed"
              ? i18n._("editor.assignLoop.keyGrid.identity.transplantSummary", {
                  count: info.transplant.clonedRuleNodeIds.length,
                  sourceId: info.transplant.sourceId,
                })
              : i18n._("editor.assignLoop.keyGrid.identity.transplantRefused", {
                  reason: info.transplant.refusalBinding ?? "",
                })}
          </span>
        </>
      )}

      {/* (c) Identity-decision provenance. */}
      {info.decisions.length > 0 && (
        <>
          <span style={PANEL_LABEL_STYLE}>
            {i18n._("editor.assignLoop.keyGrid.identity.historyLabel")}
          </span>
          <div style={PANEL_SPAN_STYLE}>
            {info.decisions.map((decision) => (
              <DecisionLine key={decision.recordId} decision={decision} />
            ))}
          </div>
        </>
      )}

      {/* FR-029 re-link — offered only, behind an inline confirm (FR-018). */}
      {relink !== undefined && onRelink !== undefined && (
        <>
          {!confirmingRelink ? (
            <div>
              <button
                type="button"
                style={SMALL_BUTTON_STYLE}
                onClick={() => setConfirmingRelink(true)}
              >
                {i18n._("editor.assignLoop.keyGrid.identity.relink.button", {
                  sourceId: relink.sourceId,
                })}
              </button>
            </div>
          ) : (
            <>
              <span style={PANEL_SPAN_STYLE}>
                {i18n._("editor.assignLoop.keyGrid.identity.relink.explainer", {
                  sourceId: relink.sourceId,
                })}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={SMALL_BUTTON_STYLE}
                  onClick={() => {
                    setConfirmingRelink(false);
                    onRelink(relink.record);
                  }}
                >
                  {i18n._("editor.assignLoop.keyGrid.identity.relink.confirm")}
                </button>
                <button
                  type="button"
                  style={SMALL_BUTTON_STYLE}
                  onClick={() => setConfirmingRelink(false)}
                >
                  {i18n._("editor.assignLoop.keyGrid.identity.relink.cancel")}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
