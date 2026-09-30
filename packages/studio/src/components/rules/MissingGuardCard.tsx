// MissingGuardCard — direction A of the guard-suggestion cards
// (spec 082 FR-020).
//
// One grouped, dismissible card per suggestion group: "N more diacritic
// keys have no guard — add them to the family?", with a per-key key +
// emitted-mark preview and one-tap "Add all". "Add all" stages rules through
// the normal reversible working-copy path (`setWorkingIR`) — never
// auto-applied, idempotent on re-run, and honestly counted: added, plus each
// skip reason on its own line (already guarded / no rule to copy / no
// editable group), since those are different facts for the author.

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { MissingGuardGroup } from "./guardAnalysis.ts";
import { groupRules } from "./ruleFamilies.ts";
import {
  synthesizeMissingGuardRules,
  targetGroupForSynthesis,
  familyForGuardStore,
} from "./guardRuleSynthesis.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";
import { Button } from "../../ui/Button.tsx";
import { rulesActions, rulesBody, rulesCode, rulesInsetCard, rulesNote } from "./rulesStyles.ts";
import { secondaryButton } from "../../survey/surveyStyles.ts";

/** What one "Add all" tap did, per reason — rendered by {@link OutcomeNote}. */
interface AddAllOutcome {
  added: number;
  /** Already guarded: re-running "Add all" never duplicates a rule. */
  alreadyCovered: number;
  /** The family has no rule to clone the guard from. */
  noTemplate: number;
  /** Synthesized, but the keyboard has no editable group to stage them in. */
  noTarget: number;
}

function OutcomeNote({
  outcome,
  familyName,
  testId,
}: {
  outcome: AddAllOutcome;
  familyName: string;
  testId: string;
}) {
  const { added, alreadyCovered, noTemplate, noTarget } = outcome;
  return (
    <p style={rulesNote} data-testid={testId}>
      <small>
        <Trans id="rules.guard.missing.addedNote">
          Added {added} guard rule(s). Review them in the rule list; remove any you don&apos;t
          want.
        </Trans>
        {alreadyCovered > 0 && (
          <>
            {" "}
            <Trans id="rules.guard.missing.skippedCovered">
              {alreadyCovered} skipped: already guarded.
            </Trans>
          </>
        )}
        {noTemplate > 0 && (
          <>
            {" "}
            <Trans id="rules.guard.missing.skippedNoTemplate">
              {noTemplate} not added: the “{familyName}” family has no rule to copy the guard
              from.
            </Trans>
          </>
        )}
        {noTarget > 0 && (
          <>
            {" "}
            <Trans id="rules.guard.missing.skippedNoTarget">
              {noTarget} not added: the keyboard has no editable rule group.
            </Trans>
          </>
        )}
      </small>
    </p>
  );
}

export function MissingGuardCard({ group }: { group: MissingGuardGroup }) {
  const dismissMissingGroup = useGuardIntentStore((s) => s.dismissMissingGroup);
  const [outcome, setOutcome] = useState<AddAllOutcome | null>(null);
  const groupKey = missingGuardGroupKey(group);

  const addAll = () => {
    const { ir, setWorkingIR } = useWorkingCopyStore.getState();
    if (ir === null) return;
    const rules = ir.groups.flatMap((g) => g.rules);
    const families = groupRules(rules);
    const { rules: synthesized, alreadyCovered, noTemplate } = synthesizeMissingGuardRules(
      ir,
      group,
      families,
    );
    const target = targetGroupForSynthesis(ir, families, group.store);
    if (target === null || synthesized.length === 0) {
      setOutcome({
        added: 0,
        alreadyCovered,
        noTemplate,
        noTarget: target === null ? synthesized.length : 0,
      });
      return;
    }
    const { groupIndex } = target;
    setWorkingIR({
      ...ir,
      groups: ir.groups.map((g, i) =>
        i === groupIndex ? { ...g, rules: [...g.rules, ...synthesized] } : g,
      ),
    });
    // Installing synthesized guard rules is the block-bundle install the
    // intent store tracks (gates re-analysis of the same group) — and it is
    // creating rules in the guard family, the second FR-020 intent signal.
    const intent = useGuardIntentStore.getState();
    intent.noteBlockBundleInstalled();
    const family = familyForGuardStore(ir, families, group.store);
    if (family !== undefined) intent.noteFamilyEdited(family.id);
    setOutcome({ added: synthesized.length, alreadyCovered, noTemplate, noTarget: 0 });
  };

  return (
    <section
      data-testid={`missing-guard-${groupKey}`}
      aria-label="Missing guard suggestion"
      style={rulesInsetCard}
    >
      <p style={rulesBody}>
        <Trans id="rules.guard.missing.prompt">
          {group.missing.length} more diacritic keys have no guard — add them to the
          “{group.familyName}” family?
        </Trans>
      </p>
      <ul style={{ ...rulesBody, paddingLeft: 18 }}>
        {group.missing.map((entry) => (
          <li
            key={`${entry.key}::${entry.outputChar}`}
            data-testid={`missing-guard-entry-${entry.key}`}
          >
            <code style={rulesCode}>{entry.key}</code> → {entry.outputChar}
            {entry.outputName !== undefined && entry.outputName !== "" && (
              <small> ({entry.outputName})</small>
            )}
          </li>
        ))}
      </ul>
      <div style={rulesActions}>
        <Button
          variant="primary"
          data-testid={`missing-guard-add-all-${groupKey}`}
          onClick={addAll}
        >
          <Trans id="rules.guard.missing.addAll">Add all</Trans>
        </Button>
        <Button
          style={secondaryButton}
          data-testid={`missing-guard-dismiss-${groupKey}`}
          onClick={() => dismissMissingGroup(groupKey)}
        >
          <Trans id="rules.guard.missing.dismiss">Dismiss</Trans>
        </Button>
      </div>
      {outcome !== null && (
        <OutcomeNote
          outcome={outcome}
          familyName={group.familyName}
          testId={`missing-guard-added-${groupKey}`}
        />
      )}
    </section>
  );
}
