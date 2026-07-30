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
 * P2 collision guard: `inputSequence.join(connector)` renders unambiguously
 * in the overwhelming common case, but a context token that IS ITSELF the
 * connector text (or the "→" arrow the template uses to join the sequence to
 * the output) — a rare literal-char rule whose keystroke/char happens to be
 * e.g. "+" — would render indistinguishably from a genuine multi-token join
 * or from the sequence/output boundary. Rather than guess which case
 * applies, treat the sequence as unrenderable in that case and let the
 * caller fall through to the generic per-kind template (which prints
 * `mark`/`base`/`keystrokeDisplay` in FIXED positions, never joined from an
 * arbitrary token array, so it has no equivalent ambiguity). Does not change
 * the approved format for the normal (non-colliding) case.
 */
function sequenceCollidesWithConnector(
  tokens: readonly string[],
  connector: string,
): boolean {
  const trimmedConnector = connector.trim();
  return tokens.some((token) => token === trimmedConnector || token === "→");
}

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

  // The engine hands back the FULL ordered input sequence + exact output
  // whenever every context element rendered to a friendly token (see
  // `buildContextInputSequence` in collectCharContributors.ts) — compose the
  // literal "{sequence} -> {output}" label directly from those engine-
  // provided tokens rather than the generic per-kind template below. A
  // deadkey chain reads as "mark then base"; anything else (a single
  // keystroke or a multi-keystroke sequence) reads as "step + step".
  if (descriptor.inputSequence !== undefined && descriptor.output !== undefined) {
    const outputDisplay = displayChar(descriptor.output);
    if (descriptor.kind === "deadkey") {
      const connector = resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.desktop.deadkeySequenceConnector",
          message: " then ",
        }),
      );
      if (!sequenceCollidesWithConnector(descriptor.inputSequence, connector)) {
        const sequence = descriptor.inputSequence.join(connector);
        return resolveMessage(
          i18n,
          msg({
            id: "editor.assignLoop.existingMethod.desktop.deadkeySequence",
            message: `${{ sequence }} → ${{ char: outputDisplay }}`,
          }),
        );
      }
    } else {
      const connector = resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.desktop.sequenceConnector",
          message: " + ",
        }),
      );
      if (!sequenceCollidesWithConnector(descriptor.inputSequence, connector)) {
        const sequence = descriptor.inputSequence.join(connector);
        return resolveMessage(
          i18n,
          msg({
            id: "editor.assignLoop.existingMethod.desktop.sequence",
            message: `${{ sequence }} → ${{ char: outputDisplay }}`,
          }),
        );
      }
    }
    // Fall through to the generic per-kind template below — either the
    // sequence collided with its own connector/arrow (see
    // `sequenceCollidesWithConnector`), or `descriptor.kind` is one of the
    // non-sequence kinds ("store-slot"/"blocked") for which `inputSequence`
    // is never populated by the engine in the first place.
  }

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
      // Priority: a typed single-token input (inputChar/inputKeystroke — the
      // aligned any()-consumed store item, mutually exclusive) reads more
      // plainly than the table-name phrasing, so it's preferred whenever the
      // engine resolved one; storeDisplayName is the next-best fallback, and
      // "Also produces" is the last resort. (The FULL inputSequence->output
      // literal path, when resolvable, is handled above this switch and never
      // reaches here.)
      if (descriptor.inputChar !== undefined) {
        return resolveMessage(
          i18n,
          msg({
            id: "editor.assignLoop.existingMethod.desktop.storeSlotInputChar",
            message: `Type ${{ inputChar: descriptor.inputChar }} → ${{ char }}`,
          }),
        );
      }
      if (descriptor.inputKeystroke !== undefined) {
        return resolveMessage(
          i18n,
          msg({
            id: "editor.assignLoop.existingMethod.desktop.storeSlotInputKeystroke",
            message: `Press ${{ inputKeystroke: descriptor.inputKeystroke }} → ${{ char }}`,
          }),
        );
      }
      return descriptor.storeDisplayName !== undefined
        ? resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.existingMethod.desktop.storeSlot",
              message: `One of your ${{ storeDisplayName: descriptor.storeDisplayName }} keys → ${{ char }}`,
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
    case "composition": {
      // Synthesized (never engine-produced from collectCharContributors) —
      // see collectCompositionMethod. `components` is always populated by
      // that function; the `?? []` default is defense-in-depth only.
      const connector = resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.composition.connector",
          message: " + ",
        }),
      );
      const sequence = (descriptor.components ?? [])
        .map((c) => displayChar(c))
        .join(connector);
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.composition.label",
          message: `${{ sequence }} → ${{ char }}`,
        }),
      );
    }
    case "unattributed":
      // No arrow, no fabricated keystroke — this row exists only to satisfy
      // the SHOW-ALL floor for a green-badged char no other row covers.
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.existingMethod.unattributed",
          message: "Your keyboard already produces this character.",
        }),
      );
    default: {
      // Exhaustiveness guard: a new descriptor `kind` must be handled above.
      const _exhaustive: never = descriptor.kind;
      return `${char}${String(_exhaustive)}`;
    }
  }
}

/**
 * Append the " - NOT DELETABLE" suffix (localized) to an already-composed
 * method label — used for every row the gallery renders as a static,
 * non-deletable chip (both the desktop MechanismGallery and TouchGallery):
 * green-static rows (composition, blocked/opaque/multi-char, unattributed,
 * and a produced rule/slot removalCapabilities marks not-removable) as well
 * as blue "used" rows (the char is only consumed, never produced, at that
 * site). The real method path (e.g. "A + ◌̂ → Â") is always kept; this only
 * adds the trailing suffix. Deletable rows never call this — they render
 * with the green "×" hover-delete chip instead.
 */
export function appendNotDeletableSuffix(label: string, i18n?: I18n): string {
  const suffix = resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.existingMethod.notDeletableSuffix",
      message: " - NOT DELETABLE",
    }),
  );
  return `${label}${suffix}`;
}

/**
 * Tooltip for a `kind: "composition"` row's non-deletable chip — explains
 * WHY there's no single rule to remove (there is no rule at all; the row is
 * synthesized from two-or-more separately-produced characters). Mirrors
 * `touchMethodNonDeletableReason`'s "reason string for a muted chip" shape.
 */
export function compositionTooltip(
  descriptor: Pick<ContributorDescriptor, "producedChar">,
  i18n?: I18n,
): string {
  const char = displayChar(descriptor.producedChar);
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.existingMethod.composition.tooltip",
      message: `${{ char }} is formed from its base plus combining mark(s); there is no single rule to remove.`,
    }),
  );
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
