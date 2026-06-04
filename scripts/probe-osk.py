"""Verify the inline OSK lives in #osk-host and that the desktop/mobile
toggle replaces the OSK element with a new InlinedOSKView."""
import sys
import time
import json
from playwright.sync_api import sync_playwright


def main() -> int:
    port = sys.argv[1] if len(sys.argv) > 1 else "5183"
    kbd = sys.argv[2] if len(sys.argv) > 2 else "sil_devanagari_phonetic"
    url = f"http://localhost:{port}/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context().new_page()
        msgs = []
        page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text[:300]}"))

        page.goto(url, wait_until="load")
        page.wait_for_selector(
            f"select#kbd-picker option[value='{kbd}']",
            state="attached",
            timeout=10000,
        )
        page.select_option("select#kbd-picker", kbd)
        time.sleep(12)

        iframe_handle = page.query_selector("iframe[title='On-screen keyboard preview']")
        iframe = iframe_handle.content_frame() if iframe_handle else None
        if iframe is None:
            print("ERROR: iframe missing")
            return 1

        def snapshot(label):
            data = iframe.evaluate("""() => {
                const host = document.getElementById('osk-host');
                const frame = document.getElementById('osk-host-frame');
                const oskInHost = host ? host.querySelector('.kmw-osk-frame') : null;
                const floatingOsk = Array.from(document.body.children).filter(c =>
                    c.classList && c.classList.contains('kmw-osk-frame'));
                return {
                    frame_class: frame ? frame.className : null,
                    osk_in_host: oskInHost ? {
                        cls: String(oskInHost.className).slice(0, 200),
                        rect: (() => { const r = oskInHost.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })()
                    } : null,
                    floating_osks_on_body: floatingOsk.length,
                };
            }""")
            print(f"\n[{label}]\n  " + json.dumps(data, indent=2).replace("\n", "\n  "))

        snapshot("after picking " + kbd + " (desktop default)")

        # Click the Mobile KB button.
        try:
            page.get_by_role("button", name="Mobile KB").click()
            time.sleep(2)
            snapshot("after Mobile KB click")
        except Exception as e:
            print(f"Mobile KB click failed: {e}")

        # Back to desktop.
        try:
            page.get_by_role("button", name="Desktop OSK").click()
            time.sleep(2)
            snapshot("after Desktop OSK click")
        except Exception as e:
            print(f"Desktop OSK click failed: {e}")

        print("\n[messages tail]")
        for m in msgs[-10:]:
            print(m)
        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
