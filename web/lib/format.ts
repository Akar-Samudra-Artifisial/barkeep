import type { Category, SourceTier, Tier } from "./types";

export function shortAddr(addr: string, head = 8, tail = 6): string {
  return addr.length > head + tail + 1 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

/** gno.land/r/<ns>/questboard/v0 → r/…/questboard/v0, keeping the readable tail. */
export function shortPath(path: string): string {
  const p = path.replace(/^gno\.land\//, "");
  const parts = p.split("/");
  if (parts.length > 2 && /^g1[0-9a-z]{38}$/.test(parts[1])) {
    return `${parts[0]}/${shortAddr(parts[1], 5, 4)}/${parts.slice(2).join("/")}`;
  }
  return p;
}

const nf = new Intl.NumberFormat("en-US");
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function fmtInt(n: number): string {
  return nf.format(Math.trunc(n));
}
export function fmt1(n: number): string {
  return nf1.format(n);
}
export function fmtMult(n: number): string {
  return `×${nf2.format(n)}`;
}

/** Relative time against the chain's own clock (the payload's `now`). */
export function ago(ts: number, now: number): string {
  if (!ts) return "never";
  const s = Math.max(0, now - ts);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export function utcDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function tierClass(t: Tier | string): string {
  switch (t) {
    case "Legend":
      return "pill accent";
    case "Patron":
      return "pill pos";
    case "Regular":
      return "pill";
    default:
      return "pill";
  }
}

export function sourceTierClass(t: SourceTier): string {
  return t === "verified" ? "pill pos" : t === "revoked" ? "pill neg" : "pill warn";
}

export const CATEGORY_LABEL: Record<Category, string> = {
  governance: "Governance",
  contribution: "Contribution",
  defi: "DeFi",
  building: "Building",
  community: "Community",
};

export function days(seconds: number): string {
  const d = seconds / 86400;
  return `${nf1.format(d)} ${d === 1 ? "day" : "days"}`;
}
