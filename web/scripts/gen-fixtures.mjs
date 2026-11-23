// Generates fixtures/*.json for DATA_SOURCE=fixture. Every figure is computed
// with the TypeScript port of renown/v0 (lib/renown.ts) from a list of sample
// attestations, so leaderboard, profiles and sources agree with each other.
// JSON shapes follow barkeep/v0 json.gno; Render markdown follows
// townhall.gno and lounge.gno.
//
//   node scripts/gen-fixtures.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../lib/renown.ts";

const NS = "g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p";
const DEV = `gno.land/r/${NS}/dev1`;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(out, { recursive: true });

// ---------- deterministic randomness and bech32 addresses ----------
let seed = 20261123;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
}
function bech32(hrp, bytes) {
  const data = [];
  let acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) { bits -= 5; data.push((acc >> bits) & 31); }
  }
  if (bits > 0) data.push((acc << (5 - bits)) & 31);
  const hrpx = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const mod = polymod(hrpx.concat(data, [0, 0, 0, 0, 0, 0])) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + data.concat(chk).map((d) => CHARSET[d]).join("");
}
const addr = () => bech32("g", Array.from({ length: 20 }, () => Math.floor(rand() * 256)));

// ---------- clock ----------
const NOW = Date.UTC(2026, 10, 23, 18, 0, 0) / 1000;
const DAY = 86400;
const P = R.DEFAULT_PARAMS;

// ---------- sources ----------
const SAMPLE_NS = addr(); // a second sample namespace for third-party sources
const sources = [
  { path: `${DEV}/questboard`, category: "contribution", desc: "Quests for adventurers", tier: "verified", weight: 1000, cap: 100, paused: false, registeredAt: NOW - 34 * DAY },
  { path: `${DEV}/townhall`, category: "governance", desc: "Town hall polls: one attestation per vote", tier: "verified", weight: 1000, cap: 100, paused: false, registeredAt: NOW - 33 * DAY },
  { path: `gno.land/r/${SAMPLE_NS}/workshop`, category: "building", desc: "Merged pull requests in the tavern workshop", tier: "verified", weight: 1500, cap: 150, paused: false, registeredAt: NOW - 29 * DAY },
  { path: `gno.land/r/${SAMPLE_NS}/hearth`, category: "community", desc: "Hosts and helpers of tavern meetups", tier: "verified", weight: 800, cap: 100, paused: false, registeredAt: NOW - 25 * DAY },
  { path: `gno.land/r/${SAMPLE_NS}/ledgerswap`, category: "defi", desc: "Swaps settled on the tavern exchange, one per day", tier: "verified", weight: 500, cap: 50, paused: true, registeredAt: NOW - 21 * DAY },
  { path: `gno.land/r/${SAMPLE_NS}/dicegame`, category: "community", desc: "Rounds of dice at the corner table", tier: "unverified", weight: 0, cap: 100, paused: false, registeredAt: NOW - 6 * DAY },
  { path: `gno.land/r/${SAMPLE_NS}/faucetfarm`, category: "defi", desc: "Points for every faucet claim", tier: "revoked", weight: 1000, cap: 100, paused: false, registeredAt: NOW - 18 * DAY },
].map((s, i) => ({ ...s, id: i + 1, attestations: 0 }));
const src = Object.fromEntries(sources.map((s) => [s.path.split("/").pop(), s]));
const eff = (s) => (s.tier === "verified" ? s.weight : 0);

// ---------- patrons and their attestations ----------
const KIND = { questboard: "quest.completed", townhall: "vote.cast", workshop: "pr.merged", hearth: "meetup.hosted", ledgerswap: "swap.settled", dicegame: "round.played", faucetfarm: "faucet.claim" };
const UNITS = { questboard: 10, townhall: 1, workshop: 8, hearth: 5, ledgerswap: 2, dicegame: 1, faucetfarm: 20 };
// [address, named, activity: { source: count }, active days ago range]
const plan = [
  [NS, true, { questboard: 14, townhall: 9, workshop: 12, hearth: 6 }, [33, 0]],
  [addr(), true, { questboard: 9, townhall: 12, workshop: 7, ledgerswap: 10 }, [30, 1]],
  [addr(), false, { workshop: 16, questboard: 6, hearth: 3 }, [28, 2]],
  [addr(), true, { townhall: 14, hearth: 9, questboard: 4 }, [26, 0]],
  [addr(), false, { questboard: 8, ledgerswap: 12 }, [24, 3]],
  [addr(), false, { questboard: 7, townhall: 5 }, [20, 1]],
  [addr(), true, { hearth: 8, townhall: 4 }, [18, 4]],
  [addr(), false, { questboard: 5, faucetfarm: 9 }, [17, 5]],
  [addr(), false, { workshop: 4, townhall: 3 }, [12, 2]],
  [addr(), false, { questboard: 3, dicegame: 6 }, [9, 1]],
  [addr(), false, { townhall: 6 }, [6, 0]],
  [addr(), false, { questboard: 1, townhall: 2 }, [3, 0]],
  [addr(), false, { questboard: 1 }, [1, 0]],
  [addr(), false, { faucetfarm: 3 }, [16, 15]],
];

