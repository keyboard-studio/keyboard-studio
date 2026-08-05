// Ambient module for Lingui catalogs imported with the `?lingui` query suffix.
// @lingui/vite-plugin compiles the catalog to a runtime Messages object at
// import time (required for any format other than .po). See vite.config.ts.
declare module "*.json?lingui" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}
