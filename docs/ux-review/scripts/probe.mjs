import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser(); const { page } = await newPage(b);
await login(page, "demo.direction"); await page.waitForTimeout(1000);
await page.goto(BASE + "/members"); await page.waitForTimeout(2000);
console.log(page.url(), (await page.locator("h1").allInnerTexts()));
await page.goto(BASE + "/de/members"); await page.waitForTimeout(2000);
console.log(page.url(), (await page.locator("h1").allInnerTexts()), await page.evaluate(()=>document.documentElement.lang));
await b.close();
