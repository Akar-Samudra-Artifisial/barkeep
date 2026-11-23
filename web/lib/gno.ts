// Server-side reads from the Gno chain (vm/qeval, vm/qrender over ABCI
// JSON-RPC), or from bundled fixtures when DATA_SOURCE=fixture. Every
// reader returns Read<T> instead of throwing, so pages can show an honest
// error state. Fixture reads are cached for REVALIDATE_SECONDS; live reads
// are not cached.

import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { REALMS, REVALIDATE_SECONDS, dataSource, serverRpcUrl } from "./config";
import { parseLounge, parsePoll, parsePollList } from "./markdown";
import type {
  Leaderboard,
  LoungeEntry,
  Params,
  PollDetail,
  Profile,
  Read,
  ReadErrorKind,
  Source,
  SourcesPage,
} from "./types";
import leaderboardFixture from "@/fixtures/leaderboard.json";
import profilesFixture from "@/fixtures/profiles.json";
import sourcesFixture from "@/fixtures/sources.json";
import paramsFixture from "@/fixtures/params.json";
import realmsFixture from "@/fixtures/realms.json";

const ADDRESS_RE = /^g1[02-9ac-hj-np-z]{38}$/;
export function isAddress(s: string): boolean {
  return ADDRESS_RE.test(s);
}

/** decodeURIComponent that returns null instead of throwing URIError. */
export function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

class ReadError extends Error {
  constructor(public kind: ReadErrorKind, message: string) {
    super(message);
  }
}

function ok<T>(data: T): Read<T> {
  return { ok: true, data, fetchedAt: Date.now() };
}
function fail<T>(e: unknown): Read<T> {
  if (e instanceof ReadError) return { ok: false, kind: e.kind, message: e.message, fetchedAt: Date.now() };
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, kind: "network", message: msg, fetchedAt: Date.now() };
}

interface AbciResponse {
  result?: {
    response?: {
      ResponseBase?: { Error: unknown; Data: string | null; Log: string };
    };
  };
  error?: { message?: string; data?: string };
}

