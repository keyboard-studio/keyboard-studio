// Welcome.htm step: continue with empty markdown (keep scaffold default).

import type { StepDrivers } from "./types.ts";

export const welcomeHtmDrivers: StepDrivers = {
  html: () => ({ html: "" }),
};
