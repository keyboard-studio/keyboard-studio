/**
 * keyIdMinting - the touch key id minting/proposal and validation policy
 * (spec 058 FR-024/FR-025/FR-045; contract:
 * specs/058-touch-key-editor/contracts/key-id-policy.md).
 *
 * The premise this whole module rests on (key-id-policy.md section 1a):
 * `T_<HEX>` does NOT self-output. Only a `U_<HEX>` id is interpreted by
 * KeymanWeb's `forUnicodeKeynames` default-output step; a `T_<HEX>` id is
 * exactly as inert as a `T_<MNEMONIC>` one - the hex in `T_0300` is a HUMAN
 * cross-check convention (the id and the rule body restate each other),
 * never a machine-interpreted one. That is the entire reason the policy below
 * distinguishes "no rule needed" (`U_`) from "id + rule, together" (`T_`):
 * a `U_` id can never go dead, while a `T_` id is inert until a rule exists
 * for it - which is precisely what makes it the right vehicle for anything
 * that needs to be guarded (a combining mark) or that a single output can't
 * express (a string, a case triple).
 *
 * Two things this module deliberately does NOT do:
 *   - Scan a KeyboardIR/TouchLayoutIR. Every fact this module needs (does the
 *     keyboard already handle CAPS, how many other layers/platforms already
 *     carry a candidate id, what ids already occupy the target scope) is
 *     supplied by the caller. Callers own IR traversal; this module is pure
 *     data-in, data-out.
 *   - Write or synthesize the actual `.kmn` rule/guard-store text beyond a
 *     short human-readable preview line. Full rule synthesis (group choice,
 *     insertion ordering, semantic idempotence, guard-store reuse) is
 *     touchRuleSynthesis.ts's job (spec 058 T080/T081), a distinct module.
 */

import { toUPlusNotation } from "@keyboard-studio/contracts";
import { unicodeCharHex } from "../shared/touch-ids.js";
import { caseCounterpart } from "../character-discovery/casePair.js";

// ---------------------------------------------------------------------------
// Reserved ids (key-id-policy.md section 6) - the canonical exported set.
//
// Several existing modules already MINT ids under these prefixes as their own
// internal placeholder convention (they are not duplicating this module - this
// module did not exist until now, so this is the first canonical home for the
// literal strings, cross-referenced rather than re-derived):
//   - `T_removed_<n>`  - applyDesktopModifications.ts / applyDesktopModificationsToRawJson.ts
//                        (`mintPlaceholderId`)
//   - `T_carved_<id>`  - applyCarveKeycapRemovalsToVfs.ts
//   - `T_touchdel_<id>`- applyTouchKeycapRemovalsToVfs.ts (`PLACEHOLDER_PREFIX`)
//   - `T_new_<n>`      - Keyman Developer's own auto-mint default (never ours)
// This module's job with respect to those four is narrower than minting them:
// reject any of them as AUTHOR input to the key-id editing surface (rename,
// add-key, or an id typed into the assign panel) - an author must never be
// able to type or keep a placeholder id that another subsystem's cascade
// relies on meaning "not a real key".
// ---------------------------------------------------------------------------

/** Prefixes never mintable, and rejected as author input (key-id-policy.md section 6). */
export const RESERVED_KEY_ID_PREFIXES = [
  "T_new_",
  "T_removed_",
  "T_carved_",
  "T_touchdel_",
] as const;

/**
 * Sentinel ids matching the corpus convention for a deliberately empty/gap
 * key. Rejected as author input UNLESS the candidate id is being set
 * precisely BECAUSE the key is meant to be that sentinel (see
 * {@link checkReservedKeyId}'s `intendedAsSentinel`).
 */
export const RESERVED_SENTINEL_KEY_IDS = ["T_BLANK", "T_SPACER", "T_NUL"] as const;

