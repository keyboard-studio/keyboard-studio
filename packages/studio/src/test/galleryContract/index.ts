// Entry point of the shared MechanismGallery / TouchGallery contract suites.
// Call from a per-gallery *.contract.test.tsx that owns its vi.mock block.
//
// Test-support module: imported only by *.test.tsx entry files.

import { describeWalkContract } from "./walk.contract.ts";
import { describeShellContract } from "./shell.contract.ts";
import { describeCustomKeyContract } from "./customKey.contract.ts";
import { describeApplyCardContract } from "./applyCard.contract.ts";
import type { GalleryAdapter } from "./adapter.ts";

export type { GalleryAdapter } from "./adapter.ts";

export function describeGalleryContract(adapter: GalleryAdapter): void {
  describeWalkContract(adapter);
  describeShellContract(adapter);
  describeCustomKeyContract(adapter);
  describeApplyCardContract(adapter);
}
