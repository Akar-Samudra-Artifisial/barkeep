# Integrating with Barkeep

How another realm writes reputation into Barkeep (source) or reads it (consumer).
Formulas and parameters are in [ALGORITHM.md](ALGORITHM.md); the threat model is in [ANTI-SYBIL.md](ANTI-SYBIL.md).

`<ns>` = `g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p`.

| Path | What you use it for |
|---|---|
| `gno.land/r/<ns>/barkeep/v0` | `RegisterSource`, `Attest` (crossing) and all reads (non-crossing). |
| `gno.land/p/<ns>/renown/v0` | Constants and pure math: categories, tier names and thresholds (`RegularMin`, `PatronMin`, `LegendMin`), `TierOf(score)`. |

**Deployment status (2026-11-24):** all five `/v0` packages are submitted to Onyx (`onyx-1`) but are
still `inert`, waiting for a package approver (GPAS). Until they are enabled, calls and queries on Onyx
fail; use a local `gnodev` chain (see the README). Details: [deployments/onyx-v0.md](../deployments/onyx-v0.md).

## 1. Become a source

A source is a realm under `gno.land/r/` that credits its users for something they did in it.

### Register once

```go
import "gno.land/r/<ns>/barkeep/v0"

func init(cur realm) {
	barkeep.RegisterSource(cross(cur), "contribution", "Quests for adventurers")
}
```

`RegisterSource(cur realm, category, desc string) bool` is permissionless. The source identity is
`cur.Previous().PkgPath()`, set by the VM, so a realm cannot register or attest as another realm.
It returns `false` (no panic) when:

- the caller is not code, or its path does not start with `gno.land/r/`, or it is already registered;
- `category` is not one of `governance`, `contribution`, `defi`, `building`, `community`
  (`renown.Governance` … `renown.Community`); one category per source;
- `desc` fails `barkeep.ValidDesc`: more than `MaxDescLen` (140) bytes, non-printable ASCII, any of
  ``[ ] ( ) < > ` | # * _ &``, or a URL (`://`, `www.`). Empty is allowed.

### Attest

```go
// Complete marks a quest done and attests the caller in Barkeep.
func Complete(cur realm, id string) bool {
	completed++
	return barkeep.Attest(cross(cur), cur.Previous().Address(), "quest.completed", 10)
}
```

This is `questboard/v0` verbatim. Signature:
`Attest(cur realm, subject address, kind string, units int64) bool`.

- `units`: 1..`MaxUnitsPerAttest` (100). One unit = one point before weight and multipliers.
- `kind`: 1..32 chars of `[a-z0-9._-]` (`renown.ValidKind`). Free-form label shown in profiles.
- `subject`: any valid address except the source realm's own address. Barkeep does not check
  that the subject signed the transaction; that is your realm's job (use `cur.Previous().Address()`
  if you only credit the caller).

`Attest` never panics for ordinary conditions. It returns `false` when the caller is not a
registered realm, the source is revoked or paused, Barkeep is paused (`PauseAll`), the subject is
invalid or the source itself, the kind or units are out of range, or the source has weight 0 and
the subject has no profile yet. Your own transaction is never failed by Barkeep, so do not panic on
`false` unless you want to.

### Get counted: verification, weight, cap

A new source is `unverified` and has effective weight 0: its attestations are only recorded on
subjects that already have a profile and add nothing to any score. To count, ask the Barkeep admin
(currently the deployer, `Admin()`) off-chain. There is no on-chain request function. The admin calls:

| Admin call | Effect |
|---|---|
| `SetSourceTier(cur, path, "verified")` | Starts counting. A source with weight 0 gets `DefaultWeight` (1000 = ×1.0). |
| `SetWeight(cur, path, weight, capPoints)` | `weight` 0..`MaxWeight` (3000 = ×3.0) permille; per-subject bucket cap `capPoints` 1..1,000,000 whole points (default 100). |
| `Pause(cur, path, paused)` | Blocks new attestations; existing points keep counting and decaying. |
| `SetSourceTier(cur, path, "revoked")` / `"unverified"` | Weight 0 at once for every score; buckets are kept. |

Check your status with `SourceTier(path)` (`""` = unknown) or `SourcesJSON(offset, limit)`.

Design notes for sources:

- The cap applies to the balance, not a time window: one attestation of 100 units fills a default
  bucket at once, and it refills as it decays (half-life 30 days). Rate-limit inside your realm.
- Your sybil resistance is Barkeep's sybil resistance for your bucket. `questboard/v0` has none
  (anyone can call `Complete` repeatedly) and is only a demo; `townhall/v0` allows one vote per
  address per poll.

## 2. Become a consumer

Reads are plain (non-crossing) function calls and return values, never pointers into Barkeep state.

```go
import (
	"gno.land/p/<ns>/renown/v0"
	"gno.land/r/<ns>/barkeep/v0"
)

const MinScore = renown.RegularMin // 10, Regular tier

func Sign(cur realm, msg string) {
	who := cur.Previous().Address()
	if !barkeep.HasMinScore(who, MinScore) {
		panic("lounge: Regulars only")
	}
	// ...
}
```

