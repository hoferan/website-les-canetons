// usage: node audit.mjs <role|anon> ; writes data/audit-<role>.json + screenshots
import fs from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import { browser, newPage, login, BASE } from "./lib.mjs";
const role = process.argv[2];
const PAGES = {
  anon: ["/", "/agenda", "/band", "/committee", "/history", "/join", "/contact", "/events/7/book", "/login", "/no-such-page", "/dev/ui"],
  "demo.player": ["/events", "/events/4/book", "/account", "/account/password"],
  "demo.both": ["/events", "/account/password"],
  "demo.direction": ["/events", "/events/new", "/events/new/series", "/events/7/edit", "/events/7/book/edit", "/event-tags", "/events/1/attendance", "/members", "/registers", "/roles", "/history/new", "/history/1/edit", "/media", "/media/1", "/website"],
  "demo.committee": ["/events/7/registrations", "/inbox", "/contact-messages"],
  "demo.young": ["/events"],
};
const WIDTHS = (process.env.WIDTHS || "375,768,1280,1920").split(",").map(Number);
const slug = (p, loc, w) => (p === "/" ? "home" : p.slice(1).replace(/\//g, "_")) + `-${loc}-${w}`;
const collect = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255,255,255)"; };
  const tok = {}; const inc = (k, v) => { (tok[k] ??= {})[v] = (tok[k][v] || 0) + 1; };
  const contrast = []; const small = []; const all = [...document.querySelectorAll("body *")].filter(vis);
  for (const e of all) {
    const s = getComputedStyle(e);
    const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { inc("color", s.color); inc("fontFamily", s.fontFamily.split(",")[0]); inc("fontSize", s.fontSize); inc("fontWeight", s.fontWeight); inc("lineHeight", s.lineHeight);
      contrast.push({ fg: s.color, bg: bgOf(e), size: s.fontSize, weight: s.fontWeight, text: e.textContent.trim().slice(0, 30), tag: e.tagName }); }
    if (!/rgba\(0, 0, 0, 0\)/.test(s.backgroundColor)) inc("background", s.backgroundColor);
    if (s.borderRadius !== "0px") inc("radius", s.borderRadius);
    if (s.boxShadow !== "none") inc("shadow", s.boxShadow);
    for (const p of ["paddingTop", "paddingLeft", "marginTop", "rowGap", "columnGap"]) { const v = s[p]; if (v && v !== "0px" && v !== "normal") inc("spacing", v); }
    if (e.matches("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=checkbox],[role=switch]")) {
      const r = e.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small.push({ tag: e.tagName, text: (e.innerText || e.getAttribute("aria-label") || e.name || "").trim().slice(0, 25), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis).map((h) => h.tagName + ":" + h.innerText.trim().slice(0, 40));
  return {
    title: document.title, lang: document.documentElement.lang, h1: heads.filter((h) => h.startsWith("H1")).length, heads, tok, contrast, small,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1, scrollW: document.documentElement.scrollWidth,
    imgNoAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.getAttribute("src")),
    unlabeled: [...document.querySelectorAll("input:not([type=hidden]),select,textarea")].filter((i) => !i.labels?.length && !i.getAttribute("aria-label") && !i.getAttribute("aria-labelledby")).map((i) => i.outerHTML.slice(0, 100)),
    nameless: [...document.querySelectorAll("button,a[href]")].filter((b) => !(b.innerText || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("aria-labelledby") && !b.querySelector("img[alt]")).map((b) => b.outerHTML.slice(0, 120)),
    text: document.body.innerText.slice(0, 1500),
  };
};
const b = await browser(); const out = [];
for (const w of WIDTHS) {
  const { ctx, page } = await newPage(b, { width: w, height: w < 500 ? 800 : 900 });
  await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
  if (role !== "anon") await login(page, role);
  for (const loc of ["fr", "de"]) for (const p of PAGES[role]) {
    const path = (loc === "de" ? "/de" : "") + (p === "/" && loc === "de" ? "" : p);
    try {
      await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(900);
      const d = await page.evaluate(collect);
      const full = w === 375 || w === 1280 || p === "/";
      if (w === 375 || w === 1280 || w === 768 || w === 1920) await page.screenshot({ path: `docs/ux-review/screenshots/${role.replace("demo.", "")}__${slug(p, loc, w)}.png`, fullPage: true });
      d.cls = await page.evaluate(() => window.__cls);
      if (w === 1280) { const ax = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); d.axe = ax.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 120)) })); }
      out.push({ role, path, p, loc, w, finalUrl: page.url().replace(BASE, ""), ...d });
      console.log(role, w, path, "->", page.url().replace(BASE, ""));
    } catch (e) { console.log("FAIL", role, w, path, e.message.slice(0, 100)); }
  }
  await ctx.close();
}
fs.writeFileSync(`docs/ux-review/data/audit-${role}${process.env.SUFFIX || ""}.json`, JSON.stringify(out));
await b.close();
