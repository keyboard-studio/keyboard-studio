// Typecheck-level pin on the vendored hook's surface (spec 115 contract: the
// dialect-search-and-question contract names these keys). A rename on a future
// re-vendor fails `tsc`; the runtime assertion keeps the file a real test.

import { describe, expect, it, expectTypeOf } from "vitest";
import { useLanguageChooser, isReadyToSubmit } from "./useLanguageChooser.ts";

type Chooser = ReturnType<typeof useLanguageChooser>;

describe("vendored useLanguageChooser", () => {
  it("returns the keys the studio chooser consumes", () => {
    expectTypeOf<Chooser>().toHaveProperty("languageResults");
    expectTypeOf<Chooser>().toHaveProperty("onSearchStringChange");
    expectTypeOf<Chooser>().toHaveProperty("selectLanguage");
    expectTypeOf<Chooser>().toHaveProperty("selectUnlistedLanguage");
    expectTypeOf<Chooser>().toHaveProperty("selectManuallyEnteredTagLanguage");
    expectTypeOf<Chooser>().toHaveProperty("selectScript");
    expectTypeOf<Chooser>().toHaveProperty("saveLanguageDetails");
    expectTypeOf<Chooser>().toHaveProperty("readyToSubmit");
    expectTypeOf<Chooser>().toHaveProperty("resetTo");
    expectTypeOf<Chooser["readyToSubmit"]>().toEqualTypeOf<boolean>();
    expect(typeof useLanguageChooser).toBe("function");
  });

  it("is not ready to submit with no language chosen", () => {
    expect(isReadyToSubmit({})).toBe(false);
  });
});
