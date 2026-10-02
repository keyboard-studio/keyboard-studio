// FamilyCardList — spec 082 FR-018: the rules step's family-card list.
//
// One collapsible card per `groupRules()` family: the family name, its
// pattern summary, the rule count, the group's plain-language explanation,
// sample KMN rows + "+N more", expandable to the full member rule list.
// Each card carries the three group actions from the rules mockup:
//   - Test this group — scrolls the demo pane into view and focuses it, so
//     the author can immediately try the family's keys (the demo trace names
//     the family of the rule that fired).
//   - Bundle as pack — selects the family in the rule builder below.
//   - Disable group — the working-copy toggle; enforcement (excluding the
//     family's rules from the compiled artifact) lives in
//     `useWorkingCopyTransform`, so this button visibly takes effect on the
//     next compile cycle.
//
// Expanding a card records the FR-020 intent signal `noteFamilyCardOpened`
// (guard suggestions surface only after author intent).

import { useMemo, useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { IRRule } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useGuardIntentStore } from "../../stores/guardIntentStore.ts";
import { useRulesStepUiStore } from "../../stores/rulesStepUiStore.ts";
import { groupRules, type RuleFamily } from "./ruleFamilies.ts";
import { formatRuleSummary } from "../ruleBuilder/RuleBuilderPanel.tsx";
import { BG_CARD, BORDER, FONT_MONO, TEXT_DIM, TEXT_MAIN } from "../../ui/theme.ts";
import { Button } from "../../ui/Button.tsx";
import { secondaryButton } from "../../survey/surveyStyles.ts";

/** Scroll the demo pane into view and focus its input. */
function focusDemoPane(): void {
  document
    .querySelector('[data-testid="rules-demo-pane"]')
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  const input = document.querySelector<HTMLInputElement>('[data-testid="rules-demo-input"]');
  // scrollIntoView is async with smooth behavior; focus after a tick so the
  // pane is visible when the caret lands.
  window.setTimeout(() => input?.focus({ preventScroll: true }), 50);
}

/** Scroll the rule-builder region into view. */
function focusBuilder(): void {
  document
    .querySelector('[data-testid="rules-builder-mount"]')
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function FamilyCard({ family, rules }: { family: RuleFamily; rules: IRRule[] }) {
  const [expanded, setExpanded] = useState(false);
  const toggleFamilyDisabled = useWorkingCopyStore((s) => s.toggleFamilyDisabled);
  const isDisabled = useWorkingCopyStore((s) => s.disabledFamilyIds.has(family.id));
  const setBundleFamilyId = useRulesStepUiStore((s) => s.setBundleFamilyId);

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      // FR-020 intent signal: the author opened this family's card.
      useGuardIntentStore.getState().noteFamilyCardOpened(family.id);
    }
  };

  const bundleAsPack = () => {
    setBundleFamilyId(family.id);
    focusBuilder();
  };

  const shownSamples = family.sampleRuleTexts.slice(0, 3);
  const hiddenCount = family.count - shownSamples.length;

  return (
    <section
      data-testid={`family-card-${family.id}`}
      aria-label={family.name}
      style={{
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: "var(--app-radius)",
        padding: "12px 14px",
        marginBottom: 12,
        opacity: isDisabled ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, color: TEXT_MAIN }}>{family.name}</h4>
        <span style={{ color: TEXT_DIM, fontSize: 13 }}>
          {family.count} {family.count === 1 ? "rule" : "rules"}
        </span>
        {isDisabled && (
          <span
            data-testid={`family-card-disabled-badge-${family.id}`}
            style={{
              color: TEXT_DIM,
              fontSize: 12,
              border: `1px solid ${BORDER}`,
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            <Trans id="rules.familyCard.disabledBadge">Disabled</Trans>
          </span>
        )}
        <Button
          style={{ ...secondaryButton, marginLeft: "auto" }}
          data-testid={`family-card-expand-${family.id}`}
          onClick={toggleExpanded}
          aria-expanded={expanded}
        >
          {expanded ? (
            <Trans id="rules.familyCard.collapse">Collapse</Trans>
          ) : (
            <Trans id="rules.familyCard.expand">Show rules</Trans>
          )}
        </Button>
      </div>

      <p style={{ margin: "6px 0", color: TEXT_DIM, fontSize: 13 }}>{family.patternSummary}</p>
      <p style={{ margin: "6px 0", color: TEXT_MAIN, fontSize: 14 }}>{family.explanation}</p>

      <ul style={{ margin: "8px 0", paddingLeft: 18, fontFamily: FONT_MONO, fontSize: 13 }}>
        {shownSamples.map((text, i) => (
          <li key={i} style={{ color: TEXT_MAIN }}>
            <code>{text}</code>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && !expanded && (
        <p style={{ margin: "4px 0", color: TEXT_DIM, fontSize: 13 }}>
          <Trans id="rules.familyCard.more">+{hiddenCount} more</Trans>
        </p>
      )}

      {expanded && (
        <ul
          data-testid={`family-card-members-${family.id}`}
          style={{ margin: "8px 0", paddingLeft: 18, fontFamily: FONT_MONO, fontSize: 13 }}
        >
          {rules.map((rule) => (
            <li key={rule.nodeId} style={{ color: TEXT_MAIN }}>
              <code>{formatRuleSummary(rule)}</code>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Button
          style={secondaryButton}
          data-testid={`family-card-test-${family.id}`}
          onClick={focusDemoPane}
        >
          <Trans id="rules.familyCard.test">Test this group</Trans>
        </Button>
        <Button
          style={secondaryButton}
          data-testid={`family-card-bundle-${family.id}`}
          onClick={bundleAsPack}
        >
          <Trans id="rules.familyCard.bundle">Bundle as pack</Trans>
        </Button>
        <Button
          style={secondaryButton}
          data-testid={`family-card-disable-${family.id}`}
          onClick={() => toggleFamilyDisabled(family.id)}
          aria-pressed={isDisabled}
        >
          {isDisabled ? (
            <Trans id="rules.familyCard.enable">Enable group</Trans>
          ) : (
            <Trans id="rules.familyCard.disable">Disable group</Trans>
          )}
        </Button>
      </div>
      {isDisabled && (
        <p style={{ margin: "6px 0 0", color: TEXT_DIM, fontSize: 13 }}>
          <Trans id="rules.familyCard.disabledNote">
            This group&apos;s rules are excluded from the demo and the compiled keyboard.
            Re-enable to restore them.
          </Trans>
        </p>
      )}
    </section>
  );
}

export function FamilyCardList() {
  const ir = useWorkingCopyStore((s) => s.ir);

  const groups = useMemo(() => {
    if (ir === null) return [];
    const rules = ir.groups.flatMap((g) => g.rules);
    const ruleById = new Map(rules.map((r) => [r.nodeId, r] as const));
    return groupRules(rules).map((family) => ({
      family,
      rules: family.memberIds
        .map((id) => ruleById.get(id))
        .filter((r): r is IRRule => r !== undefined),
    }));
  }, [ir]);

  if (ir === null) return null;
  if (groups.length === 0) return null;

  return (
    <div data-testid="family-card-list">
      {groups.map(({ family, rules }) => (
        <FamilyCard key={family.id} family={family} rules={rules} />
      ))}
    </div>
  );
}
