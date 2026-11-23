# Barkeep threat model and anti-sybil measures

What Barkeep defends against, how, and what it does not. Constants are from
`gno.land/p/<ns>/renown/v0` (`DefaultParams`, tier constants) and `gno.land/r/<ns>/barkeep/v0`
(limits in `barkeep.gno`). Formulas: [ALGORITHM.md](ALGORITHM.md).

## Trust model

- **Source identity is not forgeable.** A source is `cur.Previous().PkgPath()`, set by the VM on a
  crossing call. Users (non-code callers) cannot attest, and a realm cannot attest as another realm.
  No oracle or off-chain signer is involved.
- **Only verified sources count.** Effective weight is the source weight while the tier is
  `verified`, else 0 (`source.effectiveWeight`). Registration is permissionless; verification is an
  admin decision.
- **Barkeep trusts verified sources to judge their own users.** It does not know whether a quest
  was real; a source decides when to attest and Barkeep bounds how much that can be worth.
- **The admin is trusted.** One address (`Admin()`), moved in two steps (`TransferAdmin` →
  `AcceptAdmin`).
- **Attestations are positive only** (`units` 1..100). Nobody can lower another address's score.

## Mitigations

| Mechanism | Rule (v0 value) | What it stops |
|---|---|---|
| Unverified weight 0 | New sources are `unverified`; weight 0 until `SetSourceTier(..., "verified")` | A self-deployed realm farming points. |
| No profile creation at weight 0 | `Attest` returns `false` if the subject has no profile and the source weight is 0 | Spam realms making signers pay ~5 KB storage per arbitrary address. |
| Bucket eviction order | Profile full (`MaxBuckets` 32): weightless buckets rank lowest; a new bucket replaces the lowest only if it ranks higher | Unverified spam evicting verified history. |
| Per-source cap | Each (subject, source) bucket is clamped to the source cap: `DefaultCap` 100 points, admin range 1..1,000,000; a lowered cap applies at read time | One source, or one compromised source, minting unlimited score for an address. |
| Units bound | `MaxUnitsPerAttest` 100 per call | Overflow and single-call blowups (all math saturates anyway). |
| Decay | `HalfLife` 30 days, applied at read time | Old or abandoned farms keep their score forever. |
| Maturity ramp | ×0.5 at the first verified attestation, linear to ×1.0 over 7 days (`MaturityStart` 500, `MaturityPeriod` 7 days) | Fresh addresses reaching full weight instantly. |
| Category diversity | ×(1 + 0.15·(n−1)), max ×1.6; a category counts once it holds ≥1 weighted point | Rewards breadth across governance/contribution/defi/building/community instead of grinding one action. |
| Registered name | ×1.2 if `r/sys/users` resolves the address to a name (`IdentityBonus` 1200); names come from a registrar such as `r/sys/namereg` | Gives named accounts an edge over throwaway addresses. |
| Revoke / pause | `revoked`/`unverified` → weight 0 for every score at once; `Pause`/`PauseAll` block new attestations | A source that turns bad after verification. |
| Bounded leaderboard upkeep | `MaxTop` 50; `TopRefreshBatch` 2 snapshots refreshed per newcomer; eviction candidate re-scored (`TopConfirmMax` 2) | Gas-exhaustion of the leaderboard path; stale-low snapshots losing slots. |
| Fixed parameters | v0 realm sets `params = renown.DefaultParams()` with no setter | Admin silently changing half-life or multipliers. |

## Attacks

| Attack | Mitigation | Residual risk |
|---|---|---|
| Deploy a realm and attest yourself | Weight 0 until verified; cannot create profiles | None for score; it can still append to the `recent` list (10 entries) of existing profiles, at the attacker's own cost. |
| Many fresh addresses through a permissive verified source | Cap per bucket, maturity ×0.5, gas + ~0.5 GNOT deposit per new profile | Low gates are cheap. With `questboard/v0` (no per-user limit, 10 units per call) a fresh address reaches Regular (10) with 2 calls and townhall's poll gate (20) with 4. Sources must rate-limit. |
| One address grinding one source | Cap 100 points per source, decay | Cap is a balance, not a rate: a bucket can be refilled at any time, so a farmed address holds ~cap × weight continuously. |
| Stack many sources in one category | Each source has its own cap | No per-category cap: score is a sum over all verified sources. Bounded only by how many sources the admin verifies. |
| Pre-age addresses to skip the ramp | Maturity starts at the first **verified** attestation | One cheap verified attestation starts the 7-day clock; aged sybils reach ×1.0. |
| Buy the identity bonus | ×1.2 only | The cost of a name is set by the registrar, not Barkeep; where names are cheap the bonus is cheap. |
| Verified source turns malicious | Admin revokes → weight 0 at once | Until the admin acts, it can max every subject's bucket (cap × weight, up to 1,000,000 × 3.0 if the admin set that). It can attest any address; subjects do not consent. |
| Revoked member keeps a leaderboard slot | Reads (`LeaderboardJSON`, Render) recompute scores | The slot can be held for up to `MaxTop / TopRefreshBatch` = 25 newcomer attestations. |
| Exhaust gas in `Attest` | Bounded loops: 32 buckets, 2+2 leaderboard re-scores | Each call still loads `r/sys/users` (~8 M gas); a new subject costs 22–26 M gas. |
| Markdown/link injection via source description | `ValidDesc` (no markup chars, no URLs, ≤140 bytes) + `sanitize.TableCell` in Render | None known. |

## Known weaknesses

These are true of the v0 code, not hypothetical:

1. **Single trusted admin.** One key verifies sources and sets weight (up to ×3.0) and cap (up to
   1,000,000 points) with no timelock, quorum or appeal. Actions emit events, but the on-chain
   `adminLog` keeps only the last `MaxAdminLog` = 20 entries. A compromised admin key can verify a
   malicious realm.
2. **Barkeep is only as sybil-resistant as its verified sources.** It bounds per-source impact; it
   cannot tell whether an attested action was real. The demo `questboard/v0` is deliberately naive.
3. **No subject consent and no negative signal.** Any verified source can attest any address; there
   are no slashing or dispute mechanisms.
4. **Low tiers are cheap.** Regular (10) needs 10 weighted points after multipliers, which one
   permissive source gives in two calls. Consumers should gate valuable rights on higher scores or
   on `HasMinCategoryScore`.
5. **Identity is a name, not personhood.** The ×1.2 bonus checks `r/sys/users` only.
6. **Gates are point-in-time.** Consumers check at call time; decay or revocation does not undo
   past actions.
7. **Parameters cannot be tuned in v0.** Fixing a bad parameter needs a new version path, and v0
   has no state migration.
8. **Not live yet.** On Onyx the `/v0` packages are submitted but `inert`, waiting for a package
   approver ([deployments/onyx-v0.md](../deployments/onyx-v0.md)); all numbers above come from
   tests and a local gnodev chain.
