# Barkeep

> The barkeep knows everyone's reputation.

Cross-realm reputation scores for Gno.land (RFC gnolang/gno#3350), built for the Gnome Tavern hackathon.

Status: core package, score realm and three demo realms done and tested end-to-end on a local gnodev chain. The final `/v0` packages are deployed on Onyx (`onyx-1`) and waiting for package approval (see [deployments/onyx-v0.md](deployments/onyx-v0.md); earlier dev build: [deployments/onyx-dev1.md](deployments/onyx-dev1.md)).
Dashboard: https://barkeep-eight.vercel.app (demo data until the realms are live; auto-deployed from `main`, app root `web/`).
See [docs/ALGORITHM.md](docs/ALGORITHM.md) for formulas, parameters and measured cost per attestation,
[docs/INTEGRATION.md](docs/INTEGRATION.md) to build a source or consumer realm, and
[docs/ANTI-SYBIL.md](docs/ANTI-SYBIL.md) for the threat model and known weaknesses.

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

## How it differs

| | Typical on-chain reputation / single-realm points | Barkeep |
|---|---|---|
| Score source | Points kept inside the one realm that awards them | Attestations from many registered realms, merged into one score |
| Source identity | Trusted caller list, signer or oracle | `cur.Previous().PkgPath()` set by the VM: no oracle, a realm cannot attest as another |
| Algorithm | Logic inside the app, changes with it | Open, pure package `p/<ns>/renown/v0`, immutable per version |
| Granularity | One number | Overall score plus five categories (`CategoryScoreOf`, `HasMinCategoryScore`) |
| Anti-Sybil | Implicit or undocumented | Public rules: unverified sources weigh 0, per-source caps, decay, maturity, diversity, name bonus ([docs/ANTI-SYBIL.md](docs/ANTI-SYBIL.md)) |

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

Filetest gas is measured with `gno test -v` (difference between filetests with and without the call;
includes some filetest overhead) and leaves out package loading, so it is **not** what a transaction
pays. On-chain gas is from a local gnodev chain (same toolchain as Onyx); "—" means not measured
separately. Deposit is 100 ugnot per byte, paid by the signer.

| Call | Gas (filetest only) | Gas on chain (gnodev) | Storage |
|---|---|---|---|
| `townhall.CreatePoll` (3 options) | ~1.2M | — | +3.9 KB (~0.39 GNOT) |
| `townhall.Vote`, voter new to Barkeep | ~0.85M | — | +6.9 KB (~0.69 GNOT) |
| `townhall.Vote`, voter already has a profile | ~1.0M | 20.6–21.2M | +3.5 KB (~0.35 GNOT) |
| `lounge.Sign`, first entry | ~1.0M | — | +1.0 KB (~0.10 GNOT) |
| `lounge.Sign`, next entry | ~0.8M | 15.2M | +0.7 KB (~0.07 GNOT) |

On a real chain each call also pays to load packages from the store, mostly `r/sys/users`. On a
local gnodev chain, calls that touch Barkeep used 15–26M gas (see
[docs/ALGORITHM.md](docs/ALGORITHM.md#on-a-chain-local-gnodev-same-toolchain-scriptsseed)).
Send them with `-gas-wanted 50000000 -gas-fee 50000ugnot`.

## Limitations

Full list in [docs/ANTI-SYBIL.md](docs/ANTI-SYBIL.md). Two that matter for the demo realms:

- `questboard/v0` ignores the quest `id` and has no per-address limit: the same address can call `Complete` repeatedly, 10 units each time (up to the source cap). The dashboard shows it as one repeatable demo action.
- `townhall/v0` gates only `CreatePoll` (score ≥ 20, `townhall.gno:19`); `Vote` is open to every address by design, one vote per address per poll.

## Local end-to-end with gnodev

```bash
gnodev local -add-account g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p=1000000000000ugnot \
  -paths gno.land/r/sys/namereg/v0,gno.land/r/sys/users        # chain-id "dev", RPC 127.0.0.1:26657
ADMIN_PASSPHRASE="…" scripts/seed/seed.sh                      # 10 demo personas, quests, polls, votes, lounge
```

The seed script is idempotent: each step checks chain state first. It is configured through
`CHAIN_ID`, `REMOTE` and `REALM_BASE` and writes `scripts/seed/personas.json`. Persona keys
go to `scripts/seed/.keys/` (gitignored, empty passphrase, testnet only). The admin key
(`barkeep-deployer`) verifies the demo sources and funds the personas, which is why gnodev
premines it. Preloading `r/sys/namereg/v0` at genesis lets it register as an `r/sys/users`
controller, so personas can take `nym-…` names.

## Test

```bash
gno test ./gno/...
gno lint ./gno/...
```
