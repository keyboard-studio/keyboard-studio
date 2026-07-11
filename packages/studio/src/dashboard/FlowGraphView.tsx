// Render one laid-out FlowGraph: an SVG edge canvas with HTML node cards on top.
//
// Edges are colour-coded by kind (conditional/default/linear) so the branching
// reads at a glance; nodes are badged by role (entry, gate, engine-resolved,
// terminal). Pure presentation — all data comes from layoutFlowGraph().

import { type CSSProperties } from "react";
import type { GraphEdge } from "./model.ts";
import {
  layoutFlowGraph,
  NODE_W,
  NODE_H,
  type LaidOutGraph,
  type PositionedNode,
} from "./layout.ts";
import type { FlowGraph } from "./model.ts";
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

function nodeRole(n: PositionedNode): {
  border: string;
  bg: string;
  badge: string | null;
  badgeBg: string;
} {
  // Library-not-in-flow nodes (registered Phase B modules not in the live manifest)
  // are rendered with a distinct muted purple palette and a "reserve" badge so it is
  // immediately clear they do NOT run in the current survey.
  if (n.kind === "library-not-in-flow") {
    return {
      border: "#6e40c9",
      bg: "#1a1030",
      badge: "reserve",
      badgeBg: "#4a2a8a",
    };
  }
  // Stub nodes (galleries / wizard steps not yet in the question registry).
  if (n.kind === "stub") {
    return {
      border: "#58a6ff",
      bg: "#0d2035",
      badge: "stub",
      badgeBg: "#1c4a7a",
    };
  }
  // Proposed-flow nodes (spec 025): a distinct teal palette + "proposed" badge so
  // it is immediately clear they render only in the Library section and do NOT run.
  if (n.kind === "proposed") {
    return {
      border: "#39c5cf",
      bg: "#0c2a2e",
      badge: "proposed",
      badgeBg: "#1b6b73",
    };
  }
  // Live nodes — standard role-based styling.
  if (n.isEntry)
    return {
      border: "#6ea8fe",
      bg: "#11203a",
      badge: "entry",
      badgeBg: "#1f6feb",
    };
  if (n.isGate)
    return {
      border: "#d29922",
      bg: "#241c10",
      badge: "gate",
      badgeBg: "#9e6a03",
    };
  if (n.engineResolved)
    return {
      border: "#6e7681",
      bg: "#14181f",
      badge: "engine",
      badgeBg: "#373e47",
    };
  if (n.isTerminal)
    return {
      border: "#3fb950",
      bg: "#0f2417",
      badge: "terminal",
      badgeBg: "#238636",
    };
  return { border: "#30363d", bg: "#161b22", badge: null, badgeBg: "#30363d" };
}

interface FlowGraphViewProps {
  graph: FlowGraph;
}

export function FlowGraphView({ graph }: FlowGraphViewProps) {
  const laid: LaidOutGraph = layoutFlowGraph(graph);
  const pos = new Map<string, PositionedNode>(laid.nodes.map((n) => [n.id, n]));
  // Render the canvas a little taller than the laid-out node extent so bottom-row
  // edges aren't clipped and the next section isn't crowded (see CANVAS_BOTTOM_PAD).
  const canvasH = laid.height + CANVAS_BOTTOM_PAD;

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
          const role = nodeRole(n);
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
            tooltipLines.push(`writes: ${n.writePaths.join(", ")}`);
          if (n.inputPaths !== undefined && n.inputPaths.length > 0)
            tooltipLines.push(`inputs: ${n.inputPaths.join(", ")}`);
          if (n.lock !== undefined) tooltipLines.push(`lock: ${n.lock}`);

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
                    {`lock·${n.lock}`}
                  </span>
                )}
                {role.badge !== null && (
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
                    {role.badge}
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
                    title="This question also appears in a live flow (also live)."
                  >
                    also live
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
                  <span style={{ color: "#3fb950" }}>writes:</span>{" "}
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
                  <span style={{ color: "#58a6ff" }}>inputs:</span>{" "}
                  {n.inputPaths!.length > 0
                    ? n.inputPaths!.map((p) => truncatePath(p)).join(", ")
                    : "—"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
