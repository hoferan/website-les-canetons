import fs from "node:fs";
const D = "docs/ux-review/data/"; let rows = [];
for (const f of fs.readdirSync(D).filter((f) => /^audit-[^-]+\.json$|^audit-demo\.[a-z]+\.json$/.test(f))) rows.push(...JSON.parse(fs.readFileSync(D + f)));
const bad = (r) => r.role !== "anon" && r.finalUrl.includes("/login");
rows = rows.filter((r) => !bad(r));
for (const f of fs.readdirSync(D).filter((f) => /-w\d+\.json$/.test(f))) rows.push(...JSON.parse(fs.readFileSync(D + f)).filter((r) => !bad(r)));
fs.writeFileSync(D + "merged.json", JSON.stringify(rows));
console.log("rows", rows.length, "bad left", rows.filter(bad).length);
const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const r1280 = rows.filter((r) => r.w === 1280);
// axe
const ax = {}; for (const r of r1280) for (const v of r.axe || []) { const k = v.id; ax[k] ??= { impact: v.impact, help: v.help, n: 0, pages: new Set(), sample: v.sample[0] }; ax[k].n += v.n; ax[k].pages.add(r.role.replace("demo.","")+":"+r.path+"/"+r.loc); }
console.log("\n== AXE"); for (const [k, v] of Object.entries(ax)) console.log(k, v.impact, v.n, v.help, "| pages", v.pages.size, [...v.pages].slice(0, 4).join(" "), "|", v.sample);
// contrast
const cf = {}; for (const r of r1280) for (const c of r.contrast) { const ratio = cr(c.fg, c.bg); const large = parseFloat(c.size) >= 24 || (parseFloat(c.size) >= 18.66 && +c.weight >= 700); const need = large ? 3 : 4.5; if (ratio < need) { const k = `${c.fg} on ${c.bg} ${c.size}/${c.weight}`; cf[k] ??= { ratio: ratio.toFixed(2), need, n: 0, ex: c.text, pg: new Set() }; cf[k].n++; cf[k].pg.add(r.p); } }
console.log("\n== CONTRAST FAILS"); for (const [k, v] of Object.entries(cf).sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(k, v.ratio, "need", v.need, "n", v.n, `"${v.ex}"`, [...v.pg].slice(0, 3).join(","));
// tokens
const tok = {}; for (const r of rows) for (const [k, m] of Object.entries(r.tok)) for (const [v, n] of Object.entries(m)) { (tok[k] ??= {})[v] = (tok[k][v] || 0) + n; }
fs.writeFileSync(D + "tokens.json", JSON.stringify(tok, null, 1));
for (const k of ["fontFamily", "fontSize", "fontWeight", "radius", "color", "background"]) console.log("\n== TOKENS", k, Object.keys(tok[k]).length, JSON.stringify(Object.entries(tok[k]).sort((a, b) => b[1] - a[1]).slice(0, 25)));
console.log("\n== shadows", JSON.stringify(Object.entries(tok.shadow || {}).sort((a, b) => b[1] - a[1]).slice(0, 8)));
console.log("\n== spacing", JSON.stringify(Object.entries(tok.spacing).sort((a, b) => b[1] - a[1]).slice(0, 30)));
// structure
console.log("\n== PAGE FLAGS (1280)");
for (const r of r1280) { const f = []; if (r.h1 !== 1) f.push("h1=" + r.h1); if (r.lang !== (r.loc === "de" ? "de-CH" : "fr-CH")) f.push("lang=" + r.lang); if (r.imgNoAlt.length) f.push("noalt" + r.imgNoAlt.length); if (r.unlabeled.length) f.push("unlabeled" + r.unlabeled.length); if (r.nameless.length) f.push("nameless" + r.nameless.length); if (r.cls > 0.05) f.push("cls=" + r.cls.toFixed(2)); if (r.finalUrl !== (r.loc === "de" ? "/de" : "") + r.p && r.finalUrl !== r.path) f.push("→" + r.finalUrl); if (f.length) console.log(r.role.replace("demo.", ""), r.path, f.join(" ")); }
console.log("\n== OVERFLOW / TOUCH");
for (const w of [375, 768, 1920]) for (const r of rows.filter((r) => r.w === w && r.overflowX)) console.log("overflow", w, r.role, r.path, r.scrollW);
const sm = {}; for (const r of rows.filter((r) => r.w === 375)) for (const s of r.small) { const k = `${s.tag} ${s.w}x${s.h}`; sm[k] ??= { n: 0, ex: s.text, pg: new Set() }; sm[k].n++; sm[k].pg.add(r.p); }
console.log("small targets @375", JSON.stringify(Object.entries(sm).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([k, v]) => [k, v.n, v.ex, v.pg.size])));
const sm2 = {}; for (const r of r1280) for (const s of r.small) { const k = `${s.tag} ${s.w}x${s.h}`; sm2[k] ??= { n: 0, ex: s.text }; sm2[k].n++; }
console.log("small targets @1280", JSON.stringify(Object.entries(sm2).sort((a, b) => b[1].n - a[1].n).slice(0, 12)));
