# Barkeep scoring algorithm

All math lives in `gno.land/p/<ns>/renown/v0`: integers only, no state, no callbacks.
Points are stored in milli-points (`Milli = 1000`); multipliers are permille (`1000 = ×1.0`).
Every operation saturates instead of overflowing (`SatAdd`, `SatMul`, `MulDiv`).

## Flow

1. A realm (`gno.land/r/...`) calls `barkeep.RegisterSource(cross(cur), category, desc)`. It starts **unverified** (weight 0).
   `desc` must be ≤ 140 bytes of printable ASCII without ``[ ] ( ) < > ` | # * _ &`` and without URLs (`://`, `www.`) (`ValidDesc`); Render also escapes it with `sanitize.TableCell`.
2. The admin promotes it with `SetSourceTier(..., TierVerified)` and may tune `SetWeight(path, weight, capPoints)` or `Pause`.
   The admin role moves in two steps: `TransferAdmin(new)` then `AcceptAdmin()` by `new`; proposing `""` cancels.
3. The source attests a subject: `barkeep.Attest(cross(cur), subject, kind, units) bool`.
   The source is `cur.Previous().PkgPath()`; users and unregistered realms get `false`, as do
   `units` outside 1..100, a `kind` outside `[a-z0-9._-]{1,32}`, an invalid subject or the source's own address.
   A source with effective weight 0 (unverified) **cannot create a profile**: it only records on
   subjects that already have one, so a spam realm cannot make signers pay storage for new profiles.
4. Points go into one bucket per (subject, source). Reads compute the score at the current block time.

## Formulas

Bucket update on attest (`Bucket.Accrue`):

```
v      = Decay(points, now - lastTs, HalfLife) + units * 1000
points = min(v, cap)        lastTs = now
```

Decay (`Decay`): halve once per full half-life (bit shift), then apply an 8-step table
for the remainder, `2^(-k/8)` scaled by 1e6, `k = floor(8 * (dt mod H) / H)`.
Monotonic and exact at every whole half-life.

Score (`computeScore` in the realm, `Composite` in the package):

```
value    = min(Decay(bucket), cap(src))                    (a lowered cap applies at once)
cat[c]   = Σ weight(src)/1000 * value                      over buckets of sources in category c
base     = Σ cat[c]
active   = number of categories with cat[c] >= 1 point
maturity = 0.5 → 1.0 linearly over 7 days from the subject's first verified attestation
diversity= min(1 + 0.15 * (active - 1), 1.6)
identity = 1.2 if the address has a name in gno.land/r/sys/users, else 1.0
           (also reported for addresses without a profile)
score    = base * maturity * diversity * identity          (shown in whole points)
```

Unverified and revoked sources keep their buckets but have effective weight 0.
Pausing a source (or `PauseAll`) only blocks new attestations; existing points still count.

Tiers: Stranger < 10 ≤ Regular < 100 ≤ Patron < 500 ≤ Legend.

## Parameters (`renown.DefaultParams`)

| Param | Value |
|---|---|
| HalfLife | 30 days |
| MaturityPeriod / MaturityStart | 7 days / 0.5 |
| IdentityBonus | ×1.2 |
| DiversityStep / DiversityMax | +0.15 / ×1.6 |
| DefaultWeight / MaxWeight | ×1.0 / ×3.0 |
| DefaultCap per bucket | 100 points |
| MaxUnitsPerAttest | 100 |

Realm limits: 32 buckets per profile, 10 recent entries, top-50 leaderboard, 140-byte descriptions,
20 admin log entries, page size ≤ 50. Every registry listing is paginated (`IterateByOffset`);
the verified-source count is a counter kept by `SetSourceTier`, not a registry scan.

Bucket eviction (profile full): buckets rank weightless first, then by weighted value
(`weight × min(decay, cap)`), then raw value; the new bucket replaces the lowest only if it ranks
higher, so unverified spam cannot evict verified history.

