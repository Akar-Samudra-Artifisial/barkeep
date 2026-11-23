import Link from "next/link";
import { Suspense } from "react";
import { AddressLookup } from "@/components/address-lookup";
import { ReadErrorBlock } from "@/components/states";
import { AddressLink, Empty, SkeletonPanel, TierPill } from "@/components/ui";
import { fmtInt, shortPath } from "@/lib/format";
import { getLeaderboard, getSources } from "@/lib/gno";
import { TIER_MIN } from "@/lib/renown";
import { TIERS } from "@/lib/types";

export default function Home() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Leaderboard</h1>
          <p className="sub">
            Reputation earned across Gno.land realms. Points decay with a 30-day half-life, so the order reflects who is
            active now.
          </p>
        </div>
        <div className="actions">
          <Link className="btn primary" href="/play">
            Earn renown
          </Link>
        </div>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="stack">
      <div className="kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <div className="skeleton sk-line" style={{ width: 96 }} />
            <div className="skeleton" style={{ width: 64, height: 28, marginTop: 8 }} />
          </div>
        ))}
      </div>
      <div className="overview">
        <SkeletonPanel label="leaderboard" rows={8} />
        <SkeletonPanel label="tiers" rows={4} />
      </div>
    </div>
  );
}

async function Overview() {
  const [lb, src] = await Promise.all([getLeaderboard(0, 50), getSources()]);

  if (!lb.ok) {
    return (
      <div className="stack">
        <ReadErrorBlock kind={lb.kind} message={lb.message} what="leaderboard" />
        <section className="panel">
          <header>
            <h2>Look up an address</h2>
          </header>
          <AddressLookup />
        </section>
      </div>
    );
  }

  const data = lb.data;
  const tierCounts = TIERS.map((t) => ({ tier: t, count: data.items.filter((i) => i.tier === t).length }));
  const topSources = src.ok
    ? [...src.data.items].sort((a, b) => b.attestations - a.attestations).slice(0, 5)
    : [];

  return (
    <div className="stack">
      <section className="kpis" aria-label="Totals">
        <div className="kpi">
          <p className="kpi-label">Ranked patrons</p>
          <p className="kpi-value">{fmtInt(data.total)}</p>
          <p className="delta">score above zero</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Profiles</p>
          <p className="kpi-value">{fmtInt(data.profiles)}</p>
          <p className="delta">addresses ever attested</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Attestations</p>
          <p className="kpi-value">{fmtInt(data.attestations)}</p>
          <p className="delta">accepted by the registry</p>
        </div>
        <div className="kpi">
          <p className="kpi-label">Sources</p>
          <p className="kpi-value">{src.ok ? fmtInt(src.data.total) : "—"}</p>
          <p className="delta">
            {src.ok ? `${src.data.items.filter((s) => s.tier === "verified").length} verified` : "unavailable"}
          </p>
        </div>
      </section>

      <div className="overview">
        <section className="panel flush" aria-labelledby="lb-h">
          <header>
            <h2 id="lb-h">Top patrons</h2>
            <span className="meta">
              {data.items.length > 0 ? `Showing ${data.items.length} of ${fmtInt(data.total)}` : ""}
            </span>
          </header>
          {data.items.length === 0 ? (
            <div className="panel-body">
              <Empty>No address has a score yet. The first attestation from a registered source will appear here.</Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="n" scope="col">
                      Rank
                    </th>
                    <th scope="col">Address</th>
                    <th scope="col">Tier</th>
                    <th className="n" scope="col">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.address}>
                      <td className="n">{i.rank}</td>
                      <td>
                        <AddressLink address={i.address} />
                      </td>
                      <td>
                        <TierPill tier={i.tier} />
                      </td>
                      <td className="n">{fmtInt(i.score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="tiers-h">
            <header>
              <h2 id="tiers-h">Tiers on the board</h2>
              <Link className="card-link" href="/algorithm">
                How tiers work
              </Link>
            </header>
            <div className="rows">
              {tierCounts.map((t) => (
                <div className="row" key={t.tier}>
                  <TierPill tier={t.tier} />
                  <span className="grow muted small">
                    <span>{t.tier === "Stranger" ? `below ${TIER_MIN.Regular}` : `${TIER_MIN[t.tier]} and up`}</span>
                  </span>
                  <span className="num">{t.count}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="src-h">
            <header>
              <h2 id="src-h">Busiest sources</h2>
              <Link className="card-link" href="/sources">
                View all
              </Link>
            </header>
            {!src.ok ? (
              <ReadErrorBlock kind={src.kind} message={src.message} what="sources" />
            ) : topSources.length === 0 ? (
              <Empty>No realm is registered as a source yet.</Empty>
            ) : (
              <div className="rows">
                {topSources.map((s) => (
                  <div className="row" key={s.id}>
                    <span className="grow">
                      <span className="mono" title={s.path}>
                        {shortPath(s.path)}
                      </span>
                      <span className="small muted">{s.desc}</span>
                    </span>
                    <span className="num">{fmtInt(s.attestations)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel" aria-labelledby="lookup-h">
            <header>
              <h2 id="lookup-h">Look up an address</h2>
            </header>
            <AddressLookup />
          </section>
        </div>
      </div>
    </div>
  );
}
