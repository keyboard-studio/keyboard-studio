// facet-transform — proposeFacetTransform (spec 039, the propose/refuse surface).
//
// PURE (no mutation, no I/O): resolves the requested (facetId, toValue|preset)
// against the matrix, builds affected-site dispositions from cause tags, resolves
// the house-target policy for `preset: 'house-style'`, and assembles the preview.
// Returns a `TransformRefusal` (verbatim reason) for gate facets, `undetermined`/
// below-floor measurements, and declined-with-reason pairs — these NEVER reach a
// `proposed` state (FR-004, contract transform-proposal §Engine surface).

import type { KeyboardIR, OutputElement } from "@keyboard-studio/contracts";
import { buildProducedSet } from "@keyboard-studio/contracts";
import {
  DEFAULT_HOUSE_TARGET_POLICY,
  resolveHouseTarget,
} from "./house-target-policy.js";
import { composeOutputToNfc } from "./migrations/nfd-to-nfc.js";
import { renderSourceDiff } from "./migrations/encoding-spelling.js";
import { MIGRATION_RULES } from "./migrations/index.js";
import { opaqueInventory, producedSetDelta } from "./verify.js";
import {
  findTransition,
  GATE_FACETS,
  isGateFacet,
} from "./transition-matrix.js";
import type {
  AffectedSite,
  CauseTag,
  DefaultDisposition,
  HouseTargetPolicyRow,
  PreviewKind,
  SourceFacetMeasurement,
  TransformImpactClass,
  TransformPreview,
  TransformProposal,
  TransformRefusal,
  TransformRequest,
} from "./types.js";

// ---------------------------------------------------------------------------
// Options — injected content/config (keeps the 3-arg contract; D4/D5 discipline)
// ---------------------------------------------------------------------------

export interface ProposeOptions {
  /** Facet `implications` prose (content-authored; composed with namedLosses). */
  implicationsProse?: string[];
  /** House-target policy inputs (037 outputs, injected as fixtures — D4 guard). */
  houseTargetInputs?: { script?: string; displayDifficulty?: string };
  /** Override the house-target policy table (defaults to the built-in policy). */
  housePolicy?: readonly HouseTargetPolicyRow[];
}

// ---------------------------------------------------------------------------
// Cause-tag → default disposition (FR-005, transform-proposal contract)
// ---------------------------------------------------------------------------

const DISPOSITION_BY_CAUSE: Readonly<Record<CauseTag, DefaultDisposition>> = {
  "principled-split": "preserve",
  "capacity-forced": "consolidate-offered",
  "gap-omission": "fix-offered",
};

const FRAMING_BY_CAUSE: Readonly<Record<CauseTag, string>> = {
  "principled-split":
    "A deliberate design split — preserved by default; opt in to convert it.",
  "capacity-forced":
    "Forced onto another mechanism by capacity — offered as a consolidation (defaults to not consolidate).",
  "gap-omission": "This looks like an oversight — offered as a fix to add it.",
};

function previewKindFor(impact: TransformImpactClass): PreviewKind {
  if (impact === "behavior-preserving") return "source-diff";
  if (impact === "output-changing") return "output-diff";
  return "ux-description";
}

// ---------------------------------------------------------------------------
// Refusal helper
// ---------------------------------------------------------------------------

function refuse(
  facetId: string,
  requested: string,
  reason: string,
  refusalKind: TransformRefusal["refusalKind"],
): TransformRefusal {
  return { kind: "refusal", facetId, requested, reason, refusalKind };
}

// ---------------------------------------------------------------------------
// Output-diff helper (US3 preview)
// ---------------------------------------------------------------------------

function charsOf(output: OutputElement[]): string {
  return output.map((el) => (el.kind === "char" ? el.value : `«${el.kind}»`)).join("");
}

