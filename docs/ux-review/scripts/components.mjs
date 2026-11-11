import fs from "node:fs";
import { browser, newPage, login, BASE } from "./lib.mjs";
const PAGES = { anon: ["/", "/agenda", "/band", "/committee", "/history", "/join", "/contact", "/events/7/book", "/login", "/no-such-page"],
  "demo.player": ["/events", "/account", "/account/password"], "demo.direction": ["/events", "/events/new", "/events/new/series", "/events/7/book/edit", "/event-tags", "/events/1/attendance", "/members", "/registers", "/roles", "/history/new", "/media", "/media/1", "/website"], "demo.committee": ["/events/7/registrations", "/inbox", "/contact-messages"] };
const classify = `(() => {
  const out = [];
  const sig = (e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return [Math.round(r.height), s.paddingTop + "/" + s.paddingLeft, s.borderRadius, s.backgroundColor, s.color, s.borderTopWidth + " " + s.borderTopColor, (s.boxShadow.match(/rgb[^)]*\\) \\d+px \\d+px/g) || [""]).pop(), s.fontSize + "/" + s.fontWeight + "/" + s.fontFamily.split(",")[0], s.textTransform].join(" ; "); };
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none"; };
  document.querySelectorAll("button,a[href],input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea,[role=switch],input[type=checkbox],input[type=radio]").forEach((e) => { if (!vis(e) || e.closest(".sr-only")) return;
    let kind;
    const slot = e.dataset.slot;
    if (e.matches("input[type=checkbox]")) kind = "checkbox"; else if (e.matches("input[type=radio]")) kind = "radio"; else if (e.matches("[role=switch]")) kind = "switch";
    else if (e.matches("input,select,textarea")) kind = e.tagName.toLowerCase() === "input" ? "input:" + e.type : e.tagName.toLowerCase();
    else if (slot === "button" || /border-2|shadow-hard|btn/.test(e.className)) kind = "button:" + (e.dataset.variant || "?") + ":" + (e.dataset.size || "?");
    else if (e.closest("nav,header")) kind = "navlink"; else if (e.closest("footer")) kind = "footerlink"; else kind = "textlink";
    out.push({ kind, sig: sig(e), text: (e.innerText || e.getAttribute("aria-label") || e.name || "").trim().slice(0, 24), idx: out.length }); e.setAttribute("data-cmp", out.length - 1); });
  // surfaces: cards / badges
  document.querySelectorAll("main *, footer *").forEach((e) => { if (!vis(e)) return; const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    const bordered = s.borderTopWidth !== "0px" && s.borderTopStyle !== "none"; const sh = s.boxShadow !== "none";
    if (e.tagName.match(/^(DIV|ARTICLE|LI|SECTION|FORM)$/) && r.width > 200 && r.height > 60 && (bordered || sh) && parseFloat(s.borderRadius) >= 8) { out.push({ kind: "surface", sig: sig(e) + " ; w" + (r.width > 600 ? "wide" : "card"), text: e.tagName + " " + (e.querySelector("h1,h2,h3,legend")?.innerText || "").slice(0, 20), idx: out.length }); e.setAttribute("data-cmp", out.length - 1); }
    if (e.tagName === "SPAN" && !e.children.length && e.innerText.trim() && parseFloat(s.borderRadius) > 8 && r.height < 34 && r.width < 200 && s.backgroundColor !== "rgba(0, 0, 0, 0)" && !e.closest("button,a")) { out.push({ kind: "badge", sig: sig(e), text: e.innerText.slice(0, 20), idx: out.length }); e.setAttribute("data-cmp", out.length - 1); } });
  return out; })()`;
const b = await browser(); const all = [];
for (const role of Object.keys(PAGES)) { const { page } = await newPage(b, { width: 1280, height: 900 }); if (role !== "anon") await login(page, role);
  for (const p of PAGES[role]) { await page.goto(BASE + p); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
    const items = await page.evaluate(classify);
    // keep first instance per kind+sig on this page for cropping later
    const seen = new Set();
    for (const it of items) { const k = it.kind + "|" + it.sig; const first = !seen.has(k); seen.add(k); all.push({ role, path: p, ...it, first }); if (first) { all[all.length - 1].crop = null; } }
    globalThis.__pg = page; }
  await page.context().close(); }
fs.writeFileSync("docs/ux-review/data/components.json", JSON.stringify(all)); console.log(all.length);
await b.close();
