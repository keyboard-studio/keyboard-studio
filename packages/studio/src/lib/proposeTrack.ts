// proposeTrack — propose-then-confirm for the authoring-track question.
//
// The track question asks whether the author copies the chosen base into a
// new keyboard or adapts that base in place. Left blank, it is a derivable
// decision point left unset; this proposer derives it from the two facts the
// author has already given: the target language tag they chose at identity,
// and the languages the chosen base declares for itself.
//
// Rule: adapt only when the base is a keyboard for exactly this language —
// its declared language list has exactly one entry, and that entry matches
// the target on both language subtag and script. Every other shape (the
// base serves a different language or script, serves several languages, or
// declares no languages at all, or no target tag is known) proposes copy:
// starting a new keyboard is the non-destructive default, and adapting a
// keyboard that is not plainly the target language's own keyboard should be
// a deliberate author choice, never a silent preselection.
//
// The result is a PROPOSAL only: the track step preselects it with its
// reason shown, and the author confirms or overturns it there. A track the
// author has already recorded always wins over this proposal.

import { resolveEffectiveScript } from "@keyboard-studio/contracts";
import { canonicalLanguageSubtag } from "../survey/targetBcp47.ts";
import { getLoadedLangtags } from "./langtagsDefaults.ts";
import { primarySubtag } from "./suggestStart.ts";

export type TrackProposalBasis =
  | "same-language"
  | "different-language"
  | "different-script"
  | "multiple-languages"
  | "no-base-languages"
  | "no-target";

export interface TrackProposal {
  track: "copy" | "adapt";
  /** Why the studio suggests this track; shown as the one-line reason under the radio group. */
  reason: string;
  /** Which arm of the rule produced the suggestion. */
  basis: TrackProposalBasis;
}

/**
 * A tag reduced to the two subtags the rule compares, normalised the way
 * the target tag itself is composed: the language is the canonical primary
 * subtag (see `canonicalLanguageSubtag` in survey/targetBcp47.ts), and the
 * script is the tag's effective script — its explicit script subtag when it
 * carries one, otherwise the language's langtags default script, which is
 * exactly the script a canonical target tag omits for brevity. Region and
 * variant subtags play no part: "fr-FR" and "fr" are the same language for
 * this choice, and a romanization target carries its script explicitly.
 */
function languageAndScript(tag: string): { language: string; script: string | undefined } {
  const trimmed = tag.trim();
  const language = canonicalLanguageSubtag(primarySubtag(trimmed));
  const script = resolveEffectiveScript(trimmed, (primary) =>
    getLoadedLangtags()?.getLanguageDefaults(primary),
  );
  return { language, script };
}

/**
 * Propose an authoring track from the target tag and the base's declared
 * languages. Never blank: every input shape yields a proposal with a reason.
 *
 * @param targetBcp47  The author's target tag (surveyContext.bcp47_tag), or
 *                     undefined/empty before identity has produced one.
 * @param baseLanguages The base keyboard's declared BCP47 tags
 *                     (StartKeyboard.languages), or undefined when the base
 *                     declares none.
 */
export function proposeTrack(
  targetBcp47: string | undefined,
  baseLanguages: readonly string[] | undefined,
): TrackProposal {
  const target = (targetBcp47 ?? "").trim();
  if (target === "") {
    return {
      track: "copy",
      basis: "no-target",
      reason:
        "Suggested because no target language is recorded yet, so starting a new keyboard is the safe choice.",
    };
  }
  const languages = (baseLanguages ?? []).map((t) => t.trim()).filter((t) => t !== "");
  if (languages.length === 0) {
    return {
      track: "copy",
      basis: "no-base-languages",
      reason: `Suggested because this base does not declare which languages it serves, so it cannot be shown to be a ${target} keyboard.`,
    };
  }
  if (languages.length > 1) {
    return {
      track: "copy",
      basis: "multiple-languages",
      reason: `Suggested because this base serves ${languages.length} languages, not just ${target}.`,
    };
  }
  const base = languages[0]!;
  const t = languageAndScript(target);
  const b = languageAndScript(base);
  if (t.language !== b.language) {
    return {
      track: "copy",
      basis: "different-language",
      reason: `Suggested because this base is for ${base}, not your target language ${target}.`,
    };
  }
  if (t.script !== b.script) {
    return {
      track: "copy",
      basis: "different-script",
      reason: `Suggested because this base writes ${base} in a different script from your target ${target}.`,
    };
  }
  return {
    track: "adapt",
    basis: "same-language",
    reason: `Suggested because this base is a ${target} keyboard — the same single language and script as your target.`,
  };
}
