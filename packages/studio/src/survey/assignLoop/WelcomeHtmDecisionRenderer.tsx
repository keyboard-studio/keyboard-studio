// WelcomeHtmDecisionRenderer — gallery-host path for the welcome-htm decision.
//
// Mirrors OskLayoutDecisionRenderer: the HtmlEditor is the renderer; its
// Continue payload becomes the recorded decision value.

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { HtmlEditor } from "../../editors/assignLoop/HtmlEditor.tsx";
import type { HtmlContinueResult } from "../../lib/htmlStepCompletion.ts";
import type { WelcomeHtmValue } from "./welcomeHtmValue.ts";

export function WelcomeHtmDecisionRenderer({
  onChange,
}: DecisionRendererProps<WelcomeHtmValue>) {
  return (
    <HtmlEditor
      onBack={() => undefined}
      onComplete={(result) => {
        const payload = result as HtmlContinueResult | undefined;
        if (payload === undefined) return;
        onChange({
          ...(payload.welcomeHtm !== undefined ? { html: payload.welcomeHtm } : {}),
          ...(payload.readmeHtm !== undefined ? { readmeHtm: payload.readmeHtm } : {}),
          ...(payload.readmeMd !== undefined ? { readmeMd: payload.readmeMd } : {}),
          ...(payload.helpPhp !== undefined ? { helpPhp: payload.helpPhp } : {}),
        });
      }}
    />
  );
}
