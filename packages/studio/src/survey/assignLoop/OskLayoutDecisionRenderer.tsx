// OskLayoutDecisionRenderer — gallery-host path for the osk-layout decision.

import type { OskContinueResult } from "@keyboard-studio/engine";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { OskEditor } from "../../editors/assignLoop/OskEditor.tsx";
import type { OskLayoutValue } from "./oskLayoutValue.ts";

export function OskLayoutDecisionRenderer({
  onChange,
}: DecisionRendererProps<OskLayoutValue>) {
  return (
    <OskEditor
      onBack={() => undefined}
      onComplete={(result) => {
        const payload = result as OskContinueResult | undefined;
        if (payload?.kvksXml !== undefined) {
          onChange({ kvksXml: payload.kvksXml });
        }
      }}
    />
  );
}
