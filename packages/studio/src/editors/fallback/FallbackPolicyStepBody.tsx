// FallbackPolicyStepBody — shared document for the fallback-policy editor step (issue #2539).

import { Trans } from "@lingui/react/macro";
import { FullStepPage } from "../../components/FullStepPage.tsx";
import { FallbackPolicySection } from "./FallbackPolicySection.tsx";

export function FallbackPolicyStepBody() {
  return (
    <FullStepPage testId="fallback-policy-step">
      <h1 style={{ font: "600 18px var(--app-font)", margin: "0 0 12px" }}>
        <Trans id="editor.fallbackPolicy.title">Keys your keyboard doesn’t define</Trans>
      </h1>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--app-text-muted)", margin: "0 0 20px", maxWidth: 720 }}>
        <Trans id="editor.fallbackPolicy.lead">
          Your keyboard only defines some keys. For every other physical key, should the typist’s own computer layout (the
          base keyboard) be allowed to type its character, or should the key be blocked?
        </Trans>
      </p>
      <FallbackPolicySection variant="full" />
    </FullStepPage>
  );
}
