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

  const { transitionId, preview } = proposal;

  return (
    <section className="facet-transform-panel" aria-label="Facet transform proposal">
      <header>
        <h3>
          Switch {transitionId.facetId}: {transitionId.fromValue} → {transitionId.toValue}
        </h3>
        <p className="impact-class">Impact: {proposal.transformImpactClass}</p>
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
          <p className="assurance">Behaviour is unchanged and this transform is reversible.</p>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Before</th>
                <th>After</th>
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
                    <th>Site</th>
                    <th>Derived</th>
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
          <p className="warning">Emitted output will change — review the diff before confirming.</p>
          <table>
            <thead>
              <tr>
                <th>Before</th>
                <th>After</th>
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
          <legend>Exception sites</legend>
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
                  ? "Convert this site too"
                  : "Apply this fix"}
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
              Left untouched: {o.feature} ({o.count})
            </li>
          ))}
        </ul>
      )}

      {/* Fall-through produced-set delta (FR-011). */}
      {proposal.fallThroughImpact && (
        <p className="fall-through">
          Produced-character set changes: +{proposal.fallThroughImpact.producedCharacterSetDelta.added.length} / −
          {proposal.fallThroughImpact.producedCharacterSetDelta.removed.length}
        </p>
      )}

      <footer className="actions">
        <button type="button" onClick={handleConfirm}>
          Confirm and apply
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </section>
  );
}
