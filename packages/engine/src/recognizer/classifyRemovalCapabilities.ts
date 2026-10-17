/**
 * classifyRemovalCapabilities -- one-shot removal-capability classifier.
 *
 * Runs after recognizePatterns() has annotated rules with ownedByPattern.
 * Returns a Map whose keying contract the studio depends on:
 *
 *   rule.nodeId         -> RemovalCapability  (every rule in every group)
 *   frag.nodeId         -> "not-removable:opaque"  (every RawKmnFragment)
 *   outputStore.nodeId  -> "removable:slot-fill"   (alias for any parallel-index
 *                          fan-out rule -- the S-02 deadkey body AND the bare
 *                          transliteration shape -- so slot tiles keyed by
 *                          "<outputStoreNodeId>#<i>" can resolve by stripping
 *                          the "#<i>" suffix)
 *
 * Classification decision order (first match wins, per km-strategy):
 *   1. not-removable:opaque           -- node is a RawKmnFragment (in ir.raw)
 *  1b. not-removable:opaque           -- rule contains a name-carrying deadkey
 *                                        element (#2238 guard, km-lead ruling:
 *                                        named-deadkey rules keep the posture
 *                                        they had as fragments until a separate
 *                                        consumer ruling reclassifies them).
 *                                        MUST precede the alias emission and
 *                                        Decision 2: the alias would otherwise
 *                                        leak "removable:slot-fill" for a named
 *                                        fan-out's output store, and ownership
 *                                        inheritance would override the posture.
 *   2. Inherit ownedByPattern         -- rule is co-owned by a recognizer cluster
 *                                        (e.g. S-02 trigger/fallback/escape rules);
 *                                        inherits the cluster's removal story via
 *                                        capabilityForStrategy(strategyId).
 *                                        WHY this precedes context-sensitive: a
 *                                        recognizer-claimed cluster member already has
 *                                        an authoritative removal verdict from the
 *                                        strategy that owns it. Applying the generic
 *                                        context heuristic after the fact would label
 *                                        one co-owned member (e.g. an escape/fallback
 *                                        rule with context.length===2) not-removable
 *                                        while its siblings are removable — a
 *                                        contradictory split within one cluster.
 *   3. removable:slot-fill            -- isBody() true (S-02 body rule with shape
 *                                        [dk(D), any(S)] + index(OUT,2)).
 *                                        Checked BEFORE context-sensitive because the
 *                                        body shape has context.length===2 but is a
 *                                        recognized S-02 form that MUST be slot-fill.
 *                                        Also emits an alias entry for the output-
 *                                        store nodeId (see alias note below).
 *  3b. removable:slot-fill            -- isParallelIndexFanOut() true and !isBody()
 *                                        Handles non-deadkey fan-out rules such as
 *                                        bare-any whole-layout transliteration:
 *                                        [any(K)] > index(U, 1).
 *                                        Checked BEFORE context-sensitive so that
 *                                        bare-any rules (context.length===1, offset===1)
 *                                        are correctly labeled removable:slot-fill
 *                                        rather than falling through to unknown.
 *                                        Also emits an alias entry for the output-store
 *                                        nodeId (see alias note below).
 *   4. not-removable:context-sensitive -- rule has prior context: context.length > 1
 *                                        or a context(N) element on the LHS.
 *                                        Covers S-03 and conservatively S-05/S-07/S-09.
 *   5. removable:simple               -- isS01() true (S-01 direct vkey->char rule).
 *   6. not-removable:unknown          -- catch-all (everything else).
 *
 * Alias note: the outputStore.nodeId -> "removable:slot-fill" alias is emitted
 * whenever isParallelIndexFanOut(rule) is true, regardless of whether the body's
 * label came from ownership (step 2) or the shape checks (steps 3/3b). This keeps
 * the alias contract intact for IRs where recognizePatterns() was not applied.
 * (fanShape is a strict superset of bodyShape, so the alias always fires for S-02
 * bodies too.) Since #2233 the alias ALSO fires for a rule with a single index()
 * output that is owned by an S-02 pattern: the generalised S-02 fan-out shapes
 * (codec `+` separator in the raw context, postfix prefix char) are invisible to
 * the raw-context fanShape check, and ownership is the authoritative signal.
 * Un-owned generalised shapes earn no alias — shape-based admission stays
 * exactly as conservative as before.
 *
 * Scope: walks ir.groups / ir.stores / ir.raw only.
 * Touch-layout (S-13) nodes are not classified and receive no map entry.
 */

import type { KeyboardIR, Pattern, ContextElement } from "@keyboard-studio/contracts";
import type { RemovalCapability } from "@keyboard-studio/contracts";
import { isNamedDeadkeyElement } from "@keyboard-studio/contracts";
import { isS01 } from "./rules/s01-simple-swap.js";
import { isBody } from "./rules/s02-deadkey-single-tap.js";
import { isParallelIndexFanOut } from "./rules/parallel-index-fanout.js";

/** Resolve the RemovalCapability for an owning pattern by strategyId. */
function capabilityForStrategy(strategyId: string | undefined): RemovalCapability {
  if (strategyId === "S-01") return "removable:simple";
  if (strategyId === "S-02") return "removable:slot-fill";
  // Other recognized strategies are not yet removable in v1.
  return "not-removable:unknown";
}