/**
 * KeymanWeb's private-use triple - `PRIVATE_USE_IDS` in
 * simulator/vendor/keyman/common/types/keyman-touch-layout/keyman-touch-layout-file.ts.
 * Restated here (not imported) because that file is vendored simulator
 * source and pattern-apply has no dependency on the simulator subsystem.
 *
 * Per key-id-policy.md section 6's correction: the literal `*` in these ids
 * is syntactically valid under BOTH the import and mint regexes below, so
 * this MUST be an exact-match blocklist, never a regex/prefix exclusion.
 */
export const RESERVED_PRIVATE_USE_KEY_IDS = [
  "T_*_MT_SHIFT_TO_SHIFT",
  "T_*_MT_SHIFT_TO_CAPS",
  "T_*_MT_SHIFT_TO_DEFAULT",
] as const;

// ---------------------------------------------------------------------------
// Validation - two distinct regimes (key-id-policy.md section 3.1)
// ---------------------------------------------------------------------------

/**
 * Import-time acceptance, mirroring upstream `KeyIdType`/`GetKeyIdUnicodeType`
 * exactly. Deliberately permissive on shape - an unpadded `U_41` is
 * upstream-legal and ships in the wild.
 */
const IMPORT_KEY_ID_RE = /^((K_[A-Z0-9_?]+)|(T_\S+)|(U_[0-9A-F_]+))$/;

/**
 * Studio minting-only shape for a `U_` id: uppercase hex, each group
 * zero-padded to at least 4 digits. NEVER applied to reject an id the studio
 * did not create.
 */
const MINT_UNICODE_KEY_ID_RE = /^U_[0-9A-F]{4,6}(_[0-9A-F]{4,6})*$/;

/**
 * Upstream `IsValidUnicodeValue`'s semantic range for one `_`-separated `U_`
 * segment: `[0x20,0x7F]` union `[0xA0,0x10FFFF]` (key-id-policy.md section
 * 3.1).
 */
function isSemanticValidUnicodeSegment(hex: string): boolean {
  if (hex.length === 0) return false;
  const cp = parseInt(hex, 16);
  if (!Number.isFinite(cp)) return false;
  return (cp >= 0x20 && cp <= 0x7f) || (cp >= 0xa0 && cp <= 0x10ffff);
}

/** Why {@link checkKeyIdSyntax} rejected a candidate id's shape. */
export type KeyIdSyntaxRejectionReason =
  | "malformed"
  | "unicode-out-of-range"
  | "unicode-unpadded";

export type KeyIdSyntaxCheckResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: KeyIdSyntaxRejectionReason };

/**
 * Check a candidate id's SYNTAX only - not reserved-prefix, uniqueness, or
 * case collision (see {@link validateCandidateKeyId} for the full check).
 *
 * `minting: false` mirrors upstream's own acceptance exactly (import-time):
 * a `U_` id needs only per-segment semantic-range validity, no digit-count
 * shape - `U_41` passes.
 *
 * `minting: true` additionally requires the studio's own padded `U_` shape
 * (key-id-policy.md section 3.1) - `U_41` fails as `unicode-unpadded`. This
 * extra constraint applies ONLY to `U_` ids; `T_`/`K_` ids have no additional
 * minting-only shape beyond the base regex.
 */
export function checkKeyIdSyntax(
  id: string,
  opts: { readonly minting: boolean },
): KeyIdSyntaxCheckResult {
  if (!IMPORT_KEY_ID_RE.test(id)) return { valid: false, reason: "malformed" };

  if (id.startsWith("U_")) {
    const segments = id.slice(2).split("_");
    if (segments.some((s) => s.length === 0)) return { valid: false, reason: "malformed" };
    if (!segments.every(isSemanticValidUnicodeSegment)) {
      return { valid: false, reason: "unicode-out-of-range" };
    }
    if (opts.minting && !MINT_UNICODE_KEY_ID_RE.test(id)) {
      return { valid: false, reason: "unicode-unpadded" };
    }
  }

  return { valid: true };
}

