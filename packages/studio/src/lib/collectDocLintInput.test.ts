// collectDocLintInput — spec 076 US7 (T070/T072): the pure assembly of the
// Layer C documentation input from working-copy data, and the FR-020 baseline.

import { describe, it, expect } from "vitest";
import { runDocChecks } from "@keymanapp/keyboard-lint";
import {
  collectDocLintInput,
  computeBaselineDocFindings,
  copyrightNoticeLine,
  docMemberForPath,
  holderFromNotice,
  keyboardVersionFromKmn,
  kmnSystemStore,
  kpsCopyright,
  kvksLayerId,
  collectLayerIds,
} from "./collectDocLintInput.ts";

const KMN = [
  "store(&NAME) 'Hausa Basic'",
  "store(&COPYRIGHT) '© 2024 Jane Doe'",
  "store(&KEYBOARDVERSION) '1.2'",
  "store(&VERSION) '10.0'",
  "store(&TARGETS) 'windows mac'",
  "begin Unicode > use(main)",
  "group(main) using keys",
].join("\n");

const KPS = '<Package><Info><Copyright URL="">Copyright (c) 2024 Jane Doe</Copyright></Info></Package>';

const KVKS =
  '<visualkeyboard><header><version>10.0</version></header><encoding name="unicode">' +
  '<layer shift=""><key vkey="K_A">a</key></layer><layer shift="S"><key vkey="K_A">A</key></layer>' +
  '<layer shift="RA">@</layer></encoding></visualkeyboard>';

describe("holder / notice parsing", () => {
  it("strips the copyright word, marker, years and reserved tail down to the holder", () => {
    expect(holderFromNotice("Copyright (c) 2024 Jane Doe")).toBe("Jane Doe");
    expect(holderFromNotice("© 2019-2024 Jane Doe. All rights reserved.")).toBe("Jane Doe");
    expect(holderFromNotice("Copyright: 2024, 2025 SIL Global")).toBe("SIL Global");
    expect(holderFromNotice("   ")).toBeUndefined();
    expect(holderFromNotice(undefined)).toBeUndefined();
  });

  it("finds the first notice line in a document", () => {
    expect(copyrightNoticeLine("MIT License\n\nCopyright (c) 2024 Jane Doe\n\nPermission...")).toBe(
      "Copyright (c) 2024 Jane Doe",
    );
    expect(copyrightNoticeLine("# Title\n\nNo notice here.\n")).toBeUndefined();
  });

  it("reads .kmn system stores and the .kps copyright element", () => {
    expect(kmnSystemStore(KMN, "COPYRIGHT")).toBe("© 2024 Jane Doe");
    expect(kmnSystemStore(KMN, "MISSING")).toBeUndefined();
    expect(keyboardVersionFromKmn(KMN)).toBe("1.2");
    expect(keyboardVersionFromKmn("store(&VERSION) '10.0'\n")).toBe("1.0");
    expect(kpsCopyright(KPS)).toBe("Copyright (c) 2024 Jane Doe");
    expect(kpsCopyright("<Package/>")).toBeUndefined();
  });
});

describe("layer ids (criterion 11.6 input)", () => {
  it("maps .kvks shift states to help-site layer names and adds touch layers", () => {
    expect(kvksLayerId("")).toBe("default");
    expect(kvksLayerId("S")).toBe("shift");
    expect(kvksLayerId("RA")).toBe("rightalt");
    expect(kvksLayerId("S RA")).toBe("shift-rightalt");
    const ids = collectLayerIds(KVKS, null);
    expect(ids).toContain("default");
    expect(ids).toContain("shift");
    expect(ids).toContain("rightalt");
  });

  it("contributes nothing from inputs the codec cannot read", () => {
    expect(collectLayerIds("<not really xml", "{not json")).toEqual(["default"]);
  });
});

