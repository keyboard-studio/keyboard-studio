// KmnEditsRenderer -- the trail view of the `kmn-edits` decision (spec 117): the Layout tab's
// edits listed in plain words, in the order they were made. Read-only; edits are made in the
// Layout tab. Content-team copy (FR-041).

import { useLingui } from "@lingui/react/macro";
import { isLayoutOperation } from "@keyboard-studio/contracts";
import type { KmnEdit, KmnEditsValue, LayoutOperation, LayoutOutput } from "@keyboard-studio/contracts";
import type { DecisionRendererProps } from "../../../decisions/decisionTypes.ts";

export function KmnEditsRenderer({ value }: DecisionRendererProps<KmnEditsValue>) {
  const { t } = useLingui();
  const entries = value?.entries ?? [];

  function layerName(entry: LayoutOperation): string {
    return entry.layer.length === 0
      ? t({ id: "editor.layout.edits.defaultLayer", message: "Default" })
      : entry.layer.join("+");
  }

  function outputWords(out: LayoutOutput): string {
    switch (out.kind) {
      case "text":
        return t({ id: "editor.layout.edits.typesText", message: `types ${{ text: out.text }}` });
      case "deadkey":
        return t({ id: "editor.layout.edits.typesDeadkey", message: `makes deadkey ${{ id: out.deadkeyId }}` });
      case "nul":
        return t({ id: "editor.layout.edits.typesNothing", message: "types nothing" });
    }
  }

  function entryWords(entry: KmnEdit): string {
    if (entry.op === "code-apply") {
      return t({ id: "editor.layout.edits.codeApply", message: "Edited in the Code tab" });
    }
    if (entry.op === "review-kept") {
      return t({ id: "editor.layout.edits.reviewKept", message: "Code tab edit reviewed" });
    }
    if (!isLayoutOperation(entry)) return "";
    const key = entry.vkey;
    const layer = layerName(entry);
    switch (entry.op) {
      case "set-key":
        return t({
          id: "editor.layout.edits.setKey",
          message: `${{ key }} (${{ layer }}) ${{ what: outputWords(entry.output) }}`,
        });
      case "clear-key":
        return t({ id: "editor.layout.edits.clearKey", message: `${{ key }} (${{ layer }}) back to how it was` });
      case "set-row":
        return t({ id: "editor.layout.edits.setRow", message: `${{ key }} (${{ layer }}) after a given context changed` });
      case "remove-row":
        return t({ id: "editor.layout.edits.removeRow", message: `${{ key }} (${{ layer }}) after a given context removed` });
      case "decline-case-partner":
        return t({
          id: "editor.layout.edits.declinePartner",
          message: `${{ key }} (${{ layer }}) kept without its case partner`,
        });
    }
  }

  if (entries.length === 0) {
    return <p>{t({ id: "editor.layout.edits.none", message: "No keys changed in the Layout tab." })}</p>;
  }
  return (
    <ol aria-label={t({ id: "editor.layout.edits.listLabel", message: "Layout tab edits" })}>
      {entries.map((entry) => (
        <li key={entry.seq}>{entryWords(entry)}</li>
      ))}
    </ol>
  );
}
