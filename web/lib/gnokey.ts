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
    "  -gas-fee 20000ugnot -gas-wanted 20000000 \\",
    `  -broadcast -chainid ${CHAIN_ID} -remote ${PUBLIC_RPC_URL} \\`,
    `  ${key}`,
  ];
  return lines.join("\n");
}
