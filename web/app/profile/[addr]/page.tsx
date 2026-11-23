import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReadErrorBlock } from "@/components/states";
import { Empty, SkeletonPanel, TierPill } from "@/components/ui";
import { REALMS, gnowebUrl } from "@/lib/config";
import {
  CATEGORY_LABEL,
  ago,
  fmt1,
  fmtInt,
  fmtMult,
  shortAddr,
  shortPath,
  sourceTierClass,
  utcDate,
} from "@/lib/format";
import { getProfile, isAddress, safeDecode } from "@/lib/gno";
import { DEFAULT_PARAMS, TIER_MIN } from "@/lib/renown";
import { CATEGORIES, TIERS, type Profile, type Tier } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/profile/[addr]">): Promise<Metadata> {
  const { addr } = await params;
  return { title: `Profile ${shortAddr(addr)}` };
}

export default function ProfilePage({ params }: PageProps<"/profile/[addr]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      {params.then(({ addr }) => (
        <ProfileView addr={(safeDecode(addr) ?? addr).toLowerCase()} />
      ))}
    </Suspense>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Profile</h1>
          <p className="sub">Loading the latest score from the registry…</p>
        </div>
      </div>
      <div className="stack">
        <SkeletonPanel label="profile" rows={2} />
        <div className="split">
          <SkeletonPanel label="score" rows={5} />
          <SkeletonPanel label="categories" rows={5} />
        </div>
      </div>
    </>
  );
}

const TIER_FLOOR: Record<Tier, number> = { Stranger: 0, ...TIER_MIN };

function TierProgress({ p }: { p: Profile }) {
  const { score, tier } = p;
  const next = TIERS.find((t) => TIER_FLOOR[t] > score);
  const halfLifeDays = DEFAULT_PARAMS.halfLife / 86400;
  const ramping = p.firstSeen > 0 && p.multipliers.maturity < 1;
  const matureAt = p.firstSeen + DEFAULT_PARAMS.maturityPeriod;
  const maturityDays = DEFAULT_PARAMS.maturityPeriod / 86400;

  if (!next) {
    return (
      <div className="tier-progress">
        <p className="tier-progress-head">
          <strong>Top tier reached.</strong> <span className="muted">{tier} is the highest rung.</span>
        </p>
        <p className="small muted">Points halve every {halfLifeDays} days without new activity, so keep attesting to stay here.</p>
      </div>
    );
  }

  const floor = TIER_FLOOR[tier];
  const target = TIER_FLOOR[next];
  const pct = Math.min(100, Math.max(0, ((score - floor) / (target - floor)) * 100));
  return (
    <div className="tier-progress">
      <p className="tier-progress-head">
        <strong>
          {fmtInt(target - score)} {target - score === 1 ? "point" : "points"} to {next}
        </strong>{" "}
        <span className="muted">
          {fmtInt(score)} of {fmtInt(target)}
        </span>
      </p>
      <div
        className="bar-track"
        role="progressbar"
        aria-label={`Progress from ${tier} to ${next}`}
        aria-valuemin={floor}
        aria-valuemax={target}
        aria-valuenow={score}
        aria-valuetext={`${fmtInt(score)} of ${fmtInt(target)} points`}
      >
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="small muted">
        {ramping
          ? `Maturity is ${fmtMult(p.multipliers.maturity)} and ramps to ×1 by ${utcDate(matureAt)}, ${maturityDays} days after first seen. `
          : ""}
        Points halve every {halfLifeDays} days without new activity.
      </p>
    </div>
  );
}

