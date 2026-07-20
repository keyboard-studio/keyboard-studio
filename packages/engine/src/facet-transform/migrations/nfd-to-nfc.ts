// facet-transform migration — nfd-to-nfc (US3, output-changing).
//
// Scope: composes base+combining RHS char sequences → precomposed codepoints
// (`[{char:'a'},{char:U+0301}]` → `[{char:'á'}]`). Emitted bytes CHANGE (that is
// the point) — this is output-changing, presented with an output-level diff and
// explicit confirmation (FR-008/AC2); not parity-checked, but must not break
// compile.
//
// Companion rewrite (FR-008): remove the now-unreachable two-codepoint backspace
// override (`'a' U+0301 + [K_BKSP] > nul`) — once output composes, that sequence
// can never be produced, so the override can never match. Single-backspace then
// correctly deletes the composed codepoint. This is a Check #11-adjacent
// unreachable-rule REMOVAL, not a synthesis. (`nfc → nfd` is declined in v1.)

import type {
  IRRule,
  KeyboardIR,
  OutputElement,
} from "@keyboard-studio/contracts";
import type {
  CompanionRewrite,
  MigrationRule,
  RewriteResult,
  SiteLedgerEntry,
  SourceFacetMeasurement,
} from "../types.js";

function cloneIr(ir: KeyboardIR): KeyboardIR {
  return structuredClone(ir);
}

const COMBINING_MARK = /^\p{M}$/u;

function isCombining(ch: string): boolean {
  return COMBINING_MARK.test(ch);
}

/**
 * Compose consecutive `char` output elements into NFC precomposed codepoints.
 * A run of char elements is concatenated, NFC-normalized, and re-split into one
 * char element per resulting codepoint. Non-char elements break the run and pass
 * through untouched (deadkeys, index, outs, etc.).
 */
export function composeOutputToNfc(output: OutputElement[]): {
  output: OutputElement[];
  changed: boolean;
} {
  const result: OutputElement[] = [];
  let run: string[] = [];
  let changed = false;

  const flush = (): void => {
    if (run.length === 0) return;
    const joined = run.join("");
    const composed = joined.normalize("NFC");
    if (composed !== joined) changed = true;
    for (const ch of composed) {
      result.push({ kind: "char", value: ch });
    }
    run = [];
  };

  for (const el of output) {
    if (el.kind === "char") {
      run.push(el.value);
    } else {
      flush();
      result.push(el);
    }
  }
  flush();
  return { output: result, changed };
}

/**
 * A rule is a now-unreachable two-codepoint backspace override when its context
 * ends in `[K_BKSP]` preceded by a base char + a combining mark (the exact
 * decomposed sequence that composition removes from the produced set).
 */
function isUnreachableBackspaceOverride(rule: IRRule): boolean {
  // The context must fire on K_BKSP.
  const hasBackspace = rule.context.some(
    (el) => el.kind === "vkey" && el.name === "K_BKSP",
  );
  if (!hasBackspace) return false;
  // The look-back chars (ignoring the `+` keystroke separator and the vkey) must
  // end in a base char + a combining mark — the exact decomposed sequence that
  // composition removes from the produced set, making this override unreachable.
  const chars = rule.context.filter((el) => el.kind === "char");
  if (chars.length < 2) return false;
  const combining = chars[chars.length - 1];
  const base = chars[chars.length - 2];
  return (
    combining !== undefined &&
    combining.kind === "char" &&
    isCombining(combining.value) &&
    base !== undefined &&
    base.kind === "char" &&
    !isCombining(base.value)
  );
}

export const NFD_TO_NFC_RULE_ID = "nfd-to-nfc";

export const nfdToNfcRule: MigrationRule = {
  id: NFD_TO_NFC_RULE_ID,
  facetId: "source.normalization-posture",
  hasCompanionRewrites: true,
  derivesParameters: false,

  apply(
    workingCopyIr: KeyboardIR,
    _acceptedSiteIds: string[],
    _measurement: SourceFacetMeasurement,
  ): RewriteResult {
    const out = cloneIr(workingCopyIr);
    const ledger: SiteLedgerEntry[] = [];
    const removedBackspaceNodeIds: string[] = [];

    for (const group of out.groups) {
      const keep: IRRule[] = [];
      for (const rule of group.rules) {
        // Companion rewrite: drop unreachable two-codepoint backspace overrides.
        if (isUnreachableBackspaceOverride(rule)) {
          removedBackspaceNodeIds.push(rule.nodeId);
          continue;
        }
        const { output, changed } = composeOutputToNfc(rule.output);
        if (changed) {
          rule.output = output;
          ledger.push({ siteId: rule.nodeId, outcome: "applied" });
        }
        keep.push(rule);
      }
      group.rules = keep;
    }

    const companionRewrites: CompanionRewrite[] =
      removedBackspaceNodeIds.length > 0
        ? [
            {
              kind: "backspace-rule-removal",
              description:
                "Removed now-unreachable two-codepoint backspace override(s) so single-backspace deletes the composed codepoint.",
              affectedNodeIds: removedBackspaceNodeIds,
            },
          ]
        : [];
    for (const nodeId of removedBackspaceNodeIds) {
      ledger.push({ siteId: nodeId, outcome: "applied", reason: "companion backspace-rule removal" });
    }

    return {
      candidateIr: out,
      ledger,
      ...(companionRewrites.length > 0 ? { companionRewrites } : {}),
    };
  },
};
