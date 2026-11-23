// Shared harness for the leave-guard tests (spec 111 FR-046): a "leave" button that goes
// through `guardLeave` the way a tab switch or Continue does, and the question dialog.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { OpenApplyHost } from "../components/OpenApplyHost.tsx";
import { UnappliedTextDialog } from "../components/UnappliedTextDialog.tsx";
import { guardLeave } from "../stores/unappliedTextStore.ts";

/** Wraps a view in the real apply host, as the shell does, with the leave button and dialog. */
export function LeaveProbe({ onLeave }: { onLeave: () => void }) {
  return (
    <>
      <button type="button" data-testid="leave" onClick={() => guardLeave(onLeave)}>
        leave
      </button>
      <UnappliedTextDialog />
    </>
  );
}

export const askedQuestion = (): boolean => screen.queryByTestId("unapplied-text-dialog") !== null;

export async function answer(choice: "apply" | "discard" | "cancel"): Promise<void> {
  fireEvent.click(screen.getByTestId(`unapplied-text-${choice}`));
  await waitFor(() => expect(screen.queryByTestId("unapplied-text-dialog")).toBeNull());
}
import { expect } from "vitest";

export function WithHost({ children }: { children: ReactNode }) {
  return <OpenApplyHost>{children}</OpenApplyHost>;
}
import type { ReactNode } from "react";