Leaderboard: up to 50 snapshots, recomputed on every read. A member's own attestation refreshes
its snapshot. When the board is full and a newcomer competes for a slot, the work per call is
bounded:

1. Rolling refresh: `TopRefreshBatch` (2) snapshots are recomputed in rotation, so every entry is
   refreshed within 25 newcomer attestations. This is how a revoked or decayed entry with a
   stale-high snapshot loses its slot.
2. Confirmed eviction: the lowest snapshot is re-scored before it is replaced (up to
   `TopConfirmMax` = 2 candidates). A member is evicted only by a freshly computed score, so a
   snapshot that is too low (name registered, maturity ramp) never costs a slot.

Consequences of the bound:

- If the re-scored candidate turns out higher than its snapshot, and the newcomer no longer
  beats the next-lowest entry within the `TopConfirmMax` budget, the newcomer is rejected for
  that attestation. This is safe: its own profile is stored, and its next attestation competes
  again with the corrected snapshots, so it gets in if its score really is higher.
- A revoke or pause does not evict at once. The revoked entry keeps its stale-high snapshot until
  the rolling refresh reaches it, which can take up to `MaxTop / TopRefreshBatch` = 25 newcomer
  attestations. Reads (`LeaderboardJSON`, Render) recompute scores, so the shown score is already
  correct; only the slot is held longer.

A full refresh of all 50 entries was tried first and dropped: on a gnodev chain it cost ~74M
gas (each score reads `r/sys/users`), and a refresh that ran out of gas rolled back its own
"done" flag, so every later newcomer hit the same wall.

## Cost per Attest (measured, local `gno test`, toolchain `fc79041f4`)

Measured with temporary filetests that differ by one attestation each
(questboard source, verified, 10 units, distinct subjects). Storage deposit = 100 ugnot/byte;
gas price on Onyx = 1 ugnot per 1,000 gas.

| Case | barkeep bytes | gas | deposit |
|---|---|---|---|
| First attestation for a new subject | +5,114 to +5,809 | ~0.75–0.98 M | ~0.51–0.58 GNOT |
| Repeat attestation, same subject and source | +627 | ~0.59 M | ~0.063 GNOT |
| Admin `SetSourceTier` verify | +976 | ~1.16 M | ~0.098 GNOT |

These filetest gas numbers leave out the cost of loading packages from the store. A real chain
charges that on every transaction, so the numbers below are the ones to budget for.

### On a chain (local gnodev, same toolchain, `scripts/seed`)

| Call | gas used | storage |
|---|---|---|
| Baseline: `r/demo/counter.Increment` | 1.68 M | — |
| Loading barkeep alone (`maketx run` reading `IsPaused()`) | 9.1 M | — |
| Loading `r/sys/users` alone | 8.4 M | — |
| questboard `Complete`, repeat subject | 16–17 M | +6 to +650 B |
| questboard `Complete`, new subject, board 35–50 | 22–24 M | ~+5 KB |
| questboard `Complete`, new subject, full board (56 profiles) | 24–26 M | ~+5 KB |
| townhall `Vote`, voter with a profile | 20.6–21.2 M | +3.5 KB |
| lounge `Sign` | 15.2 M | +0.7 KB |

Most of the cost is loading the import graph, mainly `r/sys/users` (it imports `regexp` and
`gov/dao`). That cost is paid on every call. Use `-gas-wanted 50000000` with `-gas-fee 50000ugnot`
(0.05 GNOT at 1 ugnot per 1,000 gas). Adena simulates the call and sets gas itself.

The source realm adds +10 bytes in this demo. The deposit is paid by the transaction signer
(the end user), including the bytes written in barkeep. Adena `DoContract` has no deposit field,
so the chain's `default_deposit` (100 GNOT on Onyx) is the ceiling, which covers this.
A new profile is the expensive part (profile struct, avl node, recent ring, top-50 entry).
