// LayoutEditedKeys -- the keys the Layout tab has set, labelled in the Assign tab (spec 117 T067).
//
// A key set by a `kmn-edits` entry is not an assignment, so the Assign tab would otherwise not
// mention it. This lists each such key and layer as "set in the Layout tab", so an author working
// character-first can see which keys were changed key-first. Read-only: it reads the recorded
// decision and writes nothing. Content-team copy (FR-041).

import { useLingui } from "@lingui/react/macro";
import type { KmnEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import { normaliseKmnEdits } from "@keyboard-studio/engine";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { formatLayerCombo } from "./keyGrid/LayerSelector.tsx";

const NONE: readonly KmnEdit[] = [];

/** The set-key entries that survive normalisation (a cleared key is no longer set), newest last. */
export function layoutEditedKeys(entries: readonly KmnEdit[]): Array<Extract<KmnEdit, { op: "set-key" }>> {
  const latest = new Map<string, Extract<KmnEdit, { op: "set-key" }>>();
  for (const e of normaliseKmnEdits(entries)) {
    if (e.op === "set-key") latest.set(`${e.vkey}|${[...e.layer].sort().join(",")}`, e);
  }
  return [...latest.values()];
}

export function LayoutEditedKeys() {
  const { t } = useLingui();
  const entries = useDecisionStore(
    (s) => (s.decisions["kmn-edits"]?.value as KmnEditsValue | undefined)?.entries ?? NONE,
  );
  const keys = layoutEditedKeys(entries);
  if (keys.length === 0) return null;
  return (
    <section
      aria-label={t({ id: "editor.assignLoop.layoutEdits.ariaLabel", message: "Keys set in the Layout tab" })}
      data-testid="assign-layout-edited-keys"
    >
      <h4 style={{ margin: "0 0 4px", fontSize: 12 }}>
        {t({ id: "editor.assignLoop.layoutEdits.heading", message: "Set in the Layout tab" })}
      </h4>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
        {keys.map((k) => {
          const key = k.vkey.replace(/^K_/, "");
          const layer = k.layer.length === 0 ? t({ id: "editor.assignLoop.layoutEdits.defaultLayer", message: "Default" }) : formatLayerCombo(k.layer);
          const what =
            k.output.kind === "text"
              ? k.output.text
              : k.output.kind === "nul"
                ? t({ id: "editor.assignLoop.layoutEdits.nothing", message: "nothing" })
                : k.output.deadkeyId;
          return (
            <li key={`${k.vkey}|${k.layer.join(",")}`}>
              {t({
                id: "editor.assignLoop.layoutEdits.item",
                message: `Key ${{ key }} (${{ layer }}): ${{ what }}, set in the Layout tab`,
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
