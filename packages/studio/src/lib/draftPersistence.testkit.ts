// Shared fixtures + lifecycle hooks for the draftPersistence.*.test.ts files
// (split from the former single draftPersistence.test.ts). Not a test file.
//
// NOTE: each test file must repeat the `vi.mock("./serverDraftStore.ts", ...)`
// call itself (vi.mock hoists per test file); this module only consumes the
// mocked functions.

import { afterEach, beforeEach, vi } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { irGroup } from "@keyboard-studio/contracts/fixtures";
import { makeScaffoldedIR } from "../test/draftSeeds.ts";
import { saveServerDraft, saveServerDraftBeacon } from "./serverDraftStore.ts";

export const mockedSaveServerDraft = vi.mocked(saveServerDraft);
export const mockedSaveServerDraftBeacon = vi.mocked(saveServerDraftBeacon);

export const currentDir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------

/**
 * An IR with one S-01 removable rule (vkey -> char in a normal group) — reused
 * from persistWorkingCopy.test.ts's own fixture so the draft round-trip test
 * below exercises the SAME realistic shape (a real fixture, not a stripped-down
 * one that would hide the removalCapabilities re-derivation bug class).
 */
export function makeIrWithRemovableRule(): KeyboardIR {
  return makeScaffoldedIR({
    header: { keyboardId: "test_keyboard", name: "Test" },
    groups: [
      irGroup({
        nodeId: "group-main",
        rules: [
          {
            nodeId: "rule-s01-1",
            context: [{ kind: "vkey" as const, vkey: "K_A", modifiers: [] }],
            output: [{ kind: "char" as const, char: "a" }],
          },
        ] as unknown as IRRule[],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

/** Registers the shared per-test setup/teardown; call once at a test file's top level. */
export function installDraftPersistenceHooks(): void {
  beforeEach(() => {
    localStorage.clear();
    mockedSaveServerDraft.mockClear();
    mockedSaveServerDraftBeacon.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });
}