function buildOutputDiff(ir: KeyboardIR): Array<{ before: string; after: string }> {
  const rows: Array<{ before: string; after: string }> = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const { output, changed } = composeOutputToNfc(rule.output);
      if (changed) {
        rows.push({ before: charsOf(rule.output), after: charsOf(output) });
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// proposeFacetTransform
// ---------------------------------------------------------------------------

/**
 * Resolve a transform request into a {@link TransformProposal} (propose-then-
 * confirm) or a {@link TransformRefusal} (gate / undetermined / declined-with-
 * reason). Pure — never mutates `ir`.
 */
export function proposeFacetTransform(
  ir: KeyboardIR,
  measurement: SourceFacetMeasurement,
  request: TransformRequest,
  options: ProposeOptions = {},
): TransformProposal | TransformRefusal {
  const facetId = request.facetId;
  const requestedLabel = "preset" in request ? request.preset : request.toValue;

  // (1) Gate facets — refused upstream, never a matrix lookup (invariant #4).
  if (isGateFacet(facetId)) {
    return refuse(facetId, requestedLabel, GATE_FACETS.get(facetId)!, "gate");
  }

  // (2) Undetermined / below evidence floor — declines, never guesses.
  if (measurement.confidenceClass === "undetermined") {
    return refuse(
      facetId,
      requestedLabel,
      "The source facet for this base is undetermined (below the classifier's evidence floor) — the transform will not run blind.",
      "undetermined",
    );
  }

  // (3) Resolve fromValue / toValue.
  const fromValue = measurement.confidenceClass === "mixed" ? "mixed" : measurement.dominantValue;

  // `lookupTo` is what we search the matrix for; `displayTo` is the concrete
  // target shown to the user. For the house-style preset the matrix row is keyed
  // at `house-style` (invariant #5) while the policy resolves the concrete value.
  let lookupTo: string;
  let displayTo: string;
  let houseTargetResolution: TransformProposal["houseTargetProvenance"];
  if ("preset" in request) {
    const resolution = resolveHouseTarget(
      facetId,
      options.houseTargetInputs ?? {},
      options.housePolicy ?? DEFAULT_HOUSE_TARGET_POLICY,
    );
    lookupTo = "house-style";
    displayTo = resolution.target;
    // The provenance chip renders only when a non-default target fired (US1 AC1).
    if (!resolution.isDefault) houseTargetResolution = resolution;
  } else {
    lookupTo = request.toValue;
    displayTo = request.toValue;
  }

  // (4) Matrix lookup — prefer the exact (facetId, fromValue, lookupTo) row; for
  // house-style, fall back to the `mixed → house-style` row when the dominant-
  // value row is absent (invariant #5).
  let resolvedFrom = fromValue;
  let transition = findTransition(facetId, fromValue, lookupTo);
  if (transition === undefined && "preset" in request && fromValue !== "mixed") {
    const alt = findTransition(facetId, "mixed", lookupTo);
    if (alt !== undefined) {
      transition = alt;
      resolvedFrom = "mixed";
    }
  }

  if (transition === undefined) {
    return refuse(
      facetId,
      requestedLabel,
      `No transition is defined for ${facetId} ${fromValue} → ${displayTo}.`,
      "permanent",
    );
  }
  if (!transition.supported) {
    return refuse(
      facetId,
      requestedLabel,
      transition.declineReason ?? "This transition is not supported.",
      transition.declineKind === "gate" ? "gate" : transition.declineKind ?? "permanent",
    );
  }

  // (5) Build the proposal.
  const rule = MIGRATION_RULES[transition.migrationRuleId!]!;

  const affectedSites: AffectedSite[] = measurement.exceptionSites.map((site) => {
    const defaultDisposition = DISPOSITION_BY_CAUSE[site.causeTag];
    return {
      siteId: site.siteId,
      causeTag: site.causeTag,
      defaultDisposition,
      userDisposition: "pending",
      framing: FRAMING_BY_CAUSE[site.causeTag],
    };
  });

  // Preview-apply with the DEFAULT accepted set (no opt-ins yet) — dominant sites
  // apply unconditionally inside the migration. Pure copy-return, so this is safe
  // to run here and again at commit.
  const previewRewrite = rule.apply(ir, [], measurement);
  const candidate = previewRewrite.candidateIr;

  const previewKind = previewKindFor(transition.transformImpactClass);
  const preview: TransformPreview = { previewKind };
  if (previewKind === "source-diff") {
    const sample = [...buildProducedSet(ir)][0] ?? "a";
    preview.sourceDiff = renderSourceDiff(sample, resolvedFrom, displayTo);
  } else if (previewKind === "output-diff") {
    preview.outputDiff = buildOutputDiff(ir);
  } else {
    const dirNote = previewRewrite.derivedParameterReview
      ? " Flick directions are derived from sub-key order and shown for review."
      : "";
    preview.uxDescription =
      `Switching ${facetId} from ${resolvedFrom} to ${displayTo} changes the input UX; the emitted output is unchanged.` +
      dirNote;
  }

  const implications = [
    ...(options.implicationsProse ?? []),
    ...transition.namedLosses,
  ];

  const opaque = opaqueInventory(ir);
  const delta = producedSetDelta(ir, candidate);
  const producedSetChanged = delta.added.length > 0 || delta.removed.length > 0;

  return {
    kind: "proposal",
    transitionId: { facetId, fromValue: resolvedFrom, toValue: displayTo },
    transformImpactClass: transition.transformImpactClass,
    measurement,
    affectedSites,
    implications,
    previewKind,
    preview,
    ...(previewRewrite.derivedParameterReview
      ? { derivedParameterReview: previewRewrite.derivedParameterReview }
      : {}),
    ...(houseTargetResolution ? { houseTargetProvenance: houseTargetResolution } : {}),
    ...(producedSetChanged
      ? { fallThroughImpact: { producedCharacterSetDelta: delta } }
      : {}),
    ...(opaque.length > 0 ? { opaqueUntouched: opaque } : {}),
    status: "proposed",
    migrationRuleId: transition.migrationRuleId!,
    namedLosses: transition.namedLosses,
    ...(previewRewrite.companionRewrites
      ? { companionRewrites: previewRewrite.companionRewrites }
      : {}),
  };
}
