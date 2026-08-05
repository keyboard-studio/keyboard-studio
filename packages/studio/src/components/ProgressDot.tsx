// ProgressDot — one mark in the footer's journey row (spec 057 T050/T064).
//
// A REAL `<button type="button">`, never a styled `<div>` (house rule 2, "no
// div-buttons" — docs/accessibility.md). This is not a stylistic preference:
// a native button gets Enter- and Space-activation, focus, and the default
// role/name/value semantics for free, which is exactly what T054/T055 test
// ("Tab to a dot, assert its accessible name, activate with Enter" / "Enter
// AND Space") without this component writing a single keydown handler.
//
// Three classes, three shapes (FR-046 — never colour alone):
//   completed — a filled CIRCLE. The author answered this question.
//   upcoming  — a hollow SQUARE. A stage still ahead; its accessible name
//               says so explicitly (FR-043), so it cannot be mistaken for
//               progress even by a sighted user who does not notice the shape.
//   current   — a LARGER circle with a visible ring border AND
//               `aria-current="step"` — a semantic non-colour cue on top of
//               the visual one, exactly what FR-060 asks for. It is not a
//               jump target to itself (FR-061): clicking/activating it is a
//               deliberate no-op, enforced HERE so every caller gets it for
//               free rather than having to remember not to wire one up.
//
// Hover is the shortcut, not the mechanism (Q8 resolved): the native `title`
// attribute gives every dot a hover tooltip, but the SAME label is already
// the button's accessible name — a screen-reader or keyboard-only user never
// needs the hover at all (FR-044).

import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { CSS_ACCENT, CSS_BORDER, CSS_TEXT } from "../ui/theme.ts";
import type { ProgressDot as ProgressDotData } from "../decisions/progressDots.ts";

export interface ProgressDotProps {
  readonly dot: ProgressDotData;
  /**
   * Called on activation for a `completed` or `upcoming` dot. NEVER called
   * for a `current` dot (FR-061) — that branch is short-circuited inside this
   * component, not left to the caller to remember.
   */
  readonly onActivate: (dot: ProgressDotData) => void;
}

/** Diameter in px. `current` is deliberately larger — a SIZE difference on
 * top of the shape difference, since FR-046 asks for "size OR shape" and a
 * current-position marker benefits from both (it is the single most
 * important mark in the row). */
const SIZE = { completed: 10, upcoming: 10, current: 15 } as const;

export function ProgressDot({ dot, onActivate }: ProgressDotProps) {
  const { t } = useLingui();
  const size = SIZE[dot.kind];

  const ariaLabel =
    dot.kind === "completed"
      ? t({
          id: "footer.dot.completed.ariaLabel",
          message: `${{ label: dot.label }} — completed`,
        })
      : dot.kind === "current"
        ? t({
            id: "footer.dot.current.ariaLabel",
            message: `${{ label: dot.label }} — you are here`,
          })
        : t({
            id: "footer.dot.upcoming.ariaLabel",
            message: `${{ label: dot.label }} — not yet reached`,
          });

  const shapeStyle: CSSProperties =
    dot.kind === "upcoming"
      ? {
          // Hollow square — "not yet reached" reads as an outline, never a
          // filled mark, independent of colour.
          borderRadius: 3,
          background: "transparent",
          border: `1px solid ${CSS_BORDER}`,
        }
      : dot.kind === "current"
        ? {
            // Larger filled circle with a visible ring — the non-colour cue
            // FR-060 requires on top of aria-current="step".
            borderRadius: "50%",
            background: CSS_ACCENT,
            border: `2px solid ${CSS_TEXT}`,
          }
        : {
            // completed — a plain filled circle.
            borderRadius: "50%",
            background: CSS_ACCENT,
            border: "none",
          };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={dot.label}
      {...(dot.kind === "current" ? { "aria-current": "step" as const } : {})}
      onClick={() => {
        // FR-061: the current marker is never a jump target to itself. Every
        // OTHER dot's activation is handed to the caller, which routes it
        // through jumpToLocation — the one jump implementation (FR-045).
        if (dot.kind === "current") return;
        onActivate(dot);
      }}
      style={{
        ...shapeStyle,
        width: size,
        height: size,
        minWidth: size,
        flexShrink: 0,
        padding: 0,
        cursor: dot.kind === "current" ? "default" : "pointer",
        // A generous hit target beyond the visual mark — WCAG 2.5.8 Target
        // Size (Minimum) is AA in 2.2; the visual dot stays small (FR-047's
        // narrow-row budget) while the clickable/tappable area does not.
        margin: "6px 3px",
        boxSizing: "content-box",
        outlineOffset: 2,
      }}
      // data-progress-dot-kind: a stable, non-accessible hook for the a11y
      // and e2e tests to distinguish shape classes without parsing inline
      // styles (FR-046's "size or shape" is a visual assertion; this is the
      // structural handle for it).
      data-progress-dot-kind={dot.kind}
    />
  );
}
