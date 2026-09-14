// The shared "clean" DocLintInput fixture for the SC-007 fixture contract
// (spec 076 contracts/lint-checks.md): realistic tool-rendered member texts
// that produce zero findings from every one of the twelve documentation
// checks (thirteen codes). Used by bijection.test.ts and available to any
// individual check test that wants a known-good baseline.

import type { DocLintInput } from "@keyboard-studio/contracts";

export const CLEAN_DOC_LINT_INPUT: DocLintInput = {
  keyboardId: "test_kbd",
  keyboardVersion: "1.2",
  targets: ["windows", "mac"],
  layerIds: ["default", "shift"],
  displayName: "Test Keyboard",
  copyrightHolders: {
    license: "Jane Doe",
    kmn: "Jane Doe",
    kps: "Jane Doe",
    readme: "Jane Doe",
    history: "Jane Doe",
  },
  members: {
    "readme-md":
      "# Test Keyboard\n\nA test keyboard for the documentation checks.\n\n## Supported Platforms\n- windows\n- mac\n",
    "history-md":
      "## 1.2 (2024-03-01)\n* Added shift layer.\n\n## 1.0 (2024-01-01)\n* Initial release.\n",
    "license-md": "Copyright (c) 2024 Jane Doe\n\nMIT License\n",
    "readme-htm": "<html><body><h1>Test Keyboard</h1><p>A test keyboard.</p></body></html>",
    "welcome-htm": "<html><body><p>Welcome to Test Keyboard</p></body></html>",
    "help-php":
      "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Welcome to Test Keyboard</p></body></html>",
  },
  deletedFilenames: ["old-icon.ico"],
  baseHistoryMdText: "## 1.0 (2024-01-01)\n* Initial release.\n",
};
