"use client";

import { useEffect, useId, useState } from "react";
import { GATES, REALMS } from "@/lib/config";
import { fmtInt } from "@/lib/format";
import type { PollDetail, Profile } from "@/lib/types";
import { TxFallback, TxStatus, useRealmCall } from "./tx";
import { TierPill } from "./ui";
import { useWallet } from "./wallet";

const PRINTABLE = /^[\x20-\x7e]*$/;

/** The connected address's score, read through the /api/profile route handler. */
export function MyStanding() {
  const { address, status, error, connect } = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch(`/api/profile/${address}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.ok) {
          setProfile(body.data as Profile);
          setReadError(null);
        } else setReadError(body.message ?? "Could not read your score.");
      })
      .catch(() => !cancelled && setReadError("Could not reach the dashboard API."));
    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <section className="panel" aria-labelledby="me-h">
      <header>
        <h2 id="me-h">Your standing</h2>
      </header>
      {!address ? (
        <div className="stack">
          <p className="muted">
            Connect Adena to see your score and which actions it unlocks. Every action also has a gnokey command.
          </p>
          {error && (
            <p className="notice warn" role="alert">
              {error}
            </p>
          )}
          <div>
            <button type="button" className="btn primary" onClick={connect} disabled={status === "connecting"}>
              {status === "connecting" ? "Connecting…" : "Connect Adena"}
            </button>
          </div>
        </div>
      ) : readError ? (
        <p className="notice">{readError}</p>
      ) : !profile ? (
        <div className="skeleton sk-line" aria-label="Loading your score" />
      ) : (
        <dl className="facts">
          <div>
            <dt>Score</dt>
            <dd className="kpi-value">{fmtInt(profile.score)}</dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>
              <TierPill tier={profile.tier} />
            </dd>
          </div>
          <div>
            <dt>Unlocks</dt>
            <dd>
              {profile.score >= GATES.createPoll
                ? "Polls and lounge"
                : profile.score >= GATES.lounge
                  ? "Lounge"
                  : "Quests and votes"}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

const QUESTS = [
  { id: "cellar-rats", label: "Clear the cellar rats" },
  { id: "lost-tankard", label: "Find the lost tankard" },
  { id: "bard-night", label: "Host bard night" },
];

export function QuestAction() {
  const [quest, setQuest] = useState(QUESTS[0].id);
  const { phase, send } = useRealmCall(REALMS.questboard, "Complete");
  const busy = phase.kind === "signing";
  return (
    <div className="stack">
      <div className="field">
        <span className="label" id="quest-label">
          Quest
        </span>
        <div className="segmented" role="group" aria-labelledby="quest-label">
          {QUESTS.map((q) => (
            <button key={q.id} type="button" aria-pressed={quest === q.id} onClick={() => setQuest(q.id)}>
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <button type="button" className="btn primary" disabled={busy} onClick={() => send([quest])}>
          Complete quest
        </button>
      </div>
      <TxStatus phase={phase} doneText="Quest completed." />
      <TxFallback pkgPath={REALMS.questboard} func="Complete" args={[quest]} />
    </div>
  );
}

export function VoteAction({ poll }: { poll: PollDetail }) {
  const id = useId();
  const [choice, setChoice] = useState<number | null>(null);
  const { phase, send } = useRealmCall(REALMS.townhall, "Vote");
  const total = poll.options.reduce((a, o) => a + o.votes, 0);
  const args = [String(poll.id), String(choice ?? 0)];
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (choice !== null) send(args);
      }}
    >
      <fieldset className="form plain">
        <legend className="label">{poll.question}</legend>
        {poll.options.map((o) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          return (
            <label key={o.index} className="vote-option" htmlFor={`${id}-${o.index}`}>
              <input
                id={`${id}-${o.index}`}
                type="radio"
                name={`${id}-poll`}
                checked={choice === o.index}
                onChange={() => setChoice(o.index)}
              />
              <span className="grow">{o.label}</span>
              <span className="bar-track vote-bar" aria-hidden="true">
                <span className="bar-fill c-governance" style={{ width: `${pct}%` }} />
              </span>
              <span className="num r vote-count">
                {o.votes} <span className="visually-hidden">votes</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="form-row">
        <button type="submit" className="btn primary" disabled={choice === null || phase.kind === "signing"}>
          Cast vote
        </button>
        <span className="small muted">One vote per address. Each vote earns governance renown.</span>
      </div>
      <TxStatus phase={phase} doneText="Vote cast." />
      <TxFallback pkgPath={REALMS.townhall} func="Vote" args={args} />
    </form>
  );
}

export function CreatePollAction() {
  const id = useId();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes\nNo");
  const [touched, setTouched] = useState(false);
  const { phase, send } = useRealmCall(REALMS.townhall, "CreatePoll");

  const opts = options
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  const q = question.trim();
  let error: string | null = null;
  if (q.length === 0 || q.length > 140 || !PRINTABLE.test(q)) error = "Question: 1 to 140 plain ASCII characters.";
  else if (opts.length < 2 || opts.length > 5) error = "Give 2 to 5 options, one per line.";
  else if (opts.some((o) => o.length > 40 || o.includes("|") || !PRINTABLE.test(o)))
    error = "Each option: up to 40 plain ASCII characters, no | sign.";
  const args = [q || "Your question", opts.join("|") || "Yes|No"];

  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) send(args);
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-q`}>Question</label>
        <input
          id={`${id}-q`}
          className="input"
          maxLength={140}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Should the tavern stay open late on Fridays?"
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-o`}>Options, one per line</label>
        <textarea
          id={`${id}-o`}
          className="input textarea"
          rows={4}
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <p className="hint" id={`${id}-hint`}>
          Needs a Barkeep score of {GATES.createPoll}. The realm checks it, so a lower score fails on chain.
        </p>
      </div>
      {touched && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn primary" disabled={phase.kind === "signing"}>
          Open poll
        </button>
      </div>
      <TxStatus phase={phase} doneText="Poll opened." />
      <TxFallback pkgPath={REALMS.townhall} func="CreatePoll" args={args} />
    </form>
  );
}

export function SignAction() {
  const id = useId();
  const [msg, setMsg] = useState("");
  const [touched, setTouched] = useState(false);
  const { phase, send } = useRealmCall(REALMS.lounge, "Sign");
  const m = msg.trim();
  const error = m.length === 0 || m.length > 100 || !PRINTABLE.test(m) ? "1 to 100 plain ASCII characters." : null;
  return (
    <form
      className="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) send([m]);
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-m`}>Message</label>
        <input
          id={`${id}-m`}
          className="input"
          maxLength={100}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="First round is on me."
          aria-invalid={touched && error ? true : undefined}
          aria-describedby={`${id}-hint`}
        />
        <p className="hint" id={`${id}-hint`}>
          Regulars and above only (score {GATES.lounge} or more).
        </p>
      </div>
      {touched && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="submit" className="btn primary" disabled={phase.kind === "signing"}>
          Sign the guestbook
        </button>
      </div>
      <TxStatus phase={phase} doneText="Signed." />
      <TxFallback pkgPath={REALMS.lounge} func="Sign" args={[m || "Your message"]} />
    </form>
  );
}
