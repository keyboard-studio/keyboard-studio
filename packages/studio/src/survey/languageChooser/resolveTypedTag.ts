// resolveTypedTag — text that is a language code or tag, read as its parts
// (spec 115 R12, FR-028). The chooser's search alone returns nothing for
// `oc-gascon`; this layer proposes `oc` + `gascon` for the author to confirm.
//
// A word is not a code: the text must parse (`parseBcp47`), and its language
// subtag must be a 2-3 letter code. A registered code carries the registry's
// name for confirmation; `qaa`-`qtz` is a private-use proposal; a well-formed
// unregistered code is proposed with a warning. A proposal is never silent about
// what it dropped: an extension is not carried, and says so.

import { registeredLanguage } from "@keyboard-studio/engine/langtags";
import type { Bcp47ParseErrorReason } from "@keyboard-studio/contracts";
import { checkLanguageTag, type RegisteredLookup } from "../languageCodeCheck.ts";

export interface TypedTagProposal {
  language: string;
  script?: string;
  region?: string;
  /** A registered variant (`gascon`) or a private-use subtag (`x-rabinal`). */
  dialectSubtag?: string;
  /** The registry's name for the language, when it is registered. */
  registeredName?: string;
  /** In the private-use range `qaa`-`qtz`. */
  privateUse?: boolean;
  /** Well-formed but not registered (FR-031). */
  warning?: "unregistered";
  /** The tag carried an extension (`-u-co-phonebk`); it is not carried into the proposal. */
  note?: "extension-not-carried";
}

export type TypedTagResult =
  | { ok: true; proposal: TypedTagProposal }
  | { ok: false; reason: Bcp47ParseErrorReason | "not-a-tag" };

const lookup: RegisteredLookup = registeredLanguage;

/** Does the text have the shape of a tag (a 2-3 letter first subtag and a hyphen)? */
function looksLikeTag(text: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)+$/.test(text);
}

/** Resolve typed text, with the reason it is not a tag. */
export function checkTypedTag(text: string, registered: RegisteredLookup = lookup): TypedTagResult {
  const t = text.trim();
  if (t === "" || /\s/.test(t)) return { ok: false, reason: "not-a-tag" };
  const check = checkLanguageTag(t, registered);
  if (!check.ok) {
    // Ordinary words (a name with a hyphen) are not tags: report the reason only for tag-shaped text.
    return { ok: false, reason: looksLikeTag(t) && check.reason !== "not-a-code" ? check.reason : "not-a-tag" };
  }
  const p = check.parts;
  const dialect = p.variants[0] ?? (p.privateUse.length > 0 ? `x-${p.privateUse.join("-")}` : undefined);
  const proposal: TypedTagProposal = {
    language: check.code,
    ...(p.script !== undefined ? { script: p.script } : {}),
    ...(p.region !== undefined ? { region: p.region } : {}),
    ...(dialect !== undefined ? { dialectSubtag: dialect } : {}),
    ...(check.registeredName !== undefined ? { registeredName: check.registeredName } : {}),
    ...(check.privateUse ? { privateUse: true } : {}),
    ...(check.warning !== undefined ? { warning: check.warning } : {}),
    ...(p.extensions.length > 0 ? { note: "extension-not-carried" as const } : {}),
  };
  return { ok: true, proposal };
}

/** The proposal for typed text, or null when it is not a tag (see `checkTypedTag` for why). */
export function resolveTypedTag(text: string): TypedTagProposal | null {
  const r = checkTypedTag(text);
  return r.ok ? r.proposal : null;
}
