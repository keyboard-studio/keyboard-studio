async page => {
  const P = {"id":"p2-unwrap-bafut-kbdus","profile":2,"backspace":"unwrap","backspaceOnDiagonal":false,"inputOrder":"prefix","outputForm":"ready-made","lang":"bafut","base":"basic_kbdus","english":"Bafut","autonym":"Bafut","code":"bfd","overwriteChar":"ŋ","overwriteKey":"K_X","sampleText":"Àà Áá Ââ Èè Éé Êê Ìì Íí Îî Òò Óó Ôô Ùù Úú Ûû ə̀ ə́ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ à â ǎ è ê ě ì î ò ô ù û ə̀ ə̂ ɛ́ ɛ̂ ɔ́ ɔ̂ ŋ̂ ɨ̀"};
  const out = { phase: 3, chars: [], errors: [], overwrite: null };
  const vis = async (loc, ms) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true).catch(() => false);
  const bodyText = async () => page.locator("body").innerText().catch(() => "");
  async function checkDisplacement(contextLabel) {
    const banner = page.getByRole("note", { name: /Displaced character proposal/i });
    if (!(await vis(banner, 2500))) return null;
    const rec = { context: contextLabel, text: (await banner.innerText().catch(() => "")).slice(0, 700) };
    const moveBtn = banner.getByRole("button", { name: /Move .+ to AltGr|Move .+ behind a deadkey/i }).first();
    const keepBtn = banner.getByRole("button", { name: /Keep both/i }).first();
    if (await vis(moveBtn, 800)) { rec.action = "confirm-move"; await moveBtn.click().catch(() => {}); }
    else if (await vis(keepBtn, 800)) { rec.action = "keep-both"; await keepBtn.click().catch(() => {}); }
    else {
      const leave = banner.getByRole("button", { name: /Leave it|No, leave/i }).first();
      if (await vis(leave, 800)) { rec.action = "leave-it"; await leave.click().catch(() => {}); }
      else rec.action = "left-visible";
    }
    await page.waitForTimeout(500);
    return rec;
  }
  try {
    const startBtn = page.getByRole("button", { name: "Start the mechanism gallery" });
    if (await vis(startBtn, 8000)) { await startBtn.click(); out.splash = "dismissed"; }
    const emptyNotice = page.getByText("No new characters to add.");
    const forward = page.getByRole("button", { name: /^(Next character|Continue)$/ });
    await Promise.race([vis(emptyNotice, 15000), vis(forward, 15000)]).catch(() => null);
    if (await vis(emptyNotice, 600)) {
      out.emptyDiff = true;
      await page.getByTestId("mechanisms-continue").click();
      out.completed = true;
      out.endText = (await bodyText()).slice(0, 1200);
      return "WALKJSON:" + encodeURIComponent(JSON.stringify(out));
    }
    out.emptyDiff = false;
    let overwriteAttempted = false;
    for (let guard = 0; guard < 45; guard++) {
      if (!(await vis(forward, 8000))) { out.completed = out.chars.length > 0; out.endReason = out.chars.length > 0 ? "forward-gone-after-chars" : "gallery-never-opened"; break; }
      const applyBtn = page.getByRole("button", { name: /^Apply method for / });
      let currentChar = null;
      if (await vis(applyBtn, 3000)) {
        const al = (await applyBtn.getAttribute("aria-label").catch(() => "")) || "";
        currentChar = al.replace(/^Apply method for /, "");
      }
      const rec = { char: currentChar };
      // suggestion evidence
      const note = page.getByRole("note", { name: /Placement suggestion from kbgen seeder/i });
      if (await vis(note, 1500)) {
        rec.suggestion = (await note.innerText().catch(() => "")).slice(0, 900);
        rec.rationales = await note.locator('[data-testid="suggestion-rationale"]').allInnerTexts().catch(() => []);
        rec.acceptButtons = await note.getByRole("button", { name: /Accept suggestion/i }).evaluateAll(els => els.map(e => e.getAttribute("aria-label") || e.textContent || "")).catch(() => []);
      } else rec.suggestion = null;
      out.chars.push(rec);
      if (currentChar === null) { out.errors.push("no apply button at guard " + guard); break; }

      const doOverwrite = !overwriteAttempted && currentChar === P.overwriteChar;
      if (doOverwrite) {
        overwriteAttempted = true;
        const ow = { char: currentChar, key: P.overwriteKey, ok: false };
        try {
          const card = page.getByRole("button", { name: /^Assign to a key/ });
          if ((await card.getAttribute("aria-pressed").catch(() => null)) !== "true") await card.click();
          const trigger = page.getByRole("button", { name: "Physical key for Assign to a key" });
          await trigger.waitFor({ timeout: 10000 });
          await trigger.click();
          await page.locator('ul[role="listbox"] li[data-value="' + P.overwriteKey + '"]').click({ timeout: 10000 });
          ow.keySelected = true;
          await page.waitForFunction(() => { const bs = [...document.querySelectorAll("button")]; const b = bs.find(x => /^Apply method for /.test(x.getAttribute("aria-label") || "")); return !!b && !b.disabled; }, null, { timeout: 10000 }).catch(() => {});
          const dis = await applyBtn.isDisabled().catch(() => true);
          ow.applyDisabled = dis;
          if (!dis) { await applyBtn.click({ timeout: 15000 }); ow.ok = true; }
          await page.waitForTimeout(700);
          ow.displacement = await checkDisplacement("overwrite-" + currentChar + "-onto-" + P.overwriteKey);
        } catch (e) { ow.error = String(e && e.message ? e.message : e).slice(0, 400); }
        out.overwrite = ow;
      } else if (rec.suggestion && rec.acceptButtons && rec.acceptButtons.length > 0) {
        const acc = note.getByRole("button", { name: /Accept suggestion/i }).first();
        await acc.click().catch(() => {});
        rec.action = "accepted-suggestion";
        await page.waitForTimeout(700);
        rec.displacement = await checkDisplacement("suggestion-accept-" + currentChar);
      } else if (!(await applyBtn.isDisabled().catch(() => true))) {
        await applyBtn.click({ timeout: 15000 }).catch(() => {});
        rec.action = "applied-default";
        await page.waitForTimeout(500);
        rec.displacement = await checkDisplacement("default-apply-" + currentChar);
      } else {
        const contentToken = "zzq" + [...currentChar].map(cp => (cp.codePointAt(0) || 0).toString(16)).join("");
        try {
          await page.getByRole("button", { name: "Type a sequence" }).click({ timeout: 10000 });
          await page.getByTestId("sequences-content").fill(contentToken);
          await page.getByTestId("sequences-indicator").fill("j");
          await page.getByTestId("sequences-apply").click({ timeout: 10000 });
          rec.action = "sequence-fallback";
        } catch (e) { rec.action = "stuck"; rec.error = String(e && e.message ? e.message : e).slice(0, 300); out.chars[out.chars.length - 1] = rec; break; }
        await page.waitForTimeout(500);
        rec.displacement = await checkDisplacement("sequence-" + currentChar);
      }
      out.chars[out.chars.length - 1] = rec;
      let fwdEnabled = false;
      for (let w = 0; w < 25; w++) { if (await forward.isEnabled().catch(() => false)) { fwdEnabled = true; break; } await page.waitForTimeout(1000); }
      if (!fwdEnabled) { out.stuckAt = currentChar; out.endText = (await bodyText()).slice(0, 2000); break; }
      await forward.click({ timeout: 15000 });
      await page.waitForTimeout(600);
    }
    if (out.completed === undefined) out.completed = false;
    out.overwriteAttempted = overwriteAttempted;
    out.endText = (await bodyText()).slice(0, 1500);
    out.reachedTouchSeed = await vis(page.getByTestId("seed-source-confirm"), 3000);
  } catch (e) {
    out.errors.push(String(e && e.message ? e.message : e).slice(0, 800));
    out.bodyExcerpt = await bodyText().then(t => t.slice(0, 2500)).catch(() => "");
  }
  return "WALKJSON:" + encodeURIComponent(JSON.stringify(out));
}
