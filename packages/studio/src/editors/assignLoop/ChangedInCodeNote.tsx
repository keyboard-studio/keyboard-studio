// ChangedInCodeNote -- "changed in code" where a Code-tab edit overrode another editor's work
// (spec 117 US8, FR-062). Read-only: it reads the recorded `kmn-edits` decision. Each editor that
// owns some of the keyboard mounts it with the owner it cares about, so the Assign tab names
// rules-step edits and the deadkey editor names deadkey edits.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { CodeEdit, KmnEdit, KmnEditsValue, OwnerRef } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../../stores/decisionStore.ts";

const NONE: readonly KmnEdit[] = [];

/** How many recorded Code-tab entries overrode `owner`'s work. */
export function codeOverrideCount(entries: readonly KmnEdit[], owner: OwnerRef["owner"]): number {
  return entries.filter((e): e is CodeEdit => e.op === "code-apply" && e.overrides.some((o) => o.owner === owner)).length;
}

export function ChangedInCodeNote({ owner }: { readonly owner: OwnerRef["owner"] }) {
  const { t } = useLingui();
  const entries = useDecisionStore(
    (s) => (s.decisions["kmn-edits"]?.value as KmnEditsValue | undefined)?.entries ?? NONE,
  );
  const count = codeOverrideCount(entries, owner);
  if (count === 0) return null;
  return (
    <p data-testid="changed-in-code-note" style={{ margin: "4px 0", fontSize: 12 }}>
      {t({
        id: "editor.assignLoop.changedInCode.note",
        message: plural(count, {
          one: "# change here was made in the Code tab and wins over this editor.",
          other: "# changes here were made in the Code tab and win over this editor.",
        }),
      })}
    </p>
  );
}
