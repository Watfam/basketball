// Phase 14: every in-app link to a player page must point at a page that exists. Static check over the source: finds /players/... links, turns
// each ${...} into a placeholder and matches it against the routes in src/app. Also prints the journey graph (which screens link to which).
//   node training/eval/experiments/analytics-audit/link-audit.mjs
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../lib/registry.mjs";

const APP = path.join(ROOT, "src/app");
const walk = (d, acc = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, acc) : acc.push(f); } return acc; };
const routes = walk(APP).filter((f) => /\/page\.tsx$/.test(f)).map((f) => "/" + path.relative(APP, path.dirname(f)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/")).map((r) => r.replace(/\/$/, "") || "/");
const routeRe = routes.map((r) => ({ r, re: new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$") }));
const files = [...walk(path.join(ROOT, "src/components")), ...walk(APP)].filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !/\/lab\/p1\d-/.test(f));
const LINK = /[`"'](\/(?:players|teams|coach|login|auth)(?:\/[A-Za-z0-9_\-]+|\/\$\{[^}]+\})*)(?:\?[^`"']*)?[`"']/g;
const found = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(LINK)) {
    const norm = m[1].replace(/\$\{[^}]+\}/g, "[x]");
    const rel = path.relative(ROOT, f);
    (found.get(norm) ?? found.set(norm, new Set()).get(norm)).add(rel);
  }
}
let bad = 0;
for (const [link, from] of [...found].sort()) {
  const ok = routeRe.some(({ re }) => re.test(link.replace(/\[x\]/g, "x")) || re.test(link));
  if (!ok) { bad++; console.log("DANGLING", link, "  from", [...from].slice(0, 3).join(", ")); }
}
console.log(`${found.size} distinct player/team links checked against ${routes.length} routes: ${bad === 0 ? "none dangling" : bad + " dangling"}`);
const journey = ["/players/[x]", "/players/[x]/workouts", "/players/[x]/programs", "/players/[x]/film", "/players/[x]/sessions", "/players/[x]/shooting", "/players/[x]/shooting/[x]", "/players/[x]/progress", "/players/[x]/me"];
for (const j of journey) console.log(`  ${routes.some(({ }) => true) && routeRe.some(({ re }) => re.test(j.replace(/\[x\]/g, "x"))) ? "page exists" : "MISSING PAGE"}  ${j}  (linked from ${(found.get(j) ? [...found.get(j)].length : 0)} files)`);
process.exit(bad ? 1 : 0);
