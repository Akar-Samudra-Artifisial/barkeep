"use client";

import { useId, useState } from "react";
import { CATEGORY_LABEL, fmt1, fmtInt, fmtMult } from "@/lib/format";
import { calculate, type RenownParams } from "@/lib/renown";
import { CATEGORIES } from "@/lib/types";
import { TierPill } from "./ui";

const START = [20, 40, 0, 0, 10];

export function Calculator({ params }: { params: RenownParams }) {
  const id = useId();
  const [cats, setCats] = useState<number[]>(START);
  const [days, setDays] = useState(3);
  const [named, setNamed] = useState(false);
  const r = calculate({ categories: cats, daysSinceFirstSeen: days, named }, params);
  const maturityDays = params.maturityPeriod / 86400;

  return (
    <div className="split">
      <form className="form" onSubmit={(e) => e.preventDefault()} aria-label="Calculator inputs">
        {CATEGORIES.map((c, i) => (
          <div className="field" key={c}>
            <label htmlFor={`${id}-${c}`}>
              {CATEGORY_LABEL[c]} <span className="muted num">{cats[i]} pts</span>
            </label>
            <input
              id={`${id}-${c}`}
              type="range"
              min={0}
              max={300}
              step={1}
              value={cats[i]}
              onChange={(e) => setCats((prev) => prev.map((v, j) => (j === i ? Number(e.target.value) : v)))}
            />
          </div>
        ))}
        <div className="field">
          <label htmlFor={`${id}-days`}>
            Days since first attestation <span className="muted num">{days}</span>
          </label>
          <input
            id={`${id}-days`}
            type="range"
            min={0}
            max={Math.max(14, Math.ceil(maturityDays * 2))}
            step={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
          <p className="hint">Full maturity after {fmt1(maturityDays)} days.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={named} onChange={(e) => setNamed(e.target.checked)} />
          Address has a registered name
        </label>
      </form>

      <div className="stack" aria-live="polite">
        <div className="tab">
          <div className="tab-line">
            <span className="label">Base</span>
            <span className="num">{fmt1(r.base / 1000)}</span>
          </div>
          <div className="tab-line">
            <span className="label">Maturity</span>
            <span className="num">{fmtMult(r.maturity / 1000)}</span>
          </div>
          <div className="tab-line">
            <span className="label">Diversity, {r.active} active</span>
            <span className="num">{fmtMult(r.diversity / 1000)}</span>
          </div>
          <div className="tab-line">
            <span className="label">Identity</span>
            <span className="num">{fmtMult(r.identity / 1000)}</span>
          </div>
          <div className="tab-line total">
            <span className="label">Score</span>
            <span className="num">{fmtInt(r.score)}</span>
          </div>
        </div>
        <p>
          Tier: <TierPill tier={r.tier} />
        </p>
        <p className="small muted">
          Same integer maths as the renown package: milli-points, permille multipliers, floored at each step.
        </p>
      </div>
    </div>
  );
}