describe("collectDocLintInput", () => {
  it("assembles holders from every source and the targets from the .kmn", () => {
    const input = collectDocLintInput({
      keyboardId: "hausa_basic",
      displayName: "Hausa Basic",
      keyboardVersion: "1.2",
      kmnText: KMN,
      kpsText: KPS,
      kvksText: KVKS,
      touchLayoutJson: null,
      members: {
        "license-md": "MIT License\n\nCopyright (c) 2024 Jane Doe\n",
        "readme-md": "# Hausa Basic\n\nCopyright 2024 Jane Doe\n",
        "history-md": "## 1.2 (2026-09-12)\n* Initial release.\n",
      },
    });
    expect(input.copyrightHolders).toEqual({ license: "Jane Doe", kmn: "Jane Doe", kps: "Jane Doe", readme: "Jane Doe" });
    expect(input.targets).toEqual(["windows", "mac"]);
    expect(input.deletedFilenames).toEqual([]);
    expect(input.baseHistoryMdText).toBeUndefined();
    // Consistent holders, matching version: the shared checks stay silent.
    expect(runDocChecks(input).map((f) => f.code)).not.toContain("KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT");
  });

  it("US7-1: a HISTORY whose top version disagrees with the keyboard version yields exactly one HISTORY finding naming both, with a hint", () => {
    const input = collectDocLintInput({
      keyboardId: "hausa_basic",
      displayName: "Hausa Basic",
      keyboardVersion: "1.2",
      kmnText: KMN,
      kpsText: null,
      kvksText: null,
      touchLayoutJson: null,
      members: { "history-md": "## 2.0 (2026-09-12)\n* Something.\n" },
    });
    const findings = runDocChecks(input);
    const history = findings.filter((f) => f.code === "KM_LINT_HISTORY_VERSION_MISMATCH");
    expect(history).toHaveLength(1);
    expect(history[0]!.severity).toBe("warning");
    expect(history[0]!.location?.file).toBe("HISTORY.md");
    expect(history[0]!.message).toContain("2.0");
    expect(history[0]!.message).toContain("1.2");
    expect(history[0]!.hint).toBeTruthy();
  });

  it("maps a finding's file back to its member", () => {
    expect(docMemberForPath("HISTORY.md", "hausa_basic")).toBe("history-md");
    expect(docMemberForPath("source/help/hausa_basic.php", "hausa_basic")).toBe("help-php");
    expect(docMemberForPath("source/hausa_basic.kmn", "hausa_basic")).toBeUndefined();
    expect(docMemberForPath(undefined, "hausa_basic")).toBeUndefined();
  });
});

describe("computeBaselineDocFindings (FR-020)", () => {
  it("returns an empty baseline when the base ships no documentation", () => {
    expect(
      computeBaselineDocFindings({
        keyboardId: "kbd",
        displayName: "Kbd",
        kmnText: KMN,
        kpsText: null,
        kvksText: null,
        touchLayoutJson: null,
        base: { welcomeHtmText: null, helpPhpText: null, readmeMdText: null, historyMdText: null, licenseText: null },
      }),
    ).toEqual([]);
  });

  it("captures the base's own defects — a malformed help page name — against the base's version", () => {
    const findings = computeBaselineDocFindings({
      keyboardId: "kbd",
      displayName: "Kbd",
      kmnText: KMN,
      kpsText: null,
      kvksText: null,
      touchLayoutJson: null,
      base: {
        welcomeHtmText: "<html><body><p>Base.</p></body></html>",
        helpPhpText: "<?php $pagename = 'Wrong Name'; $pagetitle = $pagename; require_once('header.php'); ?><html><body><p>Base.</p></body></html>",
        readmeMdText: null,
        historyMdText: "## 1.2 (2020-01-01)\n* Initial release.\n",
        licenseText: null,
      },
    });
    expect(findings.map((f) => f.code)).toContain("KM_LINT_PHP_PAGENAME_FORMAT");
    // The base's HISTORY agrees with the base's own &KEYBOARDVERSION (1.2).
    expect(findings.map((f) => f.code)).not.toContain("KM_LINT_HISTORY_VERSION_MISMATCH");
  });
});
