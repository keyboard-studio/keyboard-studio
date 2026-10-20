async page => {
  const P = {"id":"p3-whole-ewondo-kbdfr","profile":3,"backspace":"whole","backspaceOnDiagonal":true,"inputOrder":"postfix","outputForm":"ready-made","lang":"ewondo","base":"basic_kbdfr","english":"Ewondo","autonym":"Ewondo","code":"ewo","overwriteChar":"ŋ","overwriteKey":"K_X","sampleText":"Àà Áá Ââ Èè Éé Êê Ìì Íí Îî Òò Óó Ôô Ùù Úú Ûû ə̀ ə́ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ à â ǎ è ê ě ì î ò ô ù û ə̀ ə̂ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ ɨ̀"};
  const out = { phase: 2, stations: [], errors: [] };
  const vis = async (loc, ms) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true).catch(() => false);
  const bodyText = async () => page.locator("body").innerText().catch(() => "");
  try {
    // Done on alphabet screen
    const done = page.getByTestId("charlist-done");
    await done.waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => { const b = document.querySelector('[data-testid="charlist-done"]'); return !!b && !b.disabled; }, null, { timeout: 15000 }).catch(() => {});
    await done.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    out.alphabetDone = true;

    // Text-sample prompt (marks attachment evidence) may gate the series.
    // The Done -> sample -> confirm cycle can hand back to the alphabet
    // screen (confirm adds the sampled stacks, Done must be pressed again),
    // so loop it until the marks series (or a later step) actually appears.
    for (let cycle = 0; cycle < 3; cycle++) {
      const seriesHere = await vis(page.getByTestId("marks-series"), 3000);
      if (seriesHere) break;
      const tsp0 = page.getByTestId("marks-text-sample-prompt");
      if (!(await vis(tsp0, 3000))) {
        const doneAgain = page.getByTestId("charlist-done");
        if (await vis(doneAgain, 2000)) {
          await page.waitForFunction(() => { const b = document.querySelector('[data-testid="charlist-done"]'); return !!b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
          await doneAgain.click({ timeout: 8000 }).catch(() => {});
          await page.waitForTimeout(800);
          continue;
        }
        break;
      }
      break; // prompt present: handled once below
    }
    const tsp = page.getByTestId("marks-text-sample-prompt");
    if (await vis(tsp, 8000)) {
      const rec = { present: true };
      rec.text = (await tsp.innerText().catch(() => "")).slice(0, 1200);
      try {
        await page.getByTestId("text-sample-textarea").fill(P.sampleText);
        await page.getByTestId("text-sample-submit").click();
        await page.waitForTimeout(1200);
        rec.proposalText = (await page.getByTestId("text-sample-proposal").innerText().catch(() => "")).slice(0, 1200);
        const conf = page.getByTestId("text-sample-confirm");
        if (await vis(conf, 5000)) { await conf.click(); rec.action = "sample-confirmed"; }
        else rec.action = "sample-submitted-no-confirm";
      } catch (e) {
        rec.action = "sample-failed: " + String(e && e.message ? e.message : e).slice(0, 200);
        const skip = page.getByTestId("marks-text-sample-prompt-skip");
        if (await vis(skip, 2000)) { await skip.click(); rec.action += "; skipped"; }
      }
      await page.waitForTimeout(800);
      out.textSample = rec;
    } else out.textSample = { present: false };
    // Confirm may hand back to the alphabet screen — press Done again if so.
    if (!(await vis(page.getByTestId("marks-series"), 3000))) {
      const d2 = page.getByTestId("charlist-done");
      if (await vis(d2, 3000)) {
        await page.waitForFunction(() => { const b = document.querySelector('[data-testid="charlist-done"]'); return !!b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
        await d2.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // Marks series loop
    const cont = page.getByTestId("marks-continue");
    let sawMarks = false;
    for (let i = 0; i < 12; i++) {
      const which = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        if (q('[data-testid="marks-attachment"]')) return "attachment";
        if (q('[data-testid="marks-treatment"]')) return "treatment";
        if (q('[data-testid="marks-output-form"]')) return "output-form";
        if (q('[data-testid="context-tolerance-station"]') || q('[data-testid="context-tolerance-checking"]')) return "context-tolerance";
        if (q('[data-testid="marks-stacking"]')) return "stacking";
        if (q('[data-testid="guard-station"]')) return "guard";
        if (q('[data-testid="marks-series"]')) return "marks-other";
        return null;
      }).catch(() => null);
      let contVisible = await vis(cont, which ? 2000 : 12000);
      if (!contVisible && !which) {
        // Transient states (e.g. context-tolerance checking) can hide the
        // footer for a while — poll a bit longer before giving up.
        let recovered = false;
        for (let w = 0; w < 3 && !recovered; w++) {
          await page.waitForTimeout(8000);
          recovered = await vis(cont, 2000);
        }
        if (!recovered) break;
        contVisible = true;
      }
      if (which) sawMarks = true;
      const rec = { station: which || "unknown" };
      if (which === "attachment") {
        rec.text = (await page.getByTestId("marks-attachment").innerText().catch(() => "")).slice(0, 1500);
      }
      if (which === "treatment") {
        const t = page.getByTestId("marks-treatment");
        rec.textBefore = (await t.innerText().catch(() => "")).slice(0, 2500);
        const opt = page.getByTestId("input-order-option-" + P.inputOrder);
        if (await vis(opt, 4000)) { await opt.click(); rec.inputOrderClicked = P.inputOrder; }
        else rec.inputOrderClicked = null;
        await page.waitForTimeout(400);
        rec.selectedOrder = await page.evaluate(() => {
          const el = document.querySelector('input[name="marks-input-order"]:checked');
          return el ? (el.closest("label")?.textContent || el.value || "checked") : null;
        }).catch(() => null);
        rec.textAfter = (await t.innerText().catch(() => "")).slice(0, 1200);
      }
      if (which === "output-form") {
        const s = page.getByTestId("marks-output-form");
        rec.textBefore = (await s.innerText().catch(() => "")).slice(0, 3000);
        rec.premise = await page.getByTestId("output-form-premise").innerText().catch(() => null);
        rec.previews = await page.locator('[data-testid="backspace-preview"]').allInnerTexts().catch(() => []);
        rec.proposalForm = await page.evaluate(() => {
          const el = document.querySelector('input[name="marks-output-form"]:checked');
          if (!el) return null;
          const label = el.closest("label");
          return label ? label.textContent.slice(0, 120) : "checked";
        }).catch(() => null);
        // independent backspace control? count interactive elements in the station that are not the two form radios / continue
        rec.otherControls = await page.evaluate(() => {
          const s = document.querySelector('[data-testid="marks-output-form"]');
          if (!s) return [];
          const els = [...s.querySelectorAll('button, select, input[type="checkbox"]')];
          return els.map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).slice(0, 60));
        }).catch(() => []);
        // select the case's form by label text
        const want = P.outputForm === "ready-made" ? /one single ready-made character/ : /letter and its mark as separate characters/;
        const label = page.locator('[data-testid="marks-output-form"] label', { hasText: want }).first();
        if (await vis(label, 4000)) { await label.click(); rec.formClicked = P.outputForm; }
        await page.waitForTimeout(400);
        rec.selectedForm = await page.evaluate(() => {
          const el = document.querySelector('input[name="marks-output-form"]:checked');
          if (!el) return null;
          const label = el.closest("label");
          const t = label ? label.textContent : "";
          return t.includes("ready-made") ? "ready-made" : (t.includes("separate characters") ? "base-plus-mark" : t.slice(0, 80));
        }).catch(() => null);
        rec.fallbackNote = await page.getByTestId("output-form-fallback-note").innerText().catch(() => null);
        // --- #2302 round 2: the backspace question (PR #2312, marks-backspace) ---
        const bk = { present: false };
        const bs = page.getByTestId("marks-backspace");
        if (await vis(bs, 4000)) {
          bk.present = true;
          bk.heading = await bs.locator("h3").first().innerText().catch(() => null);
          bk.sectionText = (await bs.innerText().catch(() => "")).slice(0, 2000);
          const readBk = () => page.evaluate(() => {
            const sec = document.querySelector('[data-testid="marks-backspace"]');
            if (!sec) return { recommended: null, checked: null };
            const beh = (txt) => txt.includes("one mark at a time") ? "peel" : (txt.includes("whole letter at once") ? "whole-stack" : null);
            let recommended = null, checked = null;
            for (const lab of sec.querySelectorAll("label")) {
              const t = lab.textContent || "";
              if (/recommended/.test(t)) recommended = beh(t);
              const inp = lab.querySelector('input[name="marks-backspace"]');
              if (inp && inp.checked) checked = beh(t);
            }
            return { recommended, checked };
          }).catch(() => ({ recommended: null, checked: null }));
          // Read AFTER the form selection above: the backspace proposal must follow the chosen composition.
          const st1 = await readBk();
          bk.recommended = st1.recommended;
          bk.checkedAfterForm = st1.checked;
          bk.expectedRecommended = P.outputForm === "ready-made" ? "whole-stack" : "peel";
          bk.proposalFollowsForm = bk.recommended === bk.expectedRecommended;
          bk.defaultCheckedFollowsProposal = st1.checked !== null && st1.checked === st1.recommended;
          // Select the case's target behaviour when it differs — the override.
          const wantBk = P.backspace === "whole" ? "whole-stack" : "peel";
          bk.target = wantBk;
          bk.clicked = null;
          if (st1.checked !== wantBk) {
            const labText = wantBk === "peel" ? /one mark at a time/ : /whole letter at once/;
            const lab = bs.locator("label", { hasText: labText }).first();
            if (await vis(lab, 3000)) { await lab.click(); bk.clicked = wantBk; await page.waitForTimeout(500); }
          }
          const st2 = await readBk();
          bk.checkedAfter = st2.checked;
          await page.waitForTimeout(600);
          const st3 = await readBk();
          bk.checkedSticky = st3.checked;
          bk.previewText = await bs.locator('[data-testid="backspace-preview"]').innerText().catch(() => null);
          bk.previewPresses = bk.previewText ? (bk.previewText.match(/⌫/g) || []).length : null;
          // Whole-stack preview = exactly one press; peel = two or more (one per mark + clear).
          bk.previewMatchesAnswer = bk.previewPresses === null ? null : (bk.checkedAfter === "whole-stack" ? bk.previewPresses === 1 : bk.previewPresses >= 2);
        }
        rec.backspace = bk;
        rec.textAfter = (await s.innerText().catch(() => "")).slice(0, 2500);
      }
      if (which === "guard") {
        rec.text = (await page.getByTestId("guard-station").innerText().catch(() => "")).slice(0, 1000);
        const sw = page.getByTestId("guard-option-swallow");
        const em = page.getByTestId("guard-option-emit");
        if ((await sw.count()) > 0 && (await em.count()) > 0) {
          const anySel = (await sw.isChecked().catch(() => false)) || (await em.isChecked().catch(() => false));
          if (!anySel) { await sw.check().catch(() => {}); rec.guardAnswered = "swallow"; }
          else rec.guardAnswered = "already-selected";
        } else {
          // prompt-style guard (buttons) or read-only prior
          const ps = page.getByTestId("guard-prompt-swallow");
          if (await vis(ps, 1500)) { await ps.click(); rec.guardAnswered = "prompt-swallow"; }
          else rec.guardAnswered = "prior-or-readonly";
        }
      }
      if (which === "context-tolerance") {
        rec.text = (await bodyText()).slice(0, 2500);
        // station decides via its own buttons; find a decide button inside marks-series that is not marks-continue
        const btns = page.locator('[data-testid="marks-series"] button');
        const n = await btns.count().catch(() => 0);
        rec.buttons = [];
        for (let b = 0; b < n; b++) { rec.buttons.push((await btns.nth(b).innerText().catch(() => "")).slice(0, 60)); }
      }
      out.stations.push(rec);
      if (!(await vis(cont, 1500))) {
        // maybe context-tolerance decided by its own button; try clicking a non-continue button matching accept/keep
        const decide = page.locator('[data-testid="marks-series"] button', { hasText: /accept|keep|add the rules|yes/i }).first();
        if (await vis(decide, 1500)) { await decide.click(); await page.waitForTimeout(800); continue; }
        break;
      }
      await cont.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    out.sawMarks = sawMarks;

    // punctuation (keep as proposed: click done without changes)
    const pd = page.getByTestId("punctuation-done");
    if (await vis(pd, 10000)) {
      out.punctuationText = (await bodyText()).slice(0, 2500);
      await pd.click(); out.punctuation = "done-as-proposed";
    } else out.punctuation = "not-rendered";
    // invisibles
    const inv = page.getByTestId("invisibles-continue");
    if (await vis(inv, 15000)) { await inv.click(); out.invisibles = "continued"; } else out.invisibles = "not-rendered";
    // convenience = fallback letters kept: continue as pre-checked
    const cc = page.getByTestId("convenience-continue");
    const carveEarly = page.getByTestId("carve-gallery");
    const raced = await Promise.race([
      vis(cc, 20000).then(v => v ? "convenience" : null),
      vis(carveEarly, 20000).then(v => v ? "carve" : null),
    ]).catch(() => null);
    if (raced === "convenience" || (await vis(cc, 500))) {
      out.convenienceOffered = await page.locator('[data-testid="convenience-chars"] [role="checkbox"], [data-testid="convenience-chars"] input[type="checkbox"]').evaluateAll(els => els.map(e => e.getAttribute("aria-label") || e.closest("label")?.textContent || "")).catch(() => []);
      out.convenienceText = (await bodyText()).slice(0, 2000);
      await cc.click(); out.convenience = "kept-as-proposed";
    } else out.convenience = "skipped-or-not-rendered";
    // carve
    const cg = page.getByTestId("carve-gallery");
    out.carveReached = await vis(cg, 30000);
    if (out.carveReached) {
      out.carveText = (await bodyText()).slice(0, 2000);
      await page.getByTestId("carve-continue").click(); out.carve = "continued-discard-nothing";
    }
    // deadkeys pass-through
    const dk = page.getByTestId("deadkeys-continue");
    const rc = page.getByTestId("rules-continue");
    await Promise.race([vis(dk, 20000), vis(rc, 20000)]).catch(() => null);
    if (await vis(dk, 1000)) { out.deadkeysText = (await bodyText()).slice(0, 1500); await dk.click(); out.deadkeys = "continued"; }
    else out.deadkeys = "not-rendered";
    // rules: capture text (search backspace) then continue
    if (await vis(rc, 20000)) {
      const rt = await bodyText();
      out.rulesText = rt.slice(0, 3000);
      out.rulesMentionsBackspace = /backspace/i.test(rt);
      // Round 2: any generated backspace rules visible at the rules step?
      out.rulesBkspHits = rt.split("\n").filter(l => /bksp|backspace/i.test(l)).slice(0, 10);
      await rc.click(); out.rules = "continued";
    } else out.rules = "not-rendered";
    out.endBodyExcerpt = (await bodyText()).slice(0, 1500);
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e).slice(0, 800));
    out.bodyExcerpt = await bodyText().then(t => t.slice(0, 3000)).catch(() => "");
  }
  return "WALKJSON:" + encodeURIComponent(JSON.stringify(out));
}