/** True if the rule's LHS carries any form of prior context (other than S-02 body). */
function isContextSensitive(rule: { context: ContextElement[] }): boolean {
  if (rule.context.length > 1) return true;
  return rule.context.some((el) => el.kind === "context");
}

/**
 * Classify every rule node in the IR and return a Map of nodeId -> RemovalCapability.
 *
 * @param ir  The KeyboardIR produced by parse() + recognizePatterns().
 * @returns   Classification map (see module-level keying contract above).
 */
export function classifyRemovalCapabilities(ir: KeyboardIR): Map<string, RemovalCapability> {
  const result = new Map<string, RemovalCapability>();

  // --- Decision 1: opaque fragments ---
  for (const frag of ir.raw) {
    result.set(frag.nodeId, "not-removable:opaque");
  }

  // Build a lookup: patternId -> Pattern (for ownedByPattern resolution).
  const patternById = new Map<string, Pattern>();
  for (const p of ir.recognizedPatterns) {
    patternById.set(p.id, p);
  }

  // --- Walk all groups ---
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Decision 1b (#2238 guard): a rule containing a name-carrying deadkey
      // element in context or output keeps the not-removable:opaque posture
      // it had when the codec represented it as a RawKmnFragment. This check
      // is FIRST in the loop — before the alias emission below and before
      // Decision 2 (ownership) — and depends on nothing but the element kind,
      // so no present or future shape predicate can leak a removable verdict
      // for a name-keyed rule.
      if (
        rule.context.some(isNamedDeadkeyElement) ||
        rule.output.some(isNamedDeadkeyElement)
      ) {
        result.set(rule.nodeId, "not-removable:opaque");
        continue;
      }

      // Compute shape predicates once — used both for alias emission and branching.
      // fanShape is a superset of bodyShape; both are computed early and independently
      // of which branch assigns the final label.
      const bodyShape = isBody(rule);
      const fanShape = isParallelIndexFanOut(rule);

      // Alias: emit outputStore.nodeId -> removable:slot-fill whenever the rule
      // matches the general fan-out shape (fanShape covers both S-02 bodies and
      // bare-any transliteration rules), regardless of which branch below labels
      // the rule.  Gating on fanShape (not bodyShape) ensures the alias is also
      // emitted for output stores referenced by bare-any rules like Bamum's
      // any(defaultK) > index(defaultU, 1).
      //
      // #2233: fanShape reads the RAW context, so it cannot see the S-02
      // generalised fan-out shapes (the codec's `+` separator element and the
      // postfix prefix char both break its raw alignment check).  An S-02
      // Pattern's ownership is the stronger signal: a rule owned by an S-02
      // pattern with a single index() output earns the alias through
      // ownership.  isParallelIndexFanOut itself is NOT widened — it also
      // fires for un-owned rules at Decision 3b, where shape-only admission
      // must stay conservative.
      const ownedByS02 =
        rule.ownedByPattern !== undefined &&
        patternById.get(rule.ownedByPattern)?.strategyId === "S-02";
      if (fanShape || ownedByS02) {
        const outEl = rule.output[0];
        // fanShape already guarantees a single index() output; this re-check is a
        // type narrow for outEl, not a fresh condition.
        if (outEl !== undefined && outEl.kind === "index") {
          const outStore = ir.stores.find((s) => s.name === outEl.storeRef);
          if (outStore !== undefined) {
            result.set(outStore.nodeId, "removable:slot-fill");
          }
        }
      }

      // Decision 2: inherit ownedByPattern (ownership is a stronger signal than
      // the generic context heuristic — a recognizer-claimed cluster member inherits
      // the cluster's removal story; avoids labeling one co-owned member not-removable
      // while siblings are removable, e.g. an S-02 escape/fallback rule whose
      // context.length===2 would otherwise trigger the context-sensitive branch).
      if (rule.ownedByPattern !== undefined) {
        const owningPattern = patternById.get(rule.ownedByPattern);
        const inherited = capabilityForStrategy(owningPattern?.strategyId);
        result.set(rule.nodeId, inherited);
        continue;
      }

      // Decision 3: S-02 body rule (un-owned bodies — when the classifier runs on
      // an IR where recognizePatterns() wasn't applied, the body still gets slot-fill).
      if (bodyShape) {
        result.set(rule.nodeId, "removable:slot-fill");
        continue;
      }

      // Decision 3b: general parallel-index fan-out rule that is not an S-02 body
      // (reaching here implies !bodyShape).  Covers bare-any whole-layout
      // transliteration rules such as [any(K)] > index(U, 1) where context.length===1
      // and offset===1.  Placed BEFORE context-sensitive so these single-element-
      // context rules are correctly labeled removable:slot-fill rather than falling
      // through to the unknown catch-all.
      if (fanShape) {
        result.set(rule.nodeId, "removable:slot-fill");
        continue;
      }

      // Decision 4: context-sensitive (rules with prior context, excluding S-02 body,
      // general fan-out, and owned cluster members already handled above)
      if (isContextSensitive(rule)) {
        result.set(rule.nodeId, "not-removable:context-sensitive");
        continue;
      }

      // Decision 5: S-01 simple swap
      if (isS01(rule, group.name)) {
        result.set(rule.nodeId, "removable:simple");
        continue;
      }

      // Decision 6: catch-all
      result.set(rule.nodeId, "not-removable:unknown");
    }
  }

  return result;
}
