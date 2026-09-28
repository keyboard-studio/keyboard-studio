// MissingGuardCard — direction A of the guard-suggestion cards
// (spec 082 FR-020).
//
// One grouped, dismissible card per suggestion group: "N more diacritic
// keys have no guard — add them to the family?", with a per-key key +
// emitted-mark preview and one-tap "Add all". "Add all" stages rules through
// the normal reversible working-copy path (`setWorkingIR`) — never
// auto-applied, idempotent on re-run, and honestly counted (added/skipped).

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { MissingGuardGroup } from "./guardAnalysis.ts";
import { groupRules } from "./ruleFamilies.ts";
import {
  synthesizeMissingGuardRules,
  targetGroupForSynthesis,
} from "./guardRuleSynthesis.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";

export function MissingGuardCard({ group }: { group: MissingGuardGroup }) {
  const dismissMissingGroup = useGuardIntentStore((s) => s.dismissMissingGroup);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const groupKey = missingGuardGroupKey(group);

  const addAll = () => {
    const { ir, setWorkingIR } = useWorkingCopyStore.getState();
    if (ir === null) return;
    const rules = ir.groups.flatMap((g) => g.rules);
    const families = groupRules(rules);
    const { rules: synthesized, skipped } = synthesizeMissingGuardRules(ir, group, families);
    const target = targetGroupForSynthesis(ir, families, group.store);
    if (target === null || synthesized.length === 0) {
      setAddedCount(0);
      setSkippedCount(group.missing.length);
      return;
    }
    const { groupIndex } = target;
    setWorkingIR({
      ...ir,
      groups: ir.groups.map((g, i) =>
        i === groupIndex ? { ...g, rules: [...g.rules, ...synthesized] } : g,
      ),
    });
    setAddedCount(synthesized.length);
    setSkippedCount(skipped);
  };

  return (
    <section data-testid={`missing-guard-${groupKey}`} aria-label="Missing guard suggestion">
      <p>
        <Trans id="rules.guard.missing.prompt">
          {group.missing.length} more diacritic keys have no guard — add them to the
          “{group.familyName}” family?
        </Trans>
      </p>
      <ul>
        {group.missing.map((entry) => (
          <li
            key={`${entry.key}::${entry.outputChar}`}
            data-testid={`missing-guard-entry-${entry.key}`}
          >
            <code>{entry.key}</code> → {entry.outputChar}
            {entry.outputName !== undefined && entry.outputName !== "" && (
              <small> ({entry.outputName})</small>
            )}
          </li>
        ))}
      </ul>
      <div>
        <button
          type="button"
          data-testid={`missing-guard-add-all-${groupKey}`}
          onClick={addAll}
        >
          <Trans id="rules.guard.missing.addAll">Add all</Trans>
        </button>{" "}
        <button
          type="button"
          data-testid={`missing-guard-dismiss-${groupKey}`}
          onClick={() => dismissMissingGroup(groupKey)}
        >
          <Trans id="rules.guard.missing.dismiss">Dismiss</Trans>
        </button>
      </div>
      {addedCount !== null && (
        <p data-testid={`missing-guard-added-${groupKey}`}>
          <small>
            <Trans id="rules.guard.missing.addedNote">
              Added {addedCount} guard rule(s)
              {skippedCount > 0 ? ` — ${skippedCount} skipped (already covered)` : ""}.
              Review them in the rule list; remove any you don&apos;t want.
            </Trans>
          </small>
        </p>
      )}
    </section>
  );
}
