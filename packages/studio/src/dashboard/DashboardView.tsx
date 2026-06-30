// Developer "Flow Map" / Dashboard tab — a live, auto-generated map of the
// survey's questions, their branching, and the strategy decision tree.
//
// Four sections, all derived from source (no hand-maintained diagram):
//   • Survey flow    — one graph per content/flows/*.modular.yaml (loaded via
//                      ?raw, the same source the survey runner uses via the
//                      modular loader).
//   • Script routing — §9 target-script → qwerty-qwertz / non-roman / azerty.
//   • Strategy tree  — §7.2 decision tree, from the engine's exported rule tables.
//   • Completeness   — read-only CompletenessReport (US3, T042, FR-023).
//
// The CompletenessReport is received via props from StudioShell (which can
// import both stores and dashboard). This component has NO stores/ import —
// satisfying the dashboard-layer depcruise boundary.
//
// Rebuilding the studio after editing a flow or a selector rule updates this map.

import { useMemo, useState, type ReactNode } from "react";

// Identity-lite is read directly here for the Script-routing section (§9). The
// flow drill-down sources (FLOW_SOURCES) and the rendered-node-id composition
// live in the shared dashboard/renderedNodeSet.ts helper (spec 016, D2a), so
// the Flow Map and the drift guardrail consume ONE composition. Do NOT import
// the legacy *.yaml files here — they are retired and will be deleted.
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

import {
  buildManifestProjection,
  attachDrillDowns,
} from "./manifestProjection.ts";
import { FLOW_SOURCES, safeBuild } from "./renderedNodeSet.ts";
import { FlowGraphView } from "./FlowGraphView.tsx";
import { StrategyTreeView } from "./StrategyTreeView.tsx";
import { ScriptRoutingView } from "./ScriptRoutingView.tsx";
import { MONO, SANS } from "./tokens.ts";
import type { CompletenessReport } from "./completeness.ts";

type Section = "flow" | "routing" | "strategy" | "completeness";

function LegendItem({ swatch, border, dashed, label }: { swatch: string; border: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#adbac7" }}>
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: swatch,
          border: `1.5px ${dashed ? "dashed" : "solid"} ${border}`,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function EdgeLegendItem({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#adbac7" }}>
      <svg width="26" height="10" style={{ flexShrink: 0 }}>
        <line x1="0" y1="5" x2="26" y2="5" stroke={color} strokeWidth="1.5" strokeDasharray={dashed ? "4 3" : undefined} />
      </svg>
      {label}
    </span>
  );
}

function FlowLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        padding: "10px 14px",
        background: "#0b0f14",
        border: "1px solid #21262d",
        borderRadius: 8,
        marginBottom: 16,
      }}
    >
      <LegendItem swatch="#11203a" border="#6ea8fe" label="entry" />
      <LegendItem swatch="#241c10" border="#d29922" label="gate (conditional next)" />
      <LegendItem swatch="#14181f" border="#6e7681" dashed label="engine-resolved (not shown)" />
      <LegendItem swatch="#0f2417" border="#3fb950" label="terminal" />
      <LegendItem swatch="#1a1030" border="#6e40c9" label="reserve (not in live flow)" />
      <LegendItem swatch="#0d2035" border="#58a6ff" label="stub (gallery / wizard step)" />
      <span style={{ width: 1, alignSelf: "stretch", background: "#21262d" }} />
      <EdgeLegendItem color="#d29922" label="conditional branch" />
      <EdgeLegendItem color="#6e7681" dashed label="default (else)" />
      <EdgeLegendItem color="#4d5b7c" label="linear next" />
    </div>
  );
}

function SectionTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 13,
        fontFamily: SANS,
        cursor: "pointer",
        background: active ? "rgba(110,168,254,0.14)" : "transparent",
        color: active ? "#6ea8fe" : "#adbac7",
        border: "1px solid",
        borderColor: active ? "#1f6feb" : "#30363d",
        borderRadius: 6,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// CompletenessView — read-only display of the CompletenessReport (T042/FR-023)
// ---------------------------------------------------------------------------

