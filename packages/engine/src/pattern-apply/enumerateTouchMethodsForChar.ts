/**
 * enumerateTouchMethodsForChar — list every pre-existing touch method (main
 * key, longpress sub-key, multitap entry, or flick gesture) that currently
 * produces a given character in a `TouchLayoutIR`, addressed by the stable
 * scheme in `touchKeyAddress.ts`.
 *
 * This is the READ side of the touch-method deletion overlay
 * (`workingCopyStore.deletedTouchKeyIds`); `applyTouchKeycapRemovalsToVfs.ts`
 * is the WRITE side that consumes the same address scheme. Callers pass
 * whatever `TouchLayoutIR` they want to enumerate against — e.g. TouchGallery's
 * `detectionSeedLayout` (the derived seed BEFORE Phase E assignments, see
 * `buildTouchLayoutJson.ts`'s `deriveSeedLayout`) for "what does the base
 * already provide for this char" — or a raw `.keyman-touch-layout` JSON string
 * parsed via `@keyboard-studio/contracts`'s `parseTouchLayoutString`.
 *
 * `deletable` distinguishes a genuinely TOUCH-ONLY method (spec goal: "a
 * touch-only pre-existing method... with no backing desktop .kmn rule") from
 * a touch key that is merely REFLECTING a desktop rule:
 *   - every `sk[]` / `multitap[]` / `flick{}` sub-entry is touch-only by
 *     construction (there is no desktop equivalent of a longpress/multitap/
 *     flick) — always `deletable: true`.
 *   - a main key is touch-only when its production is self-contained: either
 *     it carries an explicit `output` (which overrides the underlying vkey
 *     regardless of the .kmn rules — see `applyCarveKeycapRemovalsToVfs`'s
 *     doc comment on the same distinction), or its `id` is a `U_<HEX>` form
 *     (KMW derives the emitted character straight from a `U_` id, independent
 *     of any `.kmn` rule) — `deletable: true`.
 *   - a main key whose ONLY production is `text` on a non-`U_` id (typically
 *     `K_<letter>`) has no `output` to override the vkey: tapping it still
 *     sends the underlying virtual key through the compiled `.kmn` rules, so
 *     blanking `text` here would only change the OSK label, not what the key
 *     actually types — `deletable: false`, with a `reason` pointing the
 *     author at desktop carve instead (which already cascades to this same
 *     keycap via `applyCarveKeycapRemovalsToVfs`).
 *
 * Pure — no mutation, no I/O.
 */

import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { unicodeKeyIdToChar } from "../shared/touch-ids.js";
import { buildRemovalSet, keyMatchesRemovalSet } from "./touch-mechanism-shared.js";
import { touchFlickAddress, touchKeyAddress, touchSubKeyAddress } from "./touchKeyAddress.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TouchMethodDescriptor {
  /** Stable address — see `touchKeyAddress.ts`. Feeds `deletedTouchKeyIds`. */
  id: string;
  /** Human-readable description (e.g. "long-press on a", "key on phone default layer"). */
  label: string;
  /** False when deleting this method could not actually stop the char from being typed. */
  deletable: boolean;
  /** Present only when `deletable` is false. */
  reason?: string;
}

const REASON_DESKTOP_BACKED =
  "this key's character comes from its underlying desktop rule, not the touch layout — remove the rule via desktop carve instead";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List every touch method in `layout` that currently produces `char`
 * (NFC-compared, matching `keyMatchesRemovalSet`'s canonical rule).
 */
export function enumerateTouchMethodsForChar(
  layout: TouchLayoutIR,
  char: string,
): TouchMethodDescriptor[] {
  const removalSet = buildRemovalSet([char]);
  const results: TouchMethodDescriptor[] = [];

  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          collectDescriptorsForKey(platform.id, layer.id, key, removalSet, results);
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The label shown for the key a sub-entry hangs off of. */
function hostLabel(key: TouchKeyIR): string {
  return key.text ?? key.output ?? unicodeKeyIdToChar(key.id) ?? key.id;
}

function collectDescriptorsForKey(
  platform: string,
  layerId: string,
  key: TouchKeyIR,
  removalSet: ReadonlySet<string>,
  out: TouchMethodDescriptor[],
): void {
  if (keyMatchesRemovalSet(key, removalSet)) {
    const isTouchOnly = key.output !== undefined || key.id.startsWith("U_");
    out.push({
      id: touchKeyAddress(platform, layerId, key.id),
      label: `key on ${platform} ${layerId} layer`,
      deletable: isTouchOnly,
      ...(isTouchOnly ? {} : { reason: REASON_DESKTOP_BACKED }),
    });
  }

  const host = hostLabel(key);

  for (const sub of key.sk ?? []) {
    if (keyMatchesRemovalSet(sub, removalSet)) {
      out.push({
        id: touchSubKeyAddress(platform, layerId, key.id, "sk", sub.id),
        label: `long-press on ${host}`,
        deletable: true,
      });
    }
  }

  for (const sub of key.multitap ?? []) {
    if (keyMatchesRemovalSet(sub, removalSet)) {
      out.push({
        id: touchSubKeyAddress(platform, layerId, key.id, "multitap", sub.id),
        label: `multitap on ${host}`,
        deletable: true,
      });
    }
  }

  if (key.flick) {
    for (const direction of Object.keys(key.flick) as Array<keyof NonNullable<TouchKeyIR["flick"]>>) {
      const sub = key.flick[direction];
      if (sub !== undefined && keyMatchesRemovalSet(sub, removalSet)) {
        out.push({
          id: touchFlickAddress(platform, layerId, key.id, direction),
          label: `flick ${direction} on ${host}`,
          deletable: true,
        });
      }
    }
  }
}
