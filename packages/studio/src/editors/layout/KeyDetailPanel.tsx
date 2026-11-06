// KeyDetailPanel — everything the Layout tab knows about the selected key (spec 113 FR-015,
// FR-016, FR-014). Read-only in this phase: the output with an empty context, the class and
// its provenance, how many rules match, why a read-only cell is read-only, the contextual rows
// the key takes part in (each marked editable or read-only), what every picked base keyboard
// types when the keyboard does not handle the key, and "view in code" for each rule.
//
// The edit controls of the next phase attach through `editSlot`, rendered under the plain
// output; this component does not decide how an edit starts.
//
// FR-016's "the value a hand-set key replaced" is not shown: attribution does not carry the
// replaced starting-point value yet.

import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { LayoutBecomes, LayoutContext, LayoutOutput } from "@keyboard-studio/contracts";
import type { RowAttribution } from "@keyboard-studio/engine";
import type { BaseFallbackResult } from "./baseFallbackCells.ts";
import type { DesktopCellViewModel } from "./desktopGridViewModel.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { FONT_MONO } from "../../ui/theme.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface KeyDetailPanelProps {
  /** The selected key's cell, or null when nothing is selected. */
  cell: DesktopCellViewModel | null;
  /** Switch to the Code tab with this rule's source line in view. */
  onViewInCode: (nodeId: string) => void;
  /** Where the next phase's edit controls go. */
  editSlot?: ReactNode;
}

