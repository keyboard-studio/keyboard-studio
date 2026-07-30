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
 * `deletable` distinguishes a genuinely deletable touch method from one that
 * would leave the character reachable some other way:
 *   - every `sk[]` / `multitap[]` / `flick{}` sub-entry is always
 *     `deletable: true` — there is no other mechanism guarding them.
 *   - a main key is deletable UNLESS it also carries `nextlayer` (a
 *     layer-switch key that also happens to emit a character): removing its
 *     text/output/id here would break the layer switch, so it is left
 *     `deletable: false` with `reasonCode: "layer-switch"`.
 *   - every other main key — including a plain `K_<letter>` text-only key
 *     with no `output` — is `deletable: true`. The WRITE side
 *     (`applyTouchKeycapRemovalsToVfs`) neutralizes the key's id
 *     unconditionally when deleting a main key, so a `K_` id can no longer
 *     fall through to its underlying `.kmn` rule after deletion — see that
 *     module's doc comment.
 *
 * Fields are structured, not pre-rendered English strings: this is engine
 * code, and the studio composes the localized display label from `kind` /
 * `host` / `producedChar` / `platform` / `layer` / `direction` /
 * `reasonCode` (i18n — the engine must not hardcode English UI copy). `host`
 * is omitted when the host key has no human-facing glyph (no `text`/`output`,
 * and a non-`U_` id) — the studio must render a localized generic in that
 * case rather than a raw vkey id like `K_A`.
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
  /** What kind of touch method this is — the studio maps this to display copy. */
  kind: "tap" | "longpress" | "multitap" | "flick";
  /**
   * Display for the host key (the key this method hangs off of/is).
   * Omitted when the host key has no human-facing glyph to show (no
   * `text`/`output`, and its id doesn't decode via `unicodeKeyIdToChar`) — a
   * raw vkey id like "K_A" is an internal identifier, not author-facing
   * copy, so the studio must render a generic fallback instead of the id.
   */
  host?: string;
  /** The character this method produces (the query argument, echoed back). */
  producedChar: string;
  /** Raw platform id (e.g. "phone", "tablet") — the studio maps to friendly wording. */
  platform: string;
  /** Raw layer id (e.g. "default", "shift") — the studio maps to friendly wording. */
  layer: string;
  /** Compass direction — present only when `kind === "flick"`. */
  direction?: string;
  /** False when deleting this method could not actually stop the char from being typed. */
  deletable: boolean;
  /** Present only when `deletable` is false. */
  reasonCode?: "layer-switch";
}

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
          collectDescriptorsForKey(platform.id, layer.id, key, char, removalSet, results);
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * The label shown for the key a sub-entry hangs off of. Returns `undefined`
 * when the only thing available is the raw vkey id — that id is an internal
 * identifier, not author-facing copy, so callers must fall back to a
 * localized generic rather than surfacing it (see `TouchMethodDescriptor.host`).
 */
function hostLabel(key: TouchKeyIR): string | undefined {
  return key.text ?? key.output ?? unicodeKeyIdToChar(key.id);
}

/**
 * True when `id` (case-insensitive) is the backspace key. A dedicated
 * `K_BKSP` key won't ordinarily match an alphabet char's removal set, but
 * this is a defensive filter — see `collectCharContributors`'s desktop-side
 * backspace-input skip for the shape this mirrors.
 */
function isBackspaceKeyId(id: string | undefined): boolean {
  return id !== undefined && id.toUpperCase() === 'K_BKSP';
}

function collectDescriptorsForKey(
  platform: string,
  layerId: string,
  key: TouchKeyIR,
  char: string,
  removalSet: ReadonlySet<string>,
  out: TouchMethodDescriptor[],
): void {
  const host = hostLabel(key);
  const hostField = host !== undefined ? { host } : {};

  if (!isBackspaceKeyId(key.id) && keyMatchesRemovalSet(key, removalSet)) {
    const isLayerSwitch = key.nextlayer !== undefined;
    out.push({
      id: touchKeyAddress(platform, layerId, key.id),
      kind: "tap",
      ...hostField,
      producedChar: char,
      platform,
      layer: layerId,
      deletable: !isLayerSwitch,
      ...(isLayerSwitch ? { reasonCode: "layer-switch" as const } : {}),
    });
  }

  for (const sub of key.sk ?? []) {
    if (!isBackspaceKeyId(sub.id) && keyMatchesRemovalSet(sub, removalSet)) {
      out.push({
        id: touchSubKeyAddress(platform, layerId, key.id, "sk", sub.id),
        kind: "longpress",
        ...hostField,
        producedChar: char,
        platform,
        layer: layerId,
        deletable: true,
      });
    }
  }

  for (const sub of key.multitap ?? []) {
    if (!isBackspaceKeyId(sub.id) && keyMatchesRemovalSet(sub, removalSet)) {
      out.push({
        id: touchSubKeyAddress(platform, layerId, key.id, "multitap", sub.id),
        kind: "multitap",
        ...hostField,
        producedChar: char,
        platform,
        layer: layerId,
        deletable: true,
      });
    }
  }

  if (key.flick) {
    for (const direction of Object.keys(key.flick) as Array<keyof NonNullable<TouchKeyIR["flick"]>>) {
      const sub = key.flick[direction];
      if (sub !== undefined && !isBackspaceKeyId(sub.id) && keyMatchesRemovalSet(sub, removalSet)) {
        out.push({
          id: touchFlickAddress(platform, layerId, key.id, direction),
          kind: "flick",
          ...hostField,
          producedChar: char,
          platform,
          layer: layerId,
          direction,
          deletable: true,
        });
      }
    }
  }
}
