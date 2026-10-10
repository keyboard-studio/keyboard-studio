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
  const revision = useStepNavStore((s) => (s.revision?.stepId === stepId ? s.revision : null));
  if (revision === null && (spec === undefined || !hasSlots(spec))) return null;

  return (
    <div
      role="group"
      aria-label={t({ id: "footer.nav.groupLabel", message: "Step navigation" })}
      data-testid="step-nav"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        // Narrow-width degrade (spec 081 FR-022, SC-007): the cluster yields
        // BEFORE the dots do, but its buttons never shrink, wrap or clip —
        // each keeps `flexShrink: 0` / `nowrap` from the compact Button, so
        // excess width scrolls inside the cluster instead of spilling under
        // the footer's `overflow: hidden` where a long label (e.g. the French
        // touch-seed "Abandonner les modifications tactiles et confirmer" at
        // 375 px) would be clipped and unclickable. `minWidth: 0` lets the
        // flex item shrink below its content size so the scroll can engage;
        // focusing an off-screen button scrolls it into view natively, and
        // Tab order (nav before dots) is unchanged. No vertical growth: the
        // row stays one line tall within the 40/52 px footer frame.
        flexShrink: 1,
        minWidth: 0,
        flexWrap: "nowrap",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {revision !== null && (
        <Button
          variant="secondary"
          size="compact"
          data-testid="step-revision-discard"
          onClick={revision.onDiscard}
        >
          {t({ id: "step.revision.discard", message: "Discard changes and go back" })}
        </Button>
      )}
      {SLOT_VARIANTS.map(([slot, variant]) => {
        const stepAction: NavAction | undefined = spec?.[slot];
        if (stepAction === undefined) return null;
        // spec 094: while revising from Output, the editor's own forward
        // completes the step and StepHost returns to Output, so it is named
        // for where it goes.
        const action: NavAction =
          revision !== null && slot === "forward"
            ? {
                ...stepAction,
                label: t({ id: "step.revision.backToTesting", message: "Back to testing" }),
                testId: "step-revision-back-to-testing",
              }
            : stepAction;
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