const profiles = new Map();
const events = [];
for (const [a, named, activity, [from, to]] of plan) {
  for (const [name, count] of Object.entries(activity)) {
    for (let i = 0; i < count; i++) {
      const t = Math.round(NOW - (from - (from - to) * (i / Math.max(1, count - 1))) * DAY - rand() * 3600 * 6);
      events.push({ a, named, s: src[name], ts: Math.min(t, NOW - 60), kind: KIND[name], units: UNITS[name] });
    }
  }
}
events.sort((x, y) => x.ts - y.ts);

let totalAttest = 0;
const top = new Set();
for (const e of events) {
  // revoked sources were verified while they attested; their tier changed later
  const wasCounting = e.s.tier !== "unverified";
  let p = profiles.get(e.a);
  if (!p) {
    if (!wasCounting) continue; // weightless sources cannot create a profile
    p = { named: e.named, buckets: new Map(), recent: [], firstSeen: 0, attestations: 0 };
    profiles.set(e.a, p);
  }
  const b = p.buckets.get(e.s.id) ?? { points: 0, lastTs: e.ts };
  p.buckets.set(e.s.id, R.accrue(b, e.units * R.MILLI, e.ts, P.halfLife, e.s.cap * R.MILLI));
  if (p.firstSeen === 0 && wasCounting) p.firstSeen = e.ts;
  p.recent.push({ src: e.s.id, kind: e.kind, units: e.units, ts: e.ts });
  if (p.recent.length > 10) p.recent.shift();
  p.attestations++;
  e.s.attestations++;
  totalAttest++;
  top.add(e.a);
}

const CATS = ["governance", "contribution", "defi", "building", "community"];
const m = (v) => R.milliToNumber(v);
function computeProfile(a, p) {
  const cats = [0, 0, 0, 0, 0];
  let base = 0;
  const buckets = [];
  for (const [id, b] of p.buckets) {
    const s = sources[id - 1];
    const v = Math.min(R.decay(b.points, NOW - b.lastTs, P.halfLife), s.cap * R.MILLI);
    const w = R.weighted(v, eff(s));
    buckets.push({ source: s.path, category: s.category, tier: s.tier, points: m(v), weighted: m(w), lastTs: b.lastTs });
    if (eff(s) === 0) continue;
    cats[CATS.indexOf(s.category)] += w;
    base += w;
  }
  const active = cats.filter((c) => c >= R.MILLI).length;
  const identity = R.identity(p.named, P);
  const maturity = R.maturity(p.firstSeen, NOW, P);
  const diversity = R.diversity(active, P);
  const total = R.composite(base, identity, maturity, diversity);
  const score = R.toPoints(total);
  return {
    address: a,
    score,
    tier: R.tierOf(score),
    total: m(total),
    base: m(base),
    multipliers: { identity: m(identity), maturity: m(maturity), diversity: m(diversity) },
    named: identity > R.PERMILLE,
    activeCategories: active,
    categories: Object.fromEntries(CATS.map((c, i) => [c, m(cats[i])])),
    firstSeen: p.firstSeen,
    attestations: p.attestations,
    buckets,
    recent: [...p.recent].reverse().map((e) => ({ source: sources[e.src - 1].path, kind: e.kind, units: e.units, ts: e.ts })),
    now: NOW,
  };
}

const profileJson = {};
for (const [a, p] of profiles) profileJson[a] = computeProfile(a, p);

const ranked = [...top]
  .map((a) => profileJson[a])
  .filter((p) => p && p.total >= 1)
  .sort((x, y) => y.total - x.total || (x.address < y.address ? -1 : 1));
const leaderboard = {
  total: ranked.length,
  offset: 0,
  profiles: profiles.size,
  attestations: totalAttest,
  items: ranked.map((p, i) => ({ rank: i + 1, address: p.address, score: p.score, tier: p.tier })),
  now: NOW,
};

const sourcesJson = {
  total: sources.length,
  offset: 0,
  items: sources.map((s) => ({
    id: s.id, path: s.path, category: s.category, desc: s.desc, tier: s.tier,
    weight: s.weight, effectiveWeight: eff(s), capPoints: s.cap, paused: s.paused,
    registeredAt: s.registeredAt, attestations: s.attestations,
  })),
};

