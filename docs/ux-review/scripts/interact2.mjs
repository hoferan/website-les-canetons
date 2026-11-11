import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const S = "docs/ux-review/screenshots/"; const R = {}; const b = await browser();
const settle = (p, ms = 700) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(ms));
const slowFail = (mode, match) => () => {};
// 1. CLS sources on home
{ const { page } = await newPage(b, { width: 1280, height: 900 });
  await page.addInitScript(() => { window.__ls = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push({ v: +e.value.toFixed(3), t: Math.round(e.startTime), src: (e.sources || []).map((s) => (s.node?.nodeName || "?") + "." + (s.node?.className?.toString?.().slice(0, 40) || "") + " " + Math.round(s.previousRect.y) + "->" + Math.round(s.currentRect.y)) }); }).observe({ type: "layout-shift", buffered: true }); });
  await page.goto(BASE + "/"); await settle(page, 1500); R.homeCLS = await page.evaluate(() => window.__ls);
  R.fonts = await page.evaluate(() => [...document.fonts].map((f) => f.family + " " + f.weight + " " + f.status + " display=" + f.display));
  await page.context().close(); }
// 2. page titles fr/de
{ const { page } = await newPage(b); R.titles = {};
  for (const p of ["/", "/de/", "/band", "/de/band", "/contact", "/login", "/no-such-page"]) { await page.goto(BASE + p); await settle(page, 400); R.titles[p] = await page.title(); }
  await page.context().close(); }
// 3. events list states with fetch override
const override = (kind) => `(() => { const f = window.fetch; window.fetch = (u, o) => { const url = String(u?.url || u); if (/\\/api\\/v1\\/events(\\?|$)/.test(url) && (!o || !o.method || o.method === "GET")) { ${kind === "slow" ? "return new Promise((r) => setTimeout(() => r(f(u, o)), 4000));" : kind === "fail" ? "return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ title: 'x', status: 500, code: 'server_error', detail: 'boom' }), { status: 500, headers: { 'content-type': 'application/problem+json' } })), 300));" : "return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ data: [], meta: { total: 0, per_page: 50, current_page: 1, last_page: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })), 200));"} } return f(u, o); }; })();`;
for (const kind of ["slow", "fail", "empty"]) for (const w of [375, 1280]) {
  const { page } = await newPage(b, { width: w, height: 800 });
  await login(page, "demo.player"); await page.addInitScript(override(kind));
  await page.goto(BASE + "/events"); await page.waitForTimeout(kind === "slow" ? 1500 : 1500);
  R["events_" + kind + "_" + w] = await page.evaluate(() => ({ main: document.querySelector("main")?.innerText.slice(0, 250), roles: [...document.querySelectorAll("[role=alert],[role=status],[aria-busy=true]")].map((e) => e.getAttribute("role") + ":" + e.innerText.slice(0, 60)), retry: [...document.querySelectorAll("button")].map((b) => b.innerText).filter((t) => /réessayer|retry/i.test(t)) }));
  await page.screenshot({ path: S + `state-events-${kind}-fr-${w}.png` });
  await page.context().close(); }
// 4. destructive dialog: event edit delete (direction)
{ const { page } = await newPage(b, { width: 1280, height: 800 });
  await login(page, "demo.direction"); await page.goto(BASE + "/events/7/edit"); await settle(page);
  R.editButtons = await page.evaluate(() => [...document.querySelectorAll("main button, main a")].map((e) => e.innerText.trim() || e.getAttribute("aria-label")).filter(Boolean));
  const del = page.getByRole("button", { name: /supprimer/i }).first();
  if (await del.count()) { await del.click(); await page.waitForTimeout(500);
    R.dialog = await page.evaluate(() => { const d = document.querySelector("[role=dialog],[role=alertdialog]"); return d ? { role: d.getAttribute("role"), label: d.getAttribute("aria-label") || d.getAttribute("aria-labelledby"), text: d.innerText.slice(0, 200), active: document.activeElement.innerText, buttons: [...d.querySelectorAll("button")].map((b) => b.innerText) } : null; });
    await page.screenshot({ path: S + "state-delete-dialog-fr-1280.png" });
    const tabs = []; for (let i = 0; i < 5; i++) { await page.keyboard.press("Tab"); tabs.push(await page.evaluate(() => (document.activeElement.closest("[role=dialog],[role=alertdialog]") ? "in:" : "OUT:") + document.activeElement.innerText.slice(0, 20))); } R.dialogTabs = tabs;
    await page.keyboard.press("Escape"); await page.waitForTimeout(300);
    R.afterEsc = await page.evaluate(() => ({ open: !!document.querySelector("[role=dialog],[role=alertdialog]"), active: document.activeElement.innerText.slice(0, 20) })); }
  await page.context().close(); }
// 5. new event empty submit
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await login(page, "demo.direction"); await page.goto(BASE + "/events/new"); await settle(page);
  R.newEventFields = await page.evaluate(() => [...document.querySelectorAll("main input,main select,main textarea")].filter((i) => i.type !== "hidden").map((i) => `${i.name || i.id}|${i.type}|req=${i.required}|label=${i.labels?.[0]?.innerText.slice(0, 30)}`));
  await page.screenshot({ path: S + "flow-event-new-fr-375.png", fullPage: true });
  const sub = page.getByRole("button", { name: /enregistrer|créer|publier/i }).first(); await sub.click(); await page.waitForTimeout(600);
  R.newEventEmpty = await page.evaluate(() => ({ active: document.activeElement.name || document.activeElement.tagName, invalid: [...document.querySelectorAll("[aria-invalid=true]")].length, alerts: [...document.querySelectorAll("[role=alert]")].map((e) => e.innerText.slice(0, 80)) }));
  await page.screenshot({ path: S + "flow-event-new-empty-submit-fr-375.png", fullPage: true });
  await page.context().close(); }
// 6. booking: empty submit then full flow
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await page.goto(BASE + "/events/7/book"); await settle(page);
  await page.getByRole("button", { name: /m’inscrire/i }).click(); await page.waitForTimeout(600);
  R.bookEmpty = await page.evaluate(() => ({ active: document.activeElement.name || document.activeElement.tagName + document.activeElement.innerText, invalid: [...document.querySelectorAll("[aria-invalid=true]")].length, errs: [...document.querySelectorAll("[id$=error]")].map((e) => e.innerText.slice(0, 60)), alerts: [...document.querySelectorAll("[role=alert]")].map((e) => e.innerText.slice(0, 80)) }));
  await page.screenshot({ path: S + "flow-booking-empty-submit-fr-375.png", fullPage: true });
  R.bookQty = await page.evaluate(() => [...document.querySelectorAll("input[type=number]")].map((i) => `${i.name}|min=${i.min}|max=${i.max}|inputmode=${i.inputMode}|label=${i.labels?.[0]?.innerText.slice(0, 30)}`));
  R.bookPhone = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.name || i.id}:${i.type}:ac=${i.autocomplete}:im=${i.inputMode}`));
  await page.context().close(); }
fs.writeFileSync("docs/ux-review/data/interact2.json", JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await b.close();
