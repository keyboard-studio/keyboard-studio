// OSK step: record osk-layout from generated kvks, mirroring OskEditorAdapter.

import { generateKvksFromIR, oskContinueResult } from "@keyboard-studio/engine";
import { completeOskStep } from "../../../lib/oskStepCompletion.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import type { StepDrivers } from "./types.ts";

export const oskDrivers: StepDrivers = {
  osk: () => {
    const ir = useWorkingCopyStore.getState().ir;
    if (ir !== null) {
      const kvks = generateKvksFromIR(ir, ir.header.name ?? "keyboard");
      completeOskStep(oskContinueResult(kvks));
    }
    return undefined;
  },
};
