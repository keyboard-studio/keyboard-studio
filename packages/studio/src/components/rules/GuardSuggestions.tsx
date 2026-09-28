// GuardSuggestions — the intent-gated guard-suggestion section
// (spec 082 FR-020 / FR-022).
//
// Runs the two-direction guard analysis (`analyzeGuardCoverage`) over the
// working-copy rules plus the confirmed orthography model, and renders one
// card per suggestion — but ONLY after an intent signal (see
// guardIntentStore.ts): the author opened the family card, created/edited/
// selected a rule in the family, or installed a block-behaviour bundle.
// Never on step entry, never unsolicited: some workflows intentionally
// permit floating marks.
//
// Kept over-broad guards and dismissed missing-guard groups never reappear.

import { useMemo } from "react";
import { Trans } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  guardIntentSignaledForFamily,
  missingGuardGroupKey,
  useGuardIntentStore,
} from "../../stores/guardIntentStore.ts";
import { analyzeGuardCoverage, storeCharsOf } from "./guardAnalysis.ts";
import { deriveOrthographyModel } from "./orthographyModel.ts";
import { familyOfRule, groupRules } from "./ruleFamilies.ts";
import { MissingGuardCard } from "./MissingGuardCard.tsx";
import { OverBroadGuardCard } from "./OverBroadGuardCard.tsx";

export function GuardSuggestions() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const intent = useGuardIntentStore();

  const families = useMemo(
    () => groupRules(ir?.groups.flatMap((g) => g.rules) ?? []),
    [ir],
  );
  const analysis = useMemo(() => {
    const rules = ir?.groups.flatMap((g) => g.rules) ?? [];
    const stores = ir ? storeCharsOf(ir) : new Map<string, string[]>();
    return analyzeGuardCoverage(rules, deriveOrthographyModel(alphabet), stores);
  }, [ir, alphabet]);

  const familyIdForStore = (store: string): string | undefined =>
    families.find((f) => f.guardStore === store)?.id;
  const familyIdForGuardRule = (guardRuleId: string): string | undefined =>
    familyOfRule(families, guardRuleId)?.id;

  const visibleMissing = analysis.missing.filter((group) => {
    if (intent.dismissedMissingGroups.has(missingGuardGroupKey(group))) return false;
    const familyId = familyIdForStore(group.store);
    return (
      familyId !== undefined && guardIntentSignaledForFamily(intent, familyId)
    );
  });
  const visibleOverBroad = analysis.overBroad.filter((guard) => {
    if (intent.keptGuardRuleIds.has(guard.guardRuleId)) return false;
    const familyId = familyIdForGuardRule(guard.guardRuleId);
    return (
      familyId !== undefined && guardIntentSignaledForFamily(intent, familyId)
    );
  });

  if (visibleMissing.length === 0 && visibleOverBroad.length === 0) {
    return null;
  }

  return (
    <section data-testid="guard-suggestions" aria-label="Guard suggestions">
      <h4>
        <Trans id="rules.guard.suggestionsHeading">Guard suggestions</Trans>
      </h4>
      {visibleOverBroad.map((guard) => (
        <OverBroadGuardCard key={guard.guardRuleId} guard={guard} />
      ))}
      {visibleMissing.map((group) => (
        <MissingGuardCard
          key={`${group.store}::${group.familyName}`}
          group={group}
        />
      ))}
    </section>
  );
}
