// AssignedKeysChangedInCode -- keys the Assign tab owns that a Code-tab edit then changed
// (spec 113 ruling 10, scenario 4a). On an assigned key the most recent edit wins, so the Code
// edit is in the download; this lists each such key as "changed in code" so the author is not
// surprised that the assignment no longer answers it. Read-only: it reads the recorded
// `kmn-edits` decision and writes nothing.

import { useLingui } from "@lingui/react/macro";
import type { CodeEdit, KmnEdit, KmnEditsValue } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../../stores/decisionStore.ts";

const NONE: readonly KmnEdit[] = [];

export interface ChangedAssignedKey {
  readonly vkey: string;
  readonly modifiers: readonly string[];
}

/** The keys named by `assign-tab` overrides of recorded Code edits, each once, in entry order. */
export function assignedKeysChangedInCode(entries: readonly KmnEdit[]): ChangedAssignedKey[] {
  const seen = new Map<string, ChangedAssignedKey>();
  for (const e of entries) {
    if (e.op !== "code-apply") continue;
    for (const o of (e as CodeEdit).overrides) {
      if (o.owner !== "assign-tab") continue;
      const c = e.changes[o.change];
      if (c === undefined || (c.change !== "replace" && c.change !== "remove")) continue;
      const k = c.at.keystroke;
      if (k === undefined) continue;
      seen.set(`${k.vkey}|${[...k.modifiers].sort().join(",")}`, { vkey: k.vkey, modifiers: k.modifiers });
    }
  }
  return [...seen.values()];
}

export function AssignedKeysChangedInCode() {
  const { t } = useLingui();
  const entries = useDecisionStore(
    (s) => (s.decisions["kmn-edits"]?.value as KmnEditsValue | undefined)?.entries ?? NONE,
  );
  const keys = assignedKeysChangedInCode(entries);
  if (keys.length === 0) return null;
  return (
    <section
      aria-label={t({ id: "editor.assignLoop.assignedChangedInCode.ariaLabel", message: "Assigned keys changed in code" })}
      data-testid="assign-changed-in-code-keys"
    >
      <h4 style={{ margin: "0 0 4px", fontSize: 12 }}>
        {t({ id: "editor.assignLoop.assignedChangedInCode.heading", message: "Changed in code" })}
      </h4>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
        {keys.map((k) => {
          const key = k.vkey.replace(/^K_/, "");
          const layer =
            k.modifiers.length === 0
              ? t({ id: "editor.assignLoop.assignedChangedInCode.defaultLayer", message: "Default" })
              : k.modifiers.join("+");
          return (
            <li key={`${k.vkey}|${k.modifiers.join(",")}`}>
              {t({
                id: "editor.assignLoop.assignedChangedInCode.item",
                message: `Key ${{ key }} (${{ layer }}): changed in the Code tab; it wins over the assignment`,
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
