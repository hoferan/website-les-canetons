import { browser, newPage, BASE } from "./lib.mjs";
const S = "docs/ux-review/screenshots/components/"; const b = await browser();
const { page } = await newPage(b, { width: 1280, height: 800 });
await page.goto(BASE + "/contact"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
for (let i = 0; i < 30; i++) { await page.keyboard.press("Tab"); const t = await page.evaluate(() => document.activeElement.type + "|" + document.activeElement.id); if (/submit/.test(t)) break;
  if (/contact-lastName/.test(t)) { const r = await page.evaluate(() => { const e = document.activeElement.getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height }; }); await page.screenshot({ path: S + "focus-input-kbd-fr-1280.png", clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 } }); } }
await page.waitForTimeout(600);
const r = await page.evaluate(() => { const e = document.activeElement.getBoundingClientRect(); return { x: e.x, y: e.y, width: e.width, height: e.height, cs: getComputedStyle(document.activeElement).boxShadow + " || outline=" + getComputedStyle(document.activeElement).outline + " || border=" + getComputedStyle(document.activeElement).border }; });
console.log(r.cs); await page.screenshot({ path: S + "focus-submit-kbd-fr-1280.png", clip: { x: r.x - 14, y: r.y - 14, width: r.width + 28, height: r.height + 28 } });
await b.close();
