// Lets the app's real database code (supabase-js's PostgREST client, unchanged) run against the local Postgres: the client builds its normal HTTP
// requests, this answers them by running the equivalent SQL as the signed-in user with Row Level Security in force, one transaction per request,
// the way PostgREST does. It supports only the request shapes the drill code uses and throws on anything else, so a new query shape cannot slip through unchecked.
// What it cannot show: PostgREST's own parsing. That is checked separately against the real project, read only (see probe-live.mjs).
import { asUser } from "./db.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT } from "../../../lib/registry.mjs";

const rootReq = createRequire(path.join(ROOT, "node_modules") + "/");
const { PostgrestClient } = rootReq("@supabase/postgrest-js");

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
const splitTop = (s) => { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch; } if (cur) out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };

async function fkTo(c, table, rel) {
  const r = await c.query(`select a.attname as col, ra.attname as refcol from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1] join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1] where k.contype = 'f' and k.conrelid = $1::regclass and k.confrelid = $2::regclass`, [`hoops.${table}`, `hoops.${rel}`]);
  if (r.rows.length !== 1) throw new Error(`shim: expected exactly one foreign key ${table} -> ${rel}, found ${r.rows.length}`);
  return r.rows[0];
}

async function selectList(c, table, select, alias = "t") {
  const parts = [];
  for (const item of splitTop(select ?? "*")) {
    const m = item.match(/^(\w+)\((.*)\)$/);
    if (m) {
      const fk = await fkTo(c, table, m[1]);
      const inner = (await selectList(c, m[1], m[2], "r"));
      parts.push(`(select to_jsonb(x) from (select ${inner} from hoops.${q(m[1])} r where r.${q(fk.refcol)} = ${alias}.${q(fk.col)}) x) as ${q(m[1])}`);
    } else if (item === "*") parts.push(`${alias}.*`);
    else parts.push(`${alias}.${q(item)}`);
  }
  return parts.join(", ");
}

function whereOf(params, vals, alias = "t") {
  const pre = alias ? `${alias}.` : "";
  const conds = [];
  for (const [key, raw] of params) {
    if (["select", "limit", "order", "columns", "offset"].includes(key)) continue;
    const dot = raw.indexOf("."), op = raw.slice(0, dot), val = raw.slice(dot + 1);
    const lhs = key.includes("->>") ? `${pre}${q(key.split("->>")[0])}->>'${key.split("->>")[1].replace(/'/g, "")}'` : `${pre}${q(key)}`;
    if (op === "eq") { vals.push(val); conds.push(`${lhs}::text = $${vals.length}`); }
    else if (op === "in") { const list = splitTop(val.replace(/^\(|\)$/g, "")).map((x) => x.replace(/^"|"$/g, "")); vals.push(list); conds.push(`${lhs}::text = any($${vals.length}::text[])`); }
    else if (op === "is" && val === "null") conds.push(`${lhs} is null`);
    else throw new Error(`shim: unsupported filter ${key}=${raw}`);
  }
  return conds.length ? " where " + conds.join(" and ") : "";
}

const json = (status, body, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export function makeFetch({ connect, userId, log }) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const h = Object.fromEntries(Object.entries(init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const schema = h["accept-profile"] ?? h["content-profile"];
    if (schema !== "hoops") return json(406, { code: "PGRST106", message: `The schema must be one of the following: hoops` });
    const table = decodeURIComponent(url.pathname.split("/").pop());
    const params = [...url.searchParams.entries()];
    const select = url.searchParams.get("select");
    const single = /vnd\.pgrst\.object\+json/.test(h.accept ?? "");
    const wantRows = method === "GET" || /return=representation/.test(h.prefer ?? "");
    log?.(`${method} ${table}`);
    try {
      const rows = await asUser(connect, userId, async (c) => {
        const vals = [];
        let sql;
        if (method === "GET") {
          sql = `select to_jsonb(q) as j from (select ${await selectList(c, table, select)} from hoops.${q(table)} t${whereOf(params, vals)}${url.searchParams.get("limit") ? ` limit ${Number(url.searchParams.get("limit"))}` : ""}) q`;
        } else if (method === "POST") {
          const body = JSON.parse(init.body); const list = Array.isArray(body) ? body : [body];
          const cols = [...new Set(list.flatMap(Object.keys))];
          const tuples = list.map((r) => `(${cols.map((k) => { vals.push(r[k] !== null && typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k] ?? null); return `$${vals.length}`; }).join(",")})`).join(",");
          sql = `with t as (insert into hoops.${q(table)} (${cols.map(q).join(",")}) values ${tuples} returning *) select to_jsonb(q) as j from (select ${await selectList(c, table, select)} from t) q`;
        } else if (method === "PATCH") {
          const body = JSON.parse(init.body); const keys = Object.keys(body);
          const set = keys.map((k) => { vals.push(body[k] !== null && typeof body[k] === "object" ? JSON.stringify(body[k]) : body[k]); return `${q(k)} = $${vals.length}`; }).join(", ");
          const w = whereOf(params, vals, "");
          sql = `with t as (update hoops.${q(table)} set ${set}${w} returning *) select to_jsonb(q) as j from (select ${await selectList(c, table, select)} from t) q`;
        } else if (method === "DELETE") {
          const w = whereOf(params, vals, "");
          sql = `with t as (delete from hoops.${q(table)}${w} returning *) select to_jsonb(q) as j from (select ${await selectList(c, table, select)} from t) q`;
        } else throw new Error(`shim: unsupported method ${method}`);
        return (await c.query(sql, vals)).rows.map((r) => r.j);
      });
      if (method === "POST" && !wantRows) return new Response(null, { status: 201 });
      if (!wantRows && method !== "GET") return new Response(null, { status: 204 });
      if (single) {
        if (rows.length !== 1) return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` });
        return json(method === "POST" ? 201 : 200, rows[0]);
      }
      return json(method === "POST" ? 201 : 200, rows);
    } catch (e) {
      if (/^shim:/.test(e.message)) throw e;
      const status = e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400;
      return json(status, { code: e.code ?? "XX000", message: e.message, details: e.detail ?? null, hint: null });
    }
  };
}

/** A client for one signed-in user (or anonymous when userId is null): the same object shape the app's server code receives. */
export function clientFor(db, userId, log) {
  return new PostgrestClient("http://shim.local/rest/v1", { fetch: makeFetch({ connect: db.connect, userId, log }), schema: "hoops" });
}