function Ladder({ p }: { p: Profile }) {
  const { score, tier } = p;
  return (
    <section className="panel" aria-labelledby="ladder-h">
      <header>
        <h2 id="ladder-h">Tier ladder</h2>
        <span className="meta">thresholds from renown/v0</span>
      </header>
      <TierProgress p={p} />
      <ol className="ladder">
        {TIERS.map((t) => (
          <li
            key={t}
            className="rung"
            data-reached={score >= TIER_FLOOR[t] && t !== tier ? "true" : undefined}
            data-current={t === tier ? "true" : undefined}
            aria-current={t === tier ? "step" : undefined}
          >
            <strong>{t}</strong>
            <span>{t === "Stranger" ? "from 0" : `from ${TIER_FLOOR[t]}`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScoreTab({ p }: { p: Profile }) {
  return (
    <section className="panel" aria-labelledby="tab-h">
      <header>
        <h2 id="tab-h">The tab</h2>
        <Link className="card-link" href="/algorithm">
          Formula
        </Link>
      </header>
      <div className="tab">
        <div className="tab-line">
          <span className="label">Base, weighted points after decay</span>
          <span className="num">{fmt1(p.base)}</span>
        </div>
        <div className="tab-line">
          <span className="label">Maturity, age of the account</span>
          <span className="num">{fmtMult(p.multipliers.maturity)}</span>
        </div>
        <div className="tab-line">
          <span className="label">Diversity, {p.activeCategories} active categories</span>
          <span className="num">{fmtMult(p.multipliers.diversity)}</span>
        </div>
        <div className="tab-line">
          <span className="label">Identity, {p.named ? "registered name" : "no registered name"}</span>
          <span className="num">{fmtMult(p.multipliers.identity)}</span>
        </div>
        <div className="tab-line total">
          <span className="label">Score</span>
          <span className="num">{fmtInt(p.score)}</span>
        </div>
      </div>
    </section>
  );
}

function Categories({ p }: { p: Profile }) {
  const max = Math.max(100, ...CATEGORIES.map((c) => p.categories[c]));
  return (
    <section className="panel" aria-labelledby="cat-h">
      <header>
        <h2 id="cat-h">By category</h2>
        <span className="meta">weighted points</span>
      </header>
      <div className="bars">
        {CATEGORIES.map((c) => {
          const v = p.categories[c];
          return (
            <div className="bar-row" key={c}>
              <span>{CATEGORY_LABEL[c]}</span>
              <div
                className="bar-track"
                role="meter"
                aria-label={`${CATEGORY_LABEL[c]} points`}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={v}
              >
                <div className={`bar-fill c-${c}`} style={{ width: `${(v / max) * 100}%` }} />
              </div>
              <span className="num r">
                {fmt1(v)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function ProfileView({ addr }: { addr: string }) {
  if (!isAddress(addr)) {
    return (
      <>
        <div className="title-row">
          <div>
            <h1>Profile</h1>
            <p className="sub mono">{addr}</p>
          </div>
        </div>
        <div className="error-block">
          <strong>That is not a gno.land address.</strong>
          <p>An address starts with g1 and has 40 characters. Check the link or search from the leaderboard.</p>
          <Link className="btn" href="/">
            Back to the leaderboard
          </Link>
        </div>
      </>
    );
  }

  const r = await getProfile(addr);
  const title = (
    <div className="title-row">
      <div>
        <h1>Profile</h1>
        <p className="sub mono">{addr}</p>
      </div>
      <div className="actions">
        <a className="btn" href={gnowebUrl(REALMS.barkeep, `:u/${addr}`)} rel="noreferrer">
          View on gnoweb
        </a>
      </div>
    </div>
  );

  if (!r.ok) {
    return (
      <>
        {title}
        <ReadErrorBlock kind={r.kind} message={r.message} what="profile" />
      </>
    );
  }

  const p = r.data;
  const fresh = p.attestations === 0;

  return (
    <>
      {title}
      <div className="stack">
        <section className="panel" aria-label="Summary">
          <dl className="facts">
            <div>
              <dt>Score</dt>
              <dd className="kpi-value">{fmtInt(p.score)}</dd>
            </div>
            <div>
              <dt>Tier</dt>
              <dd>
                <TierPill tier={p.tier} />
              </dd>
            </div>
            <div>
              <dt>Attestations</dt>
              <dd>{fmtInt(p.attestations)}</dd>
            </div>
            <div>
              <dt>First seen</dt>
              <dd>{utcDate(p.firstSeen)}</dd>
            </div>
            <div>
              <dt>Active categories</dt>
              <dd>{p.activeCategories} of 5</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>{p.named ? "Registered name" : "Address only"}</dd>
            </div>
          </dl>
        </section>

        <Ladder p={p} />

        {fresh ? (
          <Empty>
            This address has no renown yet. Completing a quest on the Play page is the quickest first attestation.
          </Empty>
        ) : (
          <>
            <div className="split">
              <ScoreTab p={p} />
              <Categories p={p} />
            </div>

            <section className="panel flush" aria-labelledby="buckets-h">
              <header>
                <h2 id="buckets-h">Sources</h2>
                <span className="meta">{p.buckets.length} buckets</span>
              </header>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Realm</th>
                      <th scope="col" className="hide-sm">
                        Category
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col" className="n hide-sm">
                        Points
                      </th>
                      <th scope="col" className="n">
                        Weighted
                      </th>
                      <th scope="col" className="n hide-sm">
                        Last activity
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...p.buckets]
                      .sort((a, b) => b.weighted - a.weighted)
                      .map((b) => (
                        <tr key={b.source}>
                          <td>
                            <span className="mono truncate" title={b.source}>
                              {shortPath(b.source)}
                            </span>
                          </td>
                          <td className="hide-sm">
                            <span className={`swatch c-${b.category}`} aria-hidden="true" />
                            {CATEGORY_LABEL[b.category]}
                          </td>
                          <td>
                            <span className={sourceTierClass(b.tier)}>{b.tier}</span>
                          </td>
                          <td className="n hide-sm">{fmt1(b.points)}</td>
                          <td className="n">{fmt1(b.weighted)}</td>
                          <td className="n hide-sm">{ago(b.lastTs, p.now)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel flush" aria-labelledby="recent-h">
              <header>
                <h2 id="recent-h">Recent attestations</h2>
                <span className="meta">newest first, last {p.recent.length}</span>
              </header>
              {p.recent.length === 0 ? (
                <div className="panel-body">
                  <Empty>No recent attestations are kept for this address.</Empty>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Realm</th>
                        <th scope="col">Kind</th>
                        <th scope="col" className="n">
                          Units
                        </th>
                        <th scope="col" className="n">
                          When
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.recent.map((e, i) => (
                        <tr key={`${e.ts}-${e.source}-${i}`}>
                          <td>
                            <span className="mono truncate" title={e.source}>
                              {shortPath(e.source)}
                            </span>
                          </td>
                          <td>{e.kind}</td>
                          <td className="n">{e.units}</td>
                          <td className="n">{ago(e.ts, p.now)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
