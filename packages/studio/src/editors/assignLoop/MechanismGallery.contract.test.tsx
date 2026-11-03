// MechanismGallery — shared gallery contract (behaviours both galleries must
// satisfy; the TouchGallery twin is TouchGallery.contract.test.tsx). The
// suites live in ../../test/galleryContract/; this entry file owns the
// MechanismGallery module mocks because vi.mock hoists per test file.
//
// Shared module mocks: ../../test/mechanismGallery/mocks.tsx.

import { vi } from "vitest";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { describeGalleryContract } from "../../test/galleryContract/index.ts";
import { mechanismAdapter } from "../../test/galleryContract/mechanismAdapter.tsx";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

describeGalleryContract(mechanismAdapter);
