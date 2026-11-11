// BFS link crawl per role; writes data/routes.json
import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const ROLES = [null, "demo.player", "demo.both", "demo.direction", "demo.committee", "demo.young", "demo.mustchange", "demo.registeronly", "demo.guestlists"];
const norm = (u) => { const x = new URL(u, BASE); return x.origin === BASE ? x.pathname.replace(/\/$/, "") || "/" : null; };
const out = {}; const b = await browser();
for (const role of ROLES) {
  const { page } = await newPage(b);
  if (role) await login(page, role);
  await page.waitForTimeout(800);
  const seen = new Map(); const q = ["/", "/de"];
  while (q.length && seen.size < 80) {
    const p = q.shift(); if (seen.has(p)) continue;
    await page.goto(BASE + p).catch(() => {}); await page.waitForTimeout(900);
    const info = await page.evaluate(() => ({ h1: [...document.querySelectorAll("h1")].map(h => h.innerText), links: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")) }));
    seen.set(p, { url: page.url().replace(BASE, ""), h1: info.h1 });
    for (const l of info.links) { const n = norm(l); if (n && !seen.has(n) && !q.includes(n) && !n.includes("/de") === !p.includes("/de")) q.push(n); }
    for (const l of info.links) { const n = norm(l); if (n && !n.startsWith("/de") && !seen.has(n) && !q.includes(n)) q.push(n); }
  }
  out[role ?? "anon"] = Object.fromEntries(seen);
  console.log(role ?? "anon", seen.size);
  await page.context().close();
}
fs.writeFileSync("docs/ux-review/data/routes.json", JSON.stringify(out, null, 1));
await b.close();
