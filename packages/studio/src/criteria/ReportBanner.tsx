// ReportBanner — the dark-blue report header card shared by the /review
// health report and the authored Criteria page.
//
// One card, two hosts: ReviewReport ("Health report: <id>", judged meta)
// and CriteriaPage's `banner` prop (authored: "Criteria", keyboard +
// judged meta, passed down by CriteriaScreen). The hosts own their copy;
// this component owns only the card — same eyebrow, title, and meta
// treatment on both surfaces, so the two pages read as the same report
// with content adapted to the keyboard under judgment.

import type { ReactNode } from "react";
import { CSS_FONT_MONO } from "../ui/theme.ts";

export function ReportBanner({
  eyebrow,
  title,
  meta,
}: {
  /** Small mono line above the title (a URL on /review, the product
   * name on the Criteria page). */
  eyebrow: ReactNode;
  /** The report title. */
  title: ReactNode;
  /** One meta line under the title, when the host has one to state. */
  meta?: string;
}) {
  return (
    <div
      style={{
        background: "var(--sil-blue-dark)",
        color: "var(--sil-white)",
        borderRadius: 12,
        padding: "14px 18px",
      }}
    >
      <div
        style={{
          fontFamily: CSS_FONT_MONO,
          fontSize: 12,
          opacity: 0.75,
        }}
      >
        {eyebrow}
      </div>
      <h1 style={{ margin: "6px 0 4px", fontSize: 20 }}>{title}</h1>
      {meta !== undefined && (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{meta}</p>
      )}
    </div>
  );
}
