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

Leaderboard: up to 50 snapshots, recomputed on every read. When the board is full and a newcomer
competes for a slot, all 50 entries are recomputed first if an admin changed a source's tier,
weight or cap since the last refresh, or if the last refresh is ≥ 1 hour old
(`TopRefreshInterval`); otherwise snapshots are trusted (30-day half-life ⇒ ≤ ~0.1% drift per hour).
So revoked or decayed entries cannot hold a slot.

Known limit: a snapshot can also be too *low* for up to one hour. Barkeep is not told when a
member registers a name in `r/sys/users` (identity ×1.2) or when the maturity ramp lifts their
score, so `topDirty` is not set in those cases. Within that window a newcomer can evict a member
whose fresh score would have kept the slot. A member's own attestations refresh their own
snapshot, the displayed order is always recomputed, and the next hourly refresh corrects it.
Watching name registrations would need a hook into `r/sys/users`. Recomputing on every
attestation would raise Attest gas from ~1.3M to ~14M. Neither is worth it for a display list.

## Cost per Attest (measured, local `gno test`, toolchain `fc79041f4`)

Measured with temporary filetests that differ by one attestation each
(questboard source, verified, 10 units, distinct subjects). Storage deposit = 100 ugnot/byte;
gas price on Onyx = 1 ugnot per 1,000 gas.

| Case | barkeep bytes | gas | deposit |
|---|---|---|---|
| First attestation for a new subject | +5,114 to +5,809 | ~0.75–0.98 M | ~0.51–0.58 GNOT |
| Repeat attestation, same subject and source | +627 | ~0.59 M | ~0.063 GNOT |
| New subject, board full, snapshots trusted | +5,302 | ~1.27 M | ~0.53 GNOT |
| New subject, board full, full refresh (≤ 1×/hour or after admin change) | +5,622 | ~14.4 M | ~0.56 GNOT (+0.014 GNOT fee) |
| Admin `SetSourceTier` verify | +976 | ~1.16 M | ~0.098 GNOT |

The source realm adds +10 bytes in this demo. The deposit is paid by the transaction signer
(the end user), including the bytes written in barkeep. Adena `DoContract` has no deposit field,
so the chain's `default_deposit` (100 GNOT on Onyx) is the ceiling, which covers this.
A new profile is the expensive part (profile struct, avl node, recent ring, top-50 entry).
