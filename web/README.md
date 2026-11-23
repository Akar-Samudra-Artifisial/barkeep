# Barkeep dashboard

Next.js (App Router, Cache Components) dashboard for the Barkeep realms: leaderboard, profiles, source registry,
algorithm and calculator, demo actions via Adena, and integration snippets.

## Run

```bash
pnpm install
pnpm dev                          # http://localhost:3000, reads the chain
DATA_SOURCE=fixture pnpm dev      # bundled demo data with a visible banner
pnpm typecheck && pnpm lint && pnpm build
```

`DATA_SOURCE` is read while rendering. Static shells are prerendered at build time, so set it for both
`pnpm build` and `pnpm start`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_SOURCE` | live | `fixture` serves `fixtures/*.json`, anything else reads the chain |
| `RPC_URL` | public RPC | Server-side RPC for `vm/qeval` and `vm/qrender` |
| `NEXT_PUBLIC_CHAIN_ID` | `onyx-1` | Chain Adena must be on; the app asks Adena to switch or add it |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.onyx.testnets.gno.land:443` | Shown in gnokey commands, passed to Adena `AddNetwork` |
| `NEXT_PUBLIC_GNOWEB_URL` | `https://onyx.testnets.gno.land` | gnoweb links and `$help` fallbacks |
| `NEXT_PUBLIC_REALM_BASE` | `gno.land/r/<ns>/{name}/v0` | Realm path pattern (`{name}` = barkeep, questboard, townhall, lounge) |

All realm paths come from `lib/config.ts`.

## Data

- `lib/gno.ts` is the only chain reader. Barkeep data comes from `ProfileJSON`, `LeaderboardJSON`, `SourcesJSON` and
  `ParamsJSON`; town hall and lounge have no JSON readers, so their `Render()` markdown is parsed (`lib/markdown.ts`).
  Reads are cached for 12 seconds.
- Every reader returns `{ ok: false, kind, message }` instead of throwing. When a package is missing or still waiting for
  approval, pages say so. Live mode never shows made-up numbers.
- Route handlers: `/api/leaderboard`, `/api/profile/[addr]`, `/api/sources`, `/api/params`, `/api/realms`.
- Fixtures: `pnpm fixtures` rebuilds `fixtures/*.json` from simulated attestations through the TypeScript port of the
  renown maths (`lib/renown.ts`), so they match the shape of `json.gno` exactly.

## Writes

`/play` sends `/vm.m_call` through Adena (`AddEstablish`, then `GetAccount`, then the chain check and
`SwitchNetwork`/`AddNetwork`, then `DoContract`) for questboard `Complete`, townhall `Vote` and `CreatePoll`, and
lounge `Sign`. Each action also offers a gnoweb `$help` link and a gnokey command you can copy.
