// Single place for chain, realm paths and data source. The default targets
// the final /v0 realms (deployments/onyx-v0.md), e.g. gno.land/r/<ns>/barkeep/v0.
// Another layout is one env change; "{name}" is replaced by the realm name:
//   NEXT_PUBLIC_REALM_BASE=gno.land/r/<ns>/{name}/v0   (default)
// A base without "{name}" gets "/{name}" appended.

export const NAMESPACE = "g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p";

const DEFAULT_REALM_BASE = `gno.land/r/${NAMESPACE}/{name}/v0`;

export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "onyx-1";
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || "Gno.land Onyx testnet";
/** Public RPC, shown in gnokey commands and passed to Adena's AddNetwork. */
export const PUBLIC_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.onyx.testnets.gno.land:443";
export const GNOWEB_URL = (process.env.NEXT_PUBLIC_GNOWEB_URL || "https://onyx.testnets.gno.land").replace(/\/$/, "");

export type RealmName = "barkeep" | "questboard" | "townhall" | "lounge";

export const REALM_BASE = process.env.NEXT_PUBLIC_REALM_BASE || DEFAULT_REALM_BASE;

export function realmPath(name: RealmName): string {
  const base = REALM_BASE.replace(/\/$/, "");
  return base.includes("{name}") ? base.replace("{name}", name) : `${base}/${name}`;
}

export const REALMS: Record<RealmName, string> = {
  barkeep: realmPath("barkeep"),
  questboard: realmPath("questboard"),
  townhall: realmPath("townhall"),
  lounge: realmPath("lounge"),
};

/** gnoweb URL of a realm, optionally with a render path or `$help`. */
export function gnowebUrl(pkgPath: string, suffix = ""): string {
  return `${GNOWEB_URL}${pkgPath.replace(/^gno\.land/, "")}${suffix}`;
}

export function helpUrl(pkgPath: string, func: string): string {
  return gnowebUrl(pkgPath, `$help&func=${encodeURIComponent(func)}`);
}

export type DataSource = "live" | "fixture";

/** Server-only: "fixture" serves bundled demo JSON, anything else reads the chain. */
export function dataSource(): DataSource {
  return process.env.DATA_SOURCE === "fixture" ? "fixture" : "live";
}

/** Server-only RPC used by the route handlers and server components. */
export function serverRpcUrl(): string {
  return (process.env.RPC_URL || PUBLIC_RPC_URL).replace(/\/$/, "");
}

/**
 * Score gates enforced on chain (whole points). Keep in sync with:
 *   townhall/v0/townhall.gno:19  MinScoreToCreatePoll int64 = 20
 *   lounge/v0/lounge.gno:16      MinScore = renown.RegularMin (renown/v0/score.gno:135 = 10)
 */
export const GATES = { createPoll: 20, lounge: 10 } as const;

/** Seconds a chain read stays fresh before the next request refreshes it. */
export const REVALIDATE_SECONDS = 12;
