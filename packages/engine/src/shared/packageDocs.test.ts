import { describe, expect, it } from "vitest";
import { readmeMd } from "./packageDocs.js";

describe("readmeMd", () => {
  it("generates a README with basic keyboard information", () => {
    const readme = readmeMd("Test Keyboard", "test_keyboard", ["en"]);

    expect(readme).toContain("# Test Keyboard");
    expect(readme).toContain("## Languages Supported");
    expect(readme).toContain("- **English** (code: `en`)");
    expect(readme).toContain("## Features");
    expect(readme).toContain("## How to Type Special Characters");
    expect(readme).toContain("## Platform Support");
    expect(readme).toContain("## Installation");
    expect(readme).toContain("## License");
    expect(readme).toContain("## Credits");
  });

  it("includes keyboard ID in help links", () => {
    const readme = readmeMd("Ewondo Keyboard", "ewondo", ["ewo"]);

    expect(readme).toContain("help.keyman.com/keyboard/ewondo");
  });

  it("includes base keyboard name when provided", () => {
    const readme = readmeMd("Derived Keyboard", "derived", ["en"], "base_keyboard");

    expect(readme).toContain("Based on base_keyboard");
  });

  it("omits base keyboard line when not provided", () => {
    const readme = readmeMd("New Keyboard", "new_kb", ["en"]);

    expect(readme).toContain("Adapted from a standard keyboard layout");
    expect(readme).not.toContain("Based on undefined");
  });

  it("supports multiple languages", () => {
    const readme = readmeMd("Multilingual", "multi", ["en", "fr", "de"]);

    expect(readme).toContain("- **English** (code: `en`)");
    expect(readme).toContain("- **French** (code: `fr`)");
    expect(readme).toContain("- **German, Standard** (code: `de`)");
  });

  it("handles unknown language codes gracefully", () => {
    const readme = readmeMd("Unknown Language", "unknown", ["xyz"]);

    expect(readme).toContain("- **Xyz** (code: `xyz`)");
  });

  it("handles empty language array", () => {
    const readme = readmeMd("No Languages", "no_lang", []);

    expect(readme).toContain("- Language support information to be confirmed");
  });

  it("includes keyboard name in multiple places", () => {
    const readme = readmeMd("Amharic Keyboard", "amharic", ["am"]);

    expect(readme).toContain("# Amharic Keyboard");
    expect(readme).toContain("Type text with the Amharic Keyboard keyboard, with comprehensive character and diacritic support.");
    expect(readme).toContain("Search for \"Amharic Keyboard\"");
  });

  it("includes platform information", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("Windows, macOS, Linux");
    expect(readme).toContain("iOS, Android");
    expect(readme).toContain("keyman.com/keyboard");
  });

  it("includes installation steps", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("Step 1: Get Keyman");
    expect(readme).toContain("Step 2: Install This Keyboard");
    expect(readme).toContain("keyman.com");
  });

  it("includes help resources section", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("Getting Help");
    expect(readme).toContain("Online Help");
    expect(readme).toContain("Keyman Community");
    expect(readme).toContain("Developer Resources");
  });

  it("includes typing guide sections", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("Method 1: On-Screen Keyboard Layout");
    expect(readme).toContain("Method 2: Touch Layout");
    expect(readme).toContain("Method 3: Key Sequences");
  });

  it("is deterministic with same inputs", () => {
    const readme1 = readmeMd("Test", "test", ["en"], "base");
    const readme2 = readmeMd("Test", "test", ["en"], "base");

    expect(readme1).toBe(readme2);
  });

  it("includes version and date footer", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toMatch(/\*\*Version:\*\*.*1.0/);
    expect(readme).toMatch(/\*\*Updated:\*\*.*\d{4}-\d{2}-\d{2}/);
  });

  it("includes contributing guidelines", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("Contributing");
    expect(readme).toContain("Report an Issue");
    expect(readme).toContain("Submit Changes");
    expect(readme).toContain("keyboard-studio");
  });

  it("includes keyboard-studio credit", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    expect(readme).toContain("keyboard-studio");
    expect(readme).toContain("SIL International");
  });

  it("handles special characters in keyboard name", () => {
    const readme = readmeMd("Français Keyboard", "francais", ["fr"]);

    expect(readme).toContain("# Français Keyboard");
    expect(readme).toContain("Français Keyboard keyboard");
  });

  it("produces valid markdown structure", () => {
    const readme = readmeMd("Test", "test", ["en"]);

    // Check for proper heading hierarchy
    expect(readme).toMatch(/^# Test\n/);
    const headings = readme.match(/^##+ /gm);
    expect(headings).toBeDefined();
    expect(headings!.length).toBeGreaterThan(0);

    // Check for proper link format
    expect(readme).toMatch(/\[.+?\]\(.+?\)/);
  });

  it("maps ISO 639-3 language codes correctly", () => {
    const commonLanguages = [
      { code: "en", expected: "English" },
      { code: "fr", expected: "French" },
      { code: "de", expected: "German, Standard" },
      { code: "es", expected: "Spanish" },
      { code: "sw", expected: "Swahili (macrolanguage)" },
      { code: "ha", expected: "Hausa" },
      { code: "yo", expected: "Yoruba" },
      { code: "ewo", expected: "Ewondo" },
      { code: "bm", expected: "Bamanankan" },
      { code: "am", expected: "Amharic" },
    ];

    for (const { code, expected } of commonLanguages) {
      const readme = readmeMd("Test", "test", [code]);
      expect(readme).toContain(`**${expected}**`);
      expect(readme).toContain(`\`${code}\``);
    }
  });
});
