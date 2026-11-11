import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const S = "docs/ux-review/screenshots/"; const R = {}; const b = await browser();
const settle = (p, ms = 700) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(ms));
// error state, long wait
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await login(page, "demo.player");
  await page.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) => { const url = String(u?.url || u); if (/\/api\/v1\/events(\?|$)/.test(url) && (!o || !o.method || o.method === "GET")) return Promise.resolve(new Response(JSON.stringify({ title: "x", status: 500, code: "server_error", detail: "boom" }), { status: 500, headers: { "content-type": "application/problem+json" } })); return f(u, o); }; });
  await page.goto(BASE + "/events"); const t0 = Date.now(); let seen = null;
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); const t = await page.evaluate(() => document.querySelector("main")?.innerText); if (!/Chargement/.test(t)) { seen = { afterMs: Date.now() - t0, t: t.slice(-200) }; break; } }
  R.eventsErrorAfter = seen; R.eventsErrBtns = await page.evaluate(() => [...document.querySelectorAll("main button")].map((b) => b.innerText));
  await page.screenshot({ path: S + "state-events-error-fr-375.png" }); await page.context().close(); }
// destructive dialogs: look at each admin page for delete buttons
{ const { page } = await newPage(b, { width: 1280, height: 800 }); await login(page, "demo.direction");
  for (const p of ["/members", "/roles", "/registers", "/event-tags", "/media/1", "/events", "/history"]) {
    await page.goto(BASE + p); await settle(page, 500);
    R["delbtn " + p] = await page.evaluate(() => [...document.querySelectorAll("button,a")].map((e) => (e.innerText || e.getAttribute("aria-label") || e.title || "").trim()).filter((t) => /suppr|archiv|retir|suppression|delete/i.test(t)).slice(0, 6)); }
  // pick one and test the dialog
  await page.goto(BASE + "/event-tags"); await settle(page, 500);
  const del = page.getByRole("button", { name: /supprimer/i }).first();
  if (await del.count()) { await del.click(); await page.waitForTimeout(500);
    R.dialog = await page.evaluate(() => { const d = document.querySelector("[role=dialog],[role=alertdialog]"); return d ? { role: d.getAttribute("role"), labelledby: !!d.getAttribute("aria-labelledby"), describedby: !!d.getAttribute("aria-describedby"), text: d.innerText.slice(0, 220), active: (document.activeElement.innerText || "").slice(0, 20), buttons: [...d.querySelectorAll("button")].map((b) => b.innerText || b.getAttribute("aria-label")) } : "NO DIALOG: " + document.body.innerText.slice(0, 120); });
    await page.screenshot({ path: S + "state-delete-dialog-fr-1280.png" });
    const tabs = []; for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); tabs.push(await page.evaluate(() => (document.activeElement.closest("[role=dialog],[role=alertdialog]") ? "in:" : "OUT:") + (document.activeElement.innerText || "").slice(0, 20))); } R.dialogTabs = tabs;
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    R.afterEsc = await page.evaluate(() => ({ open: !!document.querySelector("[role=dialog],[role=alertdialog]"), active: (document.activeElement.innerText || document.activeElement.tagName).slice(0, 30) })); }
  await page.context().close(); }
// registrations nameless buttons: what are they?
{ const { page } = await newPage(b, { width: 1280, height: 800 }); await login(page, "demo.committee");
  await page.goto(BASE + "/events/7/registrations"); await settle(page);
  R.regNameless = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => !b.innerText.trim() && !b.getAttribute("aria-label")).map((b) => b.outerHTML.slice(0, 400)));
  await page.screenshot({ path: S + "flow-registrations-fr-1280.png", fullPage: true }); await page.context().close(); }
fs.writeFileSync("docs/ux-review/data/interact3.json", JSON.stringify(R, null, 1)); console.log(JSON.stringify(R, null, 1)); await b.close();
