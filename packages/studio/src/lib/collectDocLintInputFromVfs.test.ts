// Tests for collectDocLintInputFromVfs (spec 084, Phase 5, T5.1).
//
// Fixture: a small but complete foreign package VFS — .kmn with
// &KEYBOARDVERSION / &COPYRIGHT / &TARGETS, a .kps with its own copyright
// holder, a .kvks, a touch layout, and the shipped documentation members.
// The assertions pin the VFS-reading contract: members are picked up at
// their projected paths, holders are parsed from each source, the version
// comes from &KEYBOARDVERSION, and absent files are tolerated rather than
// treated as failures.

import { describe, expect, it } from "vitest";

import { createVirtualFS } from "@keyboard-studio/contracts";
import type { VirtualFS } from "@keyboard-studio/contracts";

import { collectDocLintInputFromVfs } from "./collectDocLintInputFromVfs.ts";

const KEYBOARD_ID = "foreign_fixture";

const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Foreign Fixture'",
  "store(&KEYBOARDVERSION) '2.3'",
  "store(&COPYRIGHT) 'Copyright (C) 2024 Fixture Holder'",
  "store(&TARGETS) 'windows macosx'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "",
].join("\n");

const KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <System><KeymanDeveloperVersion>17.0</KeymanDeveloperVersion></System>",
  "  <Options><Copyright>Copyright (C) 2024 Fixture Holder</Copyright></Options>",
  "</Package>",
  "",
].join("\n");

const KVKS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<visualkeyboard>",
  "  <header><version>10.0</version></header>",
  "  <encoding name='default' fontname='Arial' fontsize='9' />",
  "  <layout>",
  "    <layer shift='' key='K_A'>a</layer>",
  "  </layout>",
  "</visualkeyboard>",
  "",
].join("\n");

const TOUCH_LAYOUT = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [{ id: 1, key: [{ id: "K_A", text: "a" }] }],
      },
    ],
  },
});

const README_MD = "# Foreign Fixture\n\nA fixture keyboard.\n";
const HISTORY_MD = "# Foreign Fixture Change History\n\n## 2.3 (2026-01-01)\n\n* Release.\n";
const LICENSE_MD = "Copyright (c) 2024 Fixture Holder\n\nPermission is hereby granted.\n";
const WELCOME_HTM = "<html><body><h1>Foreign Fixture</h1></body></html>\n";
const HELP_PHP = "<?php $pagename = 'Foreign Fixture'; ?>\n";

function fixtureVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${KEYBOARD_ID}.kps`, content: KPS, isBinary: false },
    { path: `source/${KEYBOARD_ID}.kvks`, content: KVKS, isBinary: false },
    {
      path: `source/${KEYBOARD_ID}.keyman-touch-layout`,
      content: TOUCH_LAYOUT,
      isBinary: false,
    },
    { path: "README.md", content: README_MD, isBinary: false },
    { path: "HISTORY.md", content: HISTORY_MD, isBinary: false },
    { path: "LICENSE.md", content: LICENSE_MD, isBinary: false },
    { path: "source/readme.htm", content: "<html></html>\n", isBinary: false },
    { path: "source/welcome/welcome.htm", content: WELCOME_HTM, isBinary: false },
    { path: `source/help/${KEYBOARD_ID}.php`, content: HELP_PHP, isBinary: false },
  ]);
}

describe("collectDocLintInputFromVfs", () => {
  it("picks up every shipped member at its projected path", () => {
    const input = collectDocLintInputFromVfs(fixtureVfs(), KEYBOARD_ID, "Foreign Fixture");
    expect(input.members["readme-md"]).toBe(README_MD);
    expect(input.members["history-md"]).toBe(HISTORY_MD);
    expect(input.members["license-md"]).toBe(LICENSE_MD);
    expect(input.members["welcome-htm"]).toBe(WELCOME_HTM);
    expect(input.members["help-php"]).toBe(HELP_PHP);
    expect(input.members["readme-htm"]).toBeDefined();
  });

  it("parses the copyright holders from the .kmn, .kps and member texts", () => {
    const input = collectDocLintInputFromVfs(fixtureVfs(), KEYBOARD_ID, "Foreign Fixture");
    expect(input.copyrightHolders.kmn).toBe("Fixture Holder");
    expect(input.copyrightHolders.kps).toBe("Fixture Holder");
    expect(input.copyrightHolders.license).toBe("Fixture Holder");
  });

  it("takes the keyboard version from &KEYBOARDVERSION, not &VERSION", () => {
    const input = collectDocLintInputFromVfs(fixtureVfs(), KEYBOARD_ID, "Foreign Fixture");
    expect(input.keyboardVersion).toBe("2.3");
  });

  it("carries identity, targets, layer ids and an empty deleted list", () => {
    const input = collectDocLintInputFromVfs(fixtureVfs(), KEYBOARD_ID, "Foreign Fixture");
    expect(input.keyboardId).toBe(KEYBOARD_ID);
    expect(input.displayName).toBe("Foreign Fixture");
    expect(input.targets).toContain("windows");
    // The default layer is always present; the touch layout contributes it too.
    expect(input.layerIds).toContain("default");
    expect(input.deletedFilenames).toEqual([]);
  });

  it("tolerates absent files: a bare .kmn yields no members and no holders beyond the .kmn", () => {
    const vfs = createVirtualFS([
      { path: `source/${KEYBOARD_ID}.kmn`, content: KMN, isBinary: false },
    ]);
    const input = collectDocLintInputFromVfs(vfs, KEYBOARD_ID, "Foreign Fixture");
    expect(input.members).toEqual({});
    expect(input.copyrightHolders.kps).toBeUndefined();
    expect(input.copyrightHolders.license).toBeUndefined();
    expect(input.keyboardVersion).toBe("2.3");
    expect(input.layerIds).toEqual(["default"]);
  });

  it("tolerates an entirely empty VFS", () => {
    const input = collectDocLintInputFromVfs(createVirtualFS([]), KEYBOARD_ID, "Foreign Fixture");
    expect(input.members).toEqual({});
    expect(input.keyboardVersion).toBe("1.0");
    expect(input.targets).toEqual([]);
  });
});
