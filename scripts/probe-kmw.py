"""Probe KMW's runtime surface so we know what we can call for inline OSK."""
import sys
import time
from playwright.sync_api import sync_playwright


def main() -> int:
    port = sys.argv[1] if len(sys.argv) > 1 else "5183"
    kbd = sys.argv[2] if len(sys.argv) > 2 else "basic_kbdus"
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
        if iframe_handle is None:
            print("ERROR: iframe not found")
            return 1
        iframe = iframe_handle.content_frame()
        if iframe is None:
            print("ERROR: iframe contentFrame is None")
            return 1

        probe_js = """() => {
            const km = window.keyman;
            const out = {};
            if (!km) return {error: 'window.keyman missing'};
            out.osk_keys = km.osk ? Object.getOwnPropertyNames(km.osk) : null;
            out.osk_proto_keys = km.osk ? Object.getOwnPropertyNames(Object.getPrototypeOf(km.osk)) : null;
            out.config_keys = km.config ? Object.getOwnPropertyNames(km.config) : null;
            // find OSK DOM elements
            const oskByIdLike = Array.from(document.querySelectorAll('*'))
                .filter(el => (el.id || '').toLowerCase().includes('osk') || (el.className && String(el.className).toLowerCase().includes('osk')))
                .slice(0, 20)
                .map(el => ({
                    tag: el.tagName,
                    id: el.id,
                    cls: String(el.className).slice(0, 120),
                    parent: el.parentElement?.tagName + (el.parentElement?.id ? '#' + el.parentElement.id : ''),
                    pos: getComputedStyle(el).position,
                    rect: (() => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; })()
                }));
            out.osk_dom = oskByIdLike;
            // device
            out.device = km.config?.activeDevice ?? null;
            return out;
        }"""
        try:
            probe = iframe.evaluate(probe_js)
            import json
            print(json.dumps(probe, indent=2, default=str))
        except Exception as e:
            print(f"probe error: {e}")

        print("\n[messages]")
        for m in msgs[-15:]:
            print(m)

        browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(main())
