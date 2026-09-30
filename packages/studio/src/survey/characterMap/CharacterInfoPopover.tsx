// CharacterInfoPopover — the character map's hover/focus info popover
// (keyboard-studio#1783).
//
// ONE instance per CharacterMapPane, always rendered (hidden when no cell is
// active) and positioned at the hovered/focused cell. There is deliberately
// no tooltip element per cell: with up to 3000 cells per group, per-cell DOM
// would be the performance problem this issue forbids. Activation is handled
// by the delegated listeners in useCharacterInfoPopover.ts, which read the
// cell's character from its `data-char` / `data-block` attributes.
//
// This component is pure/controlled: it renders whatever `details` it is
// given (or a loading line while the lazy Unicode table resolves) and owns
// only its own positioning math. All open/close/a11y state lives in the
// hook.

import { useLayoutEffect, useState, type PointerEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import type { CharacterDescription } from "@keyboard-studio/engine";
import { BG_PAGE, BORDER, TEXT_DIM, TEXT_MAIN } from "../surveyStyles.ts";
import { prefixCombiningMark } from "../../lib/irToCarveNodes.ts";

export const CHARACTER_INFO_POPOVER_ID = "char-info-popover";

export interface CharacterInfoTarget {
  /** The cell's character (from `data-char`). */
  char: string;
  /** The group's Unicode block name (from `data-block`). */
  block: string;
  /** Viewport rect of the cell, for positioning. */
  rect: DOMRect;
}

interface CharacterInfoPopoverProps {
  target: CharacterInfoTarget | null;
  /** describeCharacter() output for the target, or null while loading. */
  details: CharacterDescription | null;
  onPointerOut: (e: PointerEvent<HTMLDivElement>) => void;
  // MutableRefObject: the callback ref below assigns .current on mount.
  popoverRef: React.MutableRefObject<HTMLDivElement | null>;
}

function uPlus(cp: number): string {
  // U+XXXX is Unicode notation (data), not UI copy.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

const rowLabel: React.CSSProperties = {
  fontWeight: 600,
  color: TEXT_DIM,
  flexShrink: 0,
  minWidth: 92,
};

const rowValue: React.CSSProperties = { color: TEXT_MAIN };

export function CharacterInfoPopover({
  target,
  details,
  onPointerOut,
  popoverRef,
}: CharacterInfoPopoverProps) {
  const { t } = useLingui();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Positioning reads the popover's own box through the hook's ref (the
  // callback ref below keeps it pointed at this element).

  // Readable General_Category labels through the catalog (spec 046 id
  // rules). The Unicode name/script values are DATA and stay untranslated;
  // these labels are UI copy. Defined here (not at module scope) so the
  // calls close over this component's own `t` binding — the lingui macro
  // tracks a specific variable binding (see tierLabel in
  // CharacterMapGroupSection.tsx).
  function categoryLabel(code: string): string {
    switch (code) {
      case "Lu": return t({ id: "survey.characterMapPane.info.category.lu", message: "Uppercase letter" });
      case "Ll": return t({ id: "survey.characterMapPane.info.category.ll", message: "Lowercase letter" });
      case "Lt": return t({ id: "survey.characterMapPane.info.category.lt", message: "Titlecase letter" });
      case "Lm": return t({ id: "survey.characterMapPane.info.category.lm", message: "Modifier letter" });
      case "Lo": return t({ id: "survey.characterMapPane.info.category.lo", message: "Other letter" });
      case "Mn": return t({ id: "survey.characterMapPane.info.category.mn", message: "Nonspacing mark" });
      case "Mc": return t({ id: "survey.characterMapPane.info.category.mc", message: "Spacing mark" });
      case "Me": return t({ id: "survey.characterMapPane.info.category.me", message: "Enclosing mark" });
      case "Nd": return t({ id: "survey.characterMapPane.info.category.nd", message: "Decimal number" });
      case "Nl": return t({ id: "survey.characterMapPane.info.category.nl", message: "Letter number" });
      case "No": return t({ id: "survey.characterMapPane.info.category.no", message: "Other number" });
      case "Pc": return t({ id: "survey.characterMapPane.info.category.pc", message: "Connector punctuation" });
      case "Pd": return t({ id: "survey.characterMapPane.info.category.pd", message: "Dash punctuation" });
      case "Ps": return t({ id: "survey.characterMapPane.info.category.ps", message: "Open punctuation" });
      case "Pe": return t({ id: "survey.characterMapPane.info.category.pe", message: "Close punctuation" });
      case "Pi": return t({ id: "survey.characterMapPane.info.category.pi", message: "Initial punctuation" });
      case "Pf": return t({ id: "survey.characterMapPane.info.category.pf", message: "Final punctuation" });
      case "Po": return t({ id: "survey.characterMapPane.info.category.po", message: "Other punctuation" });
      case "Sm": return t({ id: "survey.characterMapPane.info.category.sm", message: "Math symbol" });
      case "Sc": return t({ id: "survey.characterMapPane.info.category.sc", message: "Currency symbol" });
      case "Sk": return t({ id: "survey.characterMapPane.info.category.sk", message: "Modifier symbol" });
      case "So": return t({ id: "survey.characterMapPane.info.category.so", message: "Other symbol" });
      case "Zs": return t({ id: "survey.characterMapPane.info.category.zs", message: "Space separator" });
      case "Zl": return t({ id: "survey.characterMapPane.info.category.zl", message: "Line separator" });
      case "Zp": return t({ id: "survey.characterMapPane.info.category.zp", message: "Paragraph separator" });
      case "Cc": return t({ id: "survey.characterMapPane.info.category.cc", message: "Control" });
      case "Cf": return t({ id: "survey.characterMapPane.info.category.cf", message: "Format" });
      case "Cs": return t({ id: "survey.characterMapPane.info.category.cs", message: "Surrogate" });
      case "Co": return t({ id: "survey.characterMapPane.info.category.co", message: "Private use" });
      default: return code;
    }
  }

  // Position at the target cell: below it when there is room, otherwise
  // above; clamped into the viewport horizontally. Re-measured when the
  // target or the (async) details change, since the content height grows
  // once the table resolves.
  useLayoutEffect(() => {
    if (target === null) {
      setPos(null);
      return;
    }
    const el = popoverRef.current;
    if (el === null) return;
    const MARGIN = 8;
    const GAP = 6;
    const popH = el.offsetHeight;
    const popW = el.offsetWidth;
    const below = target.rect.bottom + GAP + popH <= window.innerHeight - MARGIN;
    const top = below
      ? target.rect.bottom + GAP
      : Math.max(MARGIN, target.rect.top - GAP - popH);
    const left = Math.min(
      Math.max(MARGIN, target.rect.left),
      Math.max(MARGIN, window.innerWidth - MARGIN - popW),
    );
    setPos({ top, left });
  }, [target, details, popoverRef]);

  const first = details?.codePoints[0];
  // Script_Extensions beyond the primary Script — the "where it adds
  // something" set for the optional row. Computed once; undefined/empty
  // means the row stays hidden.
  const scriptExtras =
    first === undefined
      ? []
      : first.scriptExtensions.filter((s) => s !== first.script);
  const hidden = target === null;

  return (
    <div
      ref={(node) => {
        // Keep the hook's ref pointed at this element (it drives the
        // hoverable/relatedTarget checks and the positioning above).
        popoverRef.current = node;
      }}
      id={CHARACTER_INFO_POPOVER_ID}
      role="tooltip"
      data-testid="char-info-popover"
      hidden={hidden}
      onPointerOut={onPointerOut}
      style={{
        position: "fixed",
        top: pos?.top ?? -10000,
        left: pos?.left ?? -10000,
        zIndex: 60,
        maxWidth: 320,
        padding: "10px 12px",
        display: hidden ? "none" : "flex",
        flexDirection: "column",
        gap: 6,
        background: BG_PAGE,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        boxShadow: "var(--app-shadow-pop)",
        fontSize: 12,
        lineHeight: 1.5,
        // The popover is descriptive, never interactive: it must not steal
        // focus (no tabbable descendants) and must not block clicks on
        // nearby cells any longer than it is actually hovered — closing is
        // handled by the hook's pointerout logic, not by pointer-events.
      }}
    >
      {target !== null && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 28, lineHeight: 1.2 }} aria-hidden="true">
              {prefixCombiningMark(target.char, details?.isCombining ?? false)}
            </span>
            <span style={{ ...rowValue, fontWeight: 600 }}>
              {details !== null && details.codePoints.length > 1
                ? t({
                    id: "survey.characterMapPane.info.codepoints",
                    message: "Code points",
                  })
                : t({
                    id: "survey.characterMapPane.info.codepoint",
                    message: "Code point",
                  })}
            </span>
          </div>
          {details === null ? (
            <div style={{ color: TEXT_DIM }}>
              {t({
                id: "survey.characterMapPane.info.loading",
                message: "Loading character details…",
              })}
            </div>
          ) : (
            <>
              {details.codePoints.map((cp) => (
                <div key={cp.codePoint} style={{ display: "flex", gap: 8 }}>
                  <span style={rowLabel}>{uPlus(cp.codePoint)}</span>
                  <span style={rowValue}>
                    {cp.name ??
                      t({
                        id: "survey.characterMapPane.info.noName",
                        message: "No Unicode name recorded",
                      })}
                  </span>
                </div>
              ))}
              {first?.category !== undefined && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={rowLabel}>
                    {t({ id: "survey.characterMapPane.info.category", message: "Category" })}
                  </span>
                  <span style={rowValue}>
                    {categoryLabel(first.category)} ({first.category})
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={rowLabel}>
                  {t({ id: "survey.characterMapPane.info.spacing", message: "Spacing" })}
                </span>
                <span style={rowValue}>
                  {details.isCombining
                    ? t({
                        id: "survey.characterMapPane.info.combining",
                        message: "Combines with the preceding character",
                      })
                    : t({
                        id: "survey.characterMapPane.info.standalone",
                        message: "Stands alone",
                      })}
                </span>
              </div>
              {first?.script !== undefined && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={rowLabel}>
                    {t({ id: "survey.characterMapPane.info.script", message: "Script" })}
                  </span>
                  <span style={rowValue}>{first.script}</span>
                </div>
              )}
              {scriptExtras.length > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={rowLabel}>
                    {t({
                      id: "survey.characterMapPane.info.scriptExtensions",
                      message: "Also used in",
                    })}
                  </span>
                  <span style={rowValue}>{scriptExtras.join(", ")}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <span style={rowLabel}>
                  {t({ id: "survey.characterMapPane.info.block", message: "Block" })}
                </span>
                <span style={rowValue}>{target.block}</span>
              </div>
              {first?.ccc !== undefined && first.ccc !== 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={rowLabel}>
                    {t({ id: "survey.characterMapPane.info.ccc", message: "Combining class" })}
                  </span>
                  <span style={rowValue}>{first.ccc}</span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
