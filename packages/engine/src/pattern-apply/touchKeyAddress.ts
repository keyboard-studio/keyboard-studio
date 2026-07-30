/**
 * touchKeyAddress — stable id scheme for addressing a single node (main key,
 * longpress sub-key, multitap entry, or flick direction) inside a
 * `.keyman-touch-layout` / `TouchLayoutIR`, for the pre-existing-touch-method
 * deletion overlay (`workingCopyStore.deletedTouchKeyIds`).
 *
 * Format: `"<platform>:<layerId>:<keyId>"` for a main key, extended with a
 * `:sk:<subId>` / `:multitap:<subId>` / `:flick:<direction>` suffix for a
 * sub-entry. This is NOT a new convention invented for this feature — it is
 * the exact composite key `@keyboard-studio/contracts`'s
 * `parseTouchLayoutString` already builds for `TouchLayoutIR.nodeIds`
 * (`${platform}:${id}:${key.id}` and `${platform}:${id}:${key.id}:sk:${sk.id}`,
 * spec §11 "JSON round-trip compatibility"). This module only adds the
 * `multitap`/`flick` suffix forms the existing nodeIds map does not need
 * (nodeIds only tracks sk, not multitap/flick), and exports the builders so
 * the enumeration and removal passes below can never independently drift on
 * the format.
 *
 * Stability: the address is built from the platform id, layer id, and the
 * ORIGINAL key/sub-key id as they appear in the (pre-deletion) touch layout —
 * never from array position — so it survives re-derivation of the layout
 * across debounce cycles as long as the underlying key/sub-key id is
 * unchanged. A key whose id was already neutralized by an earlier projection
 * step (e.g. the desktop-carve cascade's `T_carved_*` rewrite, spec
 * `applyCarveKeycapRemovalsToVfs`) no longer matches its pre-neutralization
 * address, so a stale `deletedTouchKeyIds` entry for it silently fails to
 * resolve on a later pass — the intended idempotent behavior (a touch key
 * already blanked by the desktop cascade is never double-processed or
 * errored; see `applyTouchKeycapRemovalsToVfs`'s doc comment).
 *
 * Not stably addressable: a real .keyman-touch-layout can carry duplicate key
 * ids within one layer (rare, but not schema-forbidden). This module inherits
 * that same limitation from the existing `nodeIds` convention rather than
 * inventing a stricter (and divergent) scheme — see the module doc on
 * `applyTouchKeycapRemovalsToVfs.ts` for the practical consequence.
 */

/** Build the stable address for a main key. */
export function touchKeyAddress(platform: string, layerId: string, keyId: string): string {
  return `${platform}:${layerId}:${keyId}`;
}

/** Build the stable address for an `sk[]` (longpress) or `multitap[]` sub-entry. */
export function touchSubKeyAddress(
  platform: string,
  layerId: string,
  keyId: string,
  kind: "sk" | "multitap",
  subId: string,
): string {
  return `${touchKeyAddress(platform, layerId, keyId)}:${kind}:${subId}`;
}

/** Build the stable address for a `flick{}` directional gesture entry. */
export function touchFlickAddress(
  platform: string,
  layerId: string,
  keyId: string,
  direction: string,
): string {
  return `${touchKeyAddress(platform, layerId, keyId)}:flick:${direction}`;
}
