// Open mode (spec 111 FR-009): the delivery builders halt on reformatRequired
// until consent is given, and pass it through when it is.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";

const project = vi.hoisted(() => vi.fn());
vi.mock("./serializeWorkingCopy.ts", () => ({
  projectWorkingCopyForOutput: project,
  zipProjectedVfs: vi.fn(async () => new Uint8Array([1])),
}));

import {
  buildSourceZipForDownload,
  ReformatConsentRequiredError,
} from "./buildOutputBundle.ts";

beforeEach(() => {
  project.mockReset();
  project.mockImplementation(async (opts?: { consentedReemit?: boolean }) => ({
    vfs: createVirtualFS(),
    keyboardId: "kb",
    displayName: "Kb",
    version: "1.0",
    warnings: [],
    missingInheritedImages: [],
    ...(opts?.consentedReemit === true ? {} : { reformatRequired: ["source/kb.kmn"] }),
  }));
});

describe("buildOutputBundle consent", () => {
  it("throws, naming the files, when consent is withheld", async () => {
    await expect(buildSourceZipForDownload()).rejects.toMatchObject({
      name: "ReformatConsentRequiredError",
      files: ["source/kb.kmn"],
    });
    await expect(buildSourceZipForDownload()).rejects.toBeInstanceOf(ReformatConsentRequiredError);
  });
});