export function KeyDetailPanel({ cell, onViewInCode, editSlot }: KeyDetailPanelProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();

  /** A literal piece of text, named by code point so a screen reader says what it is. */
  function quoted(text: string): string {
    return t({
      id: "editor.layout.detail.quotedText",
      message: `${{ text }} (${{ name: codepointLabel(text).title }})`,
    });
  }

  function contextWords(context: LayoutContext): string {
    return context
      .map((el) =>
        el.kind === "text"
          ? quoted(el.text)
          : t({ id: "editor.layout.detail.contextDeadkey", message: `deadkey ${{ id: el.deadkeyId }}` }),
      )
      .join(", ");
  }

  function becomesWords(out: LayoutOutput | LayoutBecomes | null): string {
    if (out === null) return t({ id: "editor.layout.detail.outputComplex", message: "complex output" });
    if (!("kind" in out)) {
      return out.length === 0
        ? t({ id: "editor.layout.detail.outputNothing", message: "types nothing" })
        : contextWords(out);
    }
    if (out.kind === "text") return quoted(out.text);
    if (out.kind === "deadkey") {
      return t({ id: "editor.layout.detail.outputDeadkey", message: `deadkey ${{ id: out.deadkeyId }}` });
    }
    return t({ id: "editor.layout.detail.outputNothing", message: "types nothing" });
  }

  function fallbackWords(result: BaseFallbackResult): string {
    switch (result.kind) {
      case "character":
        return quoted(result.text);
      case "deadkey":
        return t({ id: "editor.layout.detail.fallbackDeadkey", message: "a deadkey" });
      case "system-shortcut":
        return t({
          id: "editor.layout.detail.fallbackShortcut",
          message: "a system shortcut, not a typed character",
        });
      case "unknown":
        return t({ id: "editor.layout.detail.fallbackUnknown", message: "unknown (no data for this base keyboard)" });
      default: {
        const unreachable: never = result;
        return unreachable;
      }
    }
  }

  if (cell === null) {
    return (
      <section
        aria-label={t({ id: "editor.layout.detail.ariaLabel", message: "Key details" })}
        data-testid="key-detail-panel"
        style={panelStyle}
      >
        <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }} data-testid="key-detail-empty">
          {t({ id: "editor.layout.detail.noSelection", message: "Select a key to see what it types." })}
        </p>
      </section>
    );
  }

  const plain = cell.attribution.plain;
  const rows = cell.attribution.rows;
  const layer = copy.layerName(cell.layer);

  function viewInCodeButton(nodeId: string, what: string): ReactNode {
    return (
      <button
        type="button"
        onClick={() => onViewInCode(nodeId)}
        aria-label={t({ id: "editor.layout.detail.viewInCodeFor", message: `View in code: ${{ what }}` })}
        data-testid="key-detail-view-in-code"
        style={linkButtonStyle}
      >
        {t({ id: "editor.layout.detail.viewInCode", message: "View in code" })}
      </button>
    );
  }

  const plainNodeId = plain?.ruleNodeId;
  return (
    <section
      aria-label={t({ id: "editor.layout.detail.ariaLabel", message: "Key details" })}
      data-testid="key-detail-panel"
      style={panelStyle}
    >
      <h3 style={{ margin: 0, fontSize: 14, color: TEXT_MAIN }} data-testid="key-detail-heading">
        {t({
          id: "editor.layout.detail.heading",
          message: `Key ${{ key: cell.keyLabel }}, layer ${{ layer }}`,
        })}
      </h3>
      {cell.vkey === "K_oE2" && (
        <p style={noteStyle} data-testid="key-detail-iso-note">
          {copy.isoExtraKeyNote()}
        </p>
      )}

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", fontSize: 13 }}>
        <dt style={dtStyle}>{t({ id: "editor.layout.detail.outputLabel", message: "Types, with nothing before it" })}</dt>
        <dd style={ddStyle} data-testid="key-detail-output">
          {copy.outputPhrase(cell)}
        </dd>
        <dt style={dtStyle}>{t({ id: "editor.layout.detail.classLabel", message: "Class" })}</dt>
        <dd style={ddStyle} data-testid="key-detail-class">
          {copy.kindLabel(cell.kind)}
        </dd>
        {cell.provenance !== null && (
          <>
            <dt style={dtStyle}>{t({ id: "editor.layout.detail.provenanceLabel", message: "Where it comes from" })}</dt>
            <dd style={ddStyle} data-testid="key-detail-provenance">
              {copy.provenanceLabel(cell.provenance)}
            </dd>
          </>
        )}
        {!cell.frame && (
          <>
            <dt style={dtStyle}>{t({ id: "editor.layout.detail.ruleCountLabel", message: "Rules for this key" })}</dt>
            <dd style={ddStyle} data-testid="key-detail-rule-count">
              {t({
                id: "editor.layout.detail.ruleCount",
                message: plural(cell.ruleCount, { one: "# rule", other: "# rules" }),
              })}
            </dd>
          </>
        )}
        <dt style={dtStyle}>{t({ id: "editor.layout.detail.editableLabel", message: "Editable here" })}</dt>
        <dd style={ddStyle} data-testid="key-detail-editable">
          {cell.editable
            ? t({ id: "editor.layout.detail.editableYes", message: "Yes" })
            : t({ id: "editor.layout.detail.editableNo", message: "No, read-only" })}
        </dd>
      </dl>

      {!cell.editable && cell.readOnlyReason !== undefined && (
        <p style={noteStyle} data-testid="key-detail-reason">
          {copy.readOnlyReasonText(cell.readOnlyReason)}
        </p>
      )}

      {plainNodeId !== undefined && (
        <div>
          {viewInCodeButton(
            plainNodeId,
            t({
              id: "editor.layout.detail.plainRuleName",
              message: `the rule for key ${{ key: cell.keyLabel }} in layer ${{ layer }}`,
            }),
          )}
        </div>
      )}

      {editSlot}

      {cell.baseFallback !== undefined && (
        <div data-testid="key-detail-fallback">
          <h4 style={subheadingStyle}>
            {t({ id: "editor.layout.detail.fallbackHeading", message: "What the base keyboards type here" })}
          </h4>
          <p style={noteStyle}>
            {t({
              id: "editor.layout.detail.fallbackExplain",
              message:
                "The keyboard has no rule for this key, so each key press passes through to the base keyboard. The first one listed is the one this cell shows.",
            })}
          </p>
          {cell.baseFallback.entries.length === 0 ? (
            <p style={noteStyle} data-testid="key-detail-fallback-none">
              {t({ id: "editor.layout.detail.fallbackNoBases", message: "No base keyboard has been picked yet." })}
            </p>
          ) : (
            <ul style={listStyle}>
              {cell.baseFallback.entries.map((entry) => (
                <li key={entry.baseId} data-testid={`key-detail-fallback-${entry.baseId}`} style={{ fontSize: 13 }}>
                  {entry.primary
                    ? t({
                        id: "editor.layout.detail.fallbackEntryPrimary",
                        message: `${{ name: entry.baseName }} (primary): ${{ what: fallbackWords(entry.result) }}`,
                      })
                    : t({
                        id: "editor.layout.detail.fallbackEntry",
                        message: `${{ name: entry.baseName }}: ${{ what: fallbackWords(entry.result) }}`,
                      })}
                </li>
              ))}
            </ul>
          )}
          {cell.baseFallback.policyNotInEffect && (
            <p style={noteStyle} data-testid="key-detail-policy-note">
              {t({
                id: "editor.layout.detail.policyNotInEffect",
                message:
                  "Your fallback policy says to do nothing for this key, but the compiled keyboard does not enforce that for keys it never defined yet. The base keyboard's character still types.",
              })}
            </p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div data-testid="key-detail-rows">
          <h4 style={subheadingStyle}>
            {t({ id: "editor.layout.detail.rowsHeading", message: "Also used by these rules" })}
          </h4>
          <ul style={listStyle}>
            {rows.map((row) => (
              renderRow(row)
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  function renderRow(row: RowAttribution): ReactNode {
    const when =
      row.context.length > 0
        ? t({ id: "editor.layout.detail.rowAfter", message: `After ${{ context: contextWords(row.context) }}` })
        : t({ id: "editor.layout.detail.rowNoContext", message: "Another rule with nothing before it" });
    const what = t({
      id: "editor.layout.detail.rowOutcome",
      message: `${{ when }}: ${{ output: becomesWords(row.output) }}`,
    });
    return (
      <li key={row.ruleNodeId} data-testid={`key-detail-row-${row.ruleNodeId}`} style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
        <span>
          {what}
          {", "}
          <span data-testid={`key-detail-row-${row.ruleNodeId}-status`}>
            {row.editable
              ? t({ id: "editor.layout.detail.rowEditable", message: "editable" })
              : t({ id: "editor.layout.detail.rowReadOnly", message: "read-only" })}
          </span>
        </span>
        {!row.editable && row.readOnlyReason !== undefined && (
          <span style={noteStyle}>{copy.readOnlyReasonText(row.readOnlyReason)}</span>
        )}
        <span>{viewInCodeButton(row.ruleNodeId, what)}</span>
      </li>
    );
  }
}

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: BG_CARD,
  fontFamily: FONT,
  color: TEXT_MAIN,
} as const;

const dtStyle = { color: TEXT_DIM } as const;
const ddStyle = { margin: 0, fontFamily: FONT_MONO } as const;
const noteStyle = { margin: 0, fontSize: 12, color: TEXT_DIM, lineHeight: 1.5 } as const;
const subheadingStyle = { margin: "0 0 4px", fontSize: 12, color: TEXT_DIM, fontWeight: 600 } as const;
const listStyle = { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 } as const;
const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--app-accent-text)",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: FONT,
} as const;
