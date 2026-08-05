// Inheritance-posture confirmation step (spec 038 US2; contract §2).
//
// The ONE new engine render surface this feature adds. Renders the per-facet
// keep/propose/discard posture (from buildPosture) as §3c editable confirmations
// — a radio group per governed facet plus a provenance chip naming the evidence
// that prefilled it. One answer here governs MANY downstream proposal sites for
// that facet (the en-masse lever, FR-005).
//
// Follows the Prefill.tsx component pattern (dark palette, provenance chip, back/
// confirm buttons). Every resolution is recorded via recordConfirmation (FR-007 /
// SC-006): confirmed when the author kept the default posture, overridden when
// they changed it. An individual proposal-site override elsewhere stays LOCAL and
// does not mutate the PostureEntry (posture.ts guarantees this) — this step
// records only the governing posture decision.

import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { InheritancePosture, PostureEntry, PostureFacet } from "./posture.ts";
import { recordConfirmation } from "./confirmationEvents.ts";
import type { AdaptationEvidence } from "./evidence.ts";
import { secondaryButton, primaryButton } from "../survey/surveyStyles.ts";

/**
 * The catalog/survey question id each governed facet resolves. The `script`
 * facet is owned by the US1 script-alignment confirmations (Prefill rows), so the
 * posture step governs only the three inheritance-posture facets.
 */
const FACET_TO_QUESTION: Partial<Record<PostureFacet, string>> = {
  "input-strategies": "q_ip1_keep_strategies",
  "device-targets": "q_ip2_keep_device_targets",
  "script-conventions": "q_ip3_keep_script_conventions",
};

const FACET_TO_SESSION_FACET: Partial<Record<PostureFacet, string>> = {
  "input-strategies": "lineage.strategy-fingerprint",
  "device-targets": "env.device-mix",
  "script-conventions": "community.input-conventions",
};

// Module-scope label maps — lazy msg descriptors resolved per-render via
// useLingui().t (no useLingui binding exists at module scope).
const FACET_LABELS: Record<PostureFacet, MessageDescriptor> = {
  script: msg({ id: "adaptation.posture.facet.script", message: "Script" }),
  "input-strategies": msg({
    id: "adaptation.posture.facet.inputStrategies",
    message: "Input strategies",
  }),
  "device-targets": msg({
    id: "adaptation.posture.facet.deviceTargets",
    message: "Device targets",
  }),
  "script-conventions": msg({
    id: "adaptation.posture.facet.scriptConventions",
    message: "Script conventions",
  }),
};

const POSTURE_LABELS: Record<PostureEntry["posture"], MessageDescriptor> = {
  keep: msg({ id: "adaptation.posture.option.keep", message: "Keep the base's" }),
  propose: msg({ id: "adaptation.posture.option.propose", message: "Let the studio re-propose" }),
  discard: msg({ id: "adaptation.posture.option.discard", message: "Discard" }),
};

/** The entries this step governs (script alignment is US1's Prefill rows). */
export function governedEntries(posture: InheritancePosture): PostureEntry[] {
  return posture.entries.filter((e) => FACET_TO_QUESTION[e.facet] !== undefined);
}

export interface InheritancePostureStepProps {
  posture: InheritancePosture;
  provenanceTier: AdaptationEvidence["provenanceTier"];
  onConfirm: (resolved: InheritancePosture) => void;
  onBack?: () => void;
}

export function InheritancePostureStep({
  posture,
  provenanceTier,
  onConfirm,
  onBack,
}: InheritancePostureStepProps) {
  const { t } = useLingui();
  const governed = governedEntries(posture);
  const [choices, setChoices] = useState<Record<string, PostureEntry["posture"]>>(() =>
    Object.fromEntries(governed.map((e) => [e.facet, e.posture])),
  );

  // Mid-session base switch: a re-rendered step with a new posture prop must
  // not record stale choices seeded from the previous base's entries.
  useEffect(() => {
    setChoices(Object.fromEntries(governed.map((e) => [e.facet, e.posture])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture.baseId]);

  function confirm() {
    // Record exactly one event per governed facet (FR-007 / SC-006). The default
    // posture is the prefilled value; the author's choice is the final value.
    const resolvedEntries: PostureEntry[] = posture.entries.map((entry) => {
      const questionId = FACET_TO_QUESTION[entry.facet];
      if (questionId === undefined) return entry; // script — owned by US1
      const finalPosture = choices[entry.facet] ?? entry.posture;
      const action = finalPosture === entry.posture ? "confirmed" : "overridden";
      const sessionFacet = FACET_TO_SESSION_FACET[entry.facet];
      recordConfirmation({
        questionId,
        facetIds: sessionFacet !== undefined ? [sessionFacet] : [],
        prefilledValue: entry.posture,
        finalValue: finalPosture,
        action,
        provenanceTier,
      });
      return {
        ...entry,
        posture: finalPosture,
        source: action === "confirmed" ? "confirmed" : "overridden",
      };
    });
    onConfirm({ baseId: posture.baseId, entries: resolvedEntries });
  }

  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        <Trans id="adaptation.posture.heading">Carry forward from your starting keyboard</Trans>
      </h2>
      <p style={{ margin: "0 0 20px 0", fontSize: 13, color: "#8b949e" }}>
        <Trans id="adaptation.posture.intro">
          Each choice below governs every related proposal at once. Confirm the
          defaults, or change any of them — nothing is applied silently, and you can
          still override any individual proposal later.
        </Trans>
      </p>

      <div style={{ display: "grid", gap: 16, margin: "0 0 20px 0" }}>
        {governed.map((entry) => (
          <fieldset
            key={entry.facet}
            style={{ border: "1px solid #30363d", borderRadius: 6, padding: "10px 12px", margin: 0 }}
          >
            <legend style={{ fontSize: 13, color: "#e6edf3", padding: "0 6px" }}>
              {t(FACET_LABELS[entry.facet])}
            </legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {(["keep", "propose", "discard"] as const).map((p) => (
                <label
                  key={p}
                  style={{ fontSize: 13, color: "#c9d1d9", display: "flex", gap: 6, alignItems: "center" }}
                >
                  <input
                    type="radio"
                    name={`posture-${entry.facet}`}
                    value={p}
                    data-testid={`posture-${entry.facet}-${p}`}
                    checked={(choices[entry.facet] ?? entry.posture) === p}
                    onChange={() => setChoices((c) => ({ ...c, [entry.facet]: p }))}
                  />
                  {t(POSTURE_LABELS[p])}
                </label>
              ))}
            </div>
            <p style={{ margin: "8px 0 0 0", fontSize: 11, color: "#6e7681" }}>
              {entry.provenance} ({provenanceTier})
            </p>
          </fieldset>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button type="button" data-testid="posture-back" onClick={onBack} style={secondaryButton}>
            <Trans id="adaptation.posture.backButton">← Back</Trans>
          </button>
        )}
        <button
          type="button"
          data-testid="posture-confirm"
          onClick={confirm}
          style={primaryButton(false)}
        >
          <Trans id="adaptation.posture.confirmButton">Confirm and continue</Trans>
        </button>
      </div>
    </div>
  );
}
