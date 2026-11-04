// TouchGallery — shared gallery contract (behaviours both galleries must
// satisfy; the MechanismGallery twin is MechanismGallery.contract.test.tsx).
// The suites live in ../../test/galleryContract/; this entry file owns the
// TouchGallery module mocks because vi.mock hoists per test file.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks: ../../test/touchGallery/harness.ts.

import { vi } from "vitest";
import { installTouchGalleryHooks } from "../../test/touchGallery/harness.ts";
import { describeGalleryContract } from "../../test/galleryContract/index.ts";
import { touchAdapter } from "../../test/galleryContract/touchAdapter.tsx";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));

installTouchGalleryHooks();

describeGalleryContract(touchAdapter);
