# Post-live runbook (Onyx `/v0`)

Run this once the five `/v0` packages from `onyx-v0.md` are enabled. Script: `scripts/postlive/postlive.sh`.

## Safety model

- `DRY_RUN=1` (default) prints every `gnokey maketx` command and sends nothing.
- Broadcasting needs `DRY_RUN=0` **and** both `CHAIN_ID` and `REMOTE` set explicitly. If either comes from a default, the script stops.
- `admin`, `smoke` and `seed` first check `vm/qpkgmeta_json` for all five packages. If any package is not `live`/`active`, the script stops and names it.
- Every tx is simulated first (`-simulate only`). The gas-wanted value is the simulated estimate plus 20%. `seed.sh` uses gnokey's default `-simulate test`.
- The admin passphrase comes from `ADMIN_PASSPHRASE` or `secret get "Gno Onyx — barkeep-deployer keyring passphrase"`. It reaches gnokey on stdin and never appears in argv or logs.
- `admin` is idempotent: it reads `SourceTier` first and only changes `unverified` sources. It refuses to change a `revoked` or unknown source.

## Runbook

```sh
cd barkeep
export PATH="$PWD/../.tools/bin:$PATH"
ON='CHAIN_ID=onyx-1 REMOTE=https://rpc.onyx.testnets.gno.land:443'

# 0. Status (read-only). Exit 2 means some packages are not live yet; they are listed.
scripts/postlive/postlive.sh check

# 1. Admin: verify questboard + townhall as sources. Preview first, then broadcast.
env $ON scripts/postlive/postlive.sh admin
env $ON DRY_RUN=0 scripts/postlive/postlive.sh admin

# 2. Smoke: Render, verified sources, LeaderboardJSON, Render("sources"),
#    then 1x questboard.Complete from key `smoke` (created and funded with 2 GNOT if missing).
#    The run passes only if ScoreOf(smoke) increases.
env $ON DRY_RUN=0 scripts/postlive/postlive.sh smoke

# 3. Seed personas (default 8, SEED_COUNT=2..10), then point the dashboard at the chain (below).
env $ON DRY_RUN=0 SEED_COUNT=8 scripts/postlive/postlive.sh seed

# Or all stages in order: check → admin → smoke → seed
env $ON DRY_RUN=0 scripts/postlive/postlive.sh all
```

Persona keys are stored in `scripts/seed/.keys/` (gitignored, mode 700, empty passphrase, testnet only). The `seed` stage overwrites `scripts/seed/personas.json` with the Onyx addresses.

### If a package stays inert or absent

If `renown` and `barkeep` are live but a dependent (questboard/townhall/lounge) stays `inert`/`absent`, it may need to be re-sent after `renown` became active. See gnolang/gno#6519 and gpao#6114. Check the GPAS status first; do not resubmit a package that is still parked (`onyx-dev1.md`).

## Estimated cost (GNOT)

Fee is `-gas-fee 100000ugnot` = 0.1 GNOT per tx, plus a storage deposit of about 0.06 GNOT per write (measured on gnodev: 623 bytes = 0.0623 GNOT).

| Stage | Tx | Estimate |
|---|---|---|
| admin | 2 SetSourceTier (~7.7M gas each) | ~0.2 |
| smoke | 1 send + 1 Complete (~16–18M gas) | ~0.3 fee + 2 transferred to `smoke` |
| seed (8 personas) | ~8 send, 4 Register, 41 Complete, 2 CreatePoll, 12 Vote, 5 Sign ≈ 72 tx | ~7 fee + ~4 storage + 40 transferred (5/persona) |
| **Total** | | **~55 (≈45 of that stays in persona/smoke accounts)** |

Admin balance was 599.2 GNOT on 2026-11-24. The script warns when it drops below `MIN_ADMIN_UGNOT` (60 GNOT). Assumption: the `r/sys/namereg/v0` registration fee on Onyx is unknown and not included. Set `NAMEREG=` to skip names.

## Dashboard live (Vercel project `barkeep`, team kaktua)

Env var names come from `web/lib/config.ts`. `DATA_SOURCE` is the only switch: `fixture` means bundled JSON, any other value means the chain. The `NEXT_PUBLIC_*` defaults already point at Onyx `/v0` (`onyx-1`, `https://rpc.onyx.testnets.gno.land:443`, `gno.land/r/<ns>/{name}/v0`), so they do not need to change. `DATA_SOURCE` is currently a Secret in Production + Preview.

Do this only after `smoke` passes. Run it from `web/` (where the project is linked):

```sh
cd web
vercel env add DATA_SOURCE production --value live --force --sensitive   # --force overwrites "fixture"
# Fallback if --force fails: vercel env remove DATA_SOURCE --environment production --confirm-name DATA_SOURCE, then add again
# Optional: pin the server RPC explicitly (default = NEXT_PUBLIC_RPC_URL)
# vercel env add RPC_URL production --value https://rpc.onyx.testnets.gno.land:443
vercel ls barkeep --environment production          # take the URL of the latest deployment
vercel redeploy <production-deployment-url> --environment production
curl -s https://barkeep-eight.vercel.app/ | grep -c fixture   # expect 0 / check the "demo data" banner is gone
```

Preview: same steps with `preview` instead of `production` (optional).

### Rollback to fixture

```sh
cd web
vercel env add DATA_SOURCE production --value fixture --force --sensitive
vercel redeploy <production-deployment-url> --environment production
```

On-chain rollback: `SetSourceTier(<source>, "unverified")` stops the source counting toward scores right away. `Pause`/`PauseAll` stop attestations (`barkeep/v0/admin.gno`).

## Local verification (gnodev, 2026-11-24)

`CHAIN_ID=dev REMOTE=tcp://127.0.0.1:26657`: `check` passed (5/5 live). `admin` re-verified townhall after it was set to unverified (simulated 7.75M gas, tx OK), and a second run made no changes. `smoke` passed, with `ScoreOf(smoke)` going 0 → 5 → 10 over two runs. `seed` passed with `SEED_COUNT=8`. On Onyx, `check` reported all 5 as `inert(pending)`, and `admin` stopped before any tx.
