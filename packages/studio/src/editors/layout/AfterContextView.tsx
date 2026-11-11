// AfterContextView -- the "after this deadkey" view of the Layout tab (spec 117 US3, FR-029).
//
// Every key is shown with what typing it after the chosen deadkey produces, from the compiled
// keyboard: `useLayoutAttribution(layer, context)` simulates each key with that deadkey pending
// (a `pendingDeadkeys` seed). A key with a row shows the row's result; a key without one shows what
// actually happens instead. A key that starts another deadkey (a chain) links to "after" that one.
// A named deadkey cannot be seeded (the compiler numbers it), so nothing is guessed for it. The
// view reads the shared compile artifact and starts no timer (decision D3).
//
// Literal-context mode (spec 117 US4, FR-029, FR-029a): with no deadkey given, the view lists the
// contexts the keyboard uses (literal text and deadkeys, with how many keys each affects) and lets
// the author enter a new one, flagged before it is used when no listed layer can type it. Once a
// context is chosen each key is shown the same way, and its row can be set, changed, or removed
// with the "becomes" editor; a second rule for the same context and key that never fires is shown
// read-only with "view in code".

import { useId, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { listDeadkeys } from "@keyboard-studio/contracts";
import type { LayerCombo, LayoutBecomes, LayoutContext } from "@keyboard-studio/contracts";
import { isContextReachable, listContexts } from "@keyboard-studio/engine";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../lib/galleryTheme.ts";
import { codepointLabel } from "../../survey/codepointLabel.ts";
import { deadkeyRefOf, hexId } from "./deadkeyTable.ts";
import { BecomesEditor } from "./BecomesEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { contextToSeed, deadkeyOrdinals, useLayoutAttribution } from "./useLayoutAttribution.ts";
import type { UseLayoutAttributionOptions } from "./useLayoutAttribution.ts";
import { useLayoutCopy } from "./useLayoutCopy.ts";

export interface AfterContextViewProps {
  /** The deadkey, by its id as the keyboard names it in contexts (`0001`, or a name). Omit for literal-context mode. */
  deadkeyId?: string;
  layer: LayerCombo;
  /** The layers a new context may be typed on (literal-context mode); defaults to `layer`. */
  layers?: readonly LayerCombo[];
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

function contextKey(context: LayoutContext): string {
  return context.map((el) => (el.kind === "text" ? `t:${el.text}` : `d:${el.deadkeyId.toLowerCase()}`)).join("\u0001");
}

function contextLabel(context: LayoutContext, deadkeyText: (id: string) => string): string {
  return context.map((el) => (el.kind === "text" ? el.text : deadkeyText(el.deadkeyId))).join(" ");
}

type KeyResult =
  | { kind: "row"; text: string }
  | { kind: "chain"; deadkeyId: string }
  | { kind: "none"; text: string }
  | { kind: "nothing" };

export function AfterContextView({ deadkeyId, layer, layers, displayChar, onFollow, onViewInCode, onClose, options }: AfterContextViewProps) {
  const { t } = useLingui();
  const copy = useLayoutCopy();
  const ids = { newContext: useId() };
  const literal = deadkeyId === undefined;
  const [chosen, setChosen] = useState<LayoutContext | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const context = useMemo(
    (): LayoutContext | null => (deadkeyId !== undefined ? [{ kind: "deadkey", deadkeyId }] : chosen),
    [deadkeyId, chosen],
  );
  const storeIr = useWorkingCopyStore((st) => st.ir);
  const ir = options?.ir !== undefined ? options.ir : storeIr;
  const ordinals = useMemo(() => (ir === null ? new Map<number, number>() : deadkeyOrdinals(ir)), [ir]);
  const seedable = context !== null && contextToSeed(context, ordinals) !== null;
  const attribution = useLayoutAttribution(layer, context ?? undefined, options);
  const deadkeyText = (id: string): string => t({ id: "editor.layout.after.contextDeadkey", message: `Deadkey ${{ id }}` });
  const knownContexts = useMemo(() => (literal && ir !== null ? listContexts(ir) : []), [literal, ir]);
  const deadkeys = useMemo(
    () =>
      ir === null
        ? []
        : listDeadkeys(ir).flatMap((info) => {
            const ref = deadkeyRefOf(info);
            return ref === null ? [] : [{ ref, label: info.displayChar ?? ref }];
          }),
    [ir],
  );
  const draftContext = useMemo((): LayoutContext | null => (draft === "" ? null : [{ kind: "text", text: draft.normalize("NFC") }]), [draft]);
  const draftUnreachable = literal && ir !== null && draftContext !== null && !isContextReachable(ir, layers ?? [layer], draftContext);
  const contextText = context === null ? "" : contextLabel(context, (id) => id);
  const seedText = context === null ? "" : context.map((el) => (el.kind === "text" ? el.text : "")).join("");

  const heading =
    deadkeyId !== undefined
      ? t({
          id: "editor.layout.after.heading",
          message: `Keys after deadkey ${{ name: displayChar ?? deadkeyId }} (${{ layer: copy.layerName(layer) }} layer)`,
        })
      : context === null
        ? t({ id: "editor.layout.after.headingChoose", message: "Keys after typed text" })
        : t({
            id: "editor.layout.after.headingText",
            message: `Keys after ${{ name: contextText }} (${{ layer: copy.layerName(layer) }} layer)`,
          });

  const results = useMemo(() => {
    const out: Array<{
      vkey: string;
      label: string;
      result: KeyResult;
      ruleNodeId: string | null;
      editable: boolean;
      becomes: LayoutBecomes | null;
      neverFires: Array<{ ruleNodeId: string }>;
    }> = [];
    if (context === null) return out;
    const wanted = contextKey(context);
    const inContext = new Set(context.flatMap((el) => (el.kind === "deadkey" ? [el.deadkeyId.toLowerCase()] : [])));
    for (const cell of attribution.cells) {
      if (cell.frame) continue;
      const step = attribution.steps.find((s) => s.vkey === cell.vkey && s.context !== undefined && contextKey(s.context) === wanted);
      if (step === undefined) continue;
      const matching = cell.rows.filter((row) => contextKey(row.context) === wanted);
      const row = matching.find((r) => r.readOnlyReason !== "never-fires");
      const neverFires = matching.filter((r) => r.readOnlyReason === "never-fires").map((r) => ({ ruleNodeId: r.ruleNodeId }));
      // The simulator reports the compiler's numbers; name them by the working copy's ids.
      const idOf = (n: number): string => {
        for (const [id, ordinal] of ordinals) if (ordinal === n) return hexId(id);
        return hexId(n);
      };
      const started = step.step.pendingDeadkeys.find((p) => !inContext.has(idOf(p.id)));
      let result: KeyResult;
      if (started !== undefined) result = { kind: "chain", deadkeyId: idOf(started.id) };
      else if (step.step.outputAfter === "") result = row !== undefined ? { kind: "nothing" } : { kind: "none", text: "" };
      else if (row !== undefined) result = { kind: "row", text: step.step.outputAfter };
      else {
        // The simulator reports the whole text after the keystroke, the context text included.
        const after = step.step.outputAfter;
        result = { kind: "none", text: seedText !== "" && after.startsWith(seedText) ? after.slice(seedText.length) : after };
      }
      out.push({
        vkey: cell.vkey,
        label: cell.vkey.replace(/^K_/, ""),
        result,
        ruleNodeId: row?.ruleNodeId ?? null,
        editable: row?.editable ?? false,
        becomes: row !== undefined && row.editable && row.output !== null ? (row.output as LayoutBecomes) : null,
        neverFires,
      });
    }
    return out;
  }, [attribution, context, ordinals, seedText]);

  let status: string | null = null;
  if (context === null) {
    status = null;
  } else if (!seedable) {
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

      {literal && chosen === null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {knownContexts.length > 0 && (
            <ul style={listStyle} data-testid="after-context-list" aria-label={t({ id: "editor.layout.after.listAria", message: "Contexts the keyboard uses" })}>
              {knownContexts.map((c) => {
                const only = c.context.length === 1 ? c.context[0] : undefined;
                return (
                  <li key={contextKey(c.context)}>
                    <button
                      type="button"
                      onClick={() => (only?.kind === "deadkey" ? onFollow(only.deadkeyId) : setChosen(c.context))}
                      data-testid="after-context-choice"
                      className="ks-focus-ring ks-hit-target ks-press"
                      style={buttonStyle}
                    >
                      {contextLabel(c.context, deadkeyText)}{" "}
                      <span style={{ color: TEXT_DIM }}>
                        {t({ id: "editor.layout.after.keyCount", message: `(${plural(c.keyCount, { one: "# key", other: "# keys" })})` })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={rowStyle} role="group" aria-label={t({ id: "editor.layout.after.newAria", message: "Enter a new context" })}>
            <label htmlFor={ids.newContext} style={{ fontSize: 12, color: TEXT_DIM }}>
              {t({ id: "editor.layout.after.newLabel", message: "Text typed before the key (for example n)" })}
            </label>
            <input
              id={ids.newContext}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              data-testid="after-context-new-input"
              className="ks-focus-ring"
              style={inputStyle}
            />
            <button
              type="button"
              disabled={draftContext === null}
              onClick={() => {
                if (draftContext !== null) setChosen(draftContext);
              }}
              data-testid="after-context-new-use"
              className="ks-focus-ring ks-hit-target ks-press"
              style={buttonStyle}
            >
              {t({ id: "editor.layout.after.newUse", message: "Show keys after it" })}
            </button>
          </div>
          {draftUnreachable && (
            <p role="status" style={noteStyle} data-testid="after-context-unreachable">
              {t({
                id: "editor.layout.after.unreachable",
                message: "No layer in the list can type this text, so the rule you add would not be reached. You can still add it.",
              })}
            </p>
          )}
        </div>
      )}

      {literal && chosen !== null && (
        <button
          type="button"
          onClick={() => {
            setChosen(null);
            setEditing(null);
          }}
          data-testid="after-context-change"
          className="ks-focus-ring ks-hit-target ks-press"
          style={buttonStyle}
        >
          {t({ id: "editor.layout.after.change", message: "Choose another context" })}
        </button>
      )}

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
              {literal && context !== null && (r.editable || r.ruleNodeId === null) && editing !== r.vkey && (
                <button
                  type="button"
                  onClick={() => setEditing(r.vkey)}
                  data-testid="after-context-edit"
                  className="ks-focus-ring ks-hit-target ks-press"
                  style={buttonStyle}
                >
                  {r.ruleNodeId === null
                    ? t({ id: "editor.layout.after.add", message: `Add a result for ${{ key: r.label }}` })
                    : t({ id: "editor.layout.after.edit", message: `Change the result for ${{ key: r.label }}` })}
                </button>
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
              {r.neverFires.map((n) => (
                <span key={n.ruleNodeId} style={rowStyle} data-testid="after-context-never-fires">
                  <span style={{ color: TEXT_DIM }}>{copy.readOnlyReasonText("never-fires")}</span>
                  <button
                    type="button"
                    onClick={() => onViewInCode(n.ruleNodeId)}
                    data-testid="after-context-view-in-code"
                    className="ks-focus-ring ks-hit-target ks-press"
                    style={linkButtonStyle}
                  >
                    {t({ id: "editor.layout.after.viewInCode", message: "View in code" })}
                  </button>
                </span>
              ))}
              {literal && context !== null && editing === r.vkey && (
                <BecomesEditor
                  vkey={r.vkey}
                  layer={layer}
                  context={context}
                  current={r.becomes}
                  deadkeys={deadkeys}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
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
const inputStyle = { padding: "4px 8px", fontSize: 14, fontFamily: FONT, border: `1px solid ${BORDER}`, borderRadius: 4, width: 120 } as const;
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
