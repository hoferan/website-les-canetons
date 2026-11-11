// Pixel-based contrast: hide all text, screenshot, then compare each text element's resolved colour to the pixels behind its box.
import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const role = process.argv[2];
const PAGES = { anon: ["/", "/agenda", "/band", "/committee", "/history", "/join", "/contact", "/events/7/book", "/login", "/no-such-page"],
  "demo.player": ["/events", "/account"], "demo.direction": ["/events/new", "/events/7/edit", "/events/7/book/edit", "/event-tags", "/events/1/attendance", "/members", "/roles", "/media", "/website"], "demo.committee": ["/events/7/registrations", "/inbox"] };
const b = await browser(); const out = [];
for (const w of [375, 1280]) {
  const { ctx, page } = await newPage(b, { width: w, height: 900 });
  if (role !== "anon") await login(page, role);
  for (const p of PAGES[role]) {
    await page.goto(BASE + p); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
    const items = await page.evaluate(() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true });
      const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const res = []; const sy = scrollY, sx = scrollX;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        if (!n.textContent.trim()) continue; const e = n.parentElement; if (!e || /SCRIPT|STYLE|NOSCRIPT/.test(e.tagName)) continue;
        const s = getComputedStyle(e); if (s.visibility === "hidden" || s.display === "none") continue;
        if (e.closest(".sr-only,[aria-hidden=true],option")) continue;
        let op = 1; for (let q = e; q; q = q.parentElement) op *= +getComputedStyle(q).opacity; if (op === 0) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const rects = [...rg.getClientRects()].filter((r) => r.width > 2 && r.height > 2);
        for (const r of rects) res.push({ fg: rgba(s.color), op, size: parseFloat(s.fontSize), weight: +s.fontWeight, text: n.textContent.trim().slice(0, 28), tag: e.tagName, x: r.left + sx, y: r.top + sy + 2, w: r.width, h: Math.max(2, r.height - 4), disabled: !!e.closest(":disabled,[aria-disabled=true]") });
      }
      const st = document.createElement("style"); st.id = "__hide"; st.textContent = "*{color:transparent!important;text-shadow:none!important;-webkit-text-fill-color:transparent!important} svg *{stroke-opacity:0!important}"; document.head.append(st);
      return res;
    });
    const png = (await page.screenshot({ fullPage: true })).toString("base64");
    await page.evaluate(() => document.getElementById("__hide")?.remove());
    const fails = await page.evaluate(async ({ items, png }) => {
      const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const out = [];
      for (const it of items) {
        const x = Math.max(0, Math.floor(it.x)), y = Math.max(0, Math.floor(it.y)), w = Math.min(Math.ceil(it.w), img.width - x), h = Math.min(Math.ceil(it.h), img.height - y); if (w < 1 || h < 1) continue;
        const d = cx.getImageData(x, y, w, h).data; let worst = 99, wb = null; const step = Math.max(1, Math.floor((w * h) / 400));
        for (let k = 0; k < w * h; k += step) { const bg = [d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]; const a = it.fg[3] * it.op; const fg = [0, 1, 2].map((j) => it.fg[j] * a + bg[j] * (1 - a)); const c = cr(fg, bg); if (c < worst) { worst = c; wb = { fg, bg }; } }
        const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 700); const need = large ? 3 : 4.5;
        if (worst < need && !it.disabled) out.push({ text: it.text, tag: it.tag, size: it.size, weight: it.weight, ratio: +worst.toFixed(2), need, fg: wb.fg.map(Math.round).join(","), bg: wb.bg.join(",") });
      }
      return out;
    }, { items, png });
    for (const f of fails) out.push({ role, w, path: p, ...f });
    console.log(role, w, p, fails.length);
  }
  await ctx.close();
}
fs.writeFileSync(`docs/ux-review/data/contrast-${role}.json`, JSON.stringify(out));
await b.close();
