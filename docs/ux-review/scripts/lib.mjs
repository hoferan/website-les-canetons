import { chromium } from "playwright";
export const BASE = "http://127.0.0.1:5199";
export async function browser() { return chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] }); }
export async function newPage(b, { width = 1280, height = 900, locale = "fr-CH", scale = 1 } = {}) {
  const ctx = await b.newContext({ viewport: { width, height }, locale, deviceScaleFactor: scale, timezoneId: "Europe/Zurich" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  return { ctx, page };
}
export async function login(page, user, prefix = "") {
  await page.goto(BASE + prefix + "/login");
  await page.waitForLoadState("networkidle");
  const inputs = page.locator("input");
  await page.locator('input[name="username"], input[autocomplete="username"], input[type="text"]').first().fill(user);
  await page.locator('input[type="password"]').first().fill("demo");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !location.pathname.endsWith("/login"), null, { timeout: 8000 });
  await page.waitForLoadState("networkidle");
}
