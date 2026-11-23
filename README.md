# Barkeep

> The barkeep knows everyone's reputation.

Cross-realm reputation scores for Gno.land (RFC gnolang/gno#3350), built for the Gnome Tavern hackathon.

Status: core package, score realm and three demo realms done and tested locally. A dev build is parked on Onyx waiting for package approval (see [deployments/onyx-dev1.md](deployments/onyx-dev1.md)).
Dashboard: https://barkeep-eight.vercel.app (demo data until the realms are live; auto-deployed from `main`, app root `web/`).
See [docs/ALGORITHM.md](docs/ALGORITHM.md) for formulas, parameters and measured cost per attestation.

## Realms and packages

Namespace: `g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p` (shortened to `<ns>` below).

| Path | Role |
|---|---|
| `gno.land/p/<ns>/renown/v0` | Pure scoring math (decay, multipliers, tiers), immutable per version. |
| `gno.land/r/<ns>/barkeep/v0` | Score realm. Registered realms attest through a crossing call, identified by `cur.Previous()`. Reads, JSON and Render pages. |
| `gno.land/r/<ns>/questboard/v0` | Demo source (contribution): each completed quest attests 10 units. |
| `gno.land/r/<ns>/townhall/v0` | Demo source and consumer (governance): opening a poll needs a score of 20; each vote attests 1 unit, one vote per address per poll. |
| `gno.land/r/<ns>/lounge/v0` | Demo consumer: VIP guestbook for the Regular tier (score 10) and above, 20-entry ring buffer. Never attests. |

Filetests: `questboard/v0/filetests/z1_flow` (verify, pause, cap, decay, identity, revoke) and `townhall/v0/filetests/z1_demo` (quests raise the score, the lounge and the poll gate open at their thresholds, double votes are refused).

## Integrate

**Source realm**: register once, then attest whoever your realm rewards. New sources start unverified (weight 0) until the Barkeep admin verifies them.

```go
import "gno.land/r/<ns>/barkeep/v0"

func init(cur realm) { barkeep.RegisterSource(cross(cur), "contribution", "What my realm rewards") }

func Complete(cur realm, id string) {
	// ... your own logic ...
	barkeep.Attest(cross(cur), cur.Previous().Address(), "quest.completed", 1)
}
```

`Attest` returns `false` instead of panicking when it cannot count (unknown, unverified or paused source, bad input), so your own transaction never fails because of Barkeep.

**Consumer realm**: gate on a plain read; no crossing call needed.

```go
import "gno.land/r/<ns>/barkeep/v0"

func Sign(cur realm, msg string) {
	if !barkeep.HasMinScore(cur.Previous().Address(), 10) { panic("Regulars only") }
	// ...
}
```

Other reads: `ScoreOf`, `TierOf`, `CategoryScoreOf`, `HasMinCategoryScore`, `SourceScoreOf`, `ProfileJSON`, `LeaderboardJSON`.

## Rough cost of the demo calls

Measured with `gno test -v` (difference between filetests with and without the call; gas includes some filetest overhead). Deposit is 100 ugnot per byte, paid by the signer.

| Call | Gas | Storage |
|---|---|---|
| `townhall.CreatePoll` (3 options) | ~1.2M | +3.9 KB (~0.39 GNOT) |
| `townhall.Vote`, voter new to Barkeep | ~0.85M | +6.9 KB (~0.69 GNOT) |
| `townhall.Vote`, voter already has a profile | ~1.0M | +3.5 KB (~0.35 GNOT) |
| `lounge.Sign`, first entry | ~1.0M | +1.0 KB (~0.10 GNOT) |
| `lounge.Sign`, next entry | ~0.8M | +0.7 KB (~0.07 GNOT) |

## Test

```bash
gno test ./gno/...
gno lint ./gno/...
```
