// ProgressDot — one mark in the footer's journey row (spec 057 T050/T064;
// spec 079 journey-strip-contract.md §3, T063).
//
// A REAL `<button type="button">`, never a styled `<div>` (house rule 2, "no
// div-buttons" — docs/accessibility.md). A native button gets Enter- and
// Space-activation, focus, and the default role/name/value semantics for
// free.
//
// TWO TIERS, ONE SHAPE VOCABULARY (§2/§3):
//   section  — 14 px. One per manifest step, collapsed, except the section
//              the author is currently in (which expands into question marks
//              instead of rendering its own section mark at all).
//   question — 8 px. One per author-facing screen, shown only inside the
//              expanded (current) section.
//
// FOUR INDEPENDENT AXES (§3), never conflated:
//   fill  — full / partial / none ("has a response"), a shape fill, not a
//           colour. `partial` renders as a half-filled circle (left half
//           filled, right half hollow — the glyph journey-strip-contract.md
//           §11 leaves to planning; this is that choice).
//   shape — circle (reached) vs. hollow square (upcoming/unreached),
//           unchanged from spec 057.
//   ring  — a 2 px border, present ONLY on the current mark
//           (`aria-current="step"`), independent of size now that size is the
//           tier cue.
//   badge — a small filled triangular notch, top-right — "work waiting"
//           (FR-017), a shape cue never colour alone.
//
// Hover is the shortcut, not the mechanism (Q8 resolved): the native `title`
// attribute mirrors the accessible name (FR-044).

import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import { CSS_ACCENT, CSS_BORDER, CSS_TEXT } from "../ui/theme.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";
import type { ProgressDot as ProgressDotData, WorkKind } from "../decisions/progressDots.ts";

export interface ProgressDotProps {
  readonly dot: ProgressDotData;
  /**
   * Called on activation for a `completed` or `upcoming` dot. NEVER called
   * for a `current` dot (FR-061) — that branch is short-circuited inside this
   * component, not left to the caller to remember.
   */
  readonly onActivate: (dot: ProgressDotData) => void;
}

/** Diameter in px, by TIER (journey-strip-contract.md §2 table). `current`
 * keeps a size bump over its tier's base, same as spec 057's original
 * "size AND shape" choice for the single most important mark in the row. */
const TIER_SIZE: Record<ProgressDotData["tier"], number> = { section: 14, question: 8 };
const CURRENT_SIZE_BONUS = 5;

const BADGE_MESSAGE: Record<WorkKind, ReturnType<typeof msg>> = {
  reproposed: msg({
    id: "footer.dot.badge.reproposed.ariaLabel",
    message: "work waiting: reconfirm an earlier change",
  }),
  unassigned: msg({
    id: "footer.dot.badge.unassigned.ariaLabel",
    message: "work waiting: assign a key",
  }),
  "now-applicable": msg({
    id: "footer.dot.badge.nowApplicable.ariaLabel",
    message: "work waiting: newly applicable",
  }),
};

