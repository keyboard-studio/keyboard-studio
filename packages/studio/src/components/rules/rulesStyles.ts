// Shared style shapes for the Rules step (spec 082) — the demo pane, rule
// list, guard suggestions and rule-builder regions. Every colour is a theme
// token from ../../ui/theme.ts (var(--app-*)), so the step follows light and
// dark themes like the other survey steps; no hex literals here.

import type { CSSProperties } from "react";
import {
  BG_CARD,
  BG_INSET,
  BORDER,
  TEXT_DIM,
  TEXT_MAIN,
  FONT,
  FONT_MONO,
} from "../../ui/theme.ts";

/** A region card on the Rules page (demo, rule list, builder). */
export const rulesSection: CSSProperties = {
  background: BG_CARD,
  color: TEXT_MAIN,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-lg)",
  padding: 20,
  marginBottom: 20,
  boxSizing: "border-box",
};

/** A region heading (`<h3>`) inside a section card. */
export const rulesSectionHeading: CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: 18,
  fontWeight: 600,
  lineHeight: 1.3,
  color: TEXT_MAIN,
};

/** A sub-heading (`<h4>`) — e.g. the guard-suggestions group. */
export const rulesSubHeading: CSSProperties = {
  margin: "0 0 10px 0",
  fontSize: 15,
  fontWeight: 600,
  color: TEXT_MAIN,
};

/** Muted explanatory paragraph under a heading. */
export const rulesNote: CSSProperties = {
  margin: "0 0 12px 0",
  fontSize: 13.5,
  lineHeight: 1.55,
  color: TEXT_DIM,
};

/** Body paragraph in the primary text colour. */
export const rulesBody: CSSProperties = {
  margin: "0 0 10px 0",
  fontSize: 14,
  lineHeight: 1.55,
  color: TEXT_MAIN,
};

/** Field label stacked above its control. */
export const rulesLabel: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: TEXT_MAIN,
};

/** Text input / select. */
export const rulesInput: CSSProperties = {
  padding: "8px 10px",
  background: BG_INSET,
  color: TEXT_MAIN,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius-sm)",
  fontSize: 16,
  fontFamily: FONT,
  fontWeight: 400,
  boxSizing: "border-box",
  maxWidth: "100%",
};

/** Horizontal-scroll wrapper so a wide table never widens the page. */
export const rulesTableWrap: CSSProperties = {
  overflowX: "auto",
  margin: "12px 0",
};

export const rulesTable: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

export const rulesTh: CSSProperties = {
  textAlign: "left",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: TEXT_DIM,
  borderBottom: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};

export const rulesTd: CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
  color: TEXT_MAIN,
  borderBottom: `1px solid ${BORDER}`,
};

/** Inline code / code points. */
export const rulesCode: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 13,
};

/** Grouped controls (the host-layout fieldset). */
export const rulesFieldset: CSSProperties = {
  margin: "16px 0 0 0",
  padding: "12px 16px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius)",
  minWidth: 0,
};

export const rulesLegend: CSSProperties = {
  padding: "0 6px",
  fontSize: 14,
  fontWeight: 600,
  color: TEXT_MAIN,
};

/** A nested suggestion card (guard suggestions). */
export const rulesInsetCard: CSSProperties = {
  background: BG_INSET,
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: BORDER,
  borderRadius: "var(--app-radius)",
  padding: "12px 14px",
  marginBottom: 12,
};

/** A row of action buttons. */
export const rulesActions: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};
