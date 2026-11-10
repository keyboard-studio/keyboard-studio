// The text the one D3 validation cycle checks: the replayed keyboard's emitted
// `.kmn` once a preview projection exists, else the starting point's own text.
// Pure and synchronous: no timer, no store write.

import type { VirtualFS } from "@keyboard-studio/contracts";
import { emitKmn } from "@keyboard-studio/engine";
import type { PreviewProjection } from "./previewProjection.ts";
import { findKmnPath } from "./findKmnPath.ts";

export function selectValidationSource(
  projection: PreviewProjection | null,
  startVfs: VirtualFS | null,
): string | null {
  if (projection !== null) return emitKmn(projection.ir);
  if (!startVfs) return null;
  const path = findKmnPath(startVfs);
  if (!path) return null;
  const raw = startVfs.get(path)?.content ?? null;
  return typeof raw === "string" ? raw : null;
}
