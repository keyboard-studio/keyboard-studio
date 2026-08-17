// facet-transform migration — context-tolerance (spec 062, US1 + US3).
//
// Design note (carried forward from tasks.md T009, deliberately resolved
// here rather than left implicit): every other migration in this registry
// is a static singleton keyed by id, because its `apply()` needs nothing
// beyond `workingCopyIr` — it derives everything synchronously from the IR
// itself. Context tolerance cannot: proposing a fix requires the
// behavioural both-forms simulator comparison (`context-tolerance.ts`,
// `context-variants.ts`), which compiles the keyboard through the real
// WASM kmc-kmn pipeline and is therefore async — and `MigrationRule.apply()`
// is a synchronous, copy-return function by contract (every other rule
// depends on that synchrony). Rather than making `apply()` async for every
// migration to accommodate this one case, the async proposal step
// (`proposeContextVariants`) runs BEFORE a `MigrationRule` is even
// constructed: `createContextToleranceMigrationRule(result)` closes over
// the already-computed `ContextVariantsResult` and returns a rule whose
// `apply()` is a pure, synchronous filter over that precomputed data,
// scoped to `acceptedSiteIds` (FR-012 partial acceptance) — no live compile
// or simulate() call happens inside `apply()` itself. This is why the
// export here is a factory, not a singleton, and why it is intentionally
// NOT added to `MIGRATION_RULES` in `./index.ts`: the caller (studio's
// `useFacetTransform.ts`, spec 062 US3) must call `proposeContextVariants`
// itself first and construct the rule from its result.
//
// US3 note: `createContextToleranceMigrationRule`'s second parameter
// (`writeBackPolicy`, default `"echo"` per FR-007) needs nothing async
// either — it only chooses between two already-known byte strings per
// variant (`ContextVariant.precomposedOutput` and that string's NFD form),
// so it stays a plain argument on the same synchronous factory rather than
// a second async step.

