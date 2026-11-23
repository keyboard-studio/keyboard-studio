// useUnappliedText -- registers a code view with the leave guard for
// unapplied code-view text (spec 111 FR-046). See stores/unappliedTextStore.ts.

import { useEffect, useId, useRef } from "react";
import { useUnappliedTextStore, type UnappliedTextHandle } from "../stores/unappliedTextStore.ts";

/**
 * Register a code view while it is mounted. The handle is read through a ref, so
 * it always sees the view's latest state without re-registering on every render.
 * Pass null while the view has nothing to guard.
 */
export function useUnappliedText(handle: UnappliedTextHandle | null): void {
  const id = useId();
  const ref = useRef(handle);
  ref.current = handle;
  const present = handle !== null;
  useEffect(() => {
    if (!present) return;
    return useUnappliedTextStore.getState().register(id, {
      get label() {
        return ref.current?.label ?? "";
      },
      hasUnapplied: () => ref.current?.hasUnapplied() ?? false,
      apply: () => ref.current?.apply() ?? Promise.resolve(true),
      discard: () => ref.current?.discard(),
    });
  }, [id, present]);
}
