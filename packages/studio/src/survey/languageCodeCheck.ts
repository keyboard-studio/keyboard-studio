// languageCodeCheck — the shared check on a typed language code or tag (spec 115
// FR-028, FR-031, FR-033). Syntax is `parseBcp47`'s (never EthnoLib's); the
// registry lookup is the engine's `registeredLanguage`, passed in so this module
// stays free of the engine chunk (it is read by the survey's static graph).
//
// A code is accepted when it is registered, private use (`qaa`-`qtz`), or
// well-formed but unregistered (accepted with a warning). An ill-formed code is
// refused with the parser's reason.

import { parseBcp47, type Bcp47ParseErrorReason, type Bcp47Parts } from "@keyboard-studio/contracts";

/** What the registry knows about a language subtag (the engine's `registeredLanguage`). */
export interface RegisteredLookup {
  (subtag: string): { description: string; scope?: string } | undefined;
}

export type CodeCheck =
  | {
      ok: true;
      /** The language subtag, lowercase. */
      code: string;
      parts: Bcp47Parts;
      /** The registry's name for the code, when it is registered. */
      registeredName?: string;
      /** In the private-use range `qaa`-`qtz`. */
      privateUse: boolean;
      /** Well-formed but not in the registry (FR-031). */
      warning?: "unregistered";
    }
  | { ok: false; reason: Bcp47ParseErrorReason | "not-a-code" };

/** Check a typed language code or full tag. */
export function checkLanguageTag(text: string, registered: RegisteredLookup | null): CodeCheck {
  const parsed = parseBcp47(text.trim());
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const parts = parsed.parts;
  // A grandfathered tag, or a language that is not a 2-3 letter code, is a word
  // rather than a code.
  const code = parts.language;
  if (parts.grandfathered !== undefined || !/^[a-z]{2,3}$/.test(code)) {
    return { ok: false, reason: "bad-language" };
  }
  if (registered === null) return { ok: true, code, parts, privateUse: false };
  const entry = registered(code);
  if (entry === undefined) return { ok: true, code, parts, privateUse: false, warning: "unregistered" };
  const privateUse = entry.scope === "private-use";
  return {
    ok: true,
    code,
    parts,
    privateUse,
    ...(privateUse ? {} : { registeredName: entry.description }),
  };
}

/** Check a bare language code (FR-031): a full tag is not accepted here. */
export function checkLanguageCode(text: string, registered: RegisteredLookup | null): CodeCheck {
  const check = checkLanguageTag(text, registered);
  if (!check.ok) return check;
  const p = check.parts;
  if (
    p.extlang.length > 0 ||
    p.script !== undefined ||
    p.region !== undefined ||
    p.variants.length > 0 ||
    p.extensions.length > 0 ||
    p.privateUse.length > 0
  ) {
    return { ok: false, reason: "not-a-code" };
  }
  return check;
}
