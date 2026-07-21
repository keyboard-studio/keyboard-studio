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
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";

// Identity-lite is read directly here for the Script-routing section (§9). The
// flow drill-down sources (derived from step flowRefs) and the rendered-node-id composition
// live in the shared dashboard/renderedNodeSet.ts helper (spec 016, D2a), so
// the Flow Map and the drift guardrail consume ONE composition. Do NOT import
// the legacy *.yaml files here — they are retired and will be deleted.
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

import {
  buildManifestProjection,
  attachDrillDowns,
} from "./manifestProjection.ts";
import { buildFlowSources, buildLibrarySection } from "./renderedNodeSet.ts";
import { FlowGraphView } from "./FlowGraphView.tsx";
import { StrategyTreeView } from "./StrategyTreeView.tsx";
import { ScriptRoutingView } from "./ScriptRoutingView.tsx";
import { MONO, SANS } from "./tokens.tsx";
import type { CompletenessReport } from "./completeness.ts";
import type { AxisFill } from "@keyboard-studio/contracts";

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
  const { t } = useLingui();
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
      <LegendItem
        swatch="#11203a"
        border="#6ea8fe"
        label={t({ id: "dashboard.flowLegend.entry", message: "entry" })}
      />
      <LegendItem
        swatch="#241c10"
        border="#d29922"
        label={t({ id: "dashboard.flowLegend.gate", message: "gate (conditional next)" })}
      />
      <LegendItem
        swatch="#14181f"
        border="#6e7681"
        dashed
        label={t({ id: "dashboard.flowLegend.engineResolved", message: "engine-resolved (not shown)" })}
      />
      <LegendItem
        swatch="#0f2417"
        border="#3fb950"
        label={t({ id: "dashboard.flowLegend.terminal", message: "terminal" })}
      />
      <LegendItem
        swatch="#1a1030"
        border="#6e40c9"
        label={t({ id: "dashboard.flowLegend.reserve", message: "reserve (not in live flow)" })}
      />
      <LegendItem
        swatch="#0d2035"
        border="#58a6ff"
        label={t({ id: "dashboard.flowLegend.stub", message: "stub (gallery / wizard step)" })}
      />
      <LegendItem
        swatch="#0c2a2e"
        border="#39c5cf"
        label={t({ id: "dashboard.flowLegend.proposed", message: "proposed (Library — not live)" })}
      />
      <span style={{ width: 1, alignSelf: "stretch", background: "#21262d" }} />
      <EdgeLegendItem
        color="#d29922"
        label={t({ id: "dashboard.flowLegend.edge.conditional", message: "conditional branch" })}
      />
      <EdgeLegendItem
        color="#6e7681"
        dashed
        label={t({ id: "dashboard.flowLegend.edge.default", message: "default (else)" })}
      />
      <EdgeLegendItem
        color="#4d5b7c"
        label={t({ id: "dashboard.flowLegend.edge.linear", message: "linear next" })}
      />
    </div>
  );
}

/** Parse-failure banner shared by the drill-down and Library proposed-flow sections. */
function ParseErrorBanner({ error }: { error: string }) {
  return (
    <div style={{ color: "#ff9492", fontFamily: MONO, fontSize: 12, padding: 12, border: "1px solid #763a3a", borderRadius: 6 }}>
      <Trans id="dashboard.flow.parseError">Failed to parse: {error}</Trans>
    </div>
  );
}

