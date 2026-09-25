// ContextToleranceStation — the marks series' context-tolerance decision point
// (spec 078 US2/US3, contracts/marks-context-tolerance-station.md).
//
// Propose-then-confirm: every fixable rule is pre-ticked, previewed in the spec
// 039 FacetTransformPanel (its first production mount) with the per-site
// disclosures FR-006 requires. The station's only output is the DECISION —
// accept, partial (with site ids) or decline. It never touches the working
// copy; hooks/useContextToleranceApply.ts applies an accepted decision.
//
// A prior decision whose fingerprint still matches is shown read-only with a
// "change" control instead of being proposed again (FR-009).

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { MarksContextToleranceDecision } from "@keyboard-studio/contracts";
import type { TransformProposal } from "@keyboard-studio/engine";

import { FacetTransformPanel } from "../../components/facet-transform/FacetTransformPanel.tsx";
import { mutedParaFlush } from "../surveyStyles.ts";

/** What FR-006 discloses for one site (engine `VariantDisclosure`, aggregated per rule). */
export interface SiteDisclosure {
  shadows: { ruleId: string; relation: "shadows" | "shadowed-by"; fallback: boolean }[];
  unobservable?: "mnemonic-backspace";
  markOrderNote?: string;
}

export type ContextToleranceDecisionInput = Omit<MarksContextToleranceDecision, "appliedFingerprint">;

export interface ContextToleranceStationProps {
  /** Built from the analysis; every site accepted. */
  proposal: TransformProposal;
  /** Keyed by site id (the source rule id). */
  disclosures: Record<string, SiteDisclosure>;
  /** Rule id → its source line, for naming shadowed rules. */
  ruleLines: Record<string, number>;
  fingerprint: string;
  prior?: MarksContextToleranceDecision;
  onDecide: (decision: ContextToleranceDecisionInput) => void;
}

/** Map the panel's confirmed dispositions onto the decision shape. */
export function decisionFromProposal(confirmed: TransformProposal, fingerprint: string): ContextToleranceDecisionInput {
  const proposedSiteIds = confirmed.affectedSites.map((s) => s.siteId);
  const acceptedSiteIds = confirmed.affectedSites.filter((s) => s.userDisposition === "accepted").map((s) => s.siteId);
  const decision =
    acceptedSiteIds.length === proposedSiteIds.length ? "accept" : acceptedSiteIds.length === 0 ? "decline" : "partial";
  return { decision, acceptedSiteIds, proposedSiteIds, fingerprint };
}

function DisclosureRows({
  proposal,
  disclosures,
  ruleLines,
}: Pick<ContextToleranceStationProps, "proposal" | "disclosures" | "ruleLines">) {
  const { t } = useLingui();
  const rows = proposal.affectedSites.flatMap((site) => {
    const d = disclosures[site.siteId];
    if (d === undefined) return [];
    const items: { key: string; text: string }[] = [];
    for (const s of d.shadows) {
      const line = ruleLines[s.ruleId] ?? 0;
      items.push({
        key: `${site.siteId}-${s.ruleId}-${s.relation}`,
        text:
          s.relation === "shadows"
            ? t({
                id: "marks.contextTolerance.disclosure.shadows",
                message: `${site.framing ?? site.siteId}: the added rules take priority over the rule on line ${line}.`,
              })
            : t({
                id: "marks.contextTolerance.disclosure.shadowedBy",
                message: `${site.framing ?? site.siteId}: the rule on line ${line} still takes priority over the added rules.`,
              }),
      });
    }
    if (d.unobservable === "mnemonic-backspace") {
      items.push({
        key: `${site.siteId}-mnemonic`,
        text: t({
          id: "marks.contextTolerance.disclosure.mnemonic",
          message: `${site.framing ?? site.siteId}: what Backspace does here cannot be demonstrated in the preview, because this keyboard follows the typist's own layout.`,
        }),
      });
    }
    if (d.markOrderNote !== undefined) {
      const note = d.markOrderNote;
      items.push({
        key: `${site.siteId}-order`,
        text: t({
          id: "marks.contextTolerance.disclosure.markOrder",
          message: `${site.framing ?? site.siteId}: ${note}`,
        }),
      });
    }
    return items;
  });
  if (rows.length === 0) return null;
  return (
    <ul data-testid="context-tolerance-disclosures" style={{ margin: "8px 0", paddingLeft: 18 }}>
      {rows.map((r) => (
        <li key={r.key} style={{ fontSize: 13, lineHeight: 1.5 }}>
          {r.text}
        </li>
      ))}
    </ul>
  );
}

