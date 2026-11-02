// FileTree — the /review folder-tree inventory.
//
// Rendered in the ReviewReport just above the criteria list: every required
// file green when properly placed, red when missing or misplaced (mouseover
// summarizes the issue), known-optional files (.kpj.user, build/) yellow,
// everything else neutral. Clicking a required file scrolls to its
// criterion row.

import type { CSSProperties } from "react";
import type { FileTreeNode, FileTreeStatus } from "./fileTree.ts";
import {
  BG_CARD,
  BORDER,
  CSS_FONT_MONO,
  ERROR_TEXT,
  FONT,
  SUCCESS_ACCENT,
  TEXT_DIM,
  WARNING,
} from "../ui/theme.ts";

const STATUS_COLOR: Record<FileTreeStatus, string> = {
  ok: SUCCESS_ACCENT,
  missing: ERROR_TEXT,
  misplaced: ERROR_TEXT,
  optional: WARNING,
  other: TEXT_DIM,
};

const STATUS_GLYPH: Record<FileTreeStatus, string> = {
  ok: "✓",
  missing: "✖",
  misplaced: "⚠",
  optional: "○",
  other: "·",
};

function scrollToCriterion(criterionId: string): void {
  const el = document.getElementById(`criterion-${criterionId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function TreeNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const isFolder = node.children !== undefined;
  const color = STATUS_COLOR[node.status];
  const clickable = node.criterionId !== undefined;

  const label = (
    <span
      title={node.detail || undefined}
      style={{
        color,
        fontFamily: CSS_FONT_MONO,
        fontSize: 12.5,
        cursor: clickable ? "pointer" : "default",
        textDecoration: clickable ? "underline" : "none",
        textUnderlineOffset: 2,
      }}
      onClick={
        clickable
          ? () => scrollToCriterion(node.criterionId!)
          : undefined
      }
      role={clickable ? "link" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scrollToCriterion(node.criterionId!);
              }
            }
          : undefined
      }
    >
      {isFolder ? "📁" : `${STATUS_GLYPH[node.status]} `}{node.name}
    </span>
  );

  return (
    <li style={{ margin: "2px 0" }}>
      {label}
      {isFolder && node.children!.length > 0 && (
        <ul style={{ listStyle: "none", margin: "2px 0 2px 18px", padding: 0 }}>
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

const cardStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  padding: "12px 16px",
  fontFamily: FONT,
};

export function FileTree({ tree }: { tree: FileTreeNode[] }) {
  if (tree.length === 0) return null;
  return (
    <section aria-label="File inventory" style={cardStyle} data-testid="file-tree">
      <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>File inventory</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: TEXT_DIM }}>
        Required files green when properly placed, red when missing or
        misplaced — hover for the issue, click to jump to the criterion.
        Optional files (.kpj.user, build/) are yellow.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tree.map((node) => (
          <TreeNode key={node.path || node.name} node={node} depth={0} />
        ))}
      </ul>
    </section>
  );
}
