// RuleBuilderMount — the rules step's rule-builder region (spec 082).
//
// Sibling workstream 4 owns the real builder panel and installs it via
// `registerRuleBuilderPanel`. Until it lands, this mount renders an honest
// placeholder explaining what will live here — the step works standalone
// and never pretends the builder exists.

import { Trans } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getRuleBuilderPanel, type RuleRegionProps } from "./ruleViewRegistry.ts";

export function RuleBuilderMount() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const BuilderPanel = getRuleBuilderPanel();
  if (BuilderPanel !== null) {
    const props: RuleRegionProps = { ir };
    return <BuilderPanel {...props} />;
  }
  return (
    <div data-testid="rules-builder-placeholder">
      <h3>
        <Trans id="rules.builder.heading">Build a rule</Trans>
      </h3>
      <p>
        <Trans id="rules.builder.placeholderNote">
          The rule builder isn&apos;t installed yet. When it lands, this panel will let you add
          rules — for example, a rule that types a character the base keyboard doesn&apos;t
          have — and every new rule will appear in the demo above the moment the working copy
          recompiles.
        </Trans>
      </p>
    </div>
  );
}
