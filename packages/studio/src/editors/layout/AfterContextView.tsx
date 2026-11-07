// AfterContextView -- the "after this deadkey" view of the Layout tab (spec 113 US3, FR-029).
//
// Every key is shown with what typing it after the chosen deadkey produces, from the compiled
// keyboard: `useLayoutAttribution(layer, context)` simulates each key with that deadkey pending
// (a `pendingDeadkeys` seed). A key with a row shows the row's result; a key without one shows what
// actually happens instead. A key that starts another deadkey (a chain) links to "after" that one.
// A named deadkey cannot be seeded (the compiler numbers it), so nothing is guessed for it. The
// view reads the shared compile artifact and starts no timer (decision D3).

import { useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LayerCombo, LayoutContext } from "@keyboard-studio/contracts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import { hexId } from "./deadkeyTable.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { contextToSeed, deadkeyOrdinals, useLayoutAttribution } from "./useLayoutAttribution.ts";
import type { UseLayoutAttributionOptions } from "./useLayoutAttribution.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface AfterContextViewProps {
  /** The deadkey, by its id as the keyboard names it in contexts (`0001`, or a name). */
  deadkeyId: string;
  layer: LayerCombo;
  /** What the deadkey looks like to the author (its display character), when it has one. */
  displayChar?: string;
  /** Follow a chain: show the keys after the deadkey this key starts. */
  onFollow: (deadkeyId: string) => void;
  onViewInCode: (nodeId: string) => void;
  /** Back to the grid. */
  onClose: () => void;
  /** Test injections for the attribution hook; production reads the working copy and the D3 artifact. */
  options?: UseLayoutAttributionOptions;
}

type KeyResult =
  | { kind: "row"; text: string }
  | { kind: "chain"; deadkeyId: string }
  | { kind: "none"; text: string }
  | { kind: "nothing" };

