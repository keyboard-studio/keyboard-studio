// Fallback policy step: record decision from store, mirroring FallbackPolicyAdapter.

import { completeFallbackPolicyStep } from "../../../lib/fallbackPolicyStepCompletion.ts";
import type { StepDrivers } from "./types.ts";

export const fallbackPolicyDrivers: StepDrivers = {
  fallback_policy: () => {
    completeFallbackPolicyStep();
    return undefined;
  },
};
