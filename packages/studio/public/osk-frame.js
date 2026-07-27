// [SCAFFOLD] Inline OSK pattern using KMW's InlinedOSKView. Adapted from
// Keyman Developer's debug-host
// (keyman/developer/src/server/src/site/{index.html,test.js}).
//
// postMessage contract:
//   host -> frame: { type: "SET_KEYBOARD",  jsUrl, keyboardId, bcp47?, fontFaceUrl?, fontFaceFamily?, keyboardCssUrls? }
//   host -> frame: { type: "SET_OSK_MODE",  mode: "desktop" | "touch" }
//   frame -> host: { type: "ENGINE_READY" }
//   frame -> host: { type: "ENGINE_ERROR", message }
//   frame -> host: { type: "TEXT_UPDATED", value }
//   frame -> host: { type: "KEY_TAPPED", keyId }
//
// Font injection: when fontFaceUrl and fontFaceFamily are provided, a plain
// CSS @font-face rule is injected into the frame document head BEFORE
// window.keyman.addKeyboards() is called. This ensures the compiled keyboard
// JS can resolve the custom font by family name without relying on KMW's
// pathConfig.fonts mechanism (which is never set in this frame).
//
// Keyboard CSS injection: when keyboardCssUrls is non-empty, each blob: URL
// is loaded as a <link rel="stylesheet"> (per-keyboard `.kmw-keyboard-<id>`
// rules) after @font-face and before addKeyboards(). Mirrors what a real
// Keyman install does when it copies the package CSS next to the .js.
//
// Security: this document is same-origin-only. The message listener below
// requires event.origin === window.location.origin AND event.source ===
// window.parent before accepting anything — the parent iframe's
// sandbox="allow-same-origin" (see OSKFrame.tsx) is load-bearing for this
// check: without it the frame gets an opaque origin and window.location.origin
// would never match, silently dropping every command. jsUrl is additionally
// restricted to blob: URLs in loadKeyboard() (defense-in-depth — the only
// producer already only ever sends blob: URLs).
(function () {
  "use strict";

  var statusEl = document.getElementById("status");
  var oskTarget = document.getElementById("osk-target");
  var oskHost = document.getElementById("osk-host");
  var oskHostFrame = document.getElementById("osk-host-frame");
  var engineReady = false;
  var pendingKeyboard = null;
  var currentOsk = null;
  var currentMode = "desktop";
  // Monotonic token to supersede in-flight keyboard loads. Each loadKeyboard()
  // call claims the next token; when its async addKeyboards/setActiveKeyboard
  // chain settles, it bails if a newer load has since started. This prevents a
  // superseded load (whose blob URL the host may have already revoked on the
  // next recompile) from surfacing a spurious "Cannot find ... at blob:" error
  // or stomping the newer keyboard's activation. Mirrors the host-side runId
  // supersession in useKeyboardArtifact.ts.
  var loadToken = 0;

  // [SCAFFOLD] Device profiles cribbed from Keyman Developer test.js.
  // Two entries (desktop + phone) cover the toggle; dimensions drive
  // InlinedOSKView.setSize().
  var devices = {
    desktop: {
      name: "Windows",
      browser: "chrome",
      formFactor: "desktop",
      OS: "windows",
      touchable: false,
      dimensions: [640, 300],
    },
    touch: {
      name: "Google Pixel 5",
      browser: "chrome",
      formFactor: "phone",
      OS: "android",
      touchable: true,
      dimensions: [320, 290],
    },
  };

  function setStatus(s) { statusEl.textContent = s; }
  function post(msg) {
    // Frame and parent share origin by construction (src="/osk-frame.html"
    // is same-origin-relative); window.parent === window when this document
    // is opened top-level, so this is a harmless same-window no-op there.
    try { window.parent.postMessage(msg, window.location.origin); } catch (_) {}
  }
  function postError(message) {
    setStatus("ERROR: " + message);
    post({ type: "ENGINE_ERROR", message: message });
  }

  // Inject a @font-face rule into the frame document head so the compiled
  // keyboard JS can resolve the custom font by family name.
  // Idempotent: if a <style> with the same id already exists, skip.
  // Security: family is sanitized to an allowlist before interpolation to
  // prevent CSS injection via a crafted fontname attribute.  url is
  // validated to be a blob: or data: URL (the only kinds the studio
  // produces) before use.
  // Inject per-keyboard CSS files (from .kps <File>...<FileType>.css</FileType>)
  // as <link rel="stylesheet"> tags in the frame document head. The CSS is
  // hosted on a blob: URL the parent created; we never see the bytes here.
  // Each URL is tagged with a data-kmw-studio-keyboard-css attribute so
  // subsequent keyboard selections can sweep the old ones first.
  // Security: only blob: URLs are accepted — same posture as injectFontFace.
  function sweepKeyboardCss() {
    var existing = document.querySelectorAll("link[data-kmw-studio-keyboard-css]");
    for (var i = 0; i < existing.length; i++) {
      var el = existing[i];
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }
  function injectKeyboardCss(urls) {
    sweepKeyboardCss();
    if (!urls || !urls.length) return;
    for (var i = 0; i < urls.length; i++) {
      var url = urls[i];
      if (typeof url !== "string" || !url.startsWith("blob:")) continue;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.setAttribute("data-kmw-studio-keyboard-css", "1");
      document.head.appendChild(link);
    }
  }

  function injectFontFace(family, url) {
    if (!family || !url) return;
    // Strip any character that could break out of a CSS string or block.
    // Keeps letters, digits, spaces, and hyphens (covers "Andika Afr" etc.).
    var safeFamily = String(family).replace(/[^\w \-]/g, "").trim();
    if (safeFamily.length === 0) return;
    // Only inject blob: or data: URLs — the studio never produces anything else.
    if (
      typeof url !== "string" ||
      (!url.startsWith("blob:") && !url.startsWith("data:"))
    ) return;
    var slug = safeFamily.toLowerCase().replace(/[^a-z0-9]/g, "-");
    var styleId = "kmw-studio-font-" + slug;
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      "@font-face { font-family: \"" + safeFamily + "\"; src: url(\"" + url + "\"); }";
    document.head.appendChild(style);
  }

  function checkMinVersion(jsText) {
    var m = /MinimumKeymanVersion\s*[:=]\s*["']?(\d+)\.(\d+)/.exec(jsText);
    if (!m) return true;
    return parseInt(m[1], 10) <= 18;
  }

  // Friendly fallback for keyboards with a custom KH help panel (e.g.
  // sil_euro_latin's KMW_EMBEDJS). The panel doesn't fit flat inline
  // preview; render an explainer so the user knows the keyboard IS loaded.
  function renderCustomHelpStub(profile, keyboardId) {
    var name = keyboardId || "this keyboard";
    var note = document.createElement("div");
    note.setAttribute(
      "style",
      "padding:24px;color:#9aa7b8;font-size:13px;line-height:1.6;" +
        "text-align:center;display:flex;flex-direction:column;gap:12px;" +
        "align-items:center;justify-content:center;height:100%;",
    );
    note.innerHTML =
      "<div style=\"font-size:18px;color:#d2a8ff;\">[!] Custom keyboard layout</div>" +
      "<div><strong>" +
      name +
      "</strong> ships a custom help-panel-style OSK that doesn't fit this preview frame.</div>" +
      "<div>The keyboard is loaded and typing in the textbox above works normally.</div>" +
      "<div style=\"font-size:11px;color:#6c7891;font-family:ui-monospace,monospace;\">(" +
      profile.name +
      ")</div>";
    oskHost.appendChild(note);
  }

  // Build / rebuild the inline OSK for the current device.
  // Mirror of Keyman Developer test.js setOSK().
  function setOsk() {
    if (!window.keyman || !window.keyman.views || !window.keyman.views.InlinedOSKView) {
      return;
    }
    var profile = devices[currentMode] || devices.desktop;

    oskHostFrame.className = profile.name === "Google Pixel 5" ? "Pixel5" : "Windows";

    if (currentOsk) {
      try {
        if (currentOsk.element && currentOsk.element.parentNode === oskHost) {
          oskHost.removeChild(currentOsk.element);
        }
      } catch (_) {}
      window.keyman.osk = null;
      currentOsk = null;
    }
    while (oskHost.firstChild) oskHost.removeChild(oskHost.firstChild);

    // Surgical DOM cleanup. KMW's per-keyboard teardown is partial:
    // keyboards with KMW_EMBEDJS inject help-panel HTML directly as
    // direct children of <body>. Sweep only direct body children;
    // never remove <script>/<style>/<link> or our scaffold nodes.
    var keep = new Set([
      "osk-target",
      "status",
      "osk-host-frame",
      "KeymanWeb_HelpFrame",
    ]);
    try {
      Array.from(document.body.children).forEach(function (el) {
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") return;
        if (el.id && keep.has(el.id)) return;
        var isStrayKbd =
          (el.id && /^keyboard_/i.test(el.id)) ||
          (el.classList && el.classList.contains("kmw-osk-frame"));
        if (isStrayKbd) {
          el.parentNode.removeChild(el);
        }
      });
      document.querySelectorAll(".kmw-osk-frame").forEach(function (n) {
        if (n.closest("#osk-host")) return;
        n.parentNode && n.parentNode.removeChild(n);
      });
    } catch (_) {}

    // Ensure the KMW help-frame root exists (kept always-hidden).
    var helpRoot = document.getElementById("KeymanWeb_HelpFrame");
    if (!helpRoot) {
      helpRoot = document.createElement("div");
      helpRoot.id = "KeymanWeb_HelpFrame";
      helpRoot.setAttribute(
        "style",
        "display:none !important;visibility:hidden !important;position:absolute !important;left:-9999px !important;top:-9999px !important;width:0 !important;height:0 !important;overflow:hidden !important;",
      );
      document.body.appendChild(helpRoot);
    }
    helpRoot.innerHTML = "";

    // [SCAFFOLD] Hard list of keyboards whose DESKTOP OSK is a custom
    // KMW_EMBEDJS help panel that doesn't fit inline preview. Touch
    // layout renders normally for these. Replace with a dynamic check
    // once the engine can introspect keyboard capabilities.
    var CUSTOM_HELP_KEYBOARDS_DESKTOP = ["sil_euro_latin"];
    var activeKbId = "";
    try {
      activeKbId = String(window.keyman.getActiveKeyboard() || "").replace(
        /^Keyboard_/,
        "",
      );
    } catch (_) {}
    if (
      currentMode === "desktop" &&
      CUSTOM_HELP_KEYBOARDS_DESKTOP.indexOf(activeKbId) >= 0
    ) {
      renderCustomHelpStub(profile, activeKbId);
      return;
    }
    try {
      currentOsk = new window.keyman.views.InlinedOSKView(window.keyman, { device: profile });
      if (window.keyman.core) {
        window.keyman.core.contextDevice = profile;
      }
      window.keyman.osk = currentOsk;
      var hostW = oskHost.clientWidth || profile.dimensions[0];
      currentOsk.setSize(hostW + "px", profile.dimensions[1] + "px");
      oskHost.appendChild(currentOsk.element);
      try {
        var active = window.keyman.contextManager && window.keyman.contextManager.activeKeyboard;
        if (active) currentOsk.activeKeyboard = active;
      } catch (_) {}
    } catch (err) {
      postError("InlinedOSKView creation failed: " + (err && err.message || err));
      currentOsk = null;
    }
  }

  function loadKeyboard(jsUrl, keyboardId, fontFaceUrl, fontFaceFamily, keyboardCssUrls, bcp47) {
    // Security: the only producer of SET_KEYBOARD (OSKFrame.tsx) always sends
    // a blob: URL for jsUrl. Refuse anything else so a spoofed postMessage
    // (even one that slipped past the origin/source check) can't point KMW's
    // <script src> injection at an attacker-controlled URL.
    if (typeof jsUrl !== "string" || !jsUrl.startsWith("blob:")) {
      postError("refused non-blob keyboard URL");
      return;
    }
    if (!window.keyman || typeof window.keyman.addKeyboards !== "function") {
      postError("KMW engine missing addKeyboards()");
      return;
    }
    // Inject font and per-keyboard CSS BEFORE registering the keyboard
    // so the compiled CSS can resolve the family name and the keyboard's
    // own `.kmw-keyboard-<id>` rules are present when the keyboard JS
    // executes.
    injectFontFace(fontFaceFamily, fontFaceUrl);
    injectKeyboardCss(keyboardCssUrls);
    var myToken = ++loadToken;
    setStatus("registering keyboard: " + keyboardId);
    var kmwId = "Keyboard_" + keyboardId;
    // Remove any stale registration before re-adding. KMW caches keyboards by
    // ID — addKeyboards() with the same ID but a new blob URL would be silently
    // ignored, so the old (now-revoked) blob would stay active. Deregistering
    // first forces a fresh load from the new URL.
    try {
      if (typeof window.keyman.removeKeyboards === "function") {
        window.keyman.removeKeyboards(kmwId);
      }
    } catch (_) {}
    // Use the keyboard's actual BCP47 (forwarded by the host) so the stub
    // registers under and setActiveKeyboard activates the same tag the compiled
    // .js declares. Falling back to "en" causes "Cannot find the <id> keyboard
    // for English" on any non-English keyboard.
    var languageCode = typeof bcp47 === "string" && bcp47.length > 0 ? bcp47 : "en";
    var stub = {
      id: keyboardId,
      name: keyboardId,
      languages: { id: languageCode, name: languageCode },
      filename: jsUrl,
    };
    // Await addKeyboards() (it returns a Promise) BEFORE activating — the old
    // fixed 50ms setTimeout raced the async stub registration. Guard every
    // stage on myToken so a superseded load neither activates nor reports.
    // Promise.resolve().then(...) — not redundant: it funnels a SYNCHRONOUS
    // throw from addKeyboards into the .catch below (the old try/catch did this).
    Promise.resolve()
      .then(function () {
        return window.keyman.addKeyboards(stub);
      })
      .then(function () {
        if (myToken !== loadToken) return null; // superseded before activation
        return window.keyman.setActiveKeyboard(kmwId, languageCode);
      })
      .then(function (result) {
        if (myToken !== loadToken) return;        // superseded during activation — a newer load owns the frame
        if (result === false) {                   // KMW resolves false (not throw) on a genuine activation failure
          postError("setActiveKeyboard('" + kmwId + "') returned false for '" + languageCode + "'");
          return;
        }
        setStatus("active: " + keyboardId);
        setOsk();
        try { oskTarget.focus(); } catch (_) {}
      })
      .catch(function (err) {
        if (myToken !== loadToken) return;        // a superseded load's failure (e.g. a blob the host already revoked) — ignore
        postError("keyboard load failed for '" + kmwId + "': " + (err && err.message || err));
      });
  }

  function initEngine() {
    if (!window.keyman) {
      postError("window.keyman missing after KMW script load.");
      return;
    }
    window.keyman
      .init({
        // [TEMP] Hardcoded CDN resource path for KMW 18.0.245.
        // Replace with a versioned, self-hosted path once the production
        // delivery model for KMW assets is decided.
        resources: "https://s.keyman.com/kmw/engine/18.0.245/",
        root: "https://s.keyman.com/kmw/engine/18.0.245/",
        attachType: "manual",
        setActiveOnRegister: false,
        useAlerts: false,
      })
      .then(function () {
        try { window.keyman.attachToControl(oskTarget); } catch (_) {}
        engineReady = true;
        setStatus("KMW ready — pick a keyboard");
        post({ type: "ENGINE_READY" });
        if (pendingKeyboard) {
          var k = pendingKeyboard;
          pendingKeyboard = null;
          loadKeyboard(k.jsUrl, k.keyboardId, k.fontFaceUrl, k.fontFaceFamily, k.keyboardCssUrls, k.bcp47);
        }
      })
      .catch(function (err) {
        postError("keyman.init failed: " + (err && err.message || err));
      });
  }

  // [SCAFFOLD] Load KMW from vendored local copy. The vendored
  // keymanweb.js lives at public/kmw/18.0/ and is served by Vite
  // as a static asset.
  var s = document.createElement("script");
  s.src = "/kmw/18.0/keymanweb.js";
  s.onload = initEngine;
  s.onerror = function () {
    postError("could not load /kmw/18.0/keymanweb.js — was KMW vendored?");
  };
  document.head.appendChild(s);

  oskTarget.addEventListener("input", function () {
    post({ type: "TEXT_UPDATED", value: oskTarget.value });
  });

  // Capture-phase pointerup on the OSK host: walk up from the tap target
  // to find the nearest element with an own `keyId` expando (set by KMW's
  // internal link() helper on each .kmw-key div), then post KEY_TAPPED.
  // Does NOT call preventDefault/stopPropagation — KMW must still process
  // the tap for normal typing and long-press popups.
  oskHost.addEventListener("pointerup", function (event) {
    try {
      var el = event.target;
      // The key id is an expando KMW's link() sets on the inner .kmw-key
      // div. Prefer closest(".kmw-key") (handles taps on the child label
      // span), then fall back to an own-keyId ancestor walk for safety.
      var keyEl =
        el && typeof el.closest === "function" ? el.closest(".kmw-key") : null;
      if (!keyEl || typeof keyEl.keyId !== "string") {
        var p = el;
        while (p && p !== oskHost && !Object.prototype.hasOwnProperty.call(p, "keyId")) {
          p = p.parentElement;
        }
        if (p && p !== oskHost && Object.prototype.hasOwnProperty.call(p, "keyId")) {
          keyEl = p;
        }
      }
      if (keyEl) {
        var kid = keyEl.keyId;
        if (typeof kid === "string" && kid.length > 0) {
          post({ type: "KEY_TAPPED", keyId: kid });
        }
      }
    } catch (_) {}
  }, true);

  window.addEventListener("message", function (event) {
    // Security: only accept commands from our own document's parent, on our
    // own origin. Requires the parent iframe to be sandbox="allow-same-origin"
    // (see OSKFrame.tsx) — without it window.location.origin here is opaque
    // and never matches, so this check fails closed rather than open.
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;

    var msg = event.data;
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;

    if (msg.type === "SET_KEYBOARD") {
      if (!engineReady) {
        pendingKeyboard = {
          jsUrl: msg.jsUrl,
          keyboardId: msg.keyboardId,
          fontFaceUrl: msg.fontFaceUrl || null,
          fontFaceFamily: msg.fontFaceFamily || null,
          keyboardCssUrls: Array.isArray(msg.keyboardCssUrls) ? msg.keyboardCssUrls : null,
          bcp47: typeof msg.bcp47 === "string" ? msg.bcp47 : null,
        };
      } else {
        loadKeyboard(
          msg.jsUrl,
          msg.keyboardId,
          msg.fontFaceUrl,
          msg.fontFaceFamily,
          Array.isArray(msg.keyboardCssUrls) ? msg.keyboardCssUrls : null,
          typeof msg.bcp47 === "string" ? msg.bcp47 : null,
        );
      }
      return;
    }

    if (msg.type === "SET_OSK_MODE") {
      var nextMode = msg.mode === "touch" ? "touch" : "desktop";
      if (nextMode === currentMode) return;
      currentMode = nextMode;
      if (engineReady && window.keyman.getActiveKeyboard()) {
        setOsk();
      }
      return;
    }
  });
})();
