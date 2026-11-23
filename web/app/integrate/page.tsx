import type { Metadata } from "next";
import { CopyButton } from "@/components/tx";
import { PUBLIC_RPC_URL, REALMS } from "@/lib/config";

export const metadata: Metadata = { title: "Integrate" };

function Snippet({ title, lang, code, children }: { title: string; lang: string; code: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section className="panel" aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        <CopyButton text={code} />
      </header>
      <div className="prose mb">{children}</div>
      <pre aria-label={`${title}, ${lang}`}>
        <code>{code}</code>
      </pre>
    </section>
  );
}

export default function IntegratePage() {
  const bk = REALMS.barkeep;

  const register = `package tavern

import "${bk}"

func init(cur realm) {
	// Registers this realm as an unverified source in one category.
	// It earns nothing until the Barkeep admin verifies it.
	barkeep.RegisterSource(cross(cur), "community", "Tavern games night")
}`;

  const attest = `// Credit the caller after a real action in your realm.
func Play(cur realm, table int) {
	// ... your game logic ...
	barkeep.Attest(cross(cur), cur.Previous().Address(), "game.played", 5)
}`;

  const gate = `// Gate an action on reputation, without your own allow list.
func OpenTable(cur realm, name string) {
	caller := cur.Previous().Address()
	if !barkeep.HasMinScore(caller, 20) {
		panic("needs a Barkeep score of 20, current tier: " + barkeep.TierOf(caller))
	}
	// ...
}

// Or by category:
//   barkeep.HasMinCategoryScore(caller, "governance", 10)
//   barkeep.ScoreOf(caller)              -> int64
//   barkeep.CategoryScoreOf(caller, "defi")`;

  const offchain = `# Read a profile from any backend with a plain ABCI query.
EXPR='${bk}.ProfileJSON("g1...")'
curl -s ${PUBLIC_RPC_URL} -H 'content-type: application/json' -d "{
  \\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"abci_query\\",
  \\"params\\":{\\"path\\":\\"vm/qeval\\",\\"data\\":\\"$(printf '%s' "$EXPR" | base64)\\"}
}" | jq -r .result.response.ResponseBase.Data | base64 -d`;

  const api = `GET /api/leaderboard?offset=0&limit=50
GET /api/profile/{address}
GET /api/sources
GET /api/params
GET /api/realms        # quest board, town hall and lounge state`;

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Integrate</h1>
          <p className="sub">
            A realm becomes a source with two calls, and any realm can read a score in one. Paths below point at{" "}
            <code>{bk}</code>.
          </p>
        </div>
      </div>
      <div className="stack">
        <div className="split">
          <Snippet title="Register your realm" lang="Gno" code={register}>
            <p>
              Call once from <code>init</code>. Categories: governance, contribution, defi, building, community. The
              description is 1 to 140 printable ASCII characters.
            </p>
          </Snippet>
          <Snippet title="Attest an action" lang="Gno" code={attest}>
            <p>
              Units run from 1 to 100 per call. Each source has a cap per address, so spamming one realm stops paying
              off quickly.
            </p>
          </Snippet>
        </div>
        <Snippet title="Gate on reputation" lang="Gno" code={gate}>
          <p>
            Reads are plain functions, no crossing needed. The town hall and lounge on the Play page use exactly this
            check.
          </p>
        </Snippet>
        <div className="split">
          <Snippet title="Read from a backend" lang="shell" code={offchain}>
            <p>
              <code>ProfileJSON</code>, <code>LeaderboardJSON(offset, limit)</code>, <code>SourcesJSON(offset, limit)</code>{" "}
              and <code>ParamsJSON</code> return JSON strings, so <code>vm/qeval</code> is enough. Pages hold at most 50
              rows.
            </p>
          </Snippet>
          <Snippet title="This dashboard's API" lang="HTTP" code={api}>
            <p>
              Route handlers that wrap the same queries, cached for about 12 seconds. Each returns{" "}
              <code>{"{ ok, data }"}</code> or <code>{"{ ok: false, kind, message }"}</code>.
            </p>
          </Snippet>
        </div>
      </div>
    </>
  );
}
