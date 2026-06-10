// see spec.md §8 step 3 (Phase A — Identity + routing)

import type { RoutingGroup } from "./scaffolder";

/**
 * Script subfamily for non-Roman routing groups (spec §9).
 * Only elicited when {@link KeyboardIdentity.routingGroup} is `"non-roman"`.
 *
 * Values use the plain-language group labels from the Phase A flow YAML
 * (content/flows/phase_a_identity.yaml, question `script_family`).
 *
 * Note: `"syllabic"` here intentionally differs from `ScriptClass`'s
 * `"syllabary"` spelling — these are distinct types with different purposes:
 * `ScriptFamily` is a Phase A user-routing label; `ScriptClass` is an A2
 * discovery-axis value used by the §7.2 strategy selector. Do not unify them.
 *
 * `"alpha-nonlatin"` is emitted by the Phase A flow for users who select the
 * non-roman layout and identify their script as a non-Latin alphabet (Cyrillic,
 * Greek, Georgian, or Armenian). It routes directly to the shared universal
 * tail in Phase B (pb_special_letters), bypassing the Indic/SEA/RTL/syllabic
 * sub-branches.
 *
 * `"logographic"` is RESERVED for CJK. In v1 it is never emitted as a Phase B
 * routing value: Hangul (Hang) and Han (Hani) are detected at `primary_script`
 * in Phase A and stub-gated there (script_not_supported_stub, §16 / §14
 * Decision 5). The member is kept in the union so downstream code can reference
 * it without a type error; do not remove it until CJK support is fully built.
 * Ethiopic (Ethi) is also stub-gated due to incomplete reorder pattern support,
 * not because it is logographic.
 *
 * @see spec.md §9 (Three-group routing)
 * @see content/flows/phase_a_identity.yaml
 * @see ScriptClass (axes.ts) for the strategy-selector equivalent
 */
export type ScriptFamily =
  | "indic"
  | "sea"
  | "rtl"
  | "syllabic"
  | "logographic"
  | "alpha-nonlatin"
  | "other";

/**
 * Typed result of Phase A identity questions — the gating fields that
 * directly influence build artifacts (.kmn, .kps, LICENSE.md, welcome.htm).
 *
 * Distinct from {@link KeyboardProvenance} (non-gating intake metadata, spec §8
 * step 3). Produced by parsing a completed `phase_a_identity.yaml` answers block.
 *
 * Note: the localized language name (autonym) is stored on
 * {@link KeyboardProvenance.localizedName} per the Phase A acceptance criteria,
 * which explicitly type it there. Treat it as build-relevant even though it
 * lives on the provenance object.
 *
 * @see spec.md §8 step 3
 * @see content/flows/phase_a_identity.yaml
 */
export interface KeyboardIdentity {
  /** Language name in English (e.g. "Bafut"). */
  languageName: string;
  /** BCP47 tag, cross-checked against langtags.json (e.g. "bfd", "bfd-Latn"). */
  bcp47Tag: string;
  /** Display name for the keyboard package and welcome.htm. */
  displayName: string;
  /** Copyright holder written into LICENSE.md and .kmn header. */
  copyrightHolder: string;
  /** Three-group routing, user-confirmed in Phase A (spec §9). */
  routingGroup: RoutingGroup;
  /**
   * Script subfamily for non-Roman routing group only.
   * Undefined when {@link routingGroup} is `"qwerty-qwertz"` or `"azerty"`.
   *
   * @see spec.md §9
   */
  scriptFamily?: ScriptFamily;
}

/**
 * Input shape for {@link makeKeyboardIdentity}. Identical to
 * {@link KeyboardIdentity} — named separately to match the `XInit` factory
 * convention used across this package.
 */
export type KeyboardIdentityInit = KeyboardIdentity;

/**
 * Construct a {@link KeyboardIdentity} from a {@link KeyboardIdentityInit},
 * omitting `scriptFamily` when undefined so the result satisfies
 * `exactOptionalPropertyTypes`.
 *
 * @see spec.md §8 step 3
 */
export function makeKeyboardIdentity(
  init: KeyboardIdentityInit
): KeyboardIdentity {
  return {
    languageName: init.languageName,
    bcp47Tag: init.bcp47Tag,
    displayName: init.displayName,
    copyrightHolder: init.copyrightHolder,
    routingGroup: init.routingGroup,
    ...(init.scriptFamily !== undefined
      ? { scriptFamily: init.scriptFamily }
      : {}),
  };
}
