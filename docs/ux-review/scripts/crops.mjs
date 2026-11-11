import { browser, newPage, login, BASE } from "./lib.mjs";
const C = "docs/ux-review/screenshots/components/"; const b = await browser();
const go = async (role, path, w = 1280) => { const { page } = await newPage(b, { width: w, height: 900 }); if (role !== "anon") await login(page, role); await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800); return page; };
// tiny text
{ const page = await go("demo.direction", "/events"); const t = {};
  for (const p of ["/events", "/members", "/media", "/events/1/attendance", "/event-tags"]) { await page.goto(BASE + p); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()); ) { if (!n.textContent.trim()) continue; const e = n.parentElement; const s = getComputedStyle(e); if (parseFloat(s.fontSize) < 12 && !e.closest(".sr-only")) o.push(`${s.fontSize} "${n.textContent.trim().slice(0, 20)}" <${e.tagName}>`); } return [...new Set(o)].slice(0, 6); }); if (r.length) t[p] = r; }
  console.log("TINY", JSON.stringify(t)); await page.context().close(); }
// badges
{ const page = await go("demo.direction", "/events"); await page.locator("main").first().screenshot({ path: C + "badges-events-fr-1280.png", clip: undefined }).catch(() => {}); 
  const bs = page.locator("main span", { hasText: /^(Brouillon|Public|Répétition|Concert|Sortie)$/ }); console.log("badge count", await bs.count());
  for (const [i, name] of [[0, "badge-draft-or-tag"], [1, "badge-2"], [2, "badge-3"]]) { const el = bs.nth(i); if (await el.count()) await el.screenshot({ path: C + name + ".png" }); }
  await page.context().close(); }
{ const page = await go("demo.direction", "/members"); const el = page.locator("main span", { hasText: /Jamais utilisé/ }).first(); await el.screenshot({ path: C + "badge-never-used.png" }); await page.context().close(); }
// buttons: hero vs admin vs form-submit
{ const page = await go("anon", "/"); await page.locator("main a", { hasText: "Nous rejoindre" }).first().screenshot({ path: C + "button-accent-hero-48.png" }); await page.context().close(); }
{ const page = await go("demo.direction", "/members"); await page.getByRole("button", { name: /ajouter une personne/i }).first().screenshot({ path: C + "button-primary-44-pad12.png" }); await page.context().close(); }
{ const page = await go("anon", "/contact"); await page.getByRole("button", { name: /envoyer/i }).screenshot({ path: C + "button-primary-form-48.png" }); await page.context().close(); }
{ const page = await go("anon", "/events/7/book"); await page.getByRole("button", { name: /m’inscrire/i }).screenshot({ path: C + "button-primary-booking-44.png" }); await page.context().close(); }
// checkbox bug @375
{ const page = await go("demo.direction", "/roles", 375); const fs = page.locator("fieldset, form").last(); await page.locator("input[type=checkbox]").nth(10).scrollIntoViewIfNeeded(); await page.screenshot({ path: C + "checkbox-shrink-roles-fr-375.png" }); await page.context().close(); }
// cards
{ const page = await go("demo.player", "/events"); await page.locator("article").first().screenshot({ path: C + "card-event-list.png" }); await page.context().close(); }
{ const page = await go("anon", "/"); await page.locator("main a", { hasText: "Les instruments" }).first().screenshot({ path: C + "card-home-tile.png" }).catch(() => {}); await page.context().close(); }
{ const page = await go("demo.direction", "/roles"); await page.locator("li").first().screenshot({ path: C + "card-role.png" }); await page.context().close(); }
await b.close();
