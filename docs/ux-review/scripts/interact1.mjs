import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const S = "docs/ux-review/screenshots/";
const b = await browser(); const R = {};
const settle = (p, ms = 700) => p.waitForLoadState("networkidle").then(() => p.waitForTimeout(ms));
const ariaState = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { active: a ? (a.tagName + " " + (a.name || a.id || a.innerText || "").slice(0, 30)) : null,
    invalid: [...document.querySelectorAll("[aria-invalid=true]")].map((e) => (e.name || e.id) + " desc=" + (e.getAttribute("aria-describedby") || "none") + " -> " + (e.getAttribute("aria-describedby") || "").split(" ").map((i) => document.getElementById(i)?.innerText).join("|")),
    alerts: [...document.querySelectorAll("[role=alert],[role=status],[aria-live]")].map((e) => e.getAttribute("role") + "/" + e.getAttribute("aria-live") + ": " + e.innerText.slice(0, 80)),
    errTexts: [...document.querySelectorAll("[id*=error],[class*=error],.text-red,[class*=danger]")].map((e) => e.innerText.slice(0, 80)).filter(Boolean),
    html5: [...document.querySelectorAll("input,textarea,select")].filter((e) => e.required).map((e) => e.name + ":" + e.type + ":req=" + e.required + ":ac=" + e.autocomplete).join(", "),
    noValidate: document.querySelector("form")?.noValidate };
});
// A. contact form, empty submit at 375 FR
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await page.goto(BASE + "/contact"); await settle(page);
  R.contactInitial = await ariaState(page);
  await page.getByRole("button", { name: /envoyer/i }).click(); await page.waitForTimeout(600);
  R.contactEmptySubmit = await ariaState(page);
  await page.screenshot({ path: S + "flow-contact-empty-submit-fr-375.png", fullPage: true });
  await page.getByLabel(/^e-mail/i).fill("pas-un-mail"); await page.getByLabel(/^nom/i).fill("Muller"); await page.getByLabel(/prénom/i).fill("Léa");
  await page.getByLabel(/sujet/i).fill("Salut"); await page.getByLabel(/message/i).fill("Bonjour");
  await page.getByRole("button", { name: /envoyer/i }).click(); await page.waitForTimeout(600);
  R.contactBadEmail = await ariaState(page);
  await page.screenshot({ path: S + "flow-contact-bad-email-fr-375.png", fullPage: true });
  await page.getByLabel(/^e-mail/i).fill("lea@example.ch");
  await page.getByRole("button", { name: /envoyer/i }).click(); await page.waitForTimeout(1200);
  R.contactSuccess = await ariaState(page); R.contactSuccessText = await page.evaluate(() => document.querySelector("main")?.innerText.slice(0, 300));
  await page.screenshot({ path: S + "flow-contact-success-fr-375.png", fullPage: true });
  await page.context().close(); }
// A2. contact: server error via fetch override
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await page.addInitScript(() => { const f = window.fetch; window.fetch = (u, o) => (String(u).includes("/api/v1/contact") && o?.method === "POST") ? new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ type: "about:blank", title: "x", status: 500, code: "server_error", detail: "boom" }), { status: 500, headers: { "content-type": "application/problem+json" } })), 1500)) : f(u, o); });
  await page.goto(BASE + "/contact"); await settle(page);
  await page.getByLabel(/^e-mail/i).fill("lea@example.ch"); await page.getByLabel(/^nom/i).fill("Muller"); await page.getByLabel(/prénom/i).fill("Léa");
  await page.getByLabel(/sujet/i).fill("Salut"); await page.getByLabel(/message/i).fill("Bonjour");
  await page.getByRole("button", { name: /envoyer/i }).click(); await page.waitForTimeout(400);
  R.contactSending = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.innerText + " disabled=" + b.disabled + " aria-busy=" + b.getAttribute("aria-busy")).join(" | "));
  await page.screenshot({ path: S + "flow-contact-sending-fr-375.png" });
  await page.waitForTimeout(1500);
  R.contactServerError = await ariaState(page);
  R.contactValuesKept = await page.evaluate(() => [...document.querySelectorAll("input,textarea")].map((e) => e.value).join("|"));
  await page.screenshot({ path: S + "flow-contact-server-error-fr-375.png", fullPage: true });
  await page.context().close(); }
// C. login
{ const { page } = await newPage(b, { width: 1280, height: 800 });
  await page.goto(BASE + "/login"); await settle(page);
  R.loginInitial = await ariaState(page);
  R.loginFields = await page.evaluate(() => [...document.querySelectorAll("input")].map((i) => `${i.name}|${i.type}|ac=${i.autocomplete}|label=${i.labels?.[0]?.innerText}`));
  await page.getByRole("button", { name: /connexion|se connecter/i }).last().click(); await page.waitForTimeout(500);
  R.loginEmpty = await ariaState(page); await page.screenshot({ path: S + "flow-login-empty-fr-1280.png" });
  await page.locator("input").first().fill("demo.player"); await page.locator("input[type=password]").fill("faux");
  await page.getByRole("button", { name: /connexion|se connecter/i }).last().click(); await page.waitForTimeout(900);
  R.loginWrong = await ariaState(page); await page.screenshot({ path: S + "flow-login-wrong-fr-1280.png" });
  await page.context().close(); }
// G/I. keyboard + mobile nav + lang switch
{ const { page } = await newPage(b, { width: 1280, height: 800 });
  await page.goto(BASE + "/agenda"); await settle(page);
  const stops = []; for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); stops.push(await page.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return `${a.tagName} "${(a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 22)}" outline=${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} shadow=${s.boxShadow.slice(0, 40)}`; })); }
  R.tabStops = stops;
  await page.keyboard.press("Tab"); await page.screenshot({ path: S + "flow-focus-ring-fr-1280.png", clip: { x: 0, y: 0, width: 1280, height: 200 } });
  await page.locator("header a[href^=\"/de\"]").first().click(); await settle(page, 400); R.langFromAgenda = page.url();
  await page.goto(BASE + "/events/7/book"); await settle(page);
  await page.locator("header a[href^=\"/de\"]").first().click(); await settle(page, 400); R.langFromBook = page.url();
  await page.goto(BASE + "/band"); await settle(page); R.langAttrFr = await page.evaluate(() => document.documentElement.lang);
  R.langSwitchMarkup = await page.evaluate(() => document.querySelector("nav[aria-label], header")?.querySelector("a[href^='/de']")?.parentElement?.outerHTML.slice(0, 500));
  await page.context().close(); }
{ const { page } = await newPage(b, { width: 375, height: 800 });
  await page.goto(BASE + "/agenda"); await settle(page);
  const btn = page.getByRole("button", { name: /menu/i }).first();
  R.menuBtn = await btn.evaluate((e) => ({ expanded: e.getAttribute("aria-expanded"), controls: e.getAttribute("aria-controls"), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }));
  await btn.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  R.menuOpen = await page.evaluate(() => ({ active: document.activeElement.tagName + " " + document.activeElement.innerText?.slice(0, 20), expandedAfter: document.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") }));
  await page.screenshot({ path: S + "flow-mobile-menu-open-fr-375.png" });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  R.menuAfterEsc = await page.evaluate(() => ({ expanded: document.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"), active: document.activeElement.tagName + " " + document.activeElement.innerText?.slice(0, 20) }));
  await page.context().close(); }
fs.writeFileSync("docs/ux-review/data/interact1.json", JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await b.close();
