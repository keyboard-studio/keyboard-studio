// GalleryIntroSplash — one-time orientation splash shown on first entry to a
// gallery (the desktop Mechanism Gallery and the Touch Gallery).
//
// The host gallery owns the "seen" state (the galleryIntrosSeen store flag) and
// renders this full-screen until the author clicks "Get started" (onStart). A
// Back affordance is shown when onBack is provided. Only the eyebrow / title /
// body / bullets / start aria-label vary between galleries; everything else
// (layout, card chrome, "Get started" button) is shared here so a third gallery
// can reuse it without copying the markup.
//
// Its Back and "Get started" buttons live in the footer (spec 081). The splash
// publishes them itself and is the step's only publisher while it is shown —
// the host gallery publishes only from its own main render.

import type { CSSProperties, ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  BG_PAGE, BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT,
} from "../../lib/galleryTheme.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

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
  const { t } = useLingui();
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.assignLoop.backButton", message: "← Back" }),
            onClick: onBack,
            testId: "gallery-intro-back",
            ...(backAriaLabel !== undefined ? { ariaLabel: backAriaLabel } : {}),
          },
        }
      : {}),
    // FR-006: "Get started" is this screen's primary forward action.
    forward: {
      label: t({ id: "editor.assignLoop.getStartedButton", message: "Get started →" }),
      onClick: onStart,
      testId: "gallery-intro-start",
      ariaLabel: startAriaLabel,
    },
  });
  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div
          style={{
            marginTop: 16,
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
        </div>
      </div>
    </div>
  );
}