/**
 * Reject reason for {@link checkReservedKeyId}. `undefined` means not
 * reserved.
 */
export type ReservedKeyIdRejectionReason =
  | "reserved-prefix"
  | "reserved-sentinel"
  | "reserved-private-use";

/**
 * Check a candidate id against the section 6 reserved sets. Exact-match for
 * the private-use triple and the sentinels (never a prefix/regex exclusion -
 * see {@link RESERVED_PRIVATE_USE_KEY_IDS}'s doc); prefix match for the four
 * placeholder conventions.
 *
 * `intendedAsSentinel: true` allows `T_BLANK`/`T_SPACER`/`T_NUL` through -
 * the author (or the suppress-key compound operation) is deliberately
 * setting the id to that sentinel, not stumbling into it.
 */
export function checkReservedKeyId(
  id: string,
  opts: { readonly intendedAsSentinel?: boolean } = {},
): ReservedKeyIdRejectionReason | undefined {
  if ((RESERVED_PRIVATE_USE_KEY_IDS as readonly string[]).includes(id)) {
    return "reserved-private-use";
  }
  if (RESERVED_KEY_ID_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return "reserved-prefix";
  }
  if (
    opts.intendedAsSentinel !== true &&
    (RESERVED_SENTINEL_KEY_IDS as readonly string[]).includes(id)
  ) {
    return "reserved-sentinel";
  }
  return undefined;
}

/** An existing key id already occupying some scope, for the uniqueness/case checks. */
export interface ExistingKeyIdInScope {
  readonly id: string;
  /** The key's per-key `TouchKeyIR.layer` override, if any (spec 058 T008). */
  readonly layer?: string;
}

/** Context {@link validateCandidateKeyId} needs to fully validate one candidate id. */
export interface KeyIdCandidateContext {
  /**
   * `true` for any id the studio itself is about to set (rename target,
   * add-key id, or a minted proposal) - applies the minting-only `U_` shape
   * and the reserved-id checks. `false` mirrors pure import-time acceptance
   * (only {@link checkKeyIdSyntax} runs; reserved/uniqueness/case are
   * author-edit concerns, not import-acceptance ones).
   */
  readonly minting: boolean;
  /**
   * Ids already present in the scope uniqueness is measured over - callers
   * decide that scope (e.g. "this layer of this platform" for uniqueness;
   * callers wanting the broader case-collision guarantee kmcmplib's
   * case-insensitive interning implies should pass the widest scope they
   * have, since this module does not itself widen it).
   */
  readonly existingIdsInScope: readonly ExistingKeyIdInScope[];
  /** The candidate key's own `TouchKeyIR.layer` override, if any. */
  readonly layerOverride?: string;
  readonly intendedAsSentinel?: boolean;
}

export type KeyIdRejectionReason =
  | KeyIdSyntaxRejectionReason
  | ReservedKeyIdRejectionReason
  | "duplicate-in-layer"
  | "case-only-collision";

export type ValidateKeyIdResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: KeyIdRejectionReason;
      readonly conflictingId?: string;
    };

/**
 * Full candidate-id validation (key-id-policy.md section 3, minus bullets 4
 * and 5 which are dead-key/redundant-rule findings owned by
 * touchRuleSynthesis.ts and touchKeyDiagnostics.ts, not this module).
 * Never throws; every rejection carries a specific reason code (FR-045).
 *
 * Order: syntax, then reserved, then in-layer uniqueness (exempt when the
 * candidate's `layerOverride` differs from the conflicting existing key's),
 * then case-only collision (checked over the FULL scope passed in, with no
 * layer exemption - kmcmplib interns case-insensitively regardless of
 * layer).
 */