Pattern from `lounge/v0` (`Sign`) and `townhall/v0` (`CreatePoll` with `MinScoreToCreatePoll = 20`).

| Read | Returns |
|---|---|
| `ScoreOf(addr) int64` | Composite score, whole points, computed at the current block time. |
| `TierOf(addr) string` | `Stranger` (<10), `Regular` (≥10), `Patron` (≥100), `Legend` (≥500). |
| `HasMinScore(addr, min) bool` | `ScoreOf(addr) >= min`. |
| `CategoryScoreOf(addr, category) int64` | Weighted, decayed points in one category, **before** multipliers. Unknown category → 0. |
| `HasMinCategoryScore(addr, category, min) bool` | Category gate, e.g. governance-only rights. |
| `SourceScoreOf(addr, path) int64` | Decayed, **unweighted** points from one source (unverified sources included). |
| `SourceTier(path) string`, `IsPaused() bool` | Source / global status. |
| `ProfileJSON(addr)`, `LeaderboardJSON(offset, limit)`, `SourcesJSON(offset, limit)`, `ParamsJSON()` | JSON strings for off-chain clients; `limit` capped at `MaxPageLimit` (50). |

A gate is checked only when your function runs. Scores decay and sources can be revoked, so a
right granted once (a guestbook entry, a poll) is not re-checked later unless your realm does it.

## 3. Read-only queries

### gnokey / ABCI

`vm/qeval` takes `<pkgpath>.<expression>`; `vm/qrender` takes `<pkgpath>:<path>`.

```sh
B=gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0
RPC=https://rpc.onyx.testnets.gno.land:443        # or tcp://127.0.0.1:26657 for gnodev

gnokey query vm/qeval   -remote $RPC -data "$B.ScoreOf(\"g1...\")"
gnokey query vm/qeval   -remote $RPC -data "$B.ProfileJSON(\"g1...\")"
gnokey query vm/qeval   -remote $RPC -data "$B.LeaderboardJSON(0, 50)"
gnokey query vm/qrender -remote $RPC -data "$B:u/g1..."
```

Render pages: `""` (leaderboard), `u/<addr>`, `sources`, `algorithm`, `integrate`.

### Dashboard API

The Next.js app (`web/`, deployed at https://barkeep-eight.vercel.app) wraps the same `vm/qeval`
calls. All routes are `GET`:

| Route | Backed by |
|---|---|
| `/api/leaderboard?offset=&limit=` | `LeaderboardJSON(offset, limit)`, limit clamped to 50 |
| `/api/profile/<addr>` | `ProfileJSON(addr)`; 400 if the address is not a gno.land address |
| `/api/sources` | `SourcesJSON`, all pages |
| `/api/params` | `ParamsJSON()` |
| `/api/realms` | questboard `Completed()`, townhall polls, lounge render + `Signatures()` |

Responses are `{ ok: true, ... }` or `{ ok: false, kind, message }` with status 404
(`not-deployed`), 502 (`parse`) or 503 (chain error). With `DATA_SOURCE=fixture` the app serves
bundled demo data instead of the chain, which is what the public dashboard shows while the Onyx
packages are inert.

## 4. Gas and limits

Gas used on a local gnodev chain (same toolchain, `scripts/seed`); most of it is loading the import
graph, mainly `r/sys/users`, and is paid on every call:

| Call | Gas used |
|---|---|
| questboard `Complete`, repeat subject | ~16 M |
| townhall `Vote`, voter with a profile | ~21 M |
| Attest for a new subject (questboard `Complete`, board 35–56 profiles) | 22–26 M |
| lounge `Sign` (read-only gate) | ~15 M |

- gnokey: `-gas-wanted 50000000 -gas-fee 50000ugnot` covers every Barkeep call measured.
- Adena: `DoContract` has no gas or deposit field; the wallet simulates and sets gas, and the chain's
  default deposit is the ceiling.
- Storage deposit (100 ugnot/byte) is paid by the transaction signer, including bytes Barkeep writes:
  ~5 KB (~0.5 GNOT) for a new profile, ~0.6 KB for a repeat attestation.
- Per-profile limits: `MaxBuckets` 32 sources, `MaxRecent` 10 entries. Leaderboard: `MaxTop` 50.

## 5. Versioning

- `p/<ns>/renown/v0` is a package: immutable once deployed. Its formula and `DefaultParams()` never
  change under that path.
- `r/<ns>/barkeep/v0` loads `params = renown.DefaultParams()` at deploy time and has no setter, so
  half-life, maturity, multipliers and limits are fixed for v0. The admin can only verify, revoke,
  pause and set per-source weight/cap.
- An upgrade is a new path (`renown/v1`, `barkeep/v1`). v0 has no migration code: scores in v0 stay in
  v0, and sources must register again in v1. Pin the version you import.