const params = {
  halfLifeSeconds: P.halfLife, maturityPeriodSeconds: P.maturityPeriod,
  maturityStart: m(P.maturityStart), identityBonus: m(P.identityBonus),
  diversityStep: m(P.diversityStep), diversityMax: m(P.diversityMax),
  defaultWeight: m(P.defaultWeight), maxWeight: m(P.maxWeight),
  defaultCapPoints: R.toPoints(P.defaultCap), maxUnitsPerAttest: P.maxUnitsPerAttest,
  maxBuckets: 32, maxRecent: 10, maxTop: 50,
  tiers: { Regular: 10, Patron: 100, Legend: 500 },
  paused: false, admin: NS,
};

// ---------- townhall and lounge Render() output ----------
const voters = ranked.map((p) => p.address);
const polls = [
  { author: ranked[0].address, question: "Should the cellar open on Sundays?", options: ["Yes", "No", "Only after noon"], height: 1356120 },
  { author: ranked[1].address, question: "Next quest board theme", options: ["Lost tankards", "Rat king", "Bard contest"], height: 1361844 },
  { author: ranked[3].address, question: "Raise the workshop cap to 200 points?", options: ["Raise it", "Keep 150"], height: 1366002 },
];
const tallies = polls.map((p, i) => {
  const t = p.options.map(() => 0);
  voters.slice(0, 9 - i * 2).forEach((_, j) => { t[(j * 7 + i) % p.options.length]++; });
  return t;
});
const cell = (s) => s.replace(/\|/g, "\\|");
const BK = `/r/${NS}/barkeep/v0`;
let list = `# Town Hall\n\nPolls by patrons of the tavern. Opening a poll needs a [Barkeep](${BK}) score of 20; every vote earns governance renown.\n\n| # | Question | Votes |\n|---|---|---|\n`;
for (let i = polls.length - 1; i >= 0; i--) {
  const id = i + 1;
  list += `| [${id}](:poll/${id}) | ${cell(polls[i].question)} | ${tallies[i].reduce((a, b) => a + b, 0)} |\n`;
}
const pollPages = {};
polls.forEach((p, i) => {
  const id = i + 1;
  let md = `# Poll ${id}\n\n**${p.question}**\n\nOpened by [${p.author}](${BK}:u/${p.author}) at block ${p.height}\n\n| # | Option | Votes |\n|---|---|---|\n`;
  p.options.forEach((o, j) => { md += `| ${j} | ${cell(o)} | ${tallies[i][j]} |\n`; });
  pollPages[id] = md + "\n[All polls](:)\n";
});

const loungeEntries = [
  { who: ranked[0].address, msg: "First round is on me tonight.", height: 1366950 },
  { who: ranked[2].address, msg: "Workshop is open, bring your own hammer.", height: 1365410 },
  { who: ranked[3].address, msg: "Vote on the cellar hours before Friday.", height: 1362288 },
  { who: ranked[5].address, msg: "Made Regular. The stout is worth it.", height: 1359001 },
];
let lounge = `# The Lounge\n\nVIP guestbook for Regulars and above, gated by [Barkeep](${BK}).\n\n| Block | Patron | Tier | Message |\n|---|---|---|---|\n`;
for (const e of loungeEntries) lounge += `| ${e.height} | ${e.who} | ${profileJson[e.who].tier} | ${cell(e.msg)} |\n`;

const questCount = sources[0].attestations;

writeFileSync(join(out, "leaderboard.json"), JSON.stringify(leaderboard, null, 2) + "\n");
writeFileSync(join(out, "profiles.json"), JSON.stringify(profileJson, null, 2) + "\n");
writeFileSync(join(out, "sources.json"), JSON.stringify(sourcesJson, null, 2) + "\n");
writeFileSync(join(out, "params.json"), JSON.stringify(params, null, 2) + "\n");
writeFileSync(join(out, "realms.json"), JSON.stringify({ questCompleted: questCount, pollCount: polls.length, townhall: { list, polls: pollPages }, lounge: { render: lounge, signatures: loungeEntries.length } }, null, 2) + "\n");

// consistency checks: the numbers on screen must close
console.assert(leaderboard.items.every((it) => profileJson[it.address].score === it.score), "leaderboard scores match profiles");
console.assert(sourcesJson.items.reduce((a, s) => a + s.attestations, 0) === totalAttest, "source attestations sum to total");
console.assert([...profiles.values()].reduce((a, p) => a + p.attestations, 0) === totalAttest, "profile attestations sum to total");
console.log(`fixtures: ${leaderboard.total} ranked, ${profiles.size} profiles, ${totalAttest} attestations, ${sources.length} sources`);
