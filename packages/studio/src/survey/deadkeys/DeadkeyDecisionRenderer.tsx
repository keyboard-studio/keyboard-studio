// DeadkeyDecisionRenderer — the deadkeys-defined module's renderer
// (spec 090 T033): the deadkey lifecycle surface under the decision
// host. The surface edits the working copy directly (its own commit
// path — editors/deadkey); on completion the current op log leaves
// through onChange as the decision value. Lives in the survey feature
// home because gallery modules may import only survey/** and packages.

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { DeadkeysDefinedValue } from "./deadkeyOps.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { DeadkeySurface } from "../../editors/deadkey/DeadkeySurface.tsx";

export function DeadkeyDecisionRenderer({
  onChange,
}: DecisionRendererProps<DeadkeysDefinedValue>) {
  return (
    <DeadkeySurface
      onComplete={() =>
        onChange({ ops: [...useWorkingCopyStore.getState().deadkeyOverlay.ops] })
      }
    />
  );
}
