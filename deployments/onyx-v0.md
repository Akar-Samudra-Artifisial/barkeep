# Onyx v0 deployment (final)

Chain `onyx-1`, RPC `https://rpc.onyx.testnets.gno.land:443`, deployer `g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p` (gnokey `barkeep-deployer`).
Source: `gno/**/v0` unchanged (no path rewrite), copied to `build/v0/<name>/` (gitignored) without `*_test.gno` and `filetests/`.
Deployed 2026-11-24. Pre-flight: `gno test ./gno/...` 5 ok, `gno lint ./gno/...` exit 0, all five paths `absent` in `vm/qpkgmeta_json`.

| Package | Path | Tx hash | Height | Gas used | Status (2026-11-24) |
|---|---|---|---|---|---|
| renown | `gno.land/p/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/renown/v0` | `aqHi7GZdyn+NGiUOGL93fSsR9d7PUz70sJsiums9QDU=` | 1355854 | 13,488,909 | inert, pending approver |
| barkeep | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0` | `TAMog9OUJslNy3rcgjQ6oZWvX8Qguwvp5G0dxMqp9tI=` | 1355860 | 43,945,165 | inert, GPAS "in review queue" |
| questboard | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/questboard/v0` | `O4FRkbFJ1vqfVUV0IxvNBZIb2FAZrywniAZQ3m4P9XM=` | 1355865 | 3,294,869 | inert, pending approver |
| townhall | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/townhall/v0` | `67iLk0PYNA2T8TiynVBHm/QT6yodLVbVWtBP2FujinA=` | 1355869 | 11,210,830 | inert, pending approver |
| lounge | `gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/lounge/v0` | `HD7832fkfHC1591QVl29cn54MnQ1yAh15Xt5JQObyrk=` | 1355873 | 5,545,896 | inert, pending approver |

Each addpkg: simulated first (`-simulate only`), then `-gas-fee 100000ugnot -gas-wanted 80000000 -max-deposit 30000000ugnot`.
Fee 0.1 GNOT per tx; balance 299.7 → 299.2 GNOT. Storage deposit not charged while parked.
All five `vm/qpkgmeta_json`: `"status":"inert","reason":"waiting for a package approver to enable it","pending":true`.
Approval flow and caveats: see `onyx-dev1.md` (order renown → barkeep → dependents; do not resubmit parked packages).

Check status:

```sh
gnokey query vm/qpkgmeta_json -data gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0 -remote https://rpc.onyx.testnets.gno.land:443
```

GPAS: https://gpas.onyx.testnets.gno.land/?path=gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0

## Pending (after all five are enabled)

1. `questboard` and `townhall` init register themselves as unverified sources (confirm via render/query).
   `lounge` only reads scores (`HasMinScore`/`TierOf`), it is not a source.
2. Admin (deployer) verifies each demo source:
   `gnokey maketx call -pkgpath gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0 -func SetSourceTier -args gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/<questboard|townhall>/v0 -args verified ...`
3. Smoke test: `questboard.Complete("q1")` from deployer, then `vm/qeval` `ScoreOf("g1dmw…")`.
4. Render: https://onyx.testnets.gno.land/r/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/barkeep/v0
5. No persona seeding on Onyx.
