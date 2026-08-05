// facet-transform migration — encoding-spelling (US1, behavior-preserving).
//
// Scope: output base/combining spelling (`'a' ↔ U+0061`); within-kind input
// spelling (char-ref `'e' ↔ U+0065`; modifier `named ↔ split`). NEVER touches
// the match-kind axis (contract scope).
//
// CODEC BOUND (important): the KeyboardIR canonicalizes char spelling — both
// `'a'` and `U+0061` parse to `{ kind: "char", value: "a" }`, and emit() renders
// BMP chars as `U+XXXX` deterministically (see codec/emit.ts). So the pure
// `'a' ↔ U+0061` axis is a SEMANTIC IDENTITY at the IR level: the migration
// copy-returns a structurally-equivalent IR (parity + invertibility hold by
// construction), and the per-role source-diff shown in the preview is rendered by
// {@link renderSourceDiff} from the spelling helper, not by mutating the IR. The
// IR-OBSERVABLE half of this migration is the modifier fold (`named ↔ split`),
// which does rewrite rule contexts and carries a per-site precondition.

import type {
  ContextElement,
  IRGroup,
  IRRule,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import type {
  MigrationRule,
  RewriteResult,
  SiteLedgerEntry,
  SourceDiffRow,
  SourceFacetMeasurement,
} from "../types.js";

/** Deep, structural copy of an IR — the copy-return discipline (research D2). */
function cloneIr(ir: KeyboardIR): KeyboardIR {
  return structuredClone(ir);
}

// ---------------------------------------------------------------------------
// Modifier fold (`named ↔ split`) — the IR-observable, precondition-gated half
// ---------------------------------------------------------------------------

/**
 * Side-specific modifiers and the generic modifier a fold collapses them into.
 * A generic match (e.g. `CTRL`) covers either side, so folding `[LCTRL]`+`[RCTRL]`
 * into `[CTRL]` is lossless when both rules exist with identical output.
 * (The codec recognizes RSHIFT/LCTRL/RCTRL/LALT/RALT as modifier tokens; LSHIFT
 * is not tokenized, so LCTRL/RCTRL are the canonical split-fold demo pair.)
 */
const SIDE_MODIFIERS: Readonly<Record<string, { other: string; generic: string }>> = {
  LSHIFT: { other: "RSHIFT", generic: "SHIFT" },
  RSHIFT: { other: "LSHIFT", generic: "SHIFT" },
  LCTRL: { other: "RCTRL", generic: "CTRL" },
  RCTRL: { other: "LCTRL", generic: "CTRL" },
  LALT: { other: "RALT", generic: "ALT" },
  RALT: { other: "LALT", generic: "ALT" },
};

function outputsEqual(a: IRRule, b: IRRule): boolean {
  return JSON.stringify(a.output) === JSON.stringify(b.output);
}

/** The single keystroke vkey element of a rule, if the context is exactly one vkey. */
function soleVkey(rule: IRRule): Extract<ContextElement, { kind: "vkey" }> | null {
  if (rule.context.length !== 1) return null;
  const el = rule.context[0];
  return el !== undefined && el.kind === "vkey" ? el : null;
}

/**
 * Fold `split-modifier` rule pairs (`[LSHIFT K_x]` + `[RSHIFT K_x]`) into a
 * single `named-modifier` rule (`[SHIFT K_x]`) — lossless ONLY when both split
 * rules exist and their outputs are identical (a `SHIFT` match covers either
 * shift). Sites failing the precondition are REFUSED per-site, never silently
 * collapsed (contract precondition).
 *
 * Exported for the T013 precondition unit test.
 */
export function foldSplitModifiersToNamed(
  ir: KeyboardIR,
  acceptedSiteIds: ReadonlySet<string>,
): { ir: KeyboardIR; ledger: SiteLedgerEntry[] } {
  const out = cloneIr(ir);
  const ledger: SiteLedgerEntry[] = [];

  for (const group of out.groups) {
    foldGroup(group, acceptedSiteIds, ledger);
  }
  return { ir: out, ledger };
}

function foldGroup(
  group: IRGroup,
  acceptedSiteIds: ReadonlySet<string>,
  ledger: SiteLedgerEntry[],
): void {
  const keep: IRRule[] = [];
  const consumed = new Set<string>();

  for (const rule of group.rules) {
    if (consumed.has(rule.nodeId)) continue;
    const vk = soleVkey(rule);
    const mod = vk?.modifiers.find((m) => SIDE_MODIFIERS[m] !== undefined);
    // Not a split-modifier site, or not accepted → pass through untouched.
    if (vk === null || mod === undefined || !acceptedSiteIds.has(rule.nodeId)) {
      keep.push(rule);
      continue;
    }

    // Find the sibling split rule (the other side) on the same base key.
    const { other: otherMod, generic } = SIDE_MODIFIERS[mod]!;
    const sibling = group.rules.find((r) => {
      if (r.nodeId === rule.nodeId || consumed.has(r.nodeId)) return false;
      const rvk = soleVkey(r);
      return (
        rvk !== null &&
        rvk.name === vk.name &&
        rvk.modifiers.includes(otherMod) &&
        acceptedSiteIds.has(r.nodeId)
      );
    });

    if (sibling === undefined) {
      // Precondition fails: no matching sibling — refuse this site.
      ledger.push({
        siteId: rule.nodeId,
        outcome: "refused",
        reason: `split-modifier fold refused: no matching ${otherMod} rule for ${vk.name} — folding to SHIFT would drop the ${otherMod} case.`,
      });
      keep.push(rule);
      continue;
    }
    if (!outputsEqual(rule, sibling)) {
      // Precondition fails: outputs differ — folding would lose a case.
      ledger.push({
        siteId: rule.nodeId,
        outcome: "refused",
        reason: `split-modifier fold refused: ${mod} and ${otherMod} rules for ${vk.name} have different outputs.`,
      });
      keep.push(rule);
      continue;
    }

    // Precondition holds: emit one generic-modifier rule; drop both split rules.
    const foldedModifiers = vk.modifiers
      .filter((m) => m !== mod)
      .concat(generic);
    const folded: IRRule = {
      ...rule,
      context: [{ ...vk, modifiers: foldedModifiers }],
    };
    keep.push(folded);
    consumed.add(rule.nodeId);
    consumed.add(sibling.nodeId);
    ledger.push({ siteId: rule.nodeId, outcome: "applied" });
    ledger.push({ siteId: sibling.nodeId, outcome: "applied" });
  }

  group.rules = keep;
}

// ---------------------------------------------------------------------------
// Source-diff rendering (preview only — not an IR mutation)
// ---------------------------------------------------------------------------

function quotedLiteral(ch: string): string {
  return `'${ch}'`;
}
function uNotation(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Render the per-role before/after spelling for the `source-diff` preview from a
 * representative produced char. This is display-only: it shows the house-style
 * spelling the user is normalizing to, independent of the (canonicalizing) IR.
 */
export function renderSourceDiff(
  sampleChar: string,
  fromValue: string,
  toValue: string,
): SourceDiffRow[] {
  const render = (mode: string): string => {
    if (mode === "u-notation") return uNotation(sampleChar);
    if (mode === "quoted-literal" || mode === "house-style") return quotedLiteral(sampleChar);
    return sampleChar;
  };
  return [
    { role: "output base/combining", before: render(fromValue), after: render(toValue) },
  ];
}

// ---------------------------------------------------------------------------
// MigrationRule
// ---------------------------------------------------------------------------

export const ENCODING_SPELLING_RULE_ID = "encoding-spelling";

export const encodingSpellingRule: MigrationRule = {
  id: ENCODING_SPELLING_RULE_ID,
  facetId: "source.encoding",
  hasCompanionRewrites: false,
  derivesParameters: false,

  apply(
    workingCopyIr: KeyboardIR,
    acceptedSiteIds: string[],
    _measurement: SourceFacetMeasurement,
  ): RewriteResult {
    const acceptedSet = new Set(acceptedSiteIds);

    // Modifier-fold path: any accepted site that is a split-shift rule triggers
    // the IR-observable fold; the precondition may refuse individual sites.
    const foldResult = foldSplitModifiersToNamed(workingCopyIr, acceptedSet);

    // Char-spelling path: a semantic identity at the IR level (see CODEC BOUND).
    // Every accepted site not accounted for by the fold ledger is recorded as
    // `applied` (its emit spelling is canonical).
    const ledgered = new Set(foldResult.ledger.map((l) => l.siteId));
    const ledger: SiteLedgerEntry[] = [...foldResult.ledger];
    for (const siteId of acceptedSiteIds) {
      if (!ledgered.has(siteId)) ledger.push({ siteId, outcome: "applied" });
    }

    return { candidateIr: foldResult.ir, ledger };
  },

  // Behavior-preserving spelling normalization is invertible; the IR-level
  // representation is canonical, so the inverse round-trip is the identity IR
  // (assertSemanticEquivalence(before, inverse(candidate)) holds).
  inverse(candidateIr: KeyboardIR): KeyboardIR {
    return candidateIr;
  },
};
