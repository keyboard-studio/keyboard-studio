// RuleBuilderMount — the rules step's rule-builder region (spec 082).
//
// Renders the sibling workstream's builder panel when one is registered via
// `registerRuleBuilderPanel`. Until then — and as the default — this mount
// renders the real Track B `RuleBuilderPanel` directly: the family-card
// list's "Bundle as pack" action selects a family here (via
// `rulesStepUiStore.bundleFamilyId`) and the panel opens with that family's
// rules pre-selected for the 3-step bundle flow (name it, prove it, save
// it). The panel is keyed by the selected family so picking another family
// remounts it with a fresh selection.

import { Trans } from "@lingui/react/macro";
import { useMemo } from "react";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useRulesStepUiStore } from "../../stores/rulesStepUiStore.ts";
import { getRuleBuilderPanel, type RuleRegionProps } from "./ruleViewRegistry.ts";
import { groupRules, familyOfRule } from "./ruleFamilies.ts";
import { RuleBuilderPanel } from "../ruleBuilder/RuleBuilderPanel.tsx";

/** Download the exported bundle JSON — the mount's `onExport` handler. */
function downloadBundle(json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rule-bundle.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RuleBuilderMount() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const bundleFamilyId = useRulesStepUiStore((s) => s.bundleFamilyId);
  const BuilderPanel = getRuleBuilderPanel();

  const families = useMemo(() => {
    if (ir === null) return [];
    return groupRules(ir.groups.flatMap((g) => g.rules));
  }, [ir]);

  if (BuilderPanel !== null) {
    const props: RuleRegionProps = { ir };
    return <BuilderPanel {...props} />;
  }

  if (ir === null) {
    return (
      <div data-testid="rules-builder-placeholder">
        <h3>
          <Trans id="rules.builder.heading">Build a rule</Trans>
        </h3>
        <p>
          <Trans id="rules.builder.placeholderNote">
            The rule builder isn&apos;t available yet — instantiate a working copy first.
          </Trans>
        </p>
      </div>
    );
  }

  const allRules = ir.groups.flatMap((g) => g.rules);
  const selectedRules =
    bundleFamilyId === null
      ? allRules
      : allRules.filter((r) => familyOfRule(families, r.nodeId)?.id === bundleFamilyId);

  const scriptKey = baseKeyboard?.script;

  return (
    <div data-testid="rules-builder-mount">
      <RuleBuilderPanel
        key={bundleFamilyId ?? "all"}
        selectedRules={selectedRules}
        families={families}
        keyboardMeta={{
          id: baseKeyboard?.id ?? ir.header.keyboardId,
          name: baseKeyboard?.displayName ?? ir.header.name,
          copyright: ir.header.copyright,
          // The IR header carries no license field; the panel shows it in
          // Details — empty is honest, not guessed.
          license: "",
        }}
        // exactOptionalPropertyTypes: omit the prop when there is no script.
        {...(scriptKey !== undefined ? { scriptKey } : {})}
        onExport={downloadBundle}
      />
    </div>
  );
}