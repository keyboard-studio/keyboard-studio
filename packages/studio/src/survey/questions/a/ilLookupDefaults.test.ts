// Spec 092 (T033): the il_* lookup defaults mirror IdentityLite's seeders
// exactly — values, sources, and the deliberate exclusions (no profile
// name → no seed, never the login handle).

import { describe, it, expect } from "vitest";
import { buildExtractContext, type ExtractContext } from "../../../decisions/extractContext.ts";
import autonym from "./il_language_autonym.ts";
import code from "./il_language_code.ts";
import script from "./il_target_script.ts";
import authorName from "./il_author_name.ts";
import authorEmail from "./il_author_email.ts";

function ctx(identity?: ExtractContext["identity"]): ExtractContext {
  return { ...buildExtractContext(null, null), ...(identity ? { identity } : {}) };
}

describe("il_* lookup defaults (spec 092 T033)", () => {
  it("autonym: first local name with the langtags source", () => {
    expect(autonym.lookupDefault?.(ctx({ localNames: ["Bafut", "Bafut alt"] }))).toEqual({
      value: "Bafut",
      source: "langtags",
    });
  });

  it("autonym: Q1 English fallback carries no source; both absent → undefined", () => {
    expect(autonym.lookupDefault?.(ctx({ localNames: [], q1English: "Bafut" }))).toEqual({
      value: "Bafut",
    });
    expect(autonym.lookupDefault?.(ctx({}))).toBeUndefined();
    expect(autonym.lookupDefault?.(ctx())).toBeUndefined();
  });

  it("code and script come from the resolved entry, source langtags", () => {
    expect(code.lookupDefault?.(ctx({ languageCode: "bfd" }))).toEqual({
      value: "bfd",
      source: "langtags",
    });
    expect(script.lookupDefault?.(ctx({ targetScript: "Latn" }))).toEqual({
      value: "Latn",
      source: "langtags",
    });
    expect(code.lookupDefault?.(ctx({}))).toBeUndefined();
    expect(script.lookupDefault?.(ctx({}))).toBeUndefined();
  });

  it("author name/email come from the profile, source identity", () => {
    const profile = { authorProfile: { name: "Test Author", email: "t@example.org" } };
    expect(authorName.lookupDefault?.(ctx(profile))).toEqual({
      value: "Test Author",
      source: "identity",
    });
    expect(authorEmail.lookupDefault?.(ctx(profile))).toEqual({
      value: "t@example.org",
      source: "identity",
    });
  });

  it("no profile name → no seed (never the login handle); no email → no seed", () => {
    expect(authorName.lookupDefault?.(ctx({ authorProfile: { name: null } }))).toBeUndefined();
    expect(authorName.lookupDefault?.(ctx({ authorProfile: {} }))).toBeUndefined();
    expect(authorEmail.lookupDefault?.(ctx({ authorProfile: { email: "" } }))).toBeUndefined();
  });
});