export function ProgressDot({ dot, onActivate }: ProgressDotProps) {
  const { t, i18n } = useLingui();
  const baseSize = TIER_SIZE[dot.tier];
  const size = dot.kind === "current" ? baseSize + CURRENT_SIZE_BONUS : baseSize;

  const baseAriaLabel =
    dot.passedReason !== undefined
      ? // FR-068: a `not-asked` step reads as PASSED, never as an answer.
        `${dot.label} — ${dot.passedReason}`
      : dot.kind === "current"
        ? // Ring wins the "current" name over fill state (§3a table note).
          t({
            id: "footer.dot.current.ariaLabel",
            message: `${{ label: dot.label }} — you are here`,
          })
        : dot.fill === "partial"
          ? t({
              id: "footer.dot.partial.ariaLabel",
              message: `${{ label: dot.label }} — partly answered`,
            })
          : dot.kind === "completed"
            ? t({
                id: "footer.dot.completed.ariaLabel",
                message: `${{ label: dot.label }} — completed`,
              })
            : // §3a/§3b naming note: "upcoming" (never reached) and "reached,
              // not yet started" share a hollow visual but MUST NOT share an
              // accessible name — keyed on the mark's own resolution, not its
              // tier: a REACHED mark (this author's own position, or a
              // section behind/at it) is `reachable`; a genuinely upcoming
              // one is `degraded`/`beyond-gate`.
              dot.resolution.kind === "reachable"
              ? t({
                  id: "footer.dot.question.unanswered.ariaLabel",
                  message: `${{ label: dot.label }} — no answer yet`,
                })
              : t({
                  id: "footer.dot.upcoming.ariaLabel",
                  message: `${{ label: dot.label }} — not yet reached`,
                });

  const badgeSuffix =
    dot.badge !== undefined && dot.badge.length > 0
      ? dot.badge.map((kind) => ` — ${resolveMessage(i18n, BADGE_MESSAGE[kind])}`).join("")
      : "";

  const ariaLabel = `${baseAriaLabel}${badgeSuffix}`;

  const isSquareShape =
    dot.kind === "upcoming" &&
    dot.fill === "none" &&
    dot.passedReason === undefined &&
    dot.resolution.kind !== "reachable";

  const shapeStyle: CSSProperties = isSquareShape
    ? {
        // Hollow square — "not yet reached" reads as an outline, never a
        // filled mark, independent of colour.
        borderRadius: 3,
        background: "transparent",
        border: `1px solid ${CSS_BORDER}`,
      }
    : dot.fill === "partial"
      ? {
          // Half-filled circle — left half filled, right half hollow. A
          // shape fill, not a colour cue (§3b).
          borderRadius: "50%",
          background: `linear-gradient(90deg, ${CSS_ACCENT} 50%, transparent 50%)`,
          border: `1px solid ${CSS_BORDER}`,
        }
      : dot.kind === "current"
        ? {
            // Ring — the non-colour "current" cue, independent of size now
            // that size is the tier cue.
            borderRadius: "50%",
            background: dot.fill === "full" ? CSS_ACCENT : "transparent",
            border: `2px solid ${CSS_TEXT}`,
          }
        : dot.fill === "full"
          ? {
              // completed — a plain filled circle.
              borderRadius: "50%",
              background: CSS_ACCENT,
              border: "none",
            }
          : {
              // Reached, not yet started (question-tier "no answer yet") —
              // hollow CIRCLE, distinct from the upcoming hollow SQUARE.
              borderRadius: "50%",
              background: "transparent",
              border: `1px solid ${CSS_BORDER}`,
            };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
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
        position: "relative",
        width: size,
        height: size,
        minWidth: size,
        flexShrink: 0,
        padding: 0,
        cursor: dot.kind === "current" ? "default" : "pointer",
        // A generous hit target beyond the visual mark — WCAG 2.5.8 Target
        // Size (Minimum) is AA in 2.2; the visual mark stays small (§6's
        // narrow-row budget) while the clickable/tappable area does not.
        margin: "6px 3px",
        boxSizing: "content-box",
        outlineOffset: 2,
      }}
      // data-progress-dot-kind: a stable, non-accessible hook for the a11y
      // and e2e tests to distinguish shape classes without parsing inline
      // styles. The current mark keeps `"current"` regardless of tier (§6:
      // StudioFooter's scroll-into-view selects on this exact value).
      data-progress-dot-kind={dot.kind}
      data-progress-dot-tier={dot.tier}
      data-progress-dot-fill={dot.fill}
    >
      {/* §3c: a small filled triangular notch, top-right — a SHAPE cue for
          "work waiting", never colour alone. Presentational only; the badge
          is already named in the button's own accessible name above. */}
      {dot.badge !== undefined && dot.badge.length > 0 && (
        <span
          aria-hidden="true"
          data-progress-dot-badge=""
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: "0 6px 6px 0",
            borderColor: `transparent ${CSS_TEXT} transparent transparent`,
          }}
        />
      )}
    </button>
  );
}
