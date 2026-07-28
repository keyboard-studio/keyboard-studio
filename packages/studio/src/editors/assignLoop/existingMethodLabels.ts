// existingMethodLabels — shared label composition for the "Existing methods"
// (and, on the touch side, "Deleted methods") sections rendered by both
// MechanismGallery (desktop) and TouchGallery (touch).
//
// The engine returns STRUCTURED descriptor fields
// (`ContributorDescriptor` / `TouchMethodDescriptor`) rather than
// pre-rendered English strings or raw internal identifiers — engine code
// must not hardcode UI copy. This module is the one place the studio
// composes the localized, author-facing label from those fields, so the two
// galleries can't drift onto different templates for the same descriptor
// shape.
//
// Kept pure (no React, no store reads) and callable with an optional
// `i18n` — same convention as capabilityHint/keyHint (parts/InfoView.tsx)
// and publishManagedPRErrorMessage (lib/publishManagedPRErrorMessage.ts):
// real components pass `i18n` from `useLingui()`; unit tests call these with
// no `i18n` at all and assert on the English source text baked into the
// `msg()` descriptor.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import type {
  ContributorDescriptor,
  TouchMethodDescriptor,
} from "@keyboard-studio/engine";
import { displayChar } from "../../lib/irToCarveNodes.ts";

// ---------------------------------------------------------------------------
// Desktop (MechanismGallery) — ContributorDescriptor -> label
// ---------------------------------------------------------------------------

/**
 * Compose the author-facing label for one desktop contributor descriptor
 * (a whole-rule keystroke, a deadkey fan-out slot, a plain store-fan-out
 * slot, or a blocked/opaque producer).
 */
