// Shared fixtures for the MarksSeriesStep.*.test.tsx files. Not a test file.

import { type ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

export const ACUTE = "́";

export function seedAlphabet(marks: string[], bases: string[] = ["e"]): void {
  useWorkingCopyStore.getState().recordPhase({
    phase: "B",
    answers: [],
    alphabet: {
      bases,
      marks,
      attestedStacks: marks.map((m) => ({ base: bases[0] ?? "e", marks: [m] })),
      declaredRoles: {},
    },
  });
}

export function seedFullAlphabet(alphabet: ConfirmedAlphabet): void {
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], alphabet });
}
