import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser(); const { page } = await newPage(b, { width: 1280, height: 800 });
const small = () => page.evaluate(() => { const o = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()); ) { if (!n.textContent.trim()) continue; const e = n.parentElement; const s = getComputedStyle(e); if (parseFloat(s.fontSize) < 11.5 && !e.closest(".sr-only")) o.push(`${s.fontSize} "${n.textContent.trim().slice(0, 18)}" ${e.tagName}.${(e.className + "").slice(0, 25)}`); } return [...new Set(o)]; });
console.log("anon /", await small());
await login(page, "demo.direction"); await page.goto(BASE + "/events"); await page.waitForTimeout(900); console.log("direction /events", await small());
await page.goto(BASE + "/contact"); await page.keyboard.press("Tab"); await page.waitForTimeout(300); await page.screenshot({ path: "docs/ux-review/screenshots/flow-skiplink-focus-fr-1280.png", clip: { x: 0, y: 0, width: 700, height: 130 } });
console.log("skip", await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return a.innerText + " " + [r.x, r.y, r.width, r.height].map(Math.round); }));
await b.close();
