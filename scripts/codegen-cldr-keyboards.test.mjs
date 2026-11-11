// Tests for scripts/codegen-cldr-keyboards.mjs (pure helpers only — no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCldrFileName,
  scriptForLocale,
} from "./codegen-cldr-keyboards.mjs";

test("parseCldrFileName parses base files", () => {
  assert.deepEqual(parseCldrFileName("de-t-k0-windows.xml", "windows"), {
    locale: "de",
    platform: "windows",
    variant: "",
    file: "de-t-k0-windows.xml",
  });
  assert.deepEqual(parseCldrFileName("az-Cyrl-t-k0-windows.xml", "windows"), {
    locale: "az-Cyrl",
    platform: "windows",
    variant: "",
    file: "az-Cyrl-t-k0-windows.xml",
  });
});

test("parseCldrFileName parses variants", () => {
  assert.deepEqual(
    parseCldrFileName("ar-t-k0-windows-102key.xml", "windows"),
    {
      locale: "ar",
      platform: "windows",
      variant: "102key",
      file: "ar-t-k0-windows-102key.xml",
    },
  );
  assert.deepEqual(
    parseCldrFileName("de-t-k0-chromeos-extended.xml", "chromeos"),
    {
      locale: "de",
      platform: "chromeos",
      variant: "extended",
      file: "de-t-k0-chromeos-extended.xml",
    },
  );
});

test("parseCldrFileName splits the dpi suffix off android files", () => {
  assert.deepEqual(parseCldrFileName("de-t-k0-android-600dpi.xml", "android"), {
    locale: "de",
    platform: "android",
    variant: "",
    dpi: "600dpi",
    file: "de-t-k0-android-600dpi.xml",
  });
  assert.deepEqual(
    parseCldrFileName("bg-t-k0-android-var-768dpi.xml", "android"),
    {
      locale: "bg",
      platform: "android",
      variant: "var",
      dpi: "768dpi",
      file: "bg-t-k0-android-var-768dpi.xml",
    },
  );
});

test("parseCldrFileName rejects non-keyboard files and platform mismatches", () => {
  assert.equal(parseCldrFileName("_platform.xml", "windows"), null);
  assert.equal(parseCldrFileName("de-t-k0-windows.xml", "android"), null);
  assert.equal(parseCldrFileName("de-t-k0-windows.txt", "windows"), null);
});

test("scriptForLocale maximizes the locale script", () => {
  assert.equal(scriptForLocale("de"), "Latn");
  assert.equal(scriptForLocale("ar"), "Arab");
  assert.equal(scriptForLocale("az-Cyrl"), "Cyrl");
  assert.equal(scriptForLocale("zh-Hant"), "Hant");
});
