import { browser, newPage, login, BASE } from "./lib.mjs";
const b = await browser();
{ const { page } = await newPage(b, { width: 375, height: 800 }); await login(page, "demo.direction");
  await page.goto(BASE + "/members"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  console.log(await page.evaluate(() => [...document.querySelectorAll("main span,main div")].filter((e) => /Nie utilisé|Jamais|Provisoire|Nie benutzt|Provisorisch|Jamais utilisé|Mot de passe provisoire/i.test(e.childNodes[0]?.textContent || "") && e.children.length === 0).slice(0, 4).map((e) => { const s = getComputedStyle(e); return `${e.innerText}|color=${s.color}|bg=${s.backgroundColor}|${s.fontSize}/${s.fontWeight}`; })));
  await page.goto(BASE + "/roles"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  console.log("roles cb 375", await page.evaluate(() => [...document.querySelectorAll("input[type=checkbox]")].map((i) => Math.round(i.getBoundingClientRect().width) + "x" + Math.round(i.getBoundingClientRect().height)).join(" ")));
  await page.context().close(); }
{ const { page } = await newPage(b, { width: 1280, height: 800 }); await login(page, "demo.direction");
  await page.goto(BASE + "/roles"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  console.log("roles cb 1280", await page.evaluate(() => [...document.querySelectorAll("input[type=checkbox]")].map((i) => Math.round(i.getBoundingClientRect().width) + "x" + Math.round(i.getBoundingClientRect().height)).join(" ")));
  await page.goto(BASE + "/events/7/registrations"); await page.waitForTimeout(100);
  await page.context().close(); }
{ const { page } = await newPage(b, { width: 1280, height: 800 }); await login(page, "demo.committee");
  await page.goto(BASE + "/events/7/registrations"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  console.log(await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => !b.innerText.trim() && !b.getAttribute("aria-label")).map((b) => b.closest("li,article,div")?.innerText.slice(0, 60).replace(/\n/g, " ") + " || parent=" + b.parentElement.outerHTML.slice(0, 160))));
  await page.context().close(); }
await b.close();