export function ContextToleranceStation({
  proposal,
  disclosures,
  ruleLines,
  fingerprint,
  prior,
  onDecide,
}: ContextToleranceStationProps) {
  const { t } = useLingui();
  const priorStillValid = prior !== undefined && prior.fingerprint === fingerprint;
  const [changing, setChanging] = useState(false);
  const siteCount = proposal.affectedSites.length;

  if (priorStillValid && !changing) {
    const accepted = prior.acceptedSiteIds.length;
    return (
      <div data-testid="context-tolerance-station" data-prior={prior.decision} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0 }}>
          <Trans id="marks.contextTolerance.station.heading">Accents typed as separate characters</Trans>
        </h3>
        <p style={mutedParaFlush}>
          {prior.decision === "accept"
            ? t({
                id: "marks.contextTolerance.station.prior.accepted",
                message: plural(accepted, {
                  one: "You chose to fix # rule so it also works when the letter and its accent are separate characters.",
                  other: "You chose to fix # rules so they also work when the letter and its accent are separate characters.",
                }),
              })
            : prior.decision === "partial"
              ? t({
                  id: "marks.contextTolerance.station.prior.partial",
                  message: plural(accepted, {
                    one: "You chose to fix # of the proposed rules.",
                    other: "You chose to fix # of the proposed rules.",
                  }),
                })
              : t({
                  id: "marks.contextTolerance.station.prior.declined",
                  message: "You chose to leave your keyboard as it is.",
                })}
        </p>
        <button type="button" data-testid="context-tolerance-change" onClick={() => setChanging(true)} style={{ alignSelf: "flex-start" }}>
          <Trans id="marks.contextTolerance.station.prior.change">Change this decision</Trans>
        </button>
      </div>
    );
  }

  return (
    <div data-testid="context-tolerance-station" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <FacetTransformPanel
        proposal={proposal}
        heading={
          <>
            <h3 style={{ margin: 0 }}>
              <Trans id="marks.contextTolerance.station.heading">Accents typed as separate characters</Trans>
            </h3>
            <p style={mutedParaFlush}>
              {t({
                id: "marks.contextTolerance.station.intro",
                message: plural(siteCount, {
                  one: "Some programs, such as FieldWorks, store a letter and its accent as two separate characters instead of one. # of your keyboard's rules only works when the accent is already joined to the letter. The tool can add rules so it works both ways. Typing with joined accents stays exactly as it is.",
                  other: "Some programs, such as FieldWorks, store a letter and its accent as two separate characters instead of one. # of your keyboard's rules only work when the accent is already joined to the letter. The tool can add rules so they work both ways. Typing with joined accents stays exactly as it is.",
                }),
              })}
            </p>
          </>
        }
        confirmLabel={<Trans id="marks.contextTolerance.station.confirm">Add these rules</Trans>}
        cancelLabel={<Trans id="marks.contextTolerance.station.decline">Leave my keyboard as it is</Trans>}
        onConfirm={(confirmed) => onDecide(decisionFromProposal(confirmed, fingerprint))}
        onCancel={() =>
          onDecide({
            decision: "decline",
            acceptedSiteIds: [],
            proposedSiteIds: proposal.affectedSites.map((s) => s.siteId),
            fingerprint,
          })
        }
      >
        <DisclosureRows proposal={proposal} disclosures={disclosures} ruleLines={ruleLines} />
      </FacetTransformPanel>
    </div>
  );
}
