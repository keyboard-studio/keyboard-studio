// One deliberately-broken DocLintInput fixture per FR-019 criteria row
// (SC-007), keyed by the row's `lintRuleId` (= LintCode). Each variant
// changes exactly one thing away from `CLEAN_DOC_LINT_INPUT` so the fixture
// stays close to "realistic tool-rendered member texts" (contracts/lint-checks.md).
// 3.6 and 7.1 describe one fact from two sides and share a single fixture.

import type { DocLintInput } from "@keyboard-studio/contracts";
import { CLEAN_DOC_LINT_INPUT } from "./clean.js";

function withMembers(members: Partial<DocLintInput["members"]>): DocLintInput {
  return { ...CLEAN_DOC_LINT_INPUT, members: { ...CLEAN_DOC_LINT_INPUT.members, ...members } };
}

const HISTORY_ORDER: DocLintInput = withMembers({
  "history-md": "## 1.0 (2024-01-01)\n* Initial release.\n\n## 1.2 (2024-03-01)\n* Added shift layer.\n",
});

const HISTORY_TRUNCATED: DocLintInput = withMembers({
  "history-md": "## 1.2 (2024-03-01)\n* Added shift layer.\n",
});

const HISTORY_ENTRY_FORMAT: DocLintInput = withMembers({
  "history-md": "## Version 1.2\n* Added shift layer.\n\n## 1.0 (2024-01-01)\n* Initial release.\n",
});

const HISTORY_VERSION_MISMATCH: DocLintInput = { ...CLEAN_DOC_LINT_INPUT, keyboardVersion: "1.3" };

const HISTORY_STALE_FILE_REFS: DocLintInput = withMembers({
  "history-md":
    "## 1.2 (2024-03-01)\n* Removed old-icon.ico from icons.\n\n## 1.0 (2024-01-01)\n* Initial release.\n",
});

const COPYRIGHT_HOLDER_INCONSISTENT: DocLintInput = {
  ...CLEAN_DOC_LINT_INPUT,
  copyrightHolders: { ...CLEAN_DOC_LINT_INPUT.copyrightHolders, readme: "John Smith" },
};

const README_TARGETS_MISMATCH: DocLintInput = withMembers({
  "readme-md": "# Test Keyboard\n\nA test keyboard for the documentation checks.\n\n## Supported Platforms\n- windows\n",
});

const HTML_NOT_WELL_FORMED: DocLintInput = withMembers({
  "welcome-htm": "<html><body><p>Welcome to Test Keyboard</body></html>",
});

const PHP_DATA_STATES_INCOMPLETE: DocLintInput = withMembers({
  "help-php":
    "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Welcome to Test Keyboard</p><span data-states=\"default,phantom\"></span></body></html>",
});

const PHP_PAGENAME_FORMAT: DocLintInput = withMembers({
  "help-php":
    "<?php\n  $pagename = 'Wrong Name';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Welcome to Test Keyboard</p></body></html>",
});

const PHP_HTM_BODY_MISMATCH: DocLintInput = withMembers({
  "help-php":
    "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Something totally different.</p></body></html>",
});

const PHP_HTM_STYLE_MISMATCH: DocLintInput = withMembers({
  "help-php":
    "<?php\n  $pagename = 'Test Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p style=\"color:red\">Welcome to Test Keyboard</p></body></html>",
});

/** Broken fixtures keyed by the criterion's `lintRuleId` (the finding's `code`). */
export const BROKEN_DOC_LINT_FIXTURES: Readonly<Record<string, DocLintInput>> = {
  KM_LINT_HISTORY_ORDER: HISTORY_ORDER,
  KM_LINT_HISTORY_TRUNCATED: HISTORY_TRUNCATED,
  KM_LINT_HISTORY_ENTRY_FORMAT: HISTORY_ENTRY_FORMAT,
  KM_LINT_HISTORY_VERSION_MISMATCH: HISTORY_VERSION_MISMATCH,
  KM_LINT_KMN_VERSION_MISMATCH: HISTORY_VERSION_MISMATCH,
  KM_LINT_HISTORY_STALE_FILE_REFS: HISTORY_STALE_FILE_REFS,
  KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT: COPYRIGHT_HOLDER_INCONSISTENT,
  KM_LINT_README_TARGETS_MISMATCH: README_TARGETS_MISMATCH,
  KM_LINT_HTML_NOT_WELL_FORMED: HTML_NOT_WELL_FORMED,
  KM_LINT_PHP_DATA_STATES_INCOMPLETE: PHP_DATA_STATES_INCOMPLETE,
  KM_LINT_PHP_PAGENAME_FORMAT: PHP_PAGENAME_FORMAT,
  KM_LINT_PHP_HTM_BODY_MISMATCH: PHP_HTM_BODY_MISMATCH,
  KM_LINT_PHP_HTM_STYLE_MISMATCH: PHP_HTM_STYLE_MISMATCH,
};