export function validateCandidateKeyId(
  id: string,
  ctx: KeyIdCandidateContext,
): ValidateKeyIdResult {
  const syntax = checkKeyIdSyntax(id, { minting: ctx.minting });
  if (!syntax.valid) return { valid: false, reason: syntax.reason };

  const reserved = checkReservedKeyId(id, {
    ...(ctx.intendedAsSentinel !== undefined ? { intendedAsSentinel: ctx.intendedAsSentinel } : {}),
  });
  if (reserved !== undefined) return { valid: false, reason: reserved };

  const duplicate = ctx.existingIdsInScope.find(
    (existing) => existing.id === id && existing.layer === ctx.layerOverride,
  );
  if (duplicate !== undefined) {
    return { valid: false, reason: "duplicate-in-layer", conflictingId: duplicate.id };
  }

  const caseCollision = ctx.existingIdsInScope.find(
    (existing) => existing.id !== id && existing.id.toUpperCase() === id.toUpperCase(),
  );
  if (caseCollision !== undefined) {
    return { valid: false, reason: "case-only-collision", conflictingId: caseCollision.id };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Minting policy (key-id-policy.md section 2)
// ---------------------------------------------------------------------------

/** Which row of the section 2 minting table the proposal followed. */
export type KeyIdMintingPath =
  | "unicode-default"
  | "combining-mark-guard"
  | "multi-codepoint-string"
  | "case-triple"
  // Spec 061 FR-029/FR-030: the id was not minted at all — it was kept from the
  // physical key at this position, or taken from a key that already produces the
  // character. `proposeKeyId` never returns it; only `proposeTouchKeyId` does.
  // It lives in this union so a proposal has ONE path vocabulary to render.
  | "inherited";

/**
 * Why a requested case triple was not produced. The titlecase case is called
 * out specifically per key-id-policy.md's fail-safe note: `caseCounterpart`
 * tests only `\p{Ll}`/`\p{Lu}`, so a General_Category `Lt` character (Dz, Lj,
 * Nj) is its own third case-form and gets no triple - that is fail-safe, not
 * a bug, and the UI needs to say so rather than silently proposing nothing.
 */
export type NoCaseTripleReason =
  | "caps-not-handled"
  | "titlecase-self-third-form"
  | "no-case-counterpart"
  | "combining-mark"
  | "not-single-letter";

/** The three rule lines a proposed case triple would add. */
export interface CaseTripleRuleLines {
  readonly ncaps: string;
  readonly shiftNcaps: string;
  readonly caps: string;
}

/** Structured (not prose - FR-044) reason to prefer the `T_` alternative over the `U_` default. */
export type KeyIdMintingAlternativeReason =
  | { readonly kind: "shared-candidate"; readonly count: number }
  | { readonly kind: "always-available" };

/** The `T_` option shown alongside a pre-selected `U_` default (key-id-policy.md section 2.1). */
export interface KeyIdMintingAlternative {
  readonly id: string;
  readonly ruleLine: string;
  readonly reason: KeyIdMintingAlternativeReason;
}

/** A minting proposal: a recommendation, not a mutation. */
export interface KeyIdMintingProposal {
  readonly path: KeyIdMintingPath;
  readonly id: string;
  readonly ruleRequired: boolean;
  /** `true` only for the combining-mark path - a guard rule is needed in ADDITION to the producing rule. */
  readonly guardRequired: boolean;
  /** Human-readable preview line(s) for the producing rule; absent when `ruleRequired` is `false`. */
  readonly ruleLines?: readonly string[];
  /** Present only on the case-triple path. */
  readonly caseTriple?: CaseTripleRuleLines;
  /** Present only when a case triple was requested but could not be produced. */
  readonly noCaseTripleReason?: NoCaseTripleReason;
  /** Present only on the unicode-default path, where a `T_` path is also viable. */
  readonly alternative?: KeyIdMintingAlternative;
}

/** Input to {@link proposeKeyId}. This module never scans an IR - the caller supplies these facts. */
export interface KeyIdMintingRequest {
  /** The character(s) the author wants this key to produce. */
  readonly chars: string;
  /** Does the keyboard already handle CAPS (gates offering a case triple). */
  readonly capsHandled: boolean;
  /** Explicit author request for the NCAPS/SHIFT+NCAPS/CAPS trio. */
  readonly caseTripleRequested?: boolean;
  /** BCP47 tag for locale-sensitive case mapping, forwarded to `caseCounterpart`. */
  readonly bcp47?: string;
  /**
   * How many OTHER layers/platforms already carry a candidate `T_` id for
   * this output - feeds the section 2.1 alternative's reason ("the same id
   * already appears on N other layers/platforms, so one rule serves all of
   * them"). `undefined` or `0` still offers the alternative, with a generic
   * reason instead of a count-based one.
   */
  readonly sharedCandidateCount?: number;
}

/** Every char in General_Category Mn/Mc/Me (combining mark). */
const COMBINING_MARK_RE = /^\p{M}$/u;

/** ASCII-mnemonic-shaped multi-codepoint text (e.g. "FCFA") - the only branch in {@link mintMultiCodepointKeyId}. */
const ASCII_MNEMONIC_RE = /^[A-Z0-9]+$/;

/**
 * Mint a `T_<MNEMONIC>` id for multi-codepoint output. ONE algorithm for
 * every multi-codepoint string, regardless of script - a Latin digraph like
 * "FCFA" and a multi-codepoint grapheme cluster (e.g. an Indic conjunct) are
 * mechanically identical inputs to this function; the only branch is on
 * whether the text itself is ASCII-mnemonic-shaped, never on "is this a
 * cluster".
 */
function mintMultiCodepointKeyId(text: string): string {
  const upper = text.toUpperCase();
  if (ASCII_MNEMONIC_RE.test(upper)) return `T_${upper}`;
  const hexJoined = [...text].map((ch) => unicodeCharHex(ch)).join("_");
  return `T_${hexJoined}`;
}

/** `+ [<id>] > <output literal>` - a human preview line, not the final synthesized rule (touchRuleSynthesis.ts owns that). */
function composeProducingRuleLine(id: string, text: string): string {
  if ([...text].length === 1) return `+ [${id}] > ${toUPlusNotation(text)}`;
  const quote = text.includes("'") ? '"' : "'";
  return `+ [${id}] > ${quote}${text}${quote}`;
}

type CaseTripleAttempt =
  | { readonly ok: true; readonly id: string; readonly lines: CaseTripleRuleLines }
  | { readonly ok: false; readonly reason: NoCaseTripleReason };

/** General_Category Lt (titlecase) - matches neither `\p{Ll}` nor `\p{Lu}`, so `caseCounterpart` returns null for it. */
const TITLECASE_RE = /^\p{Lt}$/u;

function tryBuildCaseTriple(ch: string, request: KeyIdMintingRequest): CaseTripleAttempt {
  if (!request.capsHandled) return { ok: false, reason: "caps-not-handled" };

  const counterpart = caseCounterpart(ch, request.bcp47);
  if (counterpart === null) {
    return TITLECASE_RE.test(ch)
      ? { ok: false, reason: "titlecase-self-third-form" }
      : { ok: false, reason: "no-case-counterpart" };
  }

  const lower = counterpart.direction === "toUpper" ? ch : counterpart.counterpart;
  const upper = counterpart.direction === "toUpper" ? counterpart.counterpart : ch;
  const id = `T_${unicodeCharHex(lower)}`;
  const lowerLit = toUPlusNotation(lower);
  const upperLit = toUPlusNotation(upper);

  return {
    ok: true,
    id,
    lines: {
      ncaps: `+ [NCAPS ${id}] > ${lowerLit}`,
      shiftNcaps: `+ [NCAPS SHIFT ${id}] > ${upperLit}`,
      caps: `+ [CAPS ${id}] > ${upperLit}`,
    },
  };
}

function buildUnicodeDefaultProposal(
  ch: string,
  sharedCandidateCount: number | undefined,
): KeyIdMintingProposal {
  const hex = unicodeCharHex(ch);
  const altId = `T_${hex}`;
  const reason: KeyIdMintingAlternativeReason =
    sharedCandidateCount !== undefined && sharedCandidateCount > 0
      ? { kind: "shared-candidate", count: sharedCandidateCount }
      : { kind: "always-available" };

  return {
    path: "unicode-default",
    id: `U_${hex}`,
    ruleRequired: false,
    guardRequired: false,
    alternative: { id: altId, ruleLine: composeProducingRuleLine(altId, ch), reason },
  };
}

/**
 * Propose (never mutate) a key id for the character(s) an author wants a key
 * to produce, following the section 2 table:
 *
 *   - single codepoint, not a combining mark, no case triple requested ->
 *     `U_<HEX>`, no rule (the default, pre-selected; a `T_` alternative is
 *     always offered alongside it per section 2.1).
 *   - combining mark -> `T_<UPPERHEX>`, guard AND producing rule required.
 *     No `U_` alternative exists for this row - that is the whole point of
 *     section 1a.
 *   - multi-codepoint / string output (a digraph, a grapheme cluster - no
 *     distinction) -> `T_<MNEMONIC>`, producing rule required.
 *   - case triplication requested -> `T_<id>` plus the NCAPS/SHIFT+NCAPS/CAPS
 *     trio, gated on `capsHandled` and on a case counterpart existing; when
 *     it cannot be honored, falls back to the unicode-default proposal for
 *     the same character and reports why via `noCaseTripleReason`.
 *
 * `T_new_*` is never minted by this function - it does not appear anywhere
 * in the table above.
 */
export function proposeKeyId(request: KeyIdMintingRequest): KeyIdMintingProposal {
  const normalized = request.chars.normalize("NFC");
  const codepoints = [...normalized];

  if (codepoints.length === 0) {
    // Empty-input edge case - mirrors charToUnicodeKeyId's own fallback.
    return { path: "unicode-default", id: "U_FFFD", ruleRequired: false, guardRequired: false };
  }

  if (codepoints.length === 1) {
    const ch = codepoints[0]!;

    if (COMBINING_MARK_RE.test(ch)) {
      const id = `T_${unicodeCharHex(ch)}`;
      const proposal: KeyIdMintingProposal = {
        path: "combining-mark-guard",
        id,
        ruleRequired: true,
        guardRequired: true,
        ruleLines: [composeProducingRuleLine(id, ch)],
      };
      return request.caseTripleRequested === true
        ? { ...proposal, noCaseTripleReason: "combining-mark" }
        : proposal;
    }

    if (request.caseTripleRequested === true) {
      const attempt = tryBuildCaseTriple(ch, request);
      if (attempt.ok) {
        return {
          path: "case-triple",
          id: attempt.id,
          ruleRequired: true,
          guardRequired: false,
          ruleLines: [attempt.lines.ncaps, attempt.lines.shiftNcaps, attempt.lines.caps],
          caseTriple: attempt.lines,
        };
      }
      return {
        ...buildUnicodeDefaultProposal(ch, request.sharedCandidateCount),
        noCaseTripleReason: attempt.reason,
      };
    }

    return buildUnicodeDefaultProposal(ch, request.sharedCandidateCount);
  }

  // Multi-codepoint / string output. Mechanically identical for every
  // script - see mintMultiCodepointKeyId's doc.
  const id = mintMultiCodepointKeyId(normalized);
  const proposal: KeyIdMintingProposal = {
    path: "multi-codepoint-string",
    id,
    ruleRequired: true,
    guardRequired: false,
    ruleLines: [composeProducingRuleLine(id, normalized)],
  };
  return request.caseTripleRequested === true
    ? { ...proposal, noCaseTripleReason: "not-single-letter" }
    : proposal;
}
