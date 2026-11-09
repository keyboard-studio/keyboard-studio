// WalkNav: publishes Back and Continue for an Open-walk page (spec 111 FR-031;
// spec 081 FR-001 — footer via usePublishStepNav). Reads navigation from the
// gallery step context, as the Languages page does.

import { useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import { useGalleryStepContext } from "../../steps/galleryHost.tsx";
import { usePublishStepNav } from "../../hooks/usePublishStepNav.ts";

export function WalkNav({ onContinue }: { onContinue: () => void }): null {
  const { t } = useLingui();
  const { onBack } = useGalleryStepContext();
  const navSpec = useMemo(
    () => ({
      ...(onBack !== undefined
        ? {
            back: {
              label: t({ id: "openWalk.back", message: "Back" }),
              onClick: onBack,
              testId: "open-walk-back",
            },
          }
        : {}),
      forward: {
        label: t({ id: "openWalk.continue", message: "Continue" }),
        onClick: onContinue,
        testId: "open-walk-continue",
      },
    }),
    [onBack, onContinue, t],
  );
  usePublishStepNav(navSpec);
  return null;
}
