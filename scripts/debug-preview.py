"""
Headless dev-iteration harness for the #39 preview pane.

Launches Chromium against the running Vite dev server, picks the named
keyboard from the BaseKeyboardPicker, and dumps:
  - All console messages (kept verbatim with prefix tag)
  - Any uncaught page errors
  - The textContent of the overlay (so we can read "Compile failed: ...")

Usage:
  python scripts/debug-preview.py <port> <keyboard_id>
  e.g. python scripts/debug-preview.py 5183 basic_kbdus
"""

import sys
import time
from playwright.sync_api import sync_playwright


def main() -> int:
    port = sys.argv[1] if len(sys.argv) > 1 else "5183"
    keyboard_id = sys.argv[2] if len(sys.argv) > 2 else "basic_kbdus"
    url = f"http://localhost:{port}/"
    print(f"[harness] target: {url} | keyboard: {keyboard_id}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        console_msgs = []
        page_errors = []

        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: page_errors.append(f"[pageerror] {e}"))

        page.goto(url, wait_until="load")
        # Wait for picker option to be attached (options are hidden by default).
        page.wait_for_selector(
            f"select#kbd-picker option[value='{keyboard_id}']",
            state="attached",
            timeout=10000,
        )
        page.select_option("select#kbd-picker", keyboard_id)

        # Let the pipeline run. 12s is enough for cold WASM init + compile.
        time.sleep(12)

        # Grab whatever's in the overlay (PreviewPaneOverlay) AND in the iframe
        # status div if reachable.
        overlay_text = "(none)"
        try:
            overlay = page.query_selector("[aria-live='polite']")
            if overlay is not None:
                overlay_text = overlay.text_content() or "(empty)"
        except Exception as e:
            overlay_text = f"(error reading overlay: {e})"

        print("\n=========================================================")
        print(f"OVERLAY TEXT:\n{overlay_text}")
        print("=========================================================")
        print(f"\n[console messages: {len(console_msgs)}]")
        for m in console_msgs:
            print(m)
        print(f"\n[page errors: {len(page_errors)}]")
        for e in page_errors:
            print(e)

        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