export function AfterContextView({ deadkeyId, layer, displayChar, onFollow, onViewInCode, onClose, options }: AfterContextViewProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();
  const context = useMemo((): LayoutContext => [{ kind: "deadkey", deadkeyId }], [deadkeyId]);
  const storeIr = useWorkingCopyStore((st) => st.ir);
  const ir = options?.ir !== undefined ? options.ir : storeIr;
  const ordinals = useMemo(() => (ir === null ? new Map<number, number>() : deadkeyOrdinals(ir)), [ir]);
  const seedable = contextToSeed(context, ordinals) !== null;
  const attribution = useLayoutAttribution(layer, context, options);

  const heading = t({
    id: "editor.layout.after.heading",
    message: `Keys after deadkey ${{ name: displayChar ?? deadkeyId }} (${{ layer: copy.layerName(layer) }} layer)`,
  });

  const results = useMemo(() => {
    const out: Array<{ vkey: string; label: string; result: KeyResult; ruleNodeId: string | null; editable: boolean }> = [];
    const want = deadkeyId.toLowerCase();
    for (const cell of attribution.cells) {
      if (cell.frame) continue;
      const step = attribution.steps.find(
        (s) =>
          s.vkey === cell.vkey &&
          s.context !== undefined &&
          s.context.length === 1 &&
          s.context[0]?.kind === "deadkey" &&
          s.context[0].deadkeyId.toLowerCase() === want,
      );
      if (step === undefined) continue;
      const row = cell.rows.find(
        (r) => r.context.length === 1 && r.context[0]?.kind === "deadkey" && r.context[0].deadkeyId.toLowerCase() === want,
      );
      // The simulator reports the compiler's numbers; name them by the working copy's ids.
      const idOf = (n: number): string => {
        for (const [id, ordinal] of ordinals) if (ordinal === n) return hexId(id);
        return hexId(n);
      };
      const started = step.step.pendingDeadkeys.find((p) => idOf(p.id) !== want);
      let result: KeyResult;
      if (started !== undefined) result = { kind: "chain", deadkeyId: idOf(started.id) };
      else if (step.step.outputAfter === "") result = row !== undefined ? { kind: "nothing" } : { kind: "none", text: "" };
      else result = row !== undefined ? { kind: "row", text: step.step.outputAfter } : { kind: "none", text: step.step.outputAfter };
      out.push({
        vkey: cell.vkey,
        label: cell.vkey.replace(/^K_/, ""),
        result,
        ruleNodeId: row?.ruleNodeId ?? null,
        editable: row?.editable ?? false,
      });
    }
    return out;
  }, [attribution, deadkeyId, ordinals]);

  let status: string | null = null;
  if (!seedable) {
    status = t({
      id: "editor.layout.after.namedDeadkey",
      message: "This deadkey has a name rather than a number, so the studio cannot try it out here. Nothing is shown rather than a guess. You can change it in the Code tab.",
    });
  } else if (attribution.state === "not-compiled") {
    status = t({
      id: "editor.layout.after.notCompiled",
      message: "The keyboard has not compiled yet, so there is no result to show. Nothing here is a guess.",
    });
  } else if (attribution.state === "stale") {
    status = t({
      id: "editor.layout.after.stale",
      message: "The keyboard is compiling again or does not compile right now. You are seeing the last result that did.",
    });
  }

  return (
    <section aria-label={heading} data-testid="after-context-view" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}>{heading}</h4>
        <button type="button" onClick={onClose} data-testid="after-context-close" className="ks-focus-ring ks-hit-target ks-press" style={buttonStyle}>
          {t({ id: "editor.layout.after.close", message: "Back to the grid" })}
        </button>
      </div>

      {status !== null && (
        <p role="status" style={noteStyle} data-testid="after-context-status">
          {status}
        </p>
      )}

      {seedable && results.length > 0 && (
        <ul style={listStyle} data-testid="after-context-keys">
          {results.map((r) => (
            <li key={r.vkey} style={rowStyle} data-testid="after-context-key" data-vkey={r.vkey}>
              <span style={{ minWidth: 56, fontWeight: 600 }}>{r.label}</span>
              {r.result.kind === "row" && (
                <span data-testid="after-context-result">
                  {t({
                    id: "editor.layout.after.types",
                    message: `types ${{ text: r.result.text }} (${{ name: codepointLabel(r.result.text).title }})`,
                  })}
                </span>
              )}
              {r.result.kind === "nothing" && (
                <span data-testid="after-context-result">{t({ id: "editor.layout.after.nothing", message: "types nothing" })}</span>
              )}
              {r.result.kind === "none" && (
                <span data-testid="after-context-result" style={{ color: TEXT_DIM }}>
                  {r.result.text === ""
                    ? t({ id: "editor.layout.after.noRowNothing", message: "no combination; nothing happens" })
                    : t({
                        id: "editor.layout.after.noRow",
                        message: `no combination; types ${{ text: r.result.text }} instead`,
                      })}
                </span>
              )}
              {r.result.kind === "chain" && (
                <>
                  <span data-testid="after-context-result">
                    {t({ id: "editor.layout.after.chain", message: `starts deadkey ${{ id: r.result.deadkeyId }}` })}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFollow((r.result as { deadkeyId: string }).deadkeyId)}
                    data-testid="after-context-follow"
                    className="ks-focus-ring ks-hit-target ks-press"
                    style={buttonStyle}
                  >
                    {t({ id: "editor.layout.after.follow", message: "Show keys after it" })}
                  </button>
                </>
              )}
              {r.ruleNodeId !== null && !r.editable && (
                <button
                  type="button"
                  onClick={() => onViewInCode(r.ruleNodeId!)}
                  data-testid="after-context-view-in-code"
                  className="ks-focus-ring ks-hit-target ks-press"
                  style={linkButtonStyle}
                >
                  {t({ id: "editor.layout.after.viewInCode", message: "View in code" })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: BG_CARD,
  fontFamily: FONT,
} as const;
const noteStyle = { margin: 0, fontSize: 13, color: TEXT_MAIN, lineHeight: 1.5 } as const;
const listStyle = { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } as const;
const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13, color: TEXT_MAIN } as const;
const buttonStyle = {
  padding: "4px 10px",
  fontSize: 12,
  fontFamily: FONT,
  cursor: "pointer",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  background: "transparent",
  color: TEXT_MAIN,
} as const;
const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--app-accent-text)",
  textDecoration: "underline",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
} as const;
