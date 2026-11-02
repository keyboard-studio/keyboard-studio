// Profile 49: the deltas from profile 46 (contracts/ldml-mapping-49.md).
// Set mappings are not a delta (FR-023): rows 3.7-3.9 are identical in both profiles.

import type { ProfileMeta, RowDelta } from "./types.js";

export const PROFILE_49_META: ProfileMeta = {
  id: "49",
  namespace: "https://schemas.unicode.org/cldr/49/keyboard3",
  tr35Revision: "CLDR 49, tr35-79 (2026-10-21)",
  keymanRelease: null,
  keymanCompilable: false,
  isDefault: false,
  writeAttribution: true,
};

export const PROFILE_49_DELTAS: readonly RowDelta[] = [
  {
    id: "4.10",
    status: "M",
    code: null,
    severity: null,
    form: "info/@attribution holds the attribution text",
  },
];
