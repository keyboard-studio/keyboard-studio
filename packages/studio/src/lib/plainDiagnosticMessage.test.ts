// Tests for plainDiagnosticMessage / plainEngineErrorMessage.
//
// Called with no `i18n` argument, the module resolves its msg() descriptors
// against the English source text (see lib/i18nResolve.ts) — the same
// convention publishManagedPRErrorMessage's tests use. One test resolves
// through a real I18n instance with the French catalog active.

import { describe, it, expect } from "vitest";
import { I18n } from "@lingui/core";
import { messages as frMessages } from "../locales/fr/messages.json?lingui";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";
import {
  plainDiagnosticMessage,
  plainEngineErrorMessage,
} from "./plainDiagnosticMessage.ts";

function diagnostic(
  partial: Partial<CompilerDiagnostic> & Pick<CompilerDiagnostic, "code" | "message">,
): CompilerDiagnostic {
  return { severity: "error", layer: "A", ...partial };
}

describe("plainDiagnosticMessage — mapped codes", () => {
  it("maps a missing-store reference (kmcmplib decimal form) to plain copy", () => {
    // ERROR_StoreDoesNotExist = 0x50201D = 5251101 in the bridge's decimal form.
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMCMP_5251101",
        message: "Store 'nosuch' does not exist.",
        location: { file: "source/probe.kmn", line: 7 },
      }),
    );
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/refers to something that isn't there/i);
    expect(plain.whatToTry).toMatch(/undo the change/i);
    expect(plain.whatHappened).not.toContain("5251101");
  });

  it("maps the same message in symbolic form to the same copy", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMCMP_STOREDOESNOTEXIST",
        message: "Store 'nosuch' does not exist.",
      }),
    );
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/refers to something that isn't there/i);
  });

  it("maps the studio oracle-unavailable code to reload copy", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_WARN_ORACLE_UNAVAILABLE",
        severity: "warning",
        message: "WASM compiler unavailable: boom",
      }),
    );
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/builder couldn't start/i);
    expect(plain.whatToTry).toMatch(/reload the page/i);
  });

  it("maps a curated validator alias (unreachable rule hint)", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_HINT_UNREACHABLE_RULE",
        severity: "hint",
        message: "Rule is unreachable.",
      }),
    );
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/can never run/i);
  });

  it("maps a missing package member to the missing-file copy", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMP_FILE_MISSING",
        message: 'Package member "build/x.kmx" is not present in the working copy (read).',
      }),
    );
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/file your keyboard needs is missing/i);
  });
});

describe("plainDiagnosticMessage — unmapped fallback", () => {
  it("falls back to the generic build-failure copy for an unmapped error", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMCMP_5251999",
        message: "Something obscure happened in the compiler.",
      }),
    );
    expect(plain.mapped).toBe(false);
    expect(plain.whatHappened).toBe("Something in the keyboard couldn't be built.");
    expect(plain.whatToTry).toBe("Try undoing your last change.");
  });

  it("does not claim a build failure for an unmapped warning", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_WARN_SOMETHING_NEW",
        severity: "warning",
        message: "A brand-new warning.",
      }),
    );
    expect(plain.mapped).toBe(false);
    expect(plain.whatHappened).toMatch(/warning about your keyboard/i);
    expect(plain.whatHappened).not.toMatch(/couldn't be built/i);
  });

  it("prefers the diagnostic's own hint as the try copy on fallback", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMCMP_5251999",
        message: "Obscure.",
        hint: "Rename the store and rebuild.",
      }),
    );
    expect(plain.whatToTry).toBe("Rename the store and rebuild.");
  });
});

describe("plainDiagnosticMessage — technical detail disclosure content", () => {
  it("preserves code, message and location verbatim for a mapped diagnostic", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({
        code: "KM_ERROR_KMCMP_5251101",
        message: "Store 'nosuch' does not exist.",
        location: { file: "source/probe.kmn", line: 7 },
      }),
    );
    expect(plain.technicalDetail).toBe(
      "source/probe.kmn:7 — KM_ERROR_KMCMP_5251101: Store 'nosuch' does not exist.",
    );
  });

  it("preserves code and message verbatim for an unmapped diagnostic with no location", () => {
    const plain = plainDiagnosticMessage(
      diagnostic({ code: "KM_ERROR_KMCMP_5251999", message: "Obscure raw text." }),
    );
    expect(plain.technicalDetail).toBe("KM_ERROR_KMCMP_5251999: Obscure raw text.");
    // The plain front-of-house copy never leaks the raw code or message.
    expect(plain.whatHappened).not.toContain("5251999");
    expect(plain.whatHappened).not.toContain("Obscure raw text");
  });

  it("resolves through a real I18n instance — fr active translates the fallback", () => {
    const testI18n = new I18n({ locale: "fr", messages: { fr: frMessages } });
    const plain = plainDiagnosticMessage(
      diagnostic({ code: "KM_ERROR_KMCMP_5251999", message: "Obscure." }),
      testI18n,
    );
    expect(plain.whatHappened).toBe("Un élément du clavier n'a pas pu être construit.");
    expect(plain.whatToTry).toBe("Essayez d'annuler votre dernière modification.");
  });
});

describe("plainEngineErrorMessage", () => {
  it("maps a keyboard-not-found engine error to load copy, preserving the raw string", () => {
    const raw = "Cannot find the my_keyboard keyboard for English";
    const plain = plainEngineErrorMessage(raw);
    expect(plain.mapped).toBe(true);
    expect(plain.whatHappened).toMatch(/couldn't load your keyboard/i);
    expect(plain.technicalDetail).toBe(raw);
    expect(plain.whatHappened).not.toContain("my_keyboard");
  });

  it("falls back to generic preview copy for an unrecognised engine error", () => {
    const plain = plainEngineErrorMessage("TypeError: undefined is not a function");
    expect(plain.mapped).toBe(false);
    expect(plain.whatHappened).toMatch(/on-screen keyboard hit a problem/i);
    expect(plain.technicalDetail).toBe("TypeError: undefined is not a function");
  });
});