async function abciQuery(path: "vm/qeval" | "vm/qrender", data: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(serverRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "abci_query",
        params: { path, data: Buffer.from(data, "utf8").toString("base64") },
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new ReadError("network", `RPC unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) throw new ReadError("network", `RPC answered HTTP ${res.status}`);
  const body = (await res.json()) as AbciResponse;
  if (body.error) throw new ReadError("chain", body.error.data || body.error.message || "RPC error");
  const base = body.result?.response?.ResponseBase;
  if (!base) throw new ReadError("parse", "RPC response without ResponseBase");
  if (base.Error) {
    const log = base.Log || "";
    if (/package not found|InvalidPkgPathError|inert/i.test(log)) {
      throw new ReadError("not-deployed", "Package not found on chain. It may still be waiting for approval.");
    }
    const first = /Msg Traces:\s*\n\s*0\s+\S+ - ([^\n]+)/.exec(log)?.[1] ?? log.split("\n")[0];
    throw new ReadError("chain", first.slice(0, 240) || "Query failed");
  }
  return Buffer.from(base.Data ?? "", "base64").toString("utf8");
}

/** Decode a Go strconv.Quote string literal (without the quotes). */
function unquoteGo(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[++i];
    switch (n) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "a": out += "\x07"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "v": out += "\v"; break;
      case "x": out += String.fromCharCode(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; break;
      case "u": out += String.fromCodePoint(parseInt(s.slice(i + 1, i + 5), 16)); i += 4; break;
      case "U": out += String.fromCodePoint(parseInt(s.slice(i + 1, i + 9), 16)); i += 8; break;
      default: out += n;
    }
  }
  return out;
}

/** qeval returns "(<value> <type>)"; extract a string, int or bool. */
function parseEval(raw: string): string {
  const str = /^\("((?:[^"\\]|\\.)*)" string\)\s*$/.exec(raw.trim());
  if (str) return unquoteGo(str[1]);
  const prim = /^\((\S+) (?:int|int64|bool|uint64)\)\s*$/.exec(raw.trim());
  if (prim) return prim[1];
  throw new ReadError("parse", `Unexpected qeval output: ${raw.slice(0, 80)}`);
}

async function qeval(pkg: string, expr: string): Promise<string> {
  return parseEval(await abciQuery("vm/qeval", `${pkg}.${expr}`));
}

async function qevalJSON<T>(pkg: string, expr: string): Promise<T> {
  const s = await qeval(pkg, expr);
  try {
    return JSON.parse(s) as T;
  } catch {
    throw new ReadError("parse", `${expr} did not return JSON`);
  }
}

function qrender(pkg: string, path: string): Promise<string> {
  return abciQuery("vm/qrender", `${pkg}:${path}`);
}

function emptyProfile(address: string, now: number): Profile {
  return {
    address,
    score: 0,
    tier: "Stranger",
    total: 0,
    base: 0,
    multipliers: { identity: 1, maturity: 0.5, diversity: 1 },
    named: false,
    activeCategories: 0,
    categories: { governance: 0, contribution: 0, defi: 0, building: 0, community: 0 },
    firstSeen: 0,
    attestations: 0,
    buckets: [],
    recent: [],
    now,
  };
}

// ---------------------------------------------------------------- readers

export const MAX_PAGE_LIMIT = 50; // barkeep MaxPageLimit

/** Safe page bounds: offset ≥ 0, limit 1..50; anything else (NaN, Infinity, 1e21) falls back to the default. */
export function clampPage(offset: unknown, limit: unknown): { offset: number; limit: number } {
  const o = typeof offset === "number" ? offset : Number(offset);
  const l = typeof limit === "number" ? limit : Number(limit);
  return {
    offset: Number.isSafeInteger(o) && o > 0 ? o : 0,
    limit: Number.isSafeInteger(l) ? Math.min(MAX_PAGE_LIMIT, Math.max(1, l)) : MAX_PAGE_LIMIT,
  };
}

// Fixture reads never change, so they are cached (and prerendered). Live
// reads skip the cache and wait for a request: a "use cache" entry is served
// stale-while-revalidate, so the first load after a tx showed the old score.
const FIXTURE_LIFE = { stale: REVALIDATE_SECONDS, revalidate: REVALIDATE_SECONDS, expire: 300 };

async function live<T>(read: () => Promise<T>): Promise<T> {
  await connection();
  return read();
}

export async function getLeaderboard(offset = 0, limit = MAX_PAGE_LIMIT): Promise<Read<Leaderboard>> {
  return dataSource() === "fixture" ? cachedLeaderboard(offset, limit) : live(() => readLeaderboard(offset, limit));
}
async function cachedLeaderboard(offset: number, limit: number): Promise<Read<Leaderboard>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readLeaderboard(offset, limit);
}
async function readLeaderboard(offset: number, limit: number): Promise<Read<Leaderboard>> {
  const { offset: o, limit: l } = clampPage(offset, limit);
  if (dataSource() === "fixture") {
    const lb = leaderboardFixture as Leaderboard;
    return ok({ ...lb, offset: o, items: lb.items.slice(o, o + l) });
  }
  try {
    return ok(await qevalJSON<Leaderboard>(REALMS.barkeep, `LeaderboardJSON(${o}, ${l})`));
  } catch (e) {
    return fail(e);
  }
}

export async function getProfile(address: string): Promise<Read<Profile>> {
  return dataSource() === "fixture" ? cachedProfile(address) : live(() => readProfile(address));
}
async function cachedProfile(address: string): Promise<Read<Profile>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readProfile(address);
}
async function readProfile(address: string): Promise<Read<Profile>> {
  if (!isAddress(address)) return fail(new ReadError("parse", "Not a gno.land address"));
  if (dataSource() === "fixture") {
    const p = (profilesFixture as Record<string, Profile>)[address];
    return ok(p ?? emptyProfile(address, (leaderboardFixture as Leaderboard).now));
  }
  try {
    return ok(await qevalJSON<Profile>(REALMS.barkeep, `ProfileJSON("${address}")`));
  } catch (e) {
    return fail(e);
  }
}

export async function getSources(): Promise<Read<SourcesPage>> {
  return dataSource() === "fixture" ? cachedSources() : live(readSources);
}
async function cachedSources(): Promise<Read<SourcesPage>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readSources();
}
async function readSources(): Promise<Read<SourcesPage>> {
  if (dataSource() === "fixture") return ok(sourcesFixture as SourcesPage);
  try {
    const items: Source[] = [];
    let total = 0;
    for (let page = 0; page < 20; page++) {
      const r = await qevalJSON<SourcesPage>(REALMS.barkeep, `SourcesJSON(${page * 50}, 50)`);
      total = r.total;
      items.push(...r.items);
      if (items.length >= total || r.items.length === 0) break;
    }
    return ok({ total, offset: 0, items });
  } catch (e) {
    return fail(e);
  }
}

export async function getParams(): Promise<Read<Params>> {
  return dataSource() === "fixture" ? cachedParams() : live(readParams);
}
async function cachedParams(): Promise<Read<Params>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readParams();
}
async function readParams(): Promise<Read<Params>> {
  if (dataSource() === "fixture") return ok(paramsFixture as Params);
  try {
    return ok(await qevalJSON<Params>(REALMS.barkeep, "ParamsJSON()"));
  } catch (e) {
    return fail(e);
  }
}

export interface QuestboardState {
  completed: number;
}

export async function getQuestboard(): Promise<Read<QuestboardState>> {
  return dataSource() === "fixture" ? cachedQuestboard() : live(readQuestboard);
}
async function cachedQuestboard(): Promise<Read<QuestboardState>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readQuestboard();
}
async function readQuestboard(): Promise<Read<QuestboardState>> {
  if (dataSource() === "fixture") return ok({ completed: realmsFixture.questCompleted });
  try {
    return ok({ completed: Number(await qeval(REALMS.questboard, "Completed()")) });
  } catch (e) {
    return fail(e);
  }
}

export interface TownhallState {
  count: number;
  polls: PollDetail[];
}

export async function getTownhall(): Promise<Read<TownhallState>> {
  return dataSource() === "fixture" ? cachedTownhall() : live(readTownhall);
}
async function cachedTownhall(): Promise<Read<TownhallState>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readTownhall();
}
async function readTownhall(): Promise<Read<TownhallState>> {
  try {
    const fixture = dataSource() === "fixture";
    const pages = realmsFixture.townhall.polls as Record<string, string>;
    const list = fixture ? realmsFixture.townhall.list : await qrender(REALMS.townhall, "");
    const rows = parsePollList(list);
    const details = await Promise.all(
      rows.map(async (r) => parsePoll(fixture ? pages[String(r.id)] ?? "" : await qrender(REALMS.townhall, `poll/${r.id}`), r.id)),
    );
    const count = fixture ? realmsFixture.pollCount : Number(await qeval(REALMS.townhall, "PollCount()"));
    return ok({ count, polls: details.filter((d): d is PollDetail => d !== null) });
  } catch (e) {
    return fail(e);
  }
}

export interface LoungeState {
  signatures: number;
  entries: LoungeEntry[];
}

export async function getLounge(): Promise<Read<LoungeState>> {
  return dataSource() === "fixture" ? cachedLounge() : live(readLounge);
}
async function cachedLounge(): Promise<Read<LoungeState>> {
  "use cache";
  cacheLife(FIXTURE_LIFE);
  return readLounge();
}
async function readLounge(): Promise<Read<LoungeState>> {
  try {
    if (dataSource() === "fixture") {
      return ok({ signatures: realmsFixture.lounge.signatures, entries: parseLounge(realmsFixture.lounge.render) });
    }
    const [md, sigs] = await Promise.all([qrender(REALMS.lounge, ""), qeval(REALMS.lounge, "Signatures()")]);
    return ok({ signatures: Number(sigs), entries: parseLounge(md) });
  } catch (e) {
    return fail(e);
  }
}
