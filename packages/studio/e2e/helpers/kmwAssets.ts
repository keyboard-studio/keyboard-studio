// KMW OSK assets, served locally so walk specs are hermetic against CDN
// outages (and against sandboxed browsers that cannot reach s.keyman.com at
// all — without the stylesheet the keys render unstyled and stacked, and no
// real key geometry ever appears). The URLs are the same hardcoded CDN URL
// the frame itself documents as [TEMP] in public/osk-frame.html. Fetched
// once with node fetch and served back through Playwright routes. If the
// fetch fails, no routes are registered and the frame loads the assets from
// the CDN directly, as it does in production.

import type { Page } from "playwright/test";

const KMW_OSK_ASSETS = [
  { match: "kmwosk.css", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/kmwosk.css", type: "text/css" },
  { match: "globe-hint.css", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/globe-hint.css", type: "text/css" },
  { match: "keymanweb-osk.ttf", url: "https://s.keyman.com/kmw/engine/18.0.245/osk/keymanweb-osk.ttf", type: "font/ttf" },
] as const;

export async function serveKmwOskAssets(page: Page): Promise<void> {
  try {
    const bodies = await Promise.all(
      KMW_OSK_ASSETS.map(async (a) => ({ ...a, body: Buffer.from(await (await fetch(a.url)).arrayBuffer()) })),
    );
    for (const a of bodies) {
      await page.route((url) => url.href.includes(a.match), (route) =>
        route.fulfill({ contentType: a.type, body: a.body }),
      );
    }
  } catch {
    // No local copies — the frame falls back to the CDN.
  }
}