export function composeContributorLabel(
  descriptor: ContributorDescriptor,
  i18n?: I18n,
): string {
  const char = displayChar(descriptor.producedChar);
  switch (descriptor.kind) {
    case "keystroke":
      return descriptor.keystrokeDisplay !== undefined
        ? resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.keystroke",
              message: `Press ${{ keystrokeDisplay: descriptor.keystrokeDisplay }} → ${{ char }}`,
            }),
          )
        : resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.keystrokeNoVkey",
              message: `Type this key → ${{ char }}`,
            }),
          );
    case "deadkey":
      return descriptor.mark !== undefined && descriptor.base !== undefined
        ? resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.deadkey",
              message: `Type ${{ mark: descriptor.mark }} then ${{ base: descriptor.base }} → ${{ char }}`,
            }),
          )
        : resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.deadkeyUnresolved",
              message: `Part of a two-step combination → ${{ char }}`,
            }),
          );
    case "store-slot":
      return descriptor.storeDisplayName !== undefined
        ? resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.storeSlot",
              message: `Produced from the ${{ storeDisplayName: descriptor.storeDisplayName }} table → ${{ char }}`,
            }),
          )
        : resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.storeSlotUnnamed",
              message: `Also produces ${{ char }}`,
            }),
          );
    case "blocked":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.desktop.blocked",
          message: `Bundled with other output — can't remove ${{ char }} alone`,
        }),
      );
    default: {
      // Exhaustiveness guard: a new descriptor `kind` must be handled above.
      const _exhaustive: never = descriptor.kind;
      return `${char}${String(_exhaustive)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Touch (TouchGallery) — TouchMethodDescriptor -> label + friendly
// platform/layer disambiguation suffix
// ---------------------------------------------------------------------------

const FRIENDLY_LAYER_NAMES: Record<string, string> = {
  default: "main",
  shift: "Shift",
  numeric: "numbers",
};

/** Title-case a raw id, splitting on hyphen/underscore/space runs. */
function titleCaseId(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Raw layer id ("default", "shift", "numeric", …) -> friendly wording. */
function friendlyLayerName(layerId: string): string {
  return FRIENDLY_LAYER_NAMES[layerId] ?? titleCaseId(layerId);
}

const DIRECTION_ARROWS: Record<string, string> = {
  n: "↑",
  s: "↓",
  e: "→",
  w: "←",
};

/** Compass direction code -> arrow glyph (falls back to the raw code). */
function directionDisplay(direction: string): string {
  return DIRECTION_ARROWS[direction] ?? direction;
}

/**
 * Whether the "(platform, layer)" disambiguation suffix should be appended
 * for `method` — true when the FULL enumerated method list for this
 * character spans more than one platform, or `method`'s own layer isn't the
 * default/main layer. `allMethodsForChar` should be the full, UNFILTERED
 * enumeration for the character (i.e. before any deletable/deleted
 * filtering) so the decision is identical whether `method` is currently
 * shown in "Existing methods" or in the "Deleted methods" restore list.
 */
export function touchMethodNeedsPlatformLayerSuffix(
  method: Pick<TouchMethodDescriptor, "layer">,
  allMethodsForChar: readonly Pick<TouchMethodDescriptor, "platform">[],
): boolean {
  if (method.layer !== "default") return true;
  const platforms = new Set(allMethodsForChar.map((m) => m.platform));
  return platforms.size > 1;
}

/**
 * Compose the author-facing label for one touch method descriptor (main-key
 * tap, longpress sub-key, multitap entry, or flick gesture), including the
 * " (platform, layer)" disambiguation suffix when the enumerated methods for
 * this character actually need it (see
 * {@link touchMethodNeedsPlatformLayerSuffix}).
 */
export function composeTouchMethodLabel(
  method: TouchMethodDescriptor,
  allMethodsForChar: readonly TouchMethodDescriptor[],
  i18n?: I18n,
): string {
  const char = displayChar(method.producedChar);
  const base = ((): string => {
    switch (method.kind) {
      case "tap":
        return method.host !== undefined
          ? resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.tap",
                message: `Tap [${{ host: method.host }}] → ${{ char }}`,
              }),
            )
          : resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.tapNoHost",
                message: `Tap this key → ${{ char }}`,
              }),
            );
      case "longpress":
        return method.host !== undefined
          ? resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.longpress",
                message: `Long-press [${{ host: method.host }}] → ${{ char }}`,
              }),
            )
          : resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.longpressNoHost",
                message: `Long-press this key → ${{ char }}`,
              }),
            );
      case "multitap":
        return method.host !== undefined
          ? resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.multitap",
                message: `Tap [${{ host: method.host }}] repeatedly → ${{ char }}`,
              }),
            )
          : resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.multitapNoHost",
                message: `Tap this key repeatedly → ${{ char }}`,
              }),
            );
      case "flick":
        return method.host !== undefined
          ? resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.flick",
                message: `Flick [${{ host: method.host }}] ${{ direction: directionDisplay(method.direction ?? "") }} → ${{ char }}`,
              }),
            )
          : resolveMessage(
              i18n,
              msg({
                id: "editor.assignLoop.existingMethod.touch.flickNoHost",
                message: `Flick this key ${{ direction: directionDisplay(method.direction ?? "") }} → ${{ char }}`,
              }),
            );
      default: {
        // Exhaustiveness guard: a new `kind` must be handled above.
        const _exhaustive: never = method.kind;
        return char + String(_exhaustive);
      }
    }
  })();

  if (!touchMethodNeedsPlatformLayerSuffix(method, allMethodsForChar)) {
    return base;
  }
  const suffix = resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.existingMethod.touch.platformLayerSuffix",
      message: ` (${{ platform: method.platform }}, ${{ layer: friendlyLayerName(method.layer) }})`,
    }),
  );
  return `${base}${suffix}`;
}

/**
 * Short localized explanation for a non-deletable touch method's
 * `reasonCode` — used as the muted chip's `title`. Returns `undefined` when
 * `method` carries no `reasonCode` (i.e. it IS deletable).
 */
export function touchMethodNonDeletableReason(
  method: Pick<TouchMethodDescriptor, "reasonCode">,
  i18n?: I18n,
): string | undefined {
  if (method.reasonCode === undefined) return undefined;
  switch (method.reasonCode) {
    case "layer-switch":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.touch.layerSwitchReason",
          message:
            "This key also switches layers to reach other characters — it can't be removed here.",
        }),
      );
    default: {
      // Exhaustiveness guard: a new reasonCode must be handled above.
      const _exhaustive: never = method.reasonCode;
      return String(_exhaustive);
    }
  }
}
