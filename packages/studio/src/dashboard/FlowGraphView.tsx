// Render one laid-out FlowGraph: an SVG edge canvas with HTML node cards on top.
//
// Edges are colour-coded by kind (conditional/default/linear) so the branching
// reads at a glance; nodes are badged by role (entry, gate, engine-resolved,
// terminal). Pure presentation — all data comes from layoutFlowGraph().

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { DecisionImpact } from "@keyboard-studio/contracts";
import { DiffHunkList } from "../ui/DiffHunkList.tsx";
import type { GraphEdge } from "./model.ts";
import {
  layoutFlowGraph,
  NODE_W,
  NODE_H,
  type LaidOutGraph,
  type PositionedNode,
} from "./layout.ts";
import type { FlowGraph } from "./model.ts";
import { edgeKey, type PathOverlay } from "./pathOverlay.ts";
import { MONO, SANS } from "./tokens.tsx";

/** Truncate a path string to fit inside NODE_W with an ellipsis.
 *  maxLen=28: empirically fits NODE_W=220 px at the monospace font size (9.5 px) +
 *  padding used by the card; adjust if NODE_W or font-size change. */
function truncatePath(path: string, maxLen = 28): string {
  return path.length > maxLen ? path.slice(0, maxLen - 1) + "…" : path;
}

const EDGE_COLOR: Record<GraphEdge["kind"], string> = {
  linear: "#4d5b7c",
  conditional: "#d29922",
  default: "#6e7681",
};

// Extra vertical room rendered below the last node row. Edges leaving the
// bottom-most nodes (e.g. Phase B's pb_linguist_confirm / pb_picker_confirm)
// bow below their node; without this pad the SVG clips them at the canvas edge
// and the next drill-down section (e.g. Phase F) sits flush against them. The
// pad un-clips those edges AND separates consecutive sections. layout.ts's
// laid.height is unchanged (node positions / its tests are untouched) — this is
// purely a render-time canvas extension.
const CANVAS_BOTTOM_PAD = 80;

// Walked-path highlight (spec 053, FR-023). Deliberately outside the EDGE_COLOR
// palette and outside every nodeRole() border colour, so "this keyboard went here"
// can never be confused with an edge kind or a node role.
const WALKED_COLOR = "#f778ba";

// Alternative-answer panel (spec 053, FR-026). `position: sticky` with `left: 0`
// keeps it readable while the (often much wider) graph canvas is scrolled
// horizontally inside the same container.
const panelStyle: CSSProperties = {
  position: "sticky",
  left: 0,
  margin: 12,
  padding: 12,
  maxWidth: 720,
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
};

const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#6ea8fe",
  fontFamily: SANS,
  fontSize: 12,
  textDecoration: "underline",
  cursor: "pointer",
};

const noticeStyle: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 12,
  color: "#8b949e",
};

interface Pt {
  x: number;
  y: number;
}

/**
 * Cubic bezier between two nodes.
 *
 * Forward edge (target below source): exit the source bottom, enter the target top.
 * Back-edge (target at or above source — a loop back into the flow): exit the
 * source TOP and enter the target BOTTOM so the curve routes UPWARD. Otherwise it
 * would exit the source bottom and bow downward first, drawing stray lines BELOW
 * the bottom-most nodes of a phase (e.g. Phase B's confirm steps) before sweeping
 * back up — which read as the graph continuing past its last question.
 */
