import fs from "node:fs";
import { execFileSync } from "node:child_process";
const R = "repos/hoferan/website-les-canetons";
const gh = (method, path, body) => JSON.parse(execFileSync("gh", ["api", "-X", method, `${R}/${path}`, "--input", "-"], { input: JSON.stringify(body), maxBuffer: 1 << 26 }).toString());
const ASSET = "https://github.com/hoferan/website-les-canetons/blob/ux-review/assets/";
const DOCS = "https://github.com/hoferan/website-les-canetons/blob/ccr-dfefd042-fhzue7/";
const dir = "docs/ux-review/issues/";
const files = fs.readdirSync(dir).filter((f) => /^\d{3}-/.test(f)).sort();
const parse = (f) => { const t = fs.readFileSync(dir + f, "utf8"); const title = t.match(/^# (.*)$/m)[1]; const labels = t.match(/^\*\*Labels:\*\* (.*)$/m)[1].split(", "); const body = t.replace(/^# .*\n+/, "").replace(/^\*\*Labels:\*\* .*\n+/m, ""); return { n: f.slice(0, 3), f, title, labels, body }; };
const items = files.map(parse);
// milestone
const summary = fs.readFileSync("docs/ux-review/REPORT.md", "utf8").split("## 1. Executive summary")[1].split("## 2.")[0].trim();
const desc = `Black-box UI/UX review of main at a869179 (mocked backend, 6 roles, FR and DE, 375-1920 px).\n\n${summary}\n\nFull report: ${DOCS}docs/ux-review/REPORT.md`.slice(0, 4900);
const ms = gh("POST", "milestones", { title: "UI/UX Improvements", description: desc, state: "open" });
console.log("milestone", ms.number, ms.html_url);
const link = (b) => b.replace(/docs\/ux-review\/screenshots\/([^\s,;)]+\.png)/g, (m, p) => `[${p.split("/").pop()}](${ASSET}${m})`).replace(/(docs\/ux-review\/(?:data|REPORT)[^\s,;)]*)/g, (m) => (m.includes("](") ? m : `[${m}](${DOCS}${m})`)).replace(/\[\[/g, "[");
const num = {}; const order = items.filter((i) => i.n !== "000"); // components 001-003 first as drafted
for (const it of order) {
  const created = gh("POST", "issues", { title: it.title, body: link(it.body) + "\n(Draft cross-references are resolved below once all issues exist.)", labels: it.labels, milestone: ms.number });
  num[it.n] = created.number; it._number = created.number; console.log(it.n, "->", created.number, it.title);
}
const fix = (b) => b.replace(/#?\b0(0[1-9]|1[0-6])\b/g, (m, d) => (num["0" + d] ? `#${num["0" + d]}` : m));
for (const it of order) gh("PATCH", `issues/${it._number}`, { body: fix(link(it.body)) });
const trk = items.find((i) => i.n === "000");
const body = fix(link(trk.body)).replace(/\n\(Draft numbers are placeholders[^\n]*\n/, "\n");
const t = gh("POST", "issues", { title: trk.title, body, labels: trk.labels, milestone: ms.number });
console.log("tracking ->", t.number, t.html_url);
fs.writeFileSync("docs/ux-review/data/github-created.json", JSON.stringify({ milestone: ms.html_url, issues: num, tracking: t.number }, null, 1));
