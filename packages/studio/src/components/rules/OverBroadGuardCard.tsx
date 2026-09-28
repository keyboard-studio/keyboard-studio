// OverBroadGuardCard — direction B of the guard-suggestion cards
// (spec 082 FR-022).
//
// Rendered as a QUESTION, never an error: the guard may be exactly what the
// author wants (some workflows intentionally block combinations the
// orthography attests). Two actions:
//   - Keep — dismisses the card and records the author's intent for that
//     guard rule, so the question is never asked again;
//   - Narrow — selects the guard's family for editing. Full narrowing UI
//     (editing the guard's scope in place) is a follow-up; for now the
//     button selects the family and says so honestly.

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { OverBroadGuard } from "./guardAnalysis.ts";
import { familyOfRule, groupRules } from "./ruleFamilies.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { useRulesStepUiStore } from "../../stores/rulesStepUiStore.ts";

export function OverBroadGuardCard({ guard }: { guard: OverBroadGuard }) {
  const keepOverBroadGuard = useGuardIntentStore((s) => s.keepOverBroadGuard);
  const selectFamily = useRulesStepUiStore((s) => s.selectFamily);
  const [narrowedFamilyName, setNarrowedFamilyName] = useState<string | null>(null);
  const [narrowStale, setNarrowStale] = useState(false);

  const narrow = () => {
    // Find the guard rule's family from the live working-copy IR.
    const ir = useWorkingCopyStore.getState().ir;
    const rules = ir?.groups.flatMap((g) => g.rules) ?? [];
    const family = familyOfRule(groupRules(rules), guard.guardRuleId);
    if (family !== undefined) {
      selectFamily(family.id);
      setNarrowedFamilyName(family.name);
      setNarrowStale(false);
    } else {
      // The guard rule isn't in any current family (stale analysis) —
      // say so rather than failing silently.
      setNarrowedFamilyName(null);
      setNarrowStale(true);
    }
  };

  return (
    <section
      data-testid={`overbroad-guard-${guard.guardRuleId}`}
      aria-label="Guard question"
    >
      <p>
        <strong>{guard.question}</strong>
      </p>
      <p>
        <small>
          <Trans id="rules.guard.overbroad.detail">
            Guard rule <code>{guard.guardRuleId}</code> blocks {guard.markChar} (key{" "}
            {guard.markKey}) after “{guard.blockedChar}”.
          </Trans>
        </small>
      </p>
      <div>
        <button
          type="button"
          data-testid={`overbroad-guard-keep-${guard.guardRuleId}`}
          onClick={() => keepOverBroadGuard(guard.guardRuleId)}
        >
          <Trans id="rules.guard.overbroad.keep">Keep as is</Trans>
        </button>{" "}
        <button
          type="button"
          data-testid={`overbroad-guard-narrow-${guard.guardRuleId}`}
          onClick={narrow}
        >
          <Trans id="rules.guard.overbroad.narrow">Narrow this guard</Trans>
        </button>
      </div>
      {narrowedFamilyName !== null && (
        <p data-testid={`overbroad-guard-narrowed-${guard.guardRuleId}`}>
          <small>
            <Trans id="rules.guard.overbroad.narrowedNote">
              The “{narrowedFamilyName}” family is now selected for editing. Full
              in-place guard narrowing is a follow-up — edit the guard rule in the
              rule builder for now.
            </Trans>
          </small>
        </p>
      )}
      {narrowStale && (
        <p data-testid={`overbroad-guard-stale-${guard.guardRuleId}`}>
          <small>
            <Trans id="rules.guard.overbroad.staleNote">
              That guard rule isn&apos;t in the current rules — this suggestion may
              be stale.
            </Trans>
          </small>
        </p>
      )}
    </section>
  );
}