/** Dangling-goto-target warning shared by the drill-down and Library proposed-flow sections. */
function DanglingTargetsWarning({ targets }: { targets: readonly string[] }) {
  return (
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
      <Trans id="dashboard.flow.danglingTargets">
        Dangling goto target(s): {targets.join(", ")}
      </Trans>
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
        <Trans id="dashboard.completeness.emptyState">
          No completeness report available. Open a keyboard to begin.
        </Trans>
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
        {hasIssues ? (
          <>
            {"[WARN] "}
            <Trans id="dashboard.completeness.summary.issues">Completeness violations detected</Trans>
          </>
        ) : (
          <>
            {"[OK] "}
            <Trans id="dashboard.completeness.summary.ok">All completeness checks passed</Trans>
          </>
        )}
      </div>

      {/* C1: Stale steps */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c1.heading">C1 — Stale steps (transitive closure)</Trans>
        </h3>
        {report.stale.size === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c1.empty">No stale steps (nothing re-opened)</Trans>
          </span>
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
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c2.heading">C2 — Data-edge cycles (hard error if non-empty)</Trans>
        </h3>
        {report.cycles.length === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c2.empty">No cycles — acyclic writes→inputs graph</Trans>
          </span>
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
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c3.heading">C3 — Side-trail rejoin</Trans>
        </h3>
        {report.rejoinViolations.length === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c3.empty">All off-spine steps rejoin a spine step</Trans>
          </span>
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
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c4.heading">
            C4 — Spine-prefix shippability (structural proxy)
          </Trans>
        </h3>
        {report.unshippablePrefixes.length === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c4.empty">All spine prefixes are lock-consistent</Trans>
          </span>
        ) : (
          <div style={WARN_STYLE}>
            <Trans id="dashboard.completeness.c4.unshippable">
              Unshippable spine prefix indices: {report.unshippablePrefixes.join(", ")}
            </Trans>
            <div style={{ marginTop: 4, fontSize: 11, color: "#8b949e" }}>
              <Trans id="dashboard.completeness.c4.note">
                (A prefix is unshippable when it includes a lock step whose gate has not been applied.)
              </Trans>
            </div>
          </div>
        )}
      </div>

      {/* C5: Orphan inputs */}
      <div style={SECTION_STYLE}>
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c5.heading">C5 — Orphan inputs (no upstream writes)</Trans>
        </h3>
        {report.orphanInputs.length === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c5.empty">All inputs are satisfied by upstream writes</Trans>
          </span>
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
        <h3 style={HEADING_STYLE}>
          <Trans id="dashboard.completeness.c7.heading">C7 — Unreachable steps</Trans>
        </h3>
        {report.unreachable.length === 0 ? (
          <span style={OK_STYLE}>
            <Trans id="dashboard.completeness.c7.empty">All steps are reachable from the spine entry</Trans>
          </span>
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
  /**
   * Default-fill provenance (#890) — forwarded unchanged to StrategyTreeView.
   * Same boundary rationale as `completeness`: StudioShell reads
   * `useWorkingCopyStore((s) => s.axisFills)` and passes it in here.
   */
  axisFills?: AxisFill[];
}

export function FlowMapView({ completeness, axisFills }: FlowMapViewProps) {
  const { t } = useLingui();
  const [section, setSection] = useState<Section>("flow");
  const flows = useMemo(() => buildFlowSources(), []);
  // spec 025 (D6): the Library section — proposed-flow ordered graphs + flat
  // reserve + "also live" dual-references. Derived from flowSources status:"proposed"
  // entries; excluded from the live rendered<->runtime bijection.
  const library = useMemo(() => buildLibrarySection(), []);

  // Spec 015 (DEC-001 = Variant A): project the manifest spine onto a FlowGraph
  // via the StepGraph → FlowGraph/GraphNode adapter, reusing FlowGraphView /
  // layoutFlowGraph unchanged. Each projected manifest editor-step carries
  // kind:"stub" (lighting the dead legend swatch below). This block is reached
  // only when FlowMapView mounts, which is gated by SHOW_FLOWMAP (StudioShell.tsx:84) —
  // no new flag is introduced (DEC-002).
  const manifestSpine = useMemo(() => buildManifestProjection(), []);
  // Hang the derived modular graphs as registry-keyed drill-downs under their
  // manifest question-step nodes — FR-004 (spec 024: derived from step flowRefs).
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
        <h1 style={{ margin: 0, fontSize: 20, color: "#e6edf3" }}>
          <Trans id="dashboard.flowMap.title">Flow Map</Trans>
        </h1>
        <span style={{ fontSize: 12.5, color: "#6e7681" }}>
          <Trans id="dashboard.flowMap.subtitle">
            developer view · auto-generated from{" "}
            <code style={{ fontFamily: MONO }}>content/flows/*.modular.yaml</code> +{" "}
            <code style={{ fontFamily: MONO }}>strategy-selector</code>
          </Trans>
        </span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#8b949e", maxWidth: 920 }}>
        <Trans id="dashboard.flowMap.description">
          A live map of the survey questions, where each branch goes, and the strategy decision tree. It rebuilds
          from source — change a flow&rsquo;s question order or a selector rule, rebuild, and this updates.
        </Trans>
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <SectionTab active={section === "flow"} onClick={() => setSection("flow")}>
          <Trans id="dashboard.tabs.surveyFlow">Survey flow</Trans>
        </SectionTab>
        <SectionTab active={section === "routing"} onClick={() => setSection("routing")}>
          <Trans id="dashboard.tabs.scriptRouting">Script routing (§9)</Trans>
        </SectionTab>
        <SectionTab active={section === "strategy"} onClick={() => setSection("strategy")}>
          <Trans id="dashboard.tabs.strategyTree">Strategy tree (§7.2)</Trans>
        </SectionTab>
        <SectionTab active={section === "completeness"} onClick={() => setSection("completeness")}>
          <Trans id="dashboard.tabs.completeness">Completeness (US3)</Trans>
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
                  <Trans id="dashboard.flowMap.drillDownsUnder">
                    Drill-downs under <code style={{ fontFamily: MONO }}>{stepId}</code>
                  </Trans>
                </h2>
                <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6e7681", maxWidth: 920 }}>
                  <Trans id="dashboard.flowMap.drillDownsDescription">
                    Question flows hung as registry-keyed drill-downs under the manifest
                    <code style={{ fontFamily: MONO }}> {stepId}</code> step.
                  </Trans>
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
                    {error !== null && <ParseErrorBanner error={error} />}
                    {graph !== null && graph.danglingTargets.length > 0 && (
                      <DanglingTargetsWarning targets={graph.danglingTargets} />
                    )}
                    {graph !== null && <FlowGraphView graph={graph} />}
                  </section>
                ))}
              </div>
            );
          })}

          {/* spec 025 (D6): the Library section — proposed flows rendered as ordered
              graphs, clearly separated from the live flow (ADR-0001). These do NOT
              run in the live survey and are excluded from the rendered<->runtime
              bijection. */}
          <section style={{ marginTop: 36, borderTop: "1px solid #21262d", paddingTop: 24 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 15, color: "#39c5cf" }}>
                <Trans id="dashboard.library.heading">Library — proposed flows</Trans>
              </h2>
              <span style={{ fontSize: 11.5, color: "#6e7681", fontFamily: MONO }}>
                {t({
                  id: "dashboard.library.count",
                  message: plural(library.proposed.length, {
                    one: "# proposed · not in the live survey",
                    other: "# proposed · not in the live survey",
                  }),
                })}
              </span>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#6e7681", maxWidth: 920 }}>
              <Trans id="dashboard.library.description">
                Ordered graphs of flows registered as{" "}
                <code style={{ fontFamily: MONO }}>{'status:"proposed"'}</code> — browsable
                and promotable, never run by the live survey. See{" "}
                <code style={{ fontFamily: MONO }}>content/flows/README.md</code> for the promotion runbook.
              </Trans>
            </p>

            {/* Dual-reference ("also live") WARN — never a failure. */}
            {library.dualReferenced.length > 0 && (
              <div
                style={{
                  color: "#e3b341",
                  fontFamily: MONO,
                  fontSize: 12,
                  padding: "8px 12px",
                  marginBottom: 16,
                  border: "1px solid #9e6a03",
                  borderRadius: 6,
                  background: "#241c10",
                }}
              >
                {"[WARN] "}
                <Trans id="dashboard.library.dualReferenced">
                  also live — question(s) in both a live and a proposed flow:{" "}
                  {library.dualReferenced.join(", ")}
                </Trans>
              </div>
            )}

            {library.proposed.map(({ id, graph, error, title }) => (
              <section key={id} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: "#adbac7" }}>{title}</h3>
                  <span style={{ fontSize: 11.5, color: "#6e7681", fontFamily: MONO }}>
                    proposed flow: {id}
                    {graph !== null && ` · ${graph.nodes.length} questions · ${graph.edges.length} edges`}
                  </span>
                </div>
                {error !== null && <ParseErrorBanner error={error} />}
                {graph !== null && graph.danglingTargets.length > 0 && (
                  <DanglingTargetsWarning targets={graph.danglingTargets} />
                )}
                {graph !== null && <FlowGraphView graph={graph} />}
              </section>
            ))}

            {/* Flat reserve — questions in NO flow at all (neither live nor proposed). */}
            <div style={{ marginTop: 8 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 13, color: "#adbac7" }}>
                <Trans id="dashboard.library.reserve.heading">Reserve — questions in no flow</Trans>
              </h3>
              {library.reserve.length === 0 ? (
                <span style={{ color: "#3fb950", fontFamily: MONO, fontSize: 12 }}>
                  {"[OK] "}
                  <Trans id="dashboard.library.reserve.ok">
                    Every registered question belongs to a live or proposed flow.
                  </Trans>
                </span>
              ) : (
                <ul style={{ margin: 0, padding: "0 0 0 16px", color: "#8b949e", fontFamily: MONO, fontSize: 12 }}>
                  {library.reserve.map((n) => (
                    <li key={n.id}>{n.id}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}

      {section === "routing" && <ScriptRoutingView identityLiteRaw={identityLiteModularRaw} />}

      {section === "strategy" && (
        <StrategyTreeView {...(axisFills !== undefined ? { axisFills } : {})} />
      )}

      {section === "completeness" && <CompletenessView report={completeness} />}
    </div>
  );
}
