// RuleListMount — the rules step's rule-list region (spec 082).
//
// Renders the sibling workstream's rule list view when one is registered via
// `registerRuleListView` (the Track C assisted view, KmRuleView, lands on
// its own schedule). Until then — and as the default — this mount renders
// the FR-018 family-card list, so the rules step always shows the rule
// families the mockup promises instead of a bare rule dump.

import { Trans } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getRuleListView, type RuleRegionProps } from "./ruleViewRegistry.ts";
import { FamilyCardList } from "./FamilyCardList.tsx";
import { rulesNote } from "./rulesStyles.ts";

export function RuleListMount() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const ListView = getRuleListView();
  if (ListView !== null) {
    const props: RuleRegionProps = { ir };
    return <ListView {...props} />;
  }
  if (ir === null) {
    return (
      <p data-testid="rules-list-empty" style={rulesNote}>
        <Trans id="rules.list.noIr">
          No compiled rules yet — the rule list appears once the working copy compiles.
        </Trans>
      </p>
    );
  }
  return <FamilyCardList />;
}
