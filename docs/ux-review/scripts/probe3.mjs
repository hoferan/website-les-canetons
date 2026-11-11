import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser(); const { page } = await newPage(b); await login(page, "demo.direction");
await page.goto(BASE + "/events/7/book/edit"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
console.log((await page.locator("main").ariaSnapshot()).split("\n").filter((l) => /switch|spinbutton|combobox|textbox/.test(l)).join("\n"));
await b.close();
