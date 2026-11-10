// fallbackPolicyAdapter — manifest host for the keyboard-wide fallback policy (issue #2539).

import { useLingui } from "@lingui/react/macro";
import type { EditorStepProps } from "../../steps/types.ts";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";
import { FallbackPolicyStepBody } from "../fallback/FallbackPolicyStepBody.tsx";
import { completeFallbackPolicyStep } from "../../lib/fallbackPolicyStepCompletion.ts";

export function FallbackPolicyAdapter({ onComplete, onBack }: EditorStepProps) {
  const { t } = useLingui();
  usePublishStepNav({
    ...(onBack !== undefined
      ? {
          back: {
            label: t({ id: "editor.fallbackPolicy.nav.back", message: "Back" }),
            onClick: onBack,
            testId: "fallback-policy-back",
          },
        }
      : {}),
    forward: {
      label: t({ id: "editor.fallbackPolicy.nav.continue", message: "Continue" }),
      onClick: () => {
        completeFallbackPolicyStep();
        onComplete(undefined);
      },
      testId: "fallback-policy-continue",
    },
  });
  return <FallbackPolicyStepBody />;
}
