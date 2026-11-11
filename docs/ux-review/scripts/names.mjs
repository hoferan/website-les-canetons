import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser(); const { page } = await newPage(b); await login(page, "demo.direction");
for (const p of ["/event-tags", "/roles", "/members"]) { await page.goto(BASE + p); await page.waitForLoadState("networkidle"); await page.waitForTimeout(600);
  const snap = await page.locator("main").ariaSnapshot(); console.log("==", p); console.log(snap.split("\n").filter((l) => /button|link|switch|checkbox/.test(l)).slice(0, 14).join("\n")); }
await b.close();
