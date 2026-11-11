// usage: node shot.mjs role path width out [clipSelector]
import { browser, newPage, login, BASE } from "./lib.mjs";
const [role, path, w, out, sel] = process.argv.slice(2);
const b = await browser(); const { page } = await newPage(b, { width: +w, height: 900 });
if (role !== "anon") await login(page, role);
await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
if (sel) { const el = page.locator(sel).first(); await el.screenshot({ path: out }); } else await page.screenshot({ path: out, fullPage: true });
await b.close();
