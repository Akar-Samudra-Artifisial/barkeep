import type { Metadata } from "next";
import { Suspense } from "react";
import { CreatePollAction, MyStanding, QuestAction, SignAction, VoteAction } from "@/components/play-actions";
import { ReadErrorBlock } from "@/components/states";
import { AddressLink, Empty, SkeletonPanel, TierPill } from "@/components/ui";
import { REALMS, gnowebUrl } from "@/lib/config";
import { fmtInt } from "@/lib/format";
import { getLounge, getQuestboard, getTownhall } from "@/lib/gno";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Play</h1>
          <p className="sub">
            Three demo realms around the tavern. Quests and votes earn renown; polls and the lounge are gated by it. Each
            action is a real transaction signed in Adena.
          </p>
        </div>
      </div>
      <div className="stack">
        <MyStanding />
        <div className="split">
          <section className="panel" aria-labelledby="quest-h">
            <header>
              <h2 id="quest-h">Quest board</h2>
              <Suspense fallback={<span className="meta">Loading…</span>}>
                <QuestCount />
              </Suspense>
            </header>
            <p className="muted mb">
              One repeatable demo quest: every call attests 10 contribution units to your address. The board ignores the
              quest id and has no per-address limit, so it is a demo source, not a sybil-resistant one.
            </p>
            <QuestAction />
          </section>

          <section className="panel" aria-labelledby="new-poll-h">
            <header>
              <h2 id="new-poll-h">Open a poll</h2>
              <a className="card-link" href={gnowebUrl(REALMS.townhall)} rel="noreferrer">
                Town hall on gnoweb
              </a>
            </header>
            <CreatePollAction />
          </section>
        </div>

        <Suspense fallback={<SkeletonPanel label="polls" rows={4} />}>
          <Polls />
        </Suspense>

        <div className="split">
          <section className="panel" aria-labelledby="sign-h">
            <header>
              <h2 id="sign-h">Sign the lounge guestbook</h2>
            </header>
            <SignAction />
          </section>
          <Suspense fallback={<SkeletonPanel label="guestbook" rows={4} />}>
            <Guestbook />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function QuestCount() {
  const r = await getQuestboard();
  return <span className="meta">{r.ok ? `${fmtInt(r.data.completed)} completed` : "count unavailable"}</span>;
}

async function Polls() {
  const r = await getTownhall();
  return (
    <section className="panel" aria-labelledby="polls-h">
      <header>
        <h2 id="polls-h">Town hall polls</h2>
        {r.ok && <span className="meta">{r.data.count} polls</span>}
      </header>
      {!r.ok ? (
        <ReadErrorBlock kind={r.kind} message={r.message} what="town hall" />
      ) : r.data.polls.length === 0 ? (
        <Empty>No poll is open. A patron with a score of 20 can open the first one above.</Empty>
      ) : (
        <div className="polls">
          {r.data.polls.map((p) => (
            <div key={p.id} className="stack-sm">
              <p className="small muted">
                Poll {p.id}
                {p.author && (
                  <>
                    {" "}
                    by <AddressLink address={p.author} />
                  </>
                )}
                {p.height > 0 && ` at block ${fmtInt(p.height)}`}
              </p>
              <VoteAction poll={p} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

async function Guestbook() {
  const r = await getLounge();
  return (
    <section className="panel flush" aria-labelledby="guest-h">
      <header>
        <h2 id="guest-h">Guestbook</h2>
        {r.ok && <span className="meta">{fmtInt(r.data.signatures)} signatures</span>}
      </header>
      {!r.ok ? (
        <div className="panel-body">
          <ReadErrorBlock kind={r.kind} message={r.message} what="lounge" />
        </div>
      ) : r.data.entries.length === 0 ? (
        <div className="panel-body">
          <Empty>The guestbook is empty. A Regular can leave the first line.</Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Patron</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {r.data.entries.map((e) => (
                <tr key={`${e.height}-${e.patron}`}>
                  <td>
                    {/^g1[0-9a-z]{38}$/.test(e.patron) ? <AddressLink address={e.patron} /> : e.patron}
                    <span className="sub">
                      <TierPill tier={e.tier} /> block {fmtInt(e.height)}
                    </span>
                  </td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
