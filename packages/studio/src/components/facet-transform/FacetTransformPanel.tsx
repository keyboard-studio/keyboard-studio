// FacetTransformPanel — the propose-then-confirm UI for spec 039 (T019/T026/T031).
//
// Renders a TransformProposal's preview by `previewKind`:
//   - source-diff (behavior-preserving): per-role before/after + a "behaviour
//     unchanged" assurance + invertibility note + provenance chip (non-default only).
//   - ux-description (ux-changing): the UX prose, every namedLoss, the derived
//     flick-direction review table, and per-site disposition controls.
//   - output-diff (output-changing): the emitted-byte diff + companion rewrites,
//     behind an explicit confirmation.
//
// No transform is silent (FR-002): commit fires only from the explicit Confirm
// button, and the parent wires it to `useFacetTransform().commit`.

import { useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { TransformProposal, UserDisposition } from "@keyboard-studio/engine";

export interface FacetTransformPanelProps {
  proposal: TransformProposal;
  /** Called with the (possibly disposition-edited) proposal on explicit confirm. */
  onConfirm: (proposal: TransformProposal) => void;
  onCancel: () => void;
}

export function FacetTransformPanel({
  proposal,
  onConfirm,
  onCancel,
}: FacetTransformPanelProps): JSX.Element {
  // Local per-site disposition state (partial acceptance, FR-012).
  const [dispositions, setDispositions] = useState<Record<string, UserDisposition>>(
    () => Object.fromEntries(proposal.affectedSites.map((s) => [s.siteId, s.userDisposition])),
  );

  const setDisposition = (siteId: string, value: UserDisposition): void =>
    setDispositions((prev) => ({ ...prev, [siteId]: value }));

  const handleConfirm = (): void => {
    onConfirm({
      ...proposal,
      affectedSites: proposal.affectedSites.map((s) => ({
        ...s,
        userDisposition: dispositions[s.siteId] ?? s.userDisposition,
      })),
      status: "accepted",
    });
  };

  const { t } = useLingui();
  const { transitionId, preview } = proposal;
  const { facetId, fromValue, toValue } = transitionId;
  const impactClass = proposal.transformImpactClass;

  return (
    <section
      className="facet-transform-panel"
      aria-label={t({ id: "facetTransform.ariaLabel", message: "Facet transform proposal" })}
    >
      <header>
        <h3>
          <Trans id="facetTransform.heading">
            Switch {facetId}: {fromValue} → {toValue}
          </Trans>
        </h3>
        <p className="impact-class">
          <Trans id="facetTransform.impact">Impact: {impactClass}</Trans>
        </p>
      </header>

      {/* Provenance chip — rendered ONLY when a non-default house target fired. */}
      {proposal.houseTargetProvenance && (
        <p className="provenance-chip" data-testid="house-target-provenance">
          {proposal.houseTargetProvenance.explanation}
        </p>
      )}

      {/* Implications (FR-006). */}
      {proposal.implications.length > 0 && (
        <ul className="implications">
          {proposal.implications.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      {/* Preview by class. */}
      {preview.previewKind === "source-diff" && preview.sourceDiff && (
        <div className="preview source-diff">
          <p className="assurance">
            <Trans id="facetTransform.assurance">
              Behaviour is unchanged and this transform is reversible.
            </Trans>
          </p>
          <table>
            <thead>
              <tr>
                <th><Trans id="facetTransform.table.role">Role</Trans></th>
                <th><Trans id="facetTransform.table.before">Before</Trans></th>
                <th><Trans id="facetTransform.table.after">After</Trans></th>
              </tr>
            </thead>
            <tbody>
              {preview.sourceDiff.map((row, i) => (
                <tr key={i}>
                  <td>{row.role}</td>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview.previewKind === "ux-description" && (
        <div className="preview ux-description">
          <p>{preview.uxDescription}</p>
          {proposal.namedLosses.length > 0 && (
            <ul className="named-losses">
              {proposal.namedLosses.map((loss, i) => (
                <li key={i}>{loss}</li>
              ))}
            </ul>
          )}
          {proposal.derivedParameterReview && (
            <div className="derived-review">
              <p>{proposal.derivedParameterReview.note}</p>
              <table>
                <thead>
                  <tr>
                    <th><Trans id="facetTransform.table.site">Site</Trans></th>
                    <th><Trans id="facetTransform.table.derived">Derived</Trans></th>
                  </tr>
                </thead>
                <tbody>
                  {proposal.derivedParameterReview.rows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.label}</td>
                      <td>{row.derivedValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {preview.previewKind === "output-diff" && preview.outputDiff && (
        <div className="preview output-diff">
          <p className="warning">
            <Trans id="facetTransform.outputWarning">
              Emitted output will change — review the diff before confirming.
            </Trans>
          </p>
          <table>
            <thead>
              <tr>
                <th><Trans id="facetTransform.table.before">Before</Trans></th>
                <th><Trans id="facetTransform.table.after">After</Trans></th>
              </tr>
            </thead>
            <tbody>
              {preview.outputDiff.map((row, i) => (
                <tr key={i}>
                  <td>{row.before}</td>
                  <td>{row.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Companion rewrites (FR-008). */}
      {proposal.companionRewrites && proposal.companionRewrites.length > 0 && (
        <ul className="companion-rewrites">
          {proposal.companionRewrites.map((c, i) => (
            <li key={i}>{c.description}</li>
          ))}
        </ul>
      )}

      {/* Per-site disposition controls (FR-005 / FR-012). */}
      {proposal.affectedSites.length > 0 && (
        <fieldset className="affected-sites">
          <legend><Trans id="facetTransform.exceptionSites">Exception sites</Trans></legend>
          {proposal.affectedSites.map((site) => (
            <div key={site.siteId} className="site-row">
              <span className="site-framing">{site.framing ?? site.siteId}</span>
              <label>
                <input
                  type="checkbox"
                  checked={dispositions[site.siteId] === "accepted"}
                  onChange={(e) =>
                    setDisposition(site.siteId, e.target.checked ? "accepted" : "pending")
                  }
                />
                {site.defaultDisposition === "preserve"
                  ? t({ id: "facetTransform.site.convertToo", message: "Convert this site too" })
                  : t({ id: "facetTransform.site.applyFix", message: "Apply this fix" })}
              </label>
            </div>
          ))}
        </fieldset>
      )}

      {/* Opaque regions the transform could not model (FR-009). */}
      {proposal.opaqueUntouched && proposal.opaqueUntouched.length > 0 && (
        <ul className="opaque-untouched">
          {proposal.opaqueUntouched.map((o, i) => (
            <li key={i}>
              <Trans id="facetTransform.opaqueUntouched">
                Left untouched: {o.feature} ({o.count})
              </Trans>
            </li>
          ))}
        </ul>
      )}

      {/* Fall-through produced-set delta (FR-011). */}
      {proposal.fallThroughImpact &&
        (() => {
          const added = proposal.fallThroughImpact.producedCharacterSetDelta.added.length;
          const removed = proposal.fallThroughImpact.producedCharacterSetDelta.removed.length;
          return (
            <p className="fall-through">
              <Trans id="facetTransform.fallThrough">
                Produced-character set changes: +{added} / −{removed}
              </Trans>
            </p>
          );
        })()}

      <footer className="actions">
        <button type="button" onClick={handleConfirm}>
          <Trans id="facetTransform.confirm">Confirm and apply</Trans>
        </button>
        <button type="button" onClick={onCancel}>
          <Trans id="facetTransform.cancel">Cancel</Trans>
        </button>
      </footer>
    </section>
  );
}
