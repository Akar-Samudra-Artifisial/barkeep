# Onyx dev1 deployment

Chain `onyx-1`, RPC `https://rpc.onyx.testnets.gno.land:443`, deployer `g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p` (gnokey `barkeep-deployer`).
Source: copy of `gno/**/v0` with import paths rewritten, built in `build/dev1/` (gitignored); test files not uploaded.

`.../barkeep/dev1` is not deployable: the chain requires the last path element to equal the package name
unless it is a version suffix `vN` (`ValidatePkgNameMatchesPath`, `gnovm/pkg/gnolang/mempackage.go:269`,
enforced for user packages at `:1231`). Dev paths therefore use a `dev1/` segment before the name.

| Package | Path | Tx hash | Height | Gas used | Status |
|---|---|---|---|---|---|
| renown | `gno.land/p/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/dev1/renown` | `ZbCnYY4xq7BwEZ/j324WYsEnMiAhYBDDDuQ25kCcKxw=` | 1354346 | 13,490,603 | inert, GPAS "in review queue" |
| barkeep | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/dev1/barkeep` | `quqTa+1a1wLW/x+ph6ueZK+bh/EFD6GC52Klllpr5xY=` | 1354357 | 39,887,053 | inert, GPAS "in review queue" |
| questboard | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/dev1/questboard` | `kjY67kQ2aORLi66yfVDdpmfoLroy6+o9kfo+b6SYpHw=` | 1354360 | 3,300,171 | inert, GPAS "in review queue" |

Each addpkg: `-gas-fee 100000ugnot -gas-wanted 80000000 -max-deposit 30000000ugnot`.
Balance 300 → 299.7 GNOT (fees only). The storage deposit is not charged while a package is parked;
the 30 GNOT `max_deposit` is recorded in the package meta for the enable step.

## Approval (inert policy)

- `vm:p:code_submission_policy` = `inert`; `vm/qpkgmeta_json` reports
  `"status":"inert","reason":"waiting for a package approver to enable it","pending":true`.
- Approvals come from gpao (package-approver oracle, `contribs/gpao`), the gno-core instance "GPASO".
  Status page: https://gpas.onyx.testnets.gno.land/?path=gno.land/p/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/dev1/renown
- The page runs in "automatic" mode, but observed packages sit "in review queue" for hours; once "passed",
  enabling happens about 1 h later. Docs: if a path stays unknown, ask on Discord.
- Order matters: gpao resolves imports from chain, so `barkeep` can only pass after `renown` is live,
  and `questboard` after `barkeep`.
- Only the original submitter may replace a parked package (`keeper.go:1047-1058`); the replacement is a silent
  overwrite of the parked bytes. Avoid it unless an enable fails (it may reset the review, unverified).

## After enable (todo)

1. `questboard` init registers itself as an unverified source.
2. Admin: `gnokey maketx call -pkgpath gno.land/r/<ns>/dev1/barkeep -func SetSourceTier -args gno.land/r/<ns>/dev1/questboard -args verified`.
3. `questboard.Complete("q1")` from the deployer wallet, then `vm/qeval` `ScoreOf("g1dmw…")`.
4. Render: https://onyx.testnets.gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/dev1/barkeep and `:u/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p`.
