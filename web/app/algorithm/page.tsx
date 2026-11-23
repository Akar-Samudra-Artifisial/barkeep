import type { Metadata } from "next";
import { Suspense } from "react";
import { Calculator } from "@/components/calculator";
import { ReadErrorBlock } from "@/components/states";
import { SkeletonPanel } from "@/components/ui";
import { days, fmt1, fmtInt, fmtMult } from "@/lib/format";
import { getParams } from "@/lib/gno";
import { DEFAULT_PARAMS, MILLI, decay, type RenownParams } from "@/lib/renown";
import type { Params } from "@/lib/types";

export const metadata: Metadata = { title: "Algorithm" };

function toRenown(p: Params): RenownParams {
  return {
    halfLife: p.halfLifeSeconds,
    maturityPeriod: p.maturityPeriodSeconds,
    maturityStart: Math.round(p.maturityStart * 1000),
    identityBonus: Math.round(p.identityBonus * 1000),
    diversityStep: Math.round(p.diversityStep * 1000),
    diversityMax: Math.round(p.diversityMax * 1000),
    defaultWeight: Math.round(p.defaultWeight * 1000),
    maxWeight: Math.round(p.maxWeight * 1000),
    defaultCap: p.defaultCapPoints * MILLI,
    maxUnitsPerAttest: p.maxUnitsPerAttest,
  };
}

export default function AlgorithmPage() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Algorithm</h1>
          <p className="sub">
            One score per address, rebuilt from per-source buckets on every read. Nothing is stored that cannot be
            recomputed.
          </p>
        </div>
      </div>
      <div className="stack">
        <section className="panel" aria-labelledby="formula-h">
          <header>
            <h2 id="formula-h">The formula</h2>
          </header>
          <pre aria-label="Score formula">
            {`score = floor( base × maturity × diversity × identity )

base      = Σ over sources  min(decayed points, cap) × source weight
decayed   = points × 2^(−Δt / half-life)        (8-step table per half-life)
maturity  = start → 1.0, linear over the maturity period
diversity = 1 + step × (active categories − 1), at most max
identity  = bonus when the address has a registered name, else 1`}
          </pre>
          <div className="prose mt">
            <p>
              Each source realm fills one bucket per address. A bucket decays continuously, so a burst of activity fades
              and steady participation holds its value. Caps stop one realm from dominating, weights let the admin
              trust some realms more than others, and the multipliers reward accounts that are older, active in more than
              one area and named.
            </p>
          </div>
        </section>

        <Suspense fallback={<SkeletonPanel label="parameters" rows={6} />}>
          <LiveParams />
        </Suspense>
      </div>
    </>
  );
}

async function LiveParams() {
  const r = await getParams();
  if (!r.ok) {
    return (
      <>
        <ReadErrorBlock kind={r.kind} message={r.message} what="parameters" />
        <section className="panel" aria-labelledby="calc-h">
          <header>
            <h2 id="calc-h">Try it</h2>
            <span className="meta">uses the renown package defaults, not chain values</span>
          </header>
          <Calculator params={DEFAULT_PARAMS} />
        </section>
      </>
    );
  }
  const p = r.data;
  const rp = toRenown(p);
  const decayRows = [0, 7, 15, 30, 60, 90].map((d) => ({
    d,
    left: decay(100 * MILLI, d * 86400, rp.halfLife) / MILLI,
  }));

  return (
    <>
      <div className="split">
        <section className="panel flush" aria-labelledby="params-h">
          <header>
            <h2 id="params-h">Parameters on chain</h2>
            <span className="meta">{p.paused ? "registry paused" : "registry open"}</span>
          </header>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <td>Half-life</td>
                  <td className="n">{days(p.halfLifeSeconds)}</td>
                </tr>
                <tr>
                  <td>Maturity period</td>
                  <td className="n">{days(p.maturityPeriodSeconds)}</td>
                </tr>
                <tr>
                  <td>Maturity at start</td>
                  <td className="n">{fmtMult(p.maturityStart)}</td>
                </tr>
                <tr>
                  <td>Identity bonus</td>
                  <td className="n">{fmtMult(p.identityBonus)}</td>
                </tr>
                <tr>
                  <td>Diversity step, max</td>
                  <td className="n">
                    +{p.diversityStep} per category, {fmtMult(p.diversityMax)}
                  </td>
                </tr>
                <tr>
                  <td>Source weight, default and max</td>
                  <td className="n">
                    {fmtMult(p.defaultWeight)}, {fmtMult(p.maxWeight)}
                  </td>
                </tr>
                <tr>
                  <td>Default cap per source</td>
                  <td className="n">{fmtInt(p.defaultCapPoints)} pts</td>
                </tr>
                <tr>
                  <td>Units per attestation</td>
                  <td className="n">1 to {p.maxUnitsPerAttest}</td>
                </tr>
                <tr>
                  <td>Tiers</td>
                  <td className="n">
                    Regular {p.tiers.Regular}, Patron {p.tiers.Patron}, Legend {p.tiers.Legend}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel flush" aria-labelledby="decay-h">
          <header>
            <h2 id="decay-h">What 100 points are worth later</h2>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">After</th>
                  <th scope="col" className="n">
                    Points left
                  </th>
                </tr>
              </thead>
              <tbody>
                {decayRows.map((row) => (
                  <tr key={row.d}>
                    <td>{row.d === 0 ? "Same day" : `${row.d} days`}</td>
                    <td className="n">{fmt1(row.left)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby="calc-h">
        <header>
          <h2 id="calc-h">Try it</h2>
          <span className="meta">uses the parameters above</span>
        </header>
        <Calculator params={rp} />
      </section>
    </>
  );
}
