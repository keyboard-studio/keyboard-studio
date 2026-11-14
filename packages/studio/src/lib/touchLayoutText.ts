// touchLayoutText -- the three text steps a built touch layout goes through before
// it is the file: surface the desktop layer combos, sync the caps layer, conform to
// the schema Keyman Developer loads. One implementation, used by the Copy
// projection (`projectWorkingCopyVfs` steps 2.5 and 2.8, `serializeWorkingCopy`
// step 5e) and by the reseed on Open (`openApply/touchReseed.ts`), so the two
// cannot drift. `buildTouchLayoutText` composes them in the Copy order for a layout
// that is not interleaved with other steps.

import type { KeyboardIR, MechanismAssignment } from "@keyboard-studio/contracts";
import {
  collectLayerCombosInUse,
  conformTouchLayoutToKeymanSchema,
  propagateDesktopLayersToTouch,
  syncTouchCapsLayerRaw,
} from "@keyboard-studio/engine";

/** Surface the desktop layer combos `ir` uses (and `assignments` add) onto `json`. */
export function surfaceLayerCombos(
  json: string,
  ir: KeyboardIR,
  assignments: readonly MechanismAssignment[],
): { json: string; warnings: string[] } {
  const r = propagateDesktopLayersToTouch(json, ir, assignments as MechanismAssignment[]);
  return { json: r.json, warnings: r.warnings };
}

/** Give `json` its caps layer (the cased-keys caps decision); unchanged text when nothing changes. */
export function syncCapsLayer(json: string, bcp47: string | undefined): string {
  const synced = syncTouchCapsLayerRaw(json, { ...(bcp47 !== undefined ? { bcp47 } : {}) });
  return synced.changed ? synced.json : json;
}

/** Drop the members the Keyman touch-layout schema does not allow (the output form). */
export function conformTouchText(json: string): { json: string; removed: string[] } {
  return conformTouchLayoutToKeymanSchema(json);
}

/**
 * The file text for a freshly built layout, in the Copy order: combos surfaced when
 * the keyboard uses any, the caps layer when the caps decision is cased-keys, then
 * conformed. A step that throws is reported through `onWarn` and skipped.
 */
export function buildTouchLayoutText(args: {
  json: string;
  ir: KeyboardIR;
  casedKeysCaps: boolean;
  bcp47: string | undefined;
  onWarn?: (message: string, err: unknown) => void;
}): string {
  let json = args.json;
  try {
    if (collectLayerCombosInUse(args.ir).length > 0) json = surfaceLayerCombos(json, args.ir, []).json;
  } catch (err) {
    args.onWarn?.("desktop layer combos could not be surfaced onto the layout", err);
  }
  try {
    if (args.casedKeysCaps) json = syncCapsLayer(json, args.bcp47);
  } catch (err) {
    args.onWarn?.("the caps layer could not be synced onto the layout", err);
  }
  return conformTouchText(json).json;
}
