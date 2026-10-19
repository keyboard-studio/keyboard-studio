// RuleListMount — the rules step's rule-list region (spec 082).
//
// Renders the FR-018 family-card list, so the rules step always shows the
// rule families the mockup promises instead of a bare rule dump. (This
// region once read a registry slot for a sibling workstream's assisted
// view; nothing ever registered, so the indirection was removed and the
// family-card list — the only path ever rendered — is the direct path.)

import { Trans } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { FamilyCardList } from "./FamilyCardList.tsx";
import { rulesNote } from "./rulesStyles.ts";

export function RuleListMount() {
  const ir = useWorkingCopyStore((s) => s.ir);
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
