// Custom CSS step: skip (empty CSS), as the UI's "No custom CSS" path.

import type { StepDrivers } from "./types.ts";

export const customCssDrivers: StepDrivers = {
  css: () => ({ css: "" }),
};
