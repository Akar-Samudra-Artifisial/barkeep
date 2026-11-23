import { CHAIN_ID, PUBLIC_RPC_URL } from "./config";

function shq(s: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** A copy-ready gnokey command for one realm call (worst-case gas covered). */
export function gnokeyCall(pkgPath: string, func: string, args: string[], key = "mykey"): string {
  const lines = [
    "gnokey maketx call \\",
    `  -pkgpath ${shq(pkgPath)} \\`,
    `  -func ${shq(func)} \\`,
    ...args.map((a) => `  -args ${shq(a)} \\`),
    // Measured on a local gnodev chain: 15-30M gas per Barkeep-touching call
    // (loading r/sys/users alone is ~7M). 50M at 1 ugnot per 1,000 gas.
    "  -gas-fee 50000ugnot -gas-wanted 50000000 \\",
    `  -broadcast -chainid ${CHAIN_ID} -remote ${PUBLIC_RPC_URL} \\`,
    `  ${key}`,
  ];
  return lines.join("\n");
}
