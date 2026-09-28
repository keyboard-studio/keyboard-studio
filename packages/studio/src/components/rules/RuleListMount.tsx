// RuleListMount — the rules step's rule-list region (spec 082).
//
// Sibling workstream 3 owns the real list (`KmRuleView` + the rule
// classifier) and installs it via `registerRuleListView`. Until it lands,
// this mount renders the working-copy IR as a plain grouped rule list —
// every rule named by owner (pattern title / humanized id) or by its
// plain-language shape summary, never a bare index — so the step works
// standalone.

import { Trans } from "@lingui/react/macro";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { getRuleListView, type RuleRegionProps } from "./ruleViewRegistry.ts";
import { describeRuleShape, humanizeId } from "./ruleNaming.ts";

export function RuleListMount() {
  const ir = useWorkingCopyStore((s) => s.ir);
  const ListView = getRuleListView();
  if (ListView !== null) {
    const props: RuleRegionProps = { ir };
    return <ListView {...props} />;
  }
  return <RuleListPlaceholder ir={ir} />;
}

export function RuleListPlaceholder({ ir }: { ir: KeyboardIR | null }) {
  if (ir === null) {
    return (
      <p data-testid="rules-list-empty">
        <Trans id="rules.list.noIr">
          No compiled rules yet — the rule list appears once the working copy compiles.
        </Trans>
      </p>
    );
  }
  const totalRules = ir.groups.reduce((n, g) => n + g.rules.length, 0);
  return (
    <div data-testid="rules-list-placeholder">
      <p>
        <Trans id="rules.list.placeholderNote">
          The rule gallery (rule cards) isn&apos;t installed yet — showing the working
          copy&apos;s rules as plain text.
        </Trans>
      </p>
      {ir.groups.map((group) => (
        <section key={group.name} aria-label={`rule group ${group.name}`}>
          <h4>
            <code>{group.name}</code>{" "}
            <small>
              <Trans id="rules.list.ruleCount">
                {group.rules.length} of {totalRules} rules
              </Trans>
            </small>
          </h4>
          {group.rules.length === 0 ? (
            <p>
              <small>
                <Trans id="rules.list.emptyGroup">No rules in this group.</Trans>
              </small>
            </p>
          ) : (
            <ul>
              {group.rules.map((rule, i) => (
                <li key={i} data-testid={`rules-list-rule-${group.name}-${i}`}>
                  {rule.ownedByPattern ? (
                    <>
                      <strong>{humanizeId(rule.ownedByPattern)}</strong> —{" "}
                    </>
                  ) : null}
                  {describeRuleShape(rule)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {ir.raw.length > 0 && (
        <p>
          <small>
            <Trans id="rules.list.opaqueNote">
              Plus {ir.raw.length} opaque fragment(s) carried through from the base keyboard
              (view-only).
            </Trans>
          </small>
        </p>
      )}
    </div>
  );
}
