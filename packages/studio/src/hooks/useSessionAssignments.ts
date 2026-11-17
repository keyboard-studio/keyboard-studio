// useSessionAssignments -- the reactive form of `selectSessionAssignments`.

import { useMemo } from "react";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useOpenAssignStore } from "../stores/openAssignStore.ts";
import { selectSessionAssignments } from "../lib/sessionAssignments.ts";

export function useSessionAssignments(): MechanismAssignment[] {
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const session = useOpenAssignStore((s) => s.session);
  return useMemo(
    () => selectSessionAssignments({ phaseResults, startKeyboard }, session),
    [phaseResults, startKeyboard, session],
  );
}
