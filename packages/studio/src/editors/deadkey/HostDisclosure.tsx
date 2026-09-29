// HostDisclosure — the "what this trigger key does on likely host layouts"
// disclosure (1802 A1–A3, spec 083).
//
// Accepts referenceHosts-shaped data via props (keyed by key+modifiers),
// so Phase 4 can swap the temporary stub for the real `likelyHostLayouts`
// module without touching this component. Renders the five reference hosts
// plus the blocked row, each stating its own tradeoff symmetrically (A2 —
// never a verdict), with the honesty caption "best guess, not sight."

import type { CSSProperties } from "react";
import type { ReferenceHostsResult } from "../../lib/referenceHosts/index.ts";
import {
  BG_CARD,
  BORDER,
  TEXT_MAIN,
  TEXT_DIM,
  FONT,
} from "../../lib/galleryTheme.ts";

const disclosureStyle: CSSProperties = {
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "12px 14px",
  margin: "12px 0",
  fontFamily: FONT,
};

const headingStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: TEXT_MAIN,
  margin: "0 0 8px",
};

const rowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "7px 0",
  borderTop: `1px solid ${BORDER}`,
  fontSize: 12.5,
  alignItems: "baseline",
};

const hostLabelStyle: CSSProperties = {
  minWidth: 86,
  fontWeight: 700,
  color: TEXT_MAIN,
  flexShrink: 0,
};

const consequenceStyle: CSSProperties = {
  color: TEXT_DIM,
};

const captionStyle: CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,
  marginTop: 8,
  fontStyle: "italic",
};

export interface HostDisclosureProps {
  /** Reference-host data for the trigger key (key+modifiers shaped). */
  hosts: ReferenceHostsResult;
}

export function HostDisclosure({ hosts }: HostDisclosureProps) {
  return (
    <section style={disclosureStyle} aria-label="What this trigger key does on likely host layouts">
      <h3 style={headingStyle}>What this trigger key does on likely host layouts</h3>
      <div>
        {hosts.hosts.map((entry) => (
          <div key={entry.host} style={rowStyle}>
            <b style={hostLabelStyle}>{entry.host}</b>
            <span style={consequenceStyle}>{entry.consequence}</span>
          </div>
        ))}
      </div>
      <div style={captionStyle}>Likely hosts for this keyboard — best guess, not sight.</div>
    </section>
  );
}
