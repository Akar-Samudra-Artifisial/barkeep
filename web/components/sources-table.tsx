"use client";

import { useState } from "react";
import { CATEGORY_LABEL, fmtInt, fmtMult, shortPath, sourceTierClass, utcDate } from "@/lib/format";
import type { Source, SourceTier } from "@/lib/types";

type Filter = "all" | SourceTier;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All sources" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "revoked", label: "Revoked" },
];

export function SourcesTable({ items }: { items: Source[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const count = (f: Filter) => (f === "all" ? items.length : items.filter((s) => s.tier === f).length);
  const shown = filter === "all" ? items : items.filter((s) => s.tier === filter);

  return (
    <div className="stack">
      <div className="count-cards" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="count-card"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            <strong>{count(f.key)}</strong>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      <section className="panel flush" aria-labelledby="reg-h">
        <header>
          <h2 id="reg-h">Registry</h2>
          <span className="meta" aria-live="polite">
            {shown.length} shown
          </span>
        </header>
        {shown.length === 0 ? (
          <div className="panel-body">
            <p className="empty">No source has this status.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Realm</th>
                  <th scope="col" className="hide-sm">
                    Category
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="n">
                    Weight
                  </th>
                  <th scope="col" className="n hide-sm">
                    Cap
                  </th>
                  <th scope="col" className="n">
                    Attestations
                  </th>
                  <th scope="col" className="n hide-sm">
                    Registered
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="mono truncate" title={s.path}>
                        {shortPath(s.path)}
                      </span>
                      <span className="sub">{s.desc}</span>
                    </td>
                    <td className="hide-sm">
                      <span className={`swatch c-${s.category}`} aria-hidden="true" />
                      {CATEGORY_LABEL[s.category]}
                    </td>
                    <td>
                      <span className={sourceTierClass(s.tier)}>{s.tier}</span>
                      {s.paused && <span className="sub">paused</span>}
                    </td>
                    <td className="n">
                      {fmtMult(s.effectiveWeight / 1000)}
                      {s.effectiveWeight !== s.weight && <span className="sub">set {fmtMult(s.weight / 1000)}</span>}
                    </td>
                    <td className="n hide-sm">{fmtInt(s.capPoints)} pts</td>
                    <td className="n">{fmtInt(s.attestations)}</td>
                    <td className="n hide-sm">{utcDate(s.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
