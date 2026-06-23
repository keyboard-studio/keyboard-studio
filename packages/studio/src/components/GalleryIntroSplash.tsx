// GalleryIntroSplash — one-time orientation splash shown on first entry to a
// gallery (the desktop Mechanism Gallery and the Touch Gallery).
//
// The host gallery owns the "seen" state (the galleryIntrosSeen store flag) and
// renders this full-screen until the author clicks "Get started" (onStart). A
// Back affordance is shown when onBack is provided. Only the eyebrow / title /
// body / bullets / start aria-label vary between galleries; everything else
// (layout, card chrome, "Get started" button) is shared here so a third gallery
// can reuse it without copying the markup.

import type { CSSProperties, ReactNode } from "react";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT, BLUE_ACTION,
} from "../lib/galleryTheme.ts";

export interface GalleryIntroSplashProps {
  /** Small uppercase label above the title, e.g. "Getting started · Desktop". */
  eyebrow: string;
  /** Heading, e.g. "Welcome to the Mechanism Gallery". */
  title: string;
  /** Intro paragraph. */
  body: ReactNode;
  /** Bullet points, rendered as <li> items. */
  bullets: ReactNode[];
  /** aria-label for the "Get started" button, e.g. "Start the touch gallery". */
  startAriaLabel: string;
  /** Called when the author clicks "Get started". */
  onStart: () => void;
  /** When provided, a Back button is shown above the card. */
  onBack?: () => void;
  /** aria-label for the Back button (falls back to its visible "Back" text). */
  backAriaLabel?: string;
}

const pageStyle: CSSProperties = {
  background: BG_PAGE,
  height: "100%",
  boxSizing: "border-box",
  fontFamily: FONT,
  color: TEXT_MAIN,
  padding: "24px 32px",
  overflowY: "auto",
};

const ghostBtn: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

export function GalleryIntroSplash({
  eyebrow,
  title,
  body,
  bullets,
  startAriaLabel,
  onStart,
  onBack,
  backAriaLabel,
}: GalleryIntroSplashProps) {
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            {...(backAriaLabel !== undefined ? { "aria-label": backAriaLabel } : {})}
            style={ghostBtn}
          >
            &larr; Back
          </button>
        )}

        <div
          style={{
            marginTop: 40,
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: TEXT_DIM,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: FONT,
            }}
          >
            {eyebrow}
          </p>
          <h1
            style={{
              margin: 0,
              fontSize: "1.4rem",
              fontWeight: 600,
              color: ACCENT,
              fontFamily: FONT,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: TEXT_MAIN,
              fontFamily: FONT,
            }}
          >
            {body}
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: 13,
              lineHeight: 1.5,
              color: TEXT_DIM,
              fontFamily: FONT,
            }}
          >
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onStart}
            aria-label={startAriaLabel}
            style={{
              alignSelf: "flex-start",
              marginTop: 4,
              padding: "10px 24px",
              background: BLUE_ACTION,
              border: "none",
              borderRadius: 6,
              color: "#e6edf3",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Get started &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