function edgePath(from: Pt, to: Pt): string {
  const x1 = from.x + NODE_W / 2;
  const x2 = to.x + NODE_W / 2;
  if (to.y < from.y) {
    // Back-edge: route upward (source top → target bottom); never dips below source.
    const y1 = from.y;
    const y2 = to.y + NODE_H;
    const dy = Math.max(28, Math.abs(y2 - y1) * 0.4);
    return `M ${x1} ${y1} C ${x1} ${y1 - dy}, ${x2} ${y2 + dy}, ${x2} ${y2}`;
  }
  const y1 = from.y + NODE_H;
  const y2 = to.y;
  const dy = Math.max(28, Math.abs(y2 - y1) * 0.4);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

/** Node-role badge kind — a stable, translation-free tag. The macro-extractable
 *  `t()` calls that turn a kind into display text live in `badgeLabel()` below,
 *  inside the component's render (where the `useLingui()`-bound `t` is actually
 *  in scope) — passing `t` through a function parameter breaks the Lingui
 *  extractor's binding-based static analysis (it does not see through a
 *  re-parameterized alias), so this helper stays translation-free by design. */
type BadgeKind = "reserve" | "stub" | "proposed" | "entry" | "gate" | "engine" | "terminal" | null;

function nodeRole(n: PositionedNode): {
  border: string;
  bg: string;
  badgeKind: BadgeKind;
  badgeBg: string;
} {
  // Library-not-in-flow nodes (registered Phase B modules not in the live manifest)
  // are rendered with a distinct muted purple palette and a "reserve" badge so it is
  // immediately clear they do NOT run in the current survey.
  if (n.kind === "library-not-in-flow") {
    return { border: "#6e40c9", bg: "#1a1030", badgeKind: "reserve", badgeBg: "#4a2a8a" };
  }
  // Stub nodes (galleries / wizard steps not yet in the question registry).
  if (n.kind === "stub") {
    return { border: "#58a6ff", bg: "#0d2035", badgeKind: "stub", badgeBg: "#1c4a7a" };
  }
  // Proposed-flow nodes (spec 025): a distinct teal palette + "proposed" badge so
  // it is immediately clear they render only in the Library section and do NOT run.
  if (n.kind === "proposed") {
    return { border: "#39c5cf", bg: "#0c2a2e", badgeKind: "proposed", badgeBg: "#1b6b73" };
  }
  // Live nodes — standard role-based styling.
  if (n.isEntry)
    return { border: "#6ea8fe", bg: "#11203a", badgeKind: "entry", badgeBg: "#1f6feb" };
  if (n.isGate)
    return { border: "#d29922", bg: "#241c10", badgeKind: "gate", badgeBg: "#9e6a03" };
  if (n.engineResolved)
    return { border: "#6e7681", bg: "#14181f", badgeKind: "engine", badgeBg: "#373e47" };
  if (n.isTerminal)
    return { border: "#3fb950", bg: "#0f2417", badgeKind: "terminal", badgeBg: "#238636" };
  return { border: "#30363d", bg: "#161b22", badgeKind: null, badgeBg: "#30363d" };
}

interface FlowGraphViewProps {
  graph: FlowGraph;
  /**
   * Which steps and transitions the selected keyboard walked (spec 053, FR-023).
   *
   * OPTIONAL, AND ITS ABSENCE IS A CONTRACT. With no overlay this component
   * renders exactly the markup it rendered before the overlay existed — FR-024 is
   * an identity, pinned by the snapshot in FlowGraphView.pathOverlay.test.tsx. So
   * the overlay is an ADDITIONAL layer: it never restyles a node card or an edge
   * in the base render, because doing so would need a conditional inside markup
   * that has to stay byte-identical.
   *
   * Passed down as a prop rather than read from a store: `dashboard/` has no
   * `stores/` import (the depcruise `dashboard-layer` rule), so `StudioShell`
   * projects the record and hands the result in — the same arrangement
   * `completeness` and `axisFills` already use.
   */
  pathOverlay?: PathOverlay;
  /**
   * Derive, ON REQUEST, what a different answer at one step would have produced
   * (spec 053, FR-026). Returns `null` when that step recorded no survey decision
   * to vary — which is reported as a reason, never as a failure (FR-028).
   *
   * Its absence removes the affordance entirely, so a graph rendered without it is
   * markup-identical to the pre-feature build (FR-024). Injected as a function for
   * the same boundary reason as `pathOverlay`, and because FR-027's "no speculative
   * computation" has to be structural: there is nothing here that could derive an
   * outcome for a branch nobody asked about.
   */
  resolveAlternative?: (stepId: string, alternativeValue: string) => DecisionImpact | null;
}

export function FlowGraphView({ graph, pathOverlay, resolveAlternative }: FlowGraphViewProps) {
  const { t } = useLingui();
  // The inspected node, the answer being tried, and the single outcome that has
  // been asked for. One outcome at a time, cleared on every re-selection: FR-026 is
  // "that node's counterfactual and no other", so there is no map of outcomes to
  // accumulate in.
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [alternativeValue, setAlternativeValue] = useState("");
  const [outcome, setOutcome] = useState<{ stepId: string; impact: DecisionImpact | null } | null>(
    null,
  );
  const inspectable = resolveAlternative !== undefined;

  // The panel sits after the whole node-card list in DOM order, so a keyboard
  // or AT user opening it from an early node would otherwise have to tab past
  // every remaining card to reach it. Moving focus to the panel heading on
  // open (spec 053 FR-026 follow-up) lands them there directly; the heading
  // itself is not otherwise focusable, hence tabIndex={-1} below.
  const panelHeadingRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (inspectedId !== null) panelHeadingRef.current?.focus();
  }, [inspectedId]);

  // Localized badge text per BadgeKind. Defined here (not inside nodeRole)
  // so the `t()` calls stay in the same lexical scope as the `useLingui()`
  // binding above — see the BadgeKind comment for why that matters to the
  // Lingui extractor.
  function badgeLabel(kind: BadgeKind): string | null {
    switch (kind) {
      case "reserve":
        return t({ id: "dashboard.flowGraph.badge.reserve", message: "reserve" });
      case "stub":
        return t({ id: "dashboard.flowGraph.badge.stub", message: "stub" });
      case "proposed":
        return t({ id: "dashboard.flowGraph.badge.proposed", message: "proposed" });
      case "entry":
        return t({ id: "dashboard.flowGraph.badge.entry", message: "entry" });
      case "gate":
        return t({ id: "dashboard.flowGraph.badge.gate", message: "gate" });
      case "engine":
        return t({ id: "dashboard.flowGraph.badge.engine", message: "engine" });
      case "terminal":
        return t({ id: "dashboard.flowGraph.badge.terminal", message: "terminal" });
      case null:
        return null;
    }
  }

  const laid: LaidOutGraph = layoutFlowGraph(graph);
  const pos = new Map<string, PositionedNode>(laid.nodes.map((n) => [n.id, n]));
  // Render the canvas a little taller than the laid-out node extent so bottom-row
  // edges aren't clipped and the next section isn't crowded (see CANVAS_BOTTOM_PAD).
  const canvasH = laid.height + CANVAS_BOTTOM_PAD;

  // The inspected node, resolved out of the graph rather than remembered: a graph
  // that no longer contains the selected id simply has nothing to inspect.
  const inspectedNode = inspectedId === null ? undefined : pos.get(inspectedId);
  // A local, not `inspectedNode.id` inline, so the Lingui macro derives a NAMED
  // placeholder ({stepId}) instead of a positional one — a translator has to be
  // able to move it within the sentence.
  const stepId = inspectedNode?.id ?? "";

  // Every graph renders in full (page scrolls). Deep phases like Phase B must be
  // fully visible inline — no node-capping / "Show more" collapse.
  return (
    <div
      style={{
        overflow: "auto",
        border: "1px solid #21262d",
        borderRadius: 8,
        background: "#0b0f14",
      }}
    >
      <div
        style={{
          position: "relative",
          width: laid.width,
          height: canvasH,
        }}
      >
        {/* Edge canvas */}
        <svg
          width={laid.width}
          height={canvasH}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <defs>
            {(["linear", "conditional", "default"] as const).map((kind) => (
              <marker
                key={kind}
                id={`arrow-${graph.flowId}-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR[kind]} />
              </marker>
            ))}
          </defs>
          {laid.edges.map((e, i) => {
            const from = pos.get(e.from);
            const to = pos.get(e.to);
            if (!from || !to) return null; // dangling target — no node to point at
            return (
              <path
                key={`${e.from}->${e.to}-${i}`}
                d={edgePath(from, to)}
                fill="none"
                stroke={EDGE_COLOR[e.kind]}
                strokeWidth={1.5}
                strokeDasharray={e.kind === "default" ? "5 4" : undefined}
                markerEnd={`url(#arrow-${graph.flowId}-${e.kind})`}
              />
            );
          })}
        </svg>

        {/* Walked-path overlay (spec 053, FR-023). A SEPARATE layer over the edge
            canvas: walked edges are redrawn in WALKED_COLOR and walked nodes get an
            outline ring, so untraversed structure keeps its own styling and nothing
            in the base render changes. Absent entirely without the prop (FR-024).
            Untaken branches get no treatment at all — FR-027's "structural
            information only" is what the base render already is. */}
        {pathOverlay !== undefined && (
          <svg
            data-testid="flowmap-path-overlay"
            width={laid.width}
            height={canvasH}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {laid.edges.map((e, i) => {
              const key = edgeKey(e.from, e.to);
              if (!pathOverlay.walkedEdges.has(key)) return null;
              const from = pos.get(e.from);
              const to = pos.get(e.to);
              if (!from || !to) return null; // walked, but not an edge THIS graph draws
              return (
                <path
                  key={`walked-${key}-${i}`}
                  data-walked-edge={key}
                  d={edgePath(from, to)}
                  fill="none"
                  stroke={WALKED_COLOR}
                  strokeWidth={3}
                  strokeOpacity={0.85}
                />
              );
            })}
            {laid.nodes.map((n) =>
              pathOverlay.walkedSteps.has(n.id) ? (
                <rect
                  key={`walked-${n.id}`}
                  data-walked-step={n.id}
                  x={n.x - 3}
                  y={n.y - 3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={9}
                  fill="none"
                  stroke={WALKED_COLOR}
                  strokeWidth={2}
                />
              ) : null,
            )}
          </svg>
        )}

        {/* Edge labels (HTML, crisper than SVG text) */}
        {laid.edges.map((e, i) => {
          if (e.label === undefined) return null;
          const from = pos.get(e.from);
          const to = pos.get(e.to);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2 + NODE_W / 2;
          const midY = (from.y + NODE_H + to.y) / 2;
          return (
            <div
              key={`lbl-${e.from}->${e.to}-${i}`}
              title={e.label}
              style={{
                position: "absolute",
                left: midX,
                top: midY,
                transform: "translate(-50%, -50%)",
                maxWidth: 200,
                padding: "1px 6px",
                fontSize: 11,
                fontFamily: MONO,
                color: e.kind === "conditional" ? "#e3b341" : "#adbac7",
                background: "#0b0f14",
                border: `1px solid ${EDGE_COLOR[e.kind]}`,
                borderRadius: 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "auto",
              }}
            >
              {e.label}
            </div>
          );
        })}

        {/* Node cards */}
        {laid.nodes.map((n) => {
          // A local, not `n.id` inline in the aria-label below, so the Lingui
          // macro derives a NAMED placeholder rather than a positional `{0}`
          // (same reasoning as `stepId` above).
          const nodeId = n.id;
          const role = nodeRole(n);
          const badge = badgeLabel(role.badgeKind);
          const cardStyle: CSSProperties = {
            position: "absolute",
            left: n.x,
            top: n.y,
            width: NODE_W,
            height: NODE_H,
            boxSizing: "border-box",
            padding: "6px 9px",
            background: role.bg,
            border: `1.5px solid ${role.border}`,
            borderStyle: n.engineResolved ? "dashed" : "solid",
            borderRadius: 7,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflow: "hidden",
          };

          // Build the tooltip: id + label + writes + inputs + lock.
          const tooltipLines: string[] = [`${n.id}\n${n.label}`];
          if (n.writePaths !== undefined && n.writePaths.length > 0)
            tooltipLines.push(
              `${t({ id: "dashboard.flowGraph.tooltip.writes", message: "writes" })}: ${n.writePaths.join(", ")}`,
            );
          if (n.inputPaths !== undefined && n.inputPaths.length > 0)
            tooltipLines.push(
              `${t({ id: "dashboard.flowGraph.tooltip.inputs", message: "inputs" })}: ${n.inputPaths.join(", ")}`,
            );
          if (n.lock !== undefined)
            tooltipLines.push(
              `${t({ id: "dashboard.flowGraph.tooltip.lock", message: "lock" })}: ${n.lock}`,
            );

          // Metadata lines to show inline — only on nodes that carry writePaths
          // (projected manifest-step nodes). Empty arrays still show the line so
          // the space is predictable; undefined means the node is a live question
          // node and no extra line is rendered.
          const hasMetadata = n.writePaths !== undefined;

          return (
            <div key={n.id} style={cardStyle} title={tooltipLines.join("\n")}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: "#6ea8fe",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    flex: 1,
                  }}
                >
                  {n.id}
                </span>
                {/* Spec 053 (FR-026): ask what a different answer here would have
                    produced. Rendered ONLY when a resolver was injected, so the
                    card's markup is untouched in the pre-feature case (FR-024). */}
                {inspectable && (
                  <button
                    type="button"
                    data-testid="flowmap-alternative-open"
                    data-step-id={n.id}
                    aria-label={t({
                      id: "dashboard.flowGraph.alternative.openAriaLabel",
                      message: `What if ${nodeId} had a different answer?`,
                    })}
                    onClick={() => {
                      setInspectedId(n.id);
                      setAlternativeValue("");
                      setOutcome(null); // A new node means the old outcome is not this one's.
                    }}
                    style={{
                      fontFamily: SANS,
                      fontSize: 9.5,
                      lineHeight: "14px",
                      color: WALKED_COLOR,
                      background: "none",
                      border: `1px solid ${WALKED_COLOR}`,
                      borderRadius: 3,
                      padding: "0 5px",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    {t({ id: "dashboard.flowGraph.alternative.open", message: "what if?" })}
                  </button>
                )}
                {n.lock !== undefined && (
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: 9,
                      lineHeight: "13px",
                      color: "#e3b341",
                      background: "#241c10",
                      border: "1px solid #9e6a03",
                      borderRadius: 3,
                      padding: "0 4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {`${t({ id: "dashboard.flowGraph.badge.lock", message: "lock" })}·${n.lock}`}
                  </span>
                )}
                {badge !== null && (
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: 9.5,
                      lineHeight: "14px",
                      color: "#fff",
                      background: role.badgeBg,
                      borderRadius: 3,
                      padding: "0 5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge}
                  </span>
                )}
                {/* spec 025 (FR-005): dual-reference WARN — this proposed question also
                    appears in a live flow. Amber "also live" badge, never a failure. */}
                {n.alsoLive === true && (
                  <span
                    style={{
                      fontFamily: SANS,
                      fontSize: 9,
                      lineHeight: "14px",
                      color: "#e3b341",
                      background: "#241c10",
                      border: "1px solid #9e6a03",
                      borderRadius: 3,
                      padding: "0 4px",
                      whiteSpace: "nowrap",
                    }}
                    title={t({
                      id: "dashboard.flowGraph.alsoLive.title",
                      message: "This question also appears in a live flow (also live).",
                    })}
                  >
                    <Trans id="dashboard.flowGraph.alsoLive.badge">also live</Trans>
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: 10.5,
                  color: "#8b949e",
                  lineHeight: "13px",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                <span style={{ color: "#586069" }}>
                  {hasMetadata ? (n.stepKind ?? n.type) : n.type}
                </span>
                {n.label !== n.id ? ` · ${n.label}` : ""}
              </div>
              {hasMetadata && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: "#6e7681",
                    lineHeight: "13px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span style={{ color: "#3fb950" }}>
                    <Trans id="dashboard.flowGraph.metadata.writes">writes:</Trans>
                  </span>{" "}
                  {n.writePaths !== undefined && n.writePaths.length > 0
                    ? n.writePaths.map((p) => truncatePath(p)).join(", ")
                    : "—"}
                </div>
              )}
              {hasMetadata && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color: "#6e7681",
                    lineHeight: "13px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span style={{ color: "#58a6ff" }}>
                    <Trans id="dashboard.flowGraph.metadata.inputs">inputs:</Trans>
                  </span>{" "}
                  {n.inputPaths!.length > 0
                    ? n.inputPaths!.map((p) => truncatePath(p)).join(", ")
                    : "—"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spec 053 (FR-026/FR-027/FR-028): the one-branch-deep alternative.
          Structural information is shown from the graph alone the moment a node is
          inspected; the OUTCOME is derived only when explicitly asked for, for that
          node only. Where it cannot be derived the panel says why — an underivable
          alternative is a sentence, never a failure (FR-028). */}
      {inspectable && inspectedNode !== undefined && (
        <div data-testid="flowmap-alternative" style={panelStyle}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <strong
              ref={panelHeadingRef}
              tabIndex={-1}
              style={{ fontFamily: SANS, fontSize: 12.5, color: "#e6edf3", flex: 1 }}
            >
              {t({
                id: "dashboard.flowGraph.alternative.title",
                message: `Alternative at ${stepId}`,
              })}
            </strong>
            <button
              type="button"
              data-testid="flowmap-alternative-close"
              onClick={() => {
                setInspectedId(null);
                setOutcome(null);
              }}
              style={linkButtonStyle}
            >
              {t({ id: "dashboard.flowGraph.alternative.close", message: "Close" })}
            </button>
          </div>

          {/* Structural information — read off the graph, derived from nothing. */}
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#8b949e", lineHeight: "16px" }}>
            <div>{inspectedNode.stepKind ?? inspectedNode.type}</div>
            <div>
              <Trans id="dashboard.flowGraph.metadata.writes">writes:</Trans>{" "}
              {inspectedNode.writePaths !== undefined && inspectedNode.writePaths.length > 0
                ? inspectedNode.writePaths.join(", ")
                : "—"}
            </div>
            <div>
              <Trans id="dashboard.flowGraph.metadata.inputs">inputs:</Trans>{" "}
              {inspectedNode.inputPaths !== undefined && inspectedNode.inputPaths.length > 0
                ? inspectedNode.inputPaths.join(", ")
                : "—"}
            </div>
            {inspectedNode.lock !== undefined && (
              <div>
                <Trans id="dashboard.flowGraph.tooltip.lock">lock</Trans>: {inspectedNode.lock}
              </div>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "10px 0 6px",
              fontFamily: SANS,
              fontSize: 12,
              color: "#adbac7",
            }}
          >
            {t({
              id: "dashboard.flowGraph.alternative.valueLabel",
              message: "Try a different answer",
            })}
            <input
              data-testid="flowmap-alternative-value"
              value={alternativeValue}
              onChange={(e) => {
                setAlternativeValue(e.target.value);
                // A changed question invalidates the answer already on screen.
                setOutcome(null);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: MONO,
                fontSize: 12,
                padding: "3px 6px",
                color: "#e6edf3",
                background: "#0b0f14",
                border: "1px solid #30363d",
                borderRadius: 4,
              }}
            />
          </label>

          <button
            type="button"
            data-testid="flowmap-alternative-derive"
            disabled={alternativeValue.trim() === ""}
            onClick={() => {
              setOutcome({
                stepId: inspectedNode.id,
                impact: resolveAlternative(inspectedNode.id, alternativeValue),
              });
            }}
            style={linkButtonStyle}
          >
            {t({
              id: "dashboard.flowGraph.alternative.derive",
              message: "Show what this would have produced",
            })}
          </button>

          <div
            data-testid="flowmap-alternative-outcome"
            aria-live="polite"
            style={{ marginTop: 6 }}
          >
            {outcome === null || outcome.stepId !== inspectedNode.id ? (
              // FR-027, said out loud: an untaken branch shows structure and nothing
              // more until someone asks about it.
              <p style={noticeStyle}>
                {t({
                  id: "dashboard.flowGraph.alternative.prompt",
                  message: "Nothing is derived for a branch until you ask.",
                })}
              </p>
            ) : outcome.impact === null ? (
              <p style={noticeStyle}>
                {t({
                  id: "dashboard.flowGraph.alternative.noDecision",
                  message:
                    "No decision was recorded at this step, so there is no answer here to vary.",
                })}
              </p>
            ) : outcome.impact.state === "captured" ? (
              <DiffHunkList hunks={outcome.impact.hunks} />
            ) : outcome.impact.state === "none" ? (
              <p style={noticeStyle}>
                {t({
                  id: "dashboard.flowGraph.alternative.none",
                  message: "That answer would change nothing in the keyboard source.",
                })}
              </p>
            ) : outcome.impact.reason === "lock-gate-dependency" ? (
              <p style={noticeStyle}>
                {t({
                  id: "dashboard.flowGraph.alternative.unavailable.lockGate",
                  message:
                    "This step sits behind a lock that has already closed, so an alternative cannot be derived from here.",
                })}
              </p>
            ) : (
              <p style={noticeStyle}>
                {t({
                  id: "dashboard.flowGraph.alternative.unavailable.noWritePath",
                  message:
                    "This step has no re-derivable write path in this build, so an alternative cannot be derived.",
                })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
