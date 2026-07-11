// Check 18.4 — KM_WARN_CONTROL_KEY_DRIFT
// Criteria: Within a platform, control keys (K_BKSP, K_ENTER) must not move or
// resize across layers. "Geometry" = sp + width + position (rowIndex + indexInRow).
//
// Design decision: asymmetric sp/width IS drift. If the baseline layer defines sp
// or width and a subsequent layer omits it (or vice versa), that counts as drift.
// The undefined side is reported as "unset" in the drift message. Position drift
// (rowIndex and keyIndex) is ALWAYS checked regardless of whether sp/width data is
// present on either side.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { makeLocation, walkTouchKeys, type TouchKeyContext } from "./_shared.js";

const CONTROL_KEY_IDS = new Set(["K_BKSP", "K_ENTER"]);

interface KeyGeometry {
  sp: number | undefined;
  width: number | undefined;
  rowIndex: number;
  keyIndex: number;
  layerId: string;
}

/**
 * Check that control keys maintain consistent geometry (sp, width, position) across
 * all layers within each platform.
 *
 * Position drift (rowIndex, keyIndex) is always checked. sp and width drift is
 * checked symmetrically: if either side has a value and they differ (including
 * defined vs. undefined), that is drift. This matches the criterion that control-key
 * geometry must be constant across layers.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkControlKeyDrift(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  // Build a map: keyId -> first-seen geometry (from first layer that has the key),
  // reset each time the walk crosses into a new platform.
  let currentPlatform: TouchKeyContext["platform"] | undefined;
  let baseline = new Map<string, KeyGeometry>();

  walkTouchKeys(ir, ({ platform, layer, rowIndex, key, keyIndex }) => {
    if (platform !== currentPlatform) {
      currentPlatform = platform;
      baseline = new Map();
    }

    if (!CONTROL_KEY_IDS.has(key.id)) return;

    const geometry: KeyGeometry = {
      sp: key.sp,
      width: key.width,
      rowIndex,
      keyIndex,
      layerId: layer.id,
    };

    const base = baseline.get(key.id);
    if (!base) {
      baseline.set(key.id, geometry);
      return;
    }

    const drifts: string[] = [];

    // Position drift: always checked regardless of sp/width presence.
    if (base.rowIndex !== geometry.rowIndex) {
      drifts.push(`row changed from ${base.rowIndex + 1} (layer "${base.layerId}") to ${geometry.rowIndex + 1}`);
    }

    if (base.keyIndex !== geometry.keyIndex) {
      drifts.push(`position in row changed from ${base.keyIndex + 1} (layer "${base.layerId}") to ${geometry.keyIndex + 1}`);
    }

    // sp drift: flag whenever the values differ, including defined vs. undefined.
    // Treat undefined as "unset" for the message; asymmetric sp IS drift.
    if (base.sp !== geometry.sp) {
      const from = base.sp !== undefined ? String(base.sp) : "unset";
      const to = geometry.sp !== undefined ? String(geometry.sp) : "unset";
      drifts.push(`sp changed from ${from} (layer "${base.layerId}") to ${to}`);
    }

    // width drift: same semantics as sp.
    if (base.width !== geometry.width) {
      const from = base.width !== undefined ? String(base.width) : "unset";
      const to = geometry.width !== undefined ? String(geometry.width) : "unset";
      drifts.push(`width changed from ${from} (layer "${base.layerId}") to ${to}`);
    }

    if (drifts.length > 0) {
      findings.push({
        code: "KM_WARN_CONTROL_KEY_DRIFT",
        severity: "warning",
        layer: "C",
        message: `Control key "${key.id}" on platform "${platform.id}" has inconsistent geometry in layer "${layer.id}": ${drifts.join("; ")}.`,
        location: makeLocation(touchLayoutPath),
        hint: `Restore "${key.id}" to the same position and size it has in the baseline layer on ${platform.id} so users can always find it.`,
      });
    }
  });

  return findings;
}
