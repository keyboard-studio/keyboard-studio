// StepNavCluster — the active step's Back / Skip / forward buttons, rendered at
// the left of the footer (spec 081). The step publishes them through
// `usePublishStepNav`; this reads `entries[stepId]` and nothing else, so an
// outgoing step's entry is never rendered on the incoming step.
//
// Keys are the slot names, not the labels: Next relabelling to Finish, or Back
// disappearing on the first question, must not remount the forward button and
// throw away the author's focus. A STEP change does remount it — StudioFooter
// keys this component on the active step id.

import { useLingui } from "@lingui/react/macro";
import { useStepNavStore, hasSlots, type NavAction } from "../stores/stepNavStore.ts";
import { Button, type ButtonVariant } from "../ui/Button.tsx";

const SLOT_VARIANTS = [
  ["back", "back"],
  ["secondary", "secondary"],
  ["forward", "primary"],
] as const satisfies ReadonlyArray<readonly [string, ButtonVariant]>;

export function StepNavCluster({ stepId }: { stepId: string }) {
  const { t } = useLingui();
  const spec = useStepNavStore((s) => s.entries[stepId]?.spec);
  if (spec === undefined || !hasSlots(spec)) return null;

  return (
    <div
      role="group"
      aria-label={t({ id: "footer.nav.groupLabel", message: "Step navigation" })}
      data-testid="step-nav"
      style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}
    >
      {SLOT_VARIANTS.map(([slot, variant]) => {
        const action: NavAction | undefined = spec[slot];
        if (action === undefined) return null;
        return (
          <Button
            key={slot}
            variant={variant}
            size="compact"
            data-testid={action.testId}
            disabled={action.disabled ?? false}
            aria-label={action.ariaLabel}
            aria-describedby={action.ariaDescribedBy}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
