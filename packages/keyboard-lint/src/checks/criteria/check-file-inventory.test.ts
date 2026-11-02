// Tests for the Group A2 file-inventory twins
// (1.7b / 1.8b / 1.11b / 1.12b / 3.1b / 6.1b / 6.3b) and the required-file
// existence checks (1.14 / 4.0 / 5.0 / 8.0).

import { describe, expect, it } from "vitest";
import {
  checkBuildFolderPresent,
  checkDuplicateDocsSubfolder,
  checkFileInventory,
  checkHistoryMdAbsent,
  checkKeyboardInfoPresent,
  checkKpjAbsent,
  checkKpjUserPresent,
  checkKpsAbsent,
  checkLicenseMdAbsent,
  checkReadmeHtmAbsent,
  checkReadmeMdAbsent,
  checkWelcomeHtmAbsent,
} from "./check-file-inventory.js";

const CLEAN = [
  "gff_amharic.kpj",
  "source/gff_amharic.kmn",
  "source/gff_amharic.kvks",
  "source/gff_amharic.kps",
  "source/readme.htm",
  "source/welcome.htm",
  "HISTORY.md",
  "LICENSE.md",
  "README.md",
];

function codes(paths: readonly string[]): string[] {
  return checkFileInventory(paths).findings.map((f) => f.code);
}

describe("file-inventory twins", () => {
  it("passes a clean keyboard folder", () => {
    expect(checkFileInventory(CLEAN).findings).toEqual([]);
  });

  it("1.7b flags keyboard.info", () => {
    const { findings } = checkKeyboardInfoPresent([...CLEAN, "keyboard.info"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KEYBOARD_INFO_PRESENT");
  });

  it("1.8b flags docs/ duplicates, case-insensitively", () => {
    const { findings } = checkDuplicateDocsSubfolder([
      ...CLEAN,
      "docs/README.md",
      "Docs/HISTORY.md",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_DOCS_SUBFOLDER_DUPLICATES");
  });

  it("1.8b ignores a docs folder without duplicates", () => {
    expect(
      checkDuplicateDocsSubfolder([...CLEAN, "docs/notes.txt"]).findings,
    ).toEqual([]);
  });

  it("1.8b is moot without a docs/ folder, naming why", () => {
    expect(checkDuplicateDocsSubfolder(CLEAN).verified).toEqual([
      "No docs/ folder to check.",
    ]);
  });

  it("1.11b flags .kpj.user", () => {
    const { findings } = checkKpjUserPresent([...CLEAN, "gff_amharic.kpj.user"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPJ_USER_PRESENT");
  });

  it("1.12b flags build/ contents", () => {
    const { findings } = checkBuildFolderPresent([
      ...CLEAN,
      "build/gff_amharic.kmx",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_BUILD_FOLDER_PRESENT");
  });

  it("3.1b flags a missing HISTORY.md", () => {
    const without = CLEAN.filter((p) => p !== "HISTORY.md");
    const { findings } = checkHistoryMdAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_HISTORY_MD_ABSENT");
  });

  it("6.1b flags a missing source/readme.htm", () => {
    const without = CLEAN.filter((p) => p !== "source/readme.htm");
    const { findings } = checkReadmeHtmAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_README_HTM_ABSENT");
  });

  it("6.3b accepts the folder convention source/welcome/welcome.htm", () => {
    const folder = CLEAN.filter((p) => p !== "source/welcome.htm").concat(
      "source/welcome/welcome.htm",
    );
    expect(checkWelcomeHtmAbsent(folder).findings).toEqual([]);
  });

  it("6.3b flags a missing welcome.htm", () => {
    const without = CLEAN.filter((p) => p !== "source/welcome.htm");
    const { findings } = checkWelcomeHtmAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_WELCOME_HTM_ABSENT");
  });

  it("1.14 flags a missing .kpj", () => {
    const without = CLEAN.filter((p) => !p.toLowerCase().endsWith(".kpj"));
    const { findings } = checkKpjAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPJ_ABSENT");
    expect(findings[0]!.message).toBe("No .kpj project file at the keyboard root.");
  });

  it("4.0 flags a missing LICENSE.md", () => {
    const without = CLEAN.filter((p) => p !== "LICENSE.md");
    const { findings } = checkLicenseMdAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_LICENSE_MD_ABSENT");
  });

  it("5.0 flags a missing README.md", () => {
    const without = CLEAN.filter((p) => p !== "README.md");
    const { findings } = checkReadmeMdAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_README_MD_ABSENT");
  });

  it("8.0 flags a missing .kps", () => {
    const without = CLEAN.filter((p) => !p.toLowerCase().endsWith(".kps"));
    const { findings } = checkKpsAbsent(without);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_ABSENT");
  });

  it("the existence checks pass on the clean folder, naming the file", () => {
    expect(checkKpjAbsent(CLEAN).verified).toEqual([
      "File: gff_amharic.kpj",
      "Found: gff_amharic.kpj",
    ]);
    expect(checkLicenseMdAbsent(CLEAN).verified).toEqual([
      "File: LICENSE.md",
      "Found: LICENSE.md",
    ]);
    expect(checkReadmeMdAbsent(CLEAN).verified).toEqual([
      "File: README.md",
      "Found: README.md",
    ]);
    expect(checkKpsAbsent(CLEAN).verified).toEqual([
      "File: source/gff_amharic.kps",
      "Found: source/gff_amharic.kps",
    ]);
  });

  it("reports every violation code through the aggregate", () => {
    expect(
      codes([
        "keyboard.info",
        "x.kpj.user",
        "build/x.kmx",
        "docs/README.md",
      ]).sort(),
    ).toEqual(
      [
        "KM_LINT_BUILD_FOLDER_PRESENT",
        "KM_LINT_DOCS_SUBFOLDER_DUPLICATES",
        "KM_LINT_HISTORY_MD_ABSENT",
        "KM_LINT_KEYBOARD_INFO_PRESENT",
        "KM_LINT_KPJ_ABSENT",
        "KM_LINT_KPJ_USER_PRESENT",
        "KM_LINT_KPS_ABSENT",
        "KM_LINT_LICENSE_MD_ABSENT",
        "KM_LINT_README_HTM_ABSENT",
        "KM_LINT_README_MD_ABSENT",
        "KM_LINT_WELCOME_HTM_ABSENT",
      ].sort(),
    );
  });
});
