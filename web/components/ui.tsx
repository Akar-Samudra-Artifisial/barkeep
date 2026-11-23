import Link from "next/link";
import { shortAddr, tierClass } from "@/lib/format";
import type { Tier } from "@/lib/types";

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function SkeletonRows({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="rows" aria-busy="true" aria-label={`Loading ${label}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="row" key={i}>
          <div className="skeleton sk-line" style={{ width: `${40 + ((i * 17) % 40)}%` }} />
          <div className="skeleton sk-line" style={{ width: 48, marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPanel({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <section className="panel">
      <div className="skeleton sk-line" style={{ width: 160, marginBottom: 16 }} />
      <SkeletonRows rows={rows} label={label} />
    </section>
  );
}

export function TierPill({ tier }: { tier: Tier | string }) {
  return <span className={tierClass(tier)}>{tier}</span>;
}

export function AddressLink({ address, full = false }: { address: string; full?: boolean }) {
  return (
    <Link href={`/profile/${address}`} className="mono link" title={address}>
      {full ? address : shortAddr(address)}
    </Link>
  );
}

export function FixtureBanner() {
  return (
    <div className="banner" role="note">
      <strong>Demo data — chain packages pending approval.</strong>
      <span>
        Every number on this page comes from bundled fixtures shaped like the realm&apos;s JSON. Set DATA_SOURCE=live to
        read the chain.
      </span>
    </div>
  );
}
