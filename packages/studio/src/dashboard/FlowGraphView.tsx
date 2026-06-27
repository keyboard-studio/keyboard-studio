// Render one laid-out FlowGraph: an SVG edge canvas with HTML node cards on top.
//
// Edges are colour-coded by kind (conditional/default/linear) so the branching
// reads at a glance; nodes are badged by role (entry, gate, engine-resolved,
// terminal). Pure presentation — all data comes from layoutFlowGraph().

import { type CSSProperties } from "react";
import type { GraphEdge } from "./model.ts";
import { layoutFlowGraph, NODE_W, NODE_H, type LaidOutGraph, type PositionedNode } from "./layout.ts";
import type { FlowGraph } from "./model.ts";
import { MONO, SANS } from "./tokens.ts";

const EDGE_COLOR: Record<GraphEdge["kind"], string> = {
  linear: "#4d5b7c",
  conditional: "#d29922",
  default: "#6e7681",
};

interface Pt {
  x: number;
  y: number;
}

/** Cubic bezier path from the bottom-centre of `from` to the top-centre of `to`. */
function edgePath(from: Pt, to: Pt): string {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
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
    return { border: "#6e40c9", bg: "#1a1030", badge: "reserve", badgeBg: "#4a2a8a" };
  }
  // Stub nodes (galleries / wizard steps not yet in the question registry).
  if (n.kind === "stub") {
    return { border: "#58a6ff", bg: "#0d2035", badge: "stub", badgeBg: "#1c4a7a" };
  }
  // Live nodes — standard role-based styling.
  if (n.isEntry) return { border: "#6ea8fe", bg: "#11203a", badge: "entry", badgeBg: "#1f6feb" };
  if (n.isGate) return { border: "#d29922", bg: "#241c10", badge: "gate", badgeBg: "#9e6a03" };
  if (n.engineResolved)
    return { border: "#6e7681", bg: "#14181f", badge: "engine", badgeBg: "#373e47" };
  if (n.isTerminal) return { border: "#3fb950", bg: "#0f2417", badge: "terminal", badgeBg: "#238636" };
  return { border: "#30363d", bg: "#161b22", badge: null, badgeBg: "#30363d" };
}

interface FlowGraphViewProps {
  graph: FlowGraph;
}

export function FlowGraphView({ graph }: FlowGraphViewProps) {
  const laid: LaidOutGraph = layoutFlowGraph(graph);
  const pos = new Map<string, PositionedNode>(laid.nodes.map((n) => [n.id, n]));

  return (
    <div style={{ overflow: "auto", border: "1px solid #21262d", borderRadius: 8, background: "#0b0f14" }}>
      <div style={{ position: "relative", width: laid.width, height: laid.height }}>
        {/* Edge canvas */}
        <svg
          width={laid.width}
          height={laid.height}
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
          return (
            <div key={n.id} style={cardStyle} title={`${n.id}\n${n.label}`}>
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
                <span style={{ color: "#586069" }}>{n.type}</span>
                {n.label !== n.id ? ` · ${n.label}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