function CompletenessView({ report }: { report: CompletenessReport | undefined }) {
  if (report === undefined) {
    return (
      <div style={{ color: "#8b949e", fontFamily: MONO, fontSize: 13, padding: "16px 0" }}>
        No completeness report available. Open a keyboard to begin.
      </div>
    );
  }

  const hasIssues =
    report.cycles.length > 0 ||
    report.rejoinViolations.length > 0 ||
    report.orphanInputs.length > 0 ||
    report.unreachable.length > 0;

  const SECTION_STYLE: React.CSSProperties = {
    marginBottom: 20,
    padding: "12px 16px",
    border: "1px solid #21262d",
    borderRadius: 8,
    background: "#0b0f14",
  };

  const HEADING_STYLE: React.CSSProperties = {
    margin: "0 0 8px",
    fontSize: 13,
    fontWeight: 600,
    color: "#e6edf3",
  };

  const OK_STYLE: React.CSSProperties = { color: "#3fb950", fontFamily: MONO, fontSize: 12 };
  const ERR_STYLE: React.CSSProperties = { color: "#ff9492", fontFamily: MONO, fontSize: 12 };
  const WARN_STYLE: React.CSSProperties = { color: "#e3b341", fontFamily: MONO, fontSize: 12 };

  return (
    <div>
      {/* Summary banner */}
      <div
        style={{
          marginBottom: 20,
          padding: "10px 16px",
          borderRadius: 8,
          border: `1px solid ${hasIssues ? "#9e6a03" : "#238636"}`,
          background: hasIssues ? "#241c10" : "#0f2417",
          color: hasIssues ? "#e3b341" : "#3fb950",
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        {hasIssues ? "[WARN] Completeness violations detected" : "[OK] All completeness checks passed"}
      </div>

      {/* C1: Stale steps */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C1 — Stale steps (transitive closure)</h3>
        {report.stale.size === 0 ? (
          <span style={OK_STYLE}>No stale steps (nothing re-opened)</span>
        ) : (
          <ul style={{ margin: 0, padding: "0 0 0 16px", color: "#e3b341", fontFamily: MONO, fontSize: 12 }}>
            {[...report.stale].map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </div>

      {/* C2: Cycles */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C2 — Data-edge cycles (hard error if non-empty)</h3>
        {report.cycles.length === 0 ? (
          <span style={OK_STYLE}>No cycles — acyclic writes→inputs graph</span>
        ) : (
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {report.cycles.map((cycle, i) => (
              <li key={i} style={ERR_STYLE}>
                {cycle.join(" → ")}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* C3: Rejoin violations */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C3 — Side-trail rejoin</h3>
        {report.rejoinViolations.length === 0 ? (
          <span style={OK_STYLE}>All off-spine steps rejoin a spine step</span>
        ) : (
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {report.rejoinViolations.map((v) => (
              <li key={v.stepId} style={WARN_STYLE}>
                {v.stepId}: {v.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* C4: Unshippable prefixes */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C4 — Spine-prefix shippability (structural proxy)</h3>
        {report.unshippablePrefixes.length === 0 ? (
          <span style={OK_STYLE}>All spine prefixes are lock-consistent</span>
        ) : (
          <div style={WARN_STYLE}>
            Unshippable spine prefix indices: {report.unshippablePrefixes.join(", ")}
            <div style={{ marginTop: 4, fontSize: 11, color: "#8b949e" }}>
              (A prefix is unshippable when it includes a lock step whose gate has not been applied.)
            </div>
          </div>
        )}
      </div>

      {/* C5: Orphan inputs */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C5 — Orphan inputs (no upstream writes)</h3>
        {report.orphanInputs.length === 0 ? (
          <span style={OK_STYLE}>All inputs are satisfied by upstream writes</span>
        ) : (
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {report.orphanInputs.map((o, i) => (
              <li key={i} style={WARN_STYLE}>
                {o.stepId}: {o.path}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* C7: Unreachable steps */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>C7 — Unreachable steps</h3>
        {report.unreachable.length === 0 ? (
          <span style={OK_STYLE}>All steps are reachable from the spine entry</span>
        ) : (
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {report.unreachable.map((id) => (
              <li key={id} style={WARN_STYLE}>
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlowMapView (renamed DashboardView; exported as FlowMapView for StudioShell compat)
// ---------------------------------------------------------------------------

export interface FlowMapViewProps {
  /**
   * Completeness report computed by StudioShell from the manifest + wc state.
   * Passed in as a prop so DashboardView has NO stores/ import (dashboard-layer
   * boundary). StudioShell reads useWorkingCopyStore and passes the result here.
   * Optional: dashboard renders a placeholder when undefined.
   */
  completeness?: CompletenessReport;
}

export function FlowMapView({ completeness }: FlowMapViewProps) {
  const [section, setSection] = useState<Section>("flow");
  const flows = useMemo(() => FLOW_SOURCES.map(safeBuild), []);

  // Spec 015 (DEC-001 = Variant A): project the manifest spine onto a FlowGraph
  // via the StepGraph → FlowGraph/GraphNode adapter, reusing FlowGraphView /
  // layoutFlowGraph unchanged. Each projected manifest editor-step carries
  // kind:"stub" (lighting the dead legend swatch below). This block is reached
  // only when FlowMapView mounts, which is gated by SHOW_FLOWMAP (StudioShell.tsx:84) —
  // no new flag is introduced (DEC-002).
  const manifestSpine = useMemo(() => buildManifestProjection(), []);
  // Hang all FLOW_SOURCES modular graphs as registry-keyed drill-downs under their
  // manifest question-step nodes — FR-004. Phase A/B/F hang under "characters";
  // Phase G flows hang under "track" and "project_name" respectively.
  const drillDowns = useMemo(() => attachDrillDowns(flows), [flows]);

  // Manifest-spine order: collect step ids that have drill-downs, preserving the
  // order in which they appear on the manifest spine for consistent rendering.
  // The spine order is: characters, track, project_name (and any future steps).
  // We build the ordered list by walking the manifest-spine nodes and picking those
  // that have drill-downs, so the sections always render in spine order.
  const drillDownStepIds = useMemo(() => {
    const withDrillDowns = new Set(Object.keys(drillDowns));
    // Walk the manifest spine in its rendered order to get spine-ordered step ids.
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const node of manifestSpine.nodes) {
      if (withDrillDowns.has(node.id) && !seen.has(node.id)) {
        ordered.push(node.id);
        seen.add(node.id);
      }
    }
    // Add any step ids not in the spine (defensive — should not happen in practice).
    for (const id of withDrillDowns) {
      if (!seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    return ordered;
  }, [drillDowns, manifestSpine.nodes]);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 24,
        boxSizing: "border-box",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: SANS,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: "#e6edf3" }}>Flow Map</h1>
        <span style={{ fontSize: 12.5, color: "#6e7681" }}>
          developer view · auto-generated from <code style={{ fontFamily: MONO }}>content/flows/*.modular.yaml</code> +{" "}
          <code style={{ fontFamily: MONO }}>strategy-selector</code>
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8b949e", maxWidth: 920 }}>
        A live map of the survey questions, where each branch goes, and the strategy decision tree. It rebuilds
        from source — change a flow's question order or a selector rule, rebuild, and this updates.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <SectionTab active={section === "flow"} onClick={() => setSection("flow")}>
          Survey flow
        </SectionTab>
        <SectionTab active={section === "routing"} onClick={() => setSection("routing")}>
          Script routing (§9)
        </SectionTab>
        <SectionTab active={section === "strategy"} onClick={() => setSection("strategy")}>
          Strategy tree (§7.2)
        </SectionTab>
        <SectionTab active={section === "completeness"} onClick={() => setSection("completeness")}>
          Completeness (US3)
        </SectionTab>
      </div>

      {section === "flow" && (
        <>
          <FlowLegend />

          {/* Spec 015: the manifest spine, projected onto the map (kind:"stub" nodes). */}
          <section style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#6ea8fe" }}>{manifestSpine.title}</h2>
              <span style={{ fontSize: 11.5, color: "#6e7681", fontFamily: MONO }}>
                {manifestSpine.flowId} · {manifestSpine.nodes.length} steps · {manifestSpine.edges.length} edges
              </span>
            </div>
            <FlowGraphView graph={manifestSpine} />
          </section>

          {/* Spec 015 (FR-004): per-phase modular graphs as registry-keyed drill-downs
              under their manifest question-step nodes. Phase A/B/F hang under
              "characters"; Phase G flows hang under "track" and "project_name". */}
          {drillDownStepIds.map((stepId) => {
            const stepDrillDowns = drillDowns[stepId] ?? [];
            return (
              <div key={stepId}>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, color: "#6ea8fe" }}>
                  Drill-downs under <code style={{ fontFamily: MONO }}>{stepId}</code>
                </h2>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6e7681", maxWidth: 920 }}>
                  Question flows hung as registry-keyed drill-downs under the manifest
                  <code style={{ fontFamily: MONO }}> {stepId}</code> step.
                </p>
                {stepDrillDowns.map(({ graph, error, title, registryKey }) => (
                  <section key={title} style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: 14, color: "#adbac7" }}>{title}</h3>
                      <span style={{ fontSize: 11.5, color: "#6e7681", fontFamily: MONO }}>
                        drill-down key: {registryKey}
                        {graph !== null && ` · ${graph.flowId} · ${graph.nodes.length} questions · ${graph.edges.length} edges`}
                      </span>
                    </div>
                    {error !== null && (
                      <div style={{ color: "#ff9492", fontFamily: MONO, fontSize: 12, padding: 12, border: "1px solid #763a3a", borderRadius: 6 }}>
                        Failed to parse: {error}
                      </div>
                    )}
                    {graph !== null && graph.danglingTargets.length > 0 && (
                      <div
                        style={{
                          color: "#e3b341",
                          fontFamily: MONO,
                          fontSize: 12,
                          padding: "8px 12px",
                          marginBottom: 8,
                          border: "1px solid #9e6a03",
                          borderRadius: 6,
                          background: "#241c10",
                        }}
                      >
                        Dangling goto target(s): {graph.danglingTargets.join(", ")}
                      </div>
                    )}
                    {graph !== null && <FlowGraphView graph={graph} />}
                  </section>
                ))}
              </div>
            );
          })}
        </>
      )}

      {section === "routing" && <ScriptRoutingView identityLiteRaw={identityLiteModularRaw} />}

      {section === "strategy" && <StrategyTreeView />}

      {section === "completeness" && <CompletenessView report={completeness} />}
    </div>
  );
}