import type { ContextVariant, DiscoveryAxisVector, IRGroup, IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import type { MigrationRule, RewriteResult, SiteLedgerEntry, SourceFacetMeasurement, TransformPreview } from "../types.js";
import {
  charsToOutput,
  GENERATED_MARKER_PREFIX,
  type ContextVariantsResult,
} from "../../pattern-apply/context-variants.js";

export const CONTEXT_TOLERANCE_RULE_ID = "context-tolerance";
export const CONTEXT_TOLERANCE_FACET_ID = "context-tolerance";

/**
 * FR-007's write-back setting. Mirrors `DiscoveryAxisVector.contextToleranceWriteBack`
 * with the "absent behaves as echo" default made explicit at the type level —
 * every call site here has already resolved the setting to one of the two.
 */
export type ContextToleranceWriteBackPolicy = NonNullable<DiscoveryAxisVector["contextToleranceWriteBack"]>;

const DEFAULT_WRITE_BACK_POLICY: ContextToleranceWriteBackPolicy = "echo";

/**
 * The output bytes a generated rule should carry under `policy`, given its
 * variant's own-form bytes (`ContextVariant.precomposedOutput`, unchanged
 * since before US3 — see context-variants.ts's module doc). "echo" (FR-007's
 * actual default) is this same string's canonical-equivalence-preserving NFD
 * form, computed here rather than baked so Story 1's tests (which call
 * `proposeContextVariants` directly, never through this factory) keep
 * exercising generator mechanics independent of the write-back setting.
 *
 * Takes the byte string directly, not the `ContextVariant`, so its type
 * signature can't even express calling it on a backspace-unwrap variant
 * (whose `precomposedOutput` is `undefined` — every call site below
 * resolves it to a definite string before reaching here).
 */
function outputFor(precomposedOutput: string, policy: ContextToleranceWriteBackPolicy): string {
  return policy === "own-form" ? precomposedOutput : precomposedOutput.normalize("NFD");
}

function rewriteOutputIfNeeded(rule: IRRule, variant: ContextVariant, policy: ContextToleranceWriteBackPolicy): IRRule {
  if (policy === "own-form") return rule; // baked bytes already are the own-form bytes.
  // FR-007's echo/own-form choice only applies to a generated diacritic
  // rule. Story 4's backspace-unwrap rules (spec 062 US4, context-
  // variants.ts's `addBackspaceUnwrap`) have no write-back setting of their
  // own — `precomposedOutput` is `undefined` for them — and must never be
  // rewritten here.
  if (variant.precomposedOutput === undefined) return rule;
  return { ...rule, output: charsToOutput(outputFor(variant.precomposedOutput, policy)) };
}

/**
 * Build a `MigrationRule` from an already-computed `proposeContextVariants`
 * result. `apply()` never re-derives anything from `workingCopyIr` — it
 * assumes `workingCopyIr` IS (or is unchanged since) the IR the proposal was
 * computed against, and simply includes or excludes each source rule's
 * generated fix rules by `acceptedSiteIds` (siteId === `ContextVariant.sourceRuleId`),
 * rewriting each accepted rule's output bytes to match `writeBackPolicy`
 * (default `"echo"`, FR-007) without recompiling — see `outputFor()` above.
 */
export function createContextToleranceMigrationRule(
  result: ContextVariantsResult,
  writeBackPolicy: ContextToleranceWriteBackPolicy = DEFAULT_WRITE_BACK_POLICY,
): MigrationRule {
  return {
    id: CONTEXT_TOLERANCE_RULE_ID,
    facetId: CONTEXT_TOLERANCE_FACET_ID,
    hasCompanionRewrites: false,
    derivesParameters: false,

    apply(
      _workingCopyIr: KeyboardIR,
      acceptedSiteIds: string[],
      _measurement: SourceFacetMeasurement,
    ): RewriteResult {
      const accepted = new Set(acceptedSiteIds);
      const ledger: SiteLedgerEntry[] = result.variants.map((v) => ({
        siteId: v.sourceRuleId,
        outcome: accepted.has(v.sourceRuleId) ? "applied" : "skipped",
      }));

      const variantByMarker = new Map(result.variants.map((v) => [v.generatedMarker, v] as const));
      const acceptedMarkers = new Set(
        result.variants.filter((v) => accepted.has(v.sourceRuleId)).map((v) => v.generatedMarker),
      );

      // Drop the generated rules whose source rule was declined (no-op when
      // every site is accepted), keeping every rule the codec never touched
      // in the first place, and rewrite each surviving generated rule's
      // output bytes to match `writeBackPolicy`.
      const groups: IRGroup[] = result.ir.groups.map((g) => ({
        ...g,
        rules: g.rules
          .filter((r) => !r.nodeId.startsWith(GENERATED_MARKER_PREFIX) || acceptedMarkers.has(r.nodeId))
          .map((r) => {
            const variant = variantByMarker.get(r.nodeId);
            return variant === undefined ? r : rewriteOutputIfNeeded(r, variant, writeBackPolicy);
          }),
      }));

      return { candidateIr: { ...result.ir, groups }, ledger };
    },
  };
}

/**
 * FR-008 — the consequence-disclosure preview for `"own-form"`: one
 * `outputDiff` row per accepted rewrite whose own-form bytes actually differ
 * from its echo bytes (a rewrite that would be a no-op is not disclosed as
 * one). Returns `undefined` for `"echo"` (nothing is rewritten) or when no
 * accepted variant's bytes differ. Reuses `TransformPreview`'s existing
 * `"output-diff"` shape (`FacetTransformPanel.tsx`'s existing branch renders
 * it unchanged) — no new `PreviewKind` variant is needed.
 */
export function buildContextToleranceOutputDiffPreview(
  result: ContextVariantsResult,
  acceptedSiteIds: string[],
  writeBackPolicy: ContextToleranceWriteBackPolicy,
): TransformPreview | undefined {
  if (writeBackPolicy !== "own-form") return undefined;
  const accepted = new Set(acceptedSiteIds);
  const outputDiff = result.variants
    // The backspace-unwrap variants (spec 062 US4) have no write-back
    // setting of their own — `precomposedOutput` is `undefined` for them
    // (see `ContextVariant`'s doc), which this filter uses as the type-safe
    // signal to exclude them, rather than relying on a naming convention.
    .filter((v): v is ContextVariant & { precomposedOutput: string } => v.precomposedOutput !== undefined)
    .filter((v) => accepted.has(v.sourceRuleId))
    .map((v) => ({ before: outputFor(v.precomposedOutput, "echo"), after: outputFor(v.precomposedOutput, "own-form") }))
    .filter((row) => row.before !== row.after);
  return outputDiff.length === 0 ? undefined : { previewKind: "output-diff", outputDiff };
}
