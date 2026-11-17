// Open mode: the output never asks the author to agree to a reformat (the
// consent is asked when the change is applied), so the delivery builders do
// not throw on whatever the projection reports.

import { describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";

vi.mock("./serializeWorkingCopy.ts", () => ({
  projectWorkingCopyForOutput: vi.fn(async () => ({
    vfs: createVirtualFS(),
    keyboardId: "kb",
    displayName: "Kb",
    version: "1.0",
    warnings: [],
    missingInheritedImages: [],
  })),
  zipProjectedVfs: vi.fn(async () => new Uint8Array([1])),
}));

import { buildSourceZipForDownload } from "./buildOutputBundle.ts";
import * as bundle from "./buildOutputBundle.ts";

describe("buildOutputBundle consent", () => {
  it("delivers without asking for consent", async () => {
    // The compile service is not wired here, so the build may fail later; it must not fail on consent.
    const err = await buildSourceZipForDownload().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.name).not.toBe("ReformatConsentRequiredError");
    expect("ReformatConsentRequiredError" in bundle).toBe(false);
  });
});
