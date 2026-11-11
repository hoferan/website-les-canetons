import { browser, newPage, login, BASE } from "./lib.mjs";
const S = "docs/ux-review/screenshots/"; const b = await browser();
const { page } = await newPage(b, { width: 1280, height: 800 });
await page.goto(BASE + "/contact"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
for (const [n, sel] of [["input", "#contact-lastName"], ["submit", "button[type=submit]"]]) {
  await page.locator(sel).focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  console.log(n, await page.evaluate((s) => { const e = document.querySelector(s); const c = getComputedStyle(e); return `outline=${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor} | shadow=${c.boxShadow} | border=${c.borderTopColor}`; }, sel));
  await page.locator(sel).screenshot({ path: S + `components/focus-${n}-fr-1280.png`, animations: "disabled" });
}
// skip link visible on focus?
await page.goto(BASE + "/contact"); await page.keyboard.press("Tab"); await page.screenshot({ path: S + "flow-skiplink-focus-fr-1280.png", clip: { x: 0, y: 0, width: 640, height: 120 } });
console.log("skip rect", await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(","); }));
await page.goto(BASE + "/de/agenda"); await page.waitForLoadState("networkidle");
console.log("DE nav", await page.evaluate(() => [...document.querySelectorAll("header nav a")].map((a) => a.innerText.trim())));
await login(page, "demo.player"); await page.goto(BASE + "/de/events"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
console.log("DE nav member", await page.evaluate(() => [...document.querySelectorAll("header nav a")].map((a) => a.innerText.trim()).slice(0, 3)), await page.evaluate(() => document.querySelector("h1").innerText));
await b.close();
