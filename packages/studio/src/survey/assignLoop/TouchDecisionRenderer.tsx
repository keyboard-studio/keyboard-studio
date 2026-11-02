// TouchDecisionRenderer — the touch-layout module's renderer
// (spec 090 T042): the touch gallery under the decision host. The
// gallery edits the key-edit overlay through its own store actions
// (editors/assignLoop — the ratified record-from-working-copy
// precedent, D-090-31); on completion the overlay snapshot leaves
// through onChange as the decision value. Lives in the survey
// feature home because gallery modules may import only survey/**
// and packages (the CarveDecisionRenderer precedent).
//
// The store reads below mirror AddTouchAdapter's (the live manifest
// path): the gallery self-sources its working state; the renderer
// supplies only the placement priors. TouchGallery requires an
// onBack prop (its re-entry path to the touch_seed_source chooser,
// spec 035 R12) — the decision host owns navigation chrome, so the
// gallery's own Back is inert here, exactly the adapter's defensive
// fallback inverted: there, a missing onBack means a misconfigured
// manifest; here, host navigation supersedes the gallery's.

import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import type { TouchLayoutValue } from "./touchLayoutValue.ts";
import { currentTouchLayoutValue } from "./touchLayoutValue.ts";
import { usePlacementPriors } from "../../hooks/usePlacementPriors.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import { isLdmlLintCode } from "../../lint/ldmlFindings.ts";
import { LintSummary } from "../../lint/LintSummary.tsx";
import { TouchGallery } from "../../editors/assignLoop/TouchGallery.tsx";

export function TouchDecisionRenderer({
  onChange,
}: DecisionRendererProps<TouchLayoutValue>) {
  const placementMap = usePlacementPriors();
  // The LDML export notes this decision owns (spec 108 FR-015), grouped by code.
  const findings = (useValidatorFindings()["touch-layout"] ?? []).filter((f) => isLdmlLintCode(f.code));

  return (
    <>
      {findings.length > 0 && (
        <div data-testid="touch-layout-ldml-findings" style={{ padding: "0 12px 8px" }}>
          <LintSummary findings={findings} groupByCode />
        </div>
      )}
      <TouchGallery
        onComplete={() => onChange(currentTouchLayoutValue())}
        onBack={() => undefined}
        {...(placementMap ? { placementMap } : {})}
      />
    </>
  );
}
