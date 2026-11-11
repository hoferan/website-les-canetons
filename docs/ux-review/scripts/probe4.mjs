import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser();
{ const { page } = await newPage(b, { width: 1280, height: 800 }); await page.goto(BASE + "/events/7/book"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
  console.log("book section labels:", await page.evaluate(() => [...document.querySelectorAll("main form *")].filter((e) => /VOS COORD|Vos coord|Votre choix|VOTRE CHOIX/i.test(e.childNodes[0]?.textContent || "") && e.children.length === 0).map((e) => e.tagName + "." + e.className.toString().slice(0, 30))));
  await page.goto(BASE + "/agenda"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
  await page.locator("nav a", { hasText: /^contact$/i }).first().click(); await page.waitForTimeout(800);
  console.log("after nav click:", await page.evaluate(() => ({ url: location.pathname, active: document.activeElement.tagName + " " + (document.activeElement.innerText || "").slice(0, 20), title: document.title, scrollY, live: [...document.querySelectorAll("[aria-live]")].map((e) => e.getAttribute("aria-live") + ":" + e.innerText.slice(0, 40)) })));
  await page.context().close(); }
{ const { page } = await newPage(b, { width: 375, height: 800 }); await login(page, "demo.player");
  await page.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) => { const url = String(u?.url || u); if (/\/api\/v1\/events(\?|$)/.test(url) && (!o || !o.method || o.method === "GET")) return Promise.resolve(new Response(JSON.stringify({ title: "x", status: 500, code: "server_error", detail: "boom" }), { status: 500, headers: { "content-type": "application/problem+json" } })); return f(u, o); }; });
  await page.goto(BASE + "/events"); await page.waitForTimeout(2500);
  console.log("error markup:", await page.evaluate(() => { const e = [...document.querySelectorAll("main *")].find((x) => /pas pu être chargé/.test(x.innerText) && x.children.length === 0); return e ? e.outerHTML.slice(0, 220) + " | parent role=" + e.parentElement.getAttribute("role") : "none"; }));
  await page.context().close(); }
await b.close();
