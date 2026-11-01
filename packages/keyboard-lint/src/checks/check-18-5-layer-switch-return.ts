// Check 18.5 — KM_WARN_LAYER_SWITCH_NO_RETURN
// Criteria: Every non-default layer that is switched into must contain at least one
// key with a `nextlayer` value (an exit/return key). This is the simplest sound rule:
// it does not trace full reachability back to "default" — it only requires that a
// switched-into layer has SOME layer-switch key so the user can leave it.
//
// Rule: collect all layers referenced by any key's `nextlayer`. For each such target
// layer, verify that it contains at least one key whose `nextlayer` is set. Warn for
// any switched-into layer with no exit.
//
// Accepted heuristic limit: layers that are reached via a hardware modifier (e.g. the
// Shift key activating a shift layer) rather than via a `nextlayer` target are not
// modeled as "switched-into" by this check. Those layers never appear in the
// switchedInto set and therefore never trigger a false warning. This is intentional —
// hardware-modifier layers have a built-in return path (releasing the modifier) that
// is invisible to the static touch-layout JSON.

// SPEC 058: this module additionally hosts KM_WARN_TOUCH_MISSING_LAYER — the
// dangling-`nextlayer` check (0x091 analogue), which is the "different issue"
// the exit check below explicitly defers. See that function's header for why it
// stays a warning despite under-crediting our own reachability BFS.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { findMissingTouchLayers } from "@keyboard-studio/contracts";

/**
 * Collect all keys in a layer that have `nextlayer` set (recursively including sk/multitap).
 */
function collectNextlayerKeys(keys: TouchKeyIR[]): string[] {
  const result: string[] = [];
  for (const key of keys) {
    if (key.nextlayer) result.push(key.nextlayer);
    if (key.sk) result.push(...collectNextlayerKeys(key.sk));
    if (key.multitap) result.push(...collectNextlayerKeys(key.multitap));
    if (key.flick) {
      result.push(...collectNextlayerKeys(Object.values(key.flick).filter((v): v is TouchKeyIR => v !== undefined)));
    }
  }
  return result;
}

/**
 * Check that every layer switched into has at least one exit key (a key with nextlayer set).
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkLayerSwitchReturn(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    // Build a map of layerId -> all keys flat
    const layerKeys = new Map<string, TouchKeyIR[]>();
    for (const layer of platform.layers) {
      const allKeys = layer.rows.flatMap((r) => r.keys);
      layerKeys.set(layer.id, allKeys);
    }

    // Collect all layers that are switched into via nextlayer.
    // Self-references (a key whose nextlayer points back to its own layer id) do
    // not constitute a real layer switch and are excluded from the switched-into set.
    const switchedInto = new Set<string>();
    for (const [sourceLayerId, keys] of layerKeys.entries()) {
      for (const target of collectNextlayerKeys(keys)) {
        if (target !== sourceLayerId) {
          switchedInto.add(target);
        }
      }
    }

    // For each switched-into layer, verify it has at least one exit.
    // A self-referencing nextlayer (pointing back to the same layer id) does not
    // count as a real exit — the user would be stuck in a loop with no way out.
    for (const targetLayerId of switchedInto) {
      const keys = layerKeys.get(targetLayerId);
      if (!keys) continue; // target layer doesn't exist in this platform — a different issue

      const exits = collectNextlayerKeys(keys).filter((t) => t !== targetLayerId);
      if (exits.length === 0) {
        findings.push({
          code: "KM_WARN_LAYER_SWITCH_NO_RETURN",
          severity: "warning",
          layer: "C",
          message: `Platform "${platform.id}" layer "${targetLayerId}" is switched into but has no key with a nextlayer value (no exit).`,
          location: { file: touchLayoutPath, line: 0 },
          hint: `Add a key with nextlayer set in layer "${targetLayerId}" on ${platform.id} so users can navigate to another layer.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// KM_WARN_TOUCH_MISSING_LAYER — 0x091 analogue: a `nextlayer` pointing at a
// layer the platform does not declare.
//
// The key renders and is pressable, and nothing happens — or worse, the runtime
// lands somewhere unintended. The sibling check above deliberately skips this
// case ("target layer doesn't exist in this platform — a different issue"); this
// is that issue.
//
// DO NOT PROMOTE THIS TO AN ERROR, even though it has a second-order cost we
// care about: a dangling `nextlayer` makes our own reachability BFS
// under-credit, because the BFS only enqueues targets that exist, so every key on
// the intended layer reads as unreachable and its rules read as orphaned.
// Tempting as that makes an error, upstream warns, and hundreds of corpus
// keyboards contain instances — a first error-severity Layer C code would break
// the layer boundary for every one of them. Escalation belongs in edit-time
// validation, which rejects a MUTATION rather than emitting a FINDING.
// ---------------------------------------------------------------------------

/**
 * Check that every `nextlayer` target is a layer the platform actually declares.
 *
 * SPEC 058 T114: detection — the per-platform declared-layer resolution and the
 * one-finding-per-(layer, missing-target) dedup — is `findMissingTouchLayers`
 * (contracts, `touch-key-diagnostics.ts`), the ONE implementation FR-040
 * requires, shared with the edit-time surface so the two cannot drift. What
 * remains here is the English prose, composed from the structured finding's own
 * `fields`.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchMissingLayer(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  return findMissingTouchLayers(ir).map((finding) => {
    const platform = String(finding.fields.platform);
    const layerId = String(finding.fields.layerId);
    const target = String(finding.fields.target);
    return {
      code: "KM_WARN_TOUCH_MISSING_LAYER",
      severity: "warning",
      layer: "C",
      message: `Platform "${platform}" layer "${layerId}" has a key whose nextlayer is "${target}", but that platform declares no such layer.`,
      location: { file: touchLayoutPath, line: 0 },
      hint: `Add a layer with id "${target}" to platform "${platform}", or repoint the key at an existing layer. As written the key does nothing, and every key on the intended layer becomes unreachable.`,
    };
  });
}
