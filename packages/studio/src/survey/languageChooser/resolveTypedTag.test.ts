// Spec 115 T031: typed codes and tags resolve to proposals (FR-028).

import { describe, it, expect } from "vitest";
import { checkTypedTag, resolveTypedTag } from "./resolveTypedTag.ts";

describe("resolveTypedTag", () => {
  it("bft proposes Balti", () => {
    expect(resolveTypedTag("bft")).toMatchObject({ language: "bft", registeredName: "Balti" });
  });

  it("oc-gascon is oc plus the registered variant", () => {
    expect(resolveTypedTag("oc-gascon")).toMatchObject({ language: "oc", dialectSubtag: "gascon" });
  });

  it("fr-CA is fr plus CA", () => {
    expect(resolveTypedTag("fr-CA")).toMatchObject({ language: "fr", region: "CA" });
  });

  it("sr-Latn-RS is sr plus Latn plus RS", () => {
    expect(resolveTypedTag("sr-Latn-RS")).toMatchObject({ language: "sr", script: "Latn", region: "RS" });
  });

  it("zzz is proposed with a warning", () => {
    const p = resolveTypedTag("zzz");
    expect(p).toMatchObject({ language: "zzz", warning: "unregistered" });
    expect(p?.registeredName).toBeUndefined();
  });

  it("qaa is a private-use proposal", () => {
    const p = resolveTypedTag("qaa");
    expect(p).toMatchObject({ language: "qaa", privateUse: true });
    expect(p?.warning).toBeUndefined();
  });

  it("a private-use dialect is carried as x-...", () => {
    expect(resolveTypedTag("acr-x-rabinal")).toMatchObject({ language: "acr", dialectSubtag: "x-rabinal" });
  });

  it("sq-AL-gheg is null, with the parser's reason", () => {
    expect(resolveTypedTag("sq-AL-gheg")).toBeNull();
    expect(checkTypedTag("sq-AL-gheg")).toEqual({ ok: false, reason: "bad-subtag" });
  });

  it("fr-u-co-phonebk is fr, with the extension not carried and a note", () => {
    const p = resolveTypedTag("fr-u-co-phonebk");
    expect(p).toMatchObject({ language: "fr", note: "extension-not-carried" });
    expect(JSON.stringify(p)).not.toContain("phonebk");
  });

  it("names are not tags", () => {
    for (const text of ["Balti", "Ewondo", "Swiss French", "Mvog-Ada", ""]) {
      expect(resolveTypedTag(text)).toBeNull();
      expect(checkTypedTag(text)).toEqual({ ok: false, reason: "not-a-tag" });
    }
  });
});
