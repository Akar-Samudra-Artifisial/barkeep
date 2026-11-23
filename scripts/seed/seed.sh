#!/usr/bin/env bash
# Seed Barkeep with demo personas: keys, funding, quests, names, polls,
# votes and lounge signatures. Safe to re-run: every step checks chain
# state first and skips work that is already done.
#
# Target (defaults = local gnodev):
#   CHAIN_ID          dev
#   REMOTE            tcp://127.0.0.1:26657
#   REALM_BASE        gno.land/r/<ns>/{name}/v0   ("{name}" = barkeep|questboard|townhall|lounge)
#   NAMEREG           gno.land/r/sys/namereg/v0   (empty = skip name registration)
# Keys:
#   KEYS_HOME         scripts/seed/.keys          persona keybase (gitignored, empty passphrase, testnet only)
#   ADMIN_KEY         barkeep-deployer            Barkeep admin; also funds the personas
#   ADMIN_HOME        gnokey default home
#   ADMIN_PASSPHRASE  required; pass it from your secret store, e.g.
#                     ADMIN_PASSPHRASE="$(secret get '…passphrase')" scripts/seed/seed.sh
# Amounts:
#   FUND_UGNOT        5000000   top-up target per persona
#   GAS_WANTED        50000000   (Barkeep-touching calls measured 15-30M on gnodev)
#   GAS_FEE           100000ugnot
# Safety:
#   SEED_ALLOW_REMOTE unset       the script refuses any CHAIN_ID other than "dev"
#                                 before touching keys or sending a tx; set it to 1
#                                 to seed a remote testnet (e.g. onyx-1) on purpose.
# The persona keybase directory is created (and kept) with mode 700.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NS="g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p"

CHAIN_ID="${CHAIN_ID:-dev}"
REMOTE="${REMOTE:-tcp://127.0.0.1:26657}"
DEFAULT_REALM_BASE="gno.land/r/$NS/{name}/v0"
REALM_BASE="${REALM_BASE:-$DEFAULT_REALM_BASE}"
NAMEREG="${NAMEREG-gno.land/r/sys/namereg/v0}"
KEYS_HOME="${KEYS_HOME:-$HERE/.keys}"
ADMIN_KEY="${ADMIN_KEY:-barkeep-deployer}"
ADMIN_HOME="${ADMIN_HOME:-}"
FUND_UGNOT="${FUND_UGNOT:-5000000}"
GAS_WANTED="${GAS_WANTED:-50000000}"
GAS_FEE="${GAS_FEE:-100000ugnot}"
GNOKEY="${GNOKEY:-gnokey}"

log() { printf '[seed] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# Guard: seeding sends many transactions and spends real testnet tokens.
# Only the local gnodev chain is allowed unless explicitly opted in.
if [[ "$CHAIN_ID" != "dev" && "${SEED_ALLOW_REMOTE:-}" != "1" ]]; then
  die "refusing to seed chain '$CHAIN_ID': only CHAIN_ID=dev runs by default; set SEED_ALLOW_REMOTE=1 to seed a remote chain on purpose"
fi

: "${ADMIN_PASSPHRASE:?set ADMIN_PASSPHRASE for $ADMIN_KEY (from your secret store, never hard-coded)}"

realm() { local b="${REALM_BASE%/}"; if [[ "$b" == *"{name}"* ]]; then echo "${b/"{name}"/$1}"; else echo "$b/$1"; fi; }
BARKEEP="$(realm barkeep)"
QUESTBOARD="$(realm questboard)"
TOWNHALL="$(realm townhall)"
LOUNGE="$(realm lounge)"

# qeval EXPR -> raw value inside "(value type)"; strings are unquoted.
qeval() {
  local out
  out="$("$GNOKEY" query vm/qeval -data "$1" -remote "$REMOTE" 2>&1)" || die "qeval $1: $out"
  out="$(printf '%s\n' "$out" | sed -n 's/^data: //p')"
  [[ -n "$out" ]] || die "qeval $1 returned no data"
  if [[ "$out" =~ ^\(\"(.*)\"\ string\)$ ]]; then printf '%b' "${BASH_REMATCH[1]}"
  else printf '%s' "$out" | sed -E 's/^\((.*) [^ ]+\)$/\1/; s/^"(.*)"$/\1/'; fi
}

balance() {
  "$GNOKEY" query "bank/balances/$1" -remote "$REMOTE" 2>/dev/null | sed -n 's/^data: "\([0-9]*\)ugnot".*/\1/p'
}

# call KEY HOME PASS PKG FUNC [ARGS...]
call() {
  local key="$1" home="$2" pass="$3" pkg="$4" fn="$5"; shift 5
  local args=() a out
  for a in "$@"; do args+=(-args "$a"); done
  local homeflag=()
  if [[ -n "$home" ]]; then homeflag=(-home "$home"); fi
  if ! out="$(printf '%s\n' "$pass" | "$GNOKEY" maketx call ${homeflag[@]+"${homeflag[@]}"} -insecure-password-stdin \
      -pkgpath "$pkg" -func "$fn" ${args[@]+"${args[@]}"} -gas-fee "$GAS_FEE" -gas-wanted "$GAS_WANTED" \
      -broadcast -chainid "$CHAIN_ID" -remote "$REMOTE" "$key" 2>&1)"; then
    die "$key → $pkg.$fn($*) failed: $(printf '%s\n' "$out" | grep -m1 -iE 'panic|error|Data:' || printf '%s' "$out" | tail -1)"
  fi
}
admin_call() { call "$ADMIN_KEY" "$ADMIN_HOME" "$ADMIN_PASSPHRASE" "$@"; }
persona_call() { call "$1" "$KEYS_HOME" "" "${@:2}"; }

addr_of() { "$GNOKEY" list -home "$KEYS_HOME" 2>/dev/null | sed -n "s/^[0-9]*\. $1 (local) - addr: \(g1[0-9a-z]*\).*/\1/p"; }

# ------------------------------------------------------------------ personas
# key | nym name ("-" = none) | quests | votes "poll:option,..." | lounge message ("-" = none)
PERSONAS=(
  "ava|nym-avalanche101|10|1:0,2:1|Ale for everyone who shipped this week"
  "bram|nym-brambles102|8|1:1,2:0|Polls are open, come vote"
  "cora|-|6|1:0,2:2|Quiet table by the fire, please"
  "dax|nym-daxworth104|5|1:2|-"
  "elin|-|4|2:1|First round on the quest board"
  "finn|nym-finnegan106|3|1:0,2:0|-"
  "gwen|-|3|1:1|Regular at last"
  "hugo|-|2|2:2|-"
  "iris|nym-irisbloom109|1|-|-"
  "jules|-|2|1:2|-"
)
POLLS=(
  "ava|Which realm should the tavern integrate next?|DeFi vault|Builder grants|Community events"
  "bram|Should verified sources get a higher cap?|Yes|No|Only after review"
)

admin_addr="$("$GNOKEY" list ${ADMIN_HOME:+-home "$ADMIN_HOME"} 2>/dev/null | sed -n "s/^[0-9]*\. $ADMIN_KEY ([a-z]*) - addr: \(g1[0-9a-z]*\).*/\1/p")"
[[ -n "$admin_addr" ]] || die "admin key $ADMIN_KEY not found"
[[ "$(qeval "$BARKEEP.Admin()")" == "$admin_addr" ]] || die "$ADMIN_KEY ($admin_addr) is not the Barkeep admin"
log "chain=$CHAIN_ID remote=$REMOTE barkeep=$BARKEEP admin=$admin_addr"

# 1. keys + funding
mkdir -p "$KEYS_HOME"
chmod 700 "$KEYS_HOME"
for row in "${PERSONAS[@]}"; do
  IFS='|' read -r key _ <<<"$row"
  if [[ -z "$(addr_of "$key")" ]]; then
    printf '\n\n' | "$GNOKEY" add -home "$KEYS_HOME" -insecure-password-stdin "$key" >/dev/null 2>&1 || die "create key $key"
    log "key $key created"
  fi
  a="$(addr_of "$key")"
  bal="$(balance "$a")"; bal="${bal:-0}"
  if (( bal < FUND_UGNOT / 2 )); then
    printf '%s\n' "$ADMIN_PASSPHRASE" | "$GNOKEY" maketx send ${ADMIN_HOME:+-home "$ADMIN_HOME"} -insecure-password-stdin \
      -to "$a" -send "$((FUND_UGNOT - bal))ugnot" -gas-fee "$GAS_FEE" -gas-wanted 2000000 \
      -broadcast -chainid "$CHAIN_ID" -remote "$REMOTE" "$ADMIN_KEY" >/dev/null 2>&1 || die "fund $key ($a)"
    log "funded $key $a"
  fi
done

# 2. verify the demo sources
for src in "$QUESTBOARD" "$TOWNHALL"; do
  tier="$(qeval "$BARKEEP.SourceTier(\"$src\")")"
  case "$tier" in
    verified) ;;
    unverified) admin_call "$BARKEEP" SetSourceTier "$src" verified; log "verified $src" ;;
    *) die "source $src has tier '$tier' (not registered?)" ;;
  esac
done

# 3. names first, so the leaderboard snapshot written by the next attest includes the bonus
if [[ -n "$NAMEREG" ]]; then
  for row in "${PERSONAS[@]}"; do
    IFS='|' read -r key name _ <<<"$row"
    [[ "$name" == "-" ]] && continue
    a="$(addr_of "$key")"
    if [[ "$(qeval "gno.land/r/sys/users.ResolveAddress(\"$a\") != nil")" != "true" ]]; then
      persona_call "$key" "$NAMEREG" Register "$name"; log "$key registered $name"
    fi
  done
fi

# 4. quests (10 points each, capped by the source cap); skip what is already on chain
for row in "${PERSONAS[@]}"; do
  IFS='|' read -r key _ quests _ <<<"$row"
  a="$(addr_of "$key")"
  have="$(qeval "$BARKEEP.SourceScoreOf(\"$a\", \"$QUESTBOARD\")")"
  todo=$(( quests - (have + 5) / 10 ))
  for ((i = 0; i < todo; i++)); do persona_call "$key" "$QUESTBOARD" Complete "q$i"; done
  if (( todo > 0 )); then log "$key completed $todo quest(s)"; fi
done

# 5. polls
count="$(qeval "$TOWNHALL.PollCount()")"
for ((i = count; i < ${#POLLS[@]}; i++)); do
  IFS='|' read -r key question opts <<<"${POLLS[$i]}"
  persona_call "$key" "$TOWNHALL" CreatePoll "$question" "$opts"; log "$key opened poll $((i + 1))"
done

# 6. votes
for row in "${PERSONAS[@]}"; do
  IFS='|' read -r key _ _ votes _ <<<"$row"
  [[ "$votes" == "-" ]] && continue
  a="$(addr_of "$key")"
  IFS=',' read -ra vs <<<"$votes"
  for v in "${vs[@]}"; do
    poll="${v%%:*}" opt="${v##*:}"
    if [[ "$(qeval "$TOWNHALL.HasVoted($poll, \"$a\")")" != "true" ]]; then
      persona_call "$key" "$TOWNHALL" Vote "$poll" "$opt"; log "$key voted $opt on poll $poll"
    fi
  done
done

# 7. lounge: signatures are not indexed per address, so sign only while the total is short
want=0
for row in "${PERSONAS[@]}"; do if [[ "${row##*|}" != "-" ]]; then want=$((want + 1)); fi; done
have="$(qeval "$LOUNGE.Signatures()")"
if (( have < want )); then
  for row in "${PERSONAS[@]}"; do
    msg="${row##*|}"; key="${row%%|*}"
    [[ "$msg" == "-" ]] && continue
    persona_call "$key" "$LOUNGE" Sign "$msg"; log "$key signed the lounge"
  done
fi

# 8. personas.json (addresses + label; no key material)
{
  printf '{\n  "chainId": "%s",\n  "realmBase": "%s",\n  "personas": [\n' "$CHAIN_ID" "$REALM_BASE"
  n=${#PERSONAS[@]}; i=0
  for row in "${PERSONAS[@]}"; do
    IFS='|' read -r key name _ <<<"$row"; i=$((i + 1))
    a="$(addr_of "$key")"; score="$(qeval "$BARKEEP.ScoreOf(\"$a\")")"; tier="$(qeval "$BARKEEP.TierOf(\"$a\")")"
    [[ "$name" == "-" ]] && name=""
    printf '    {"key": "%s", "address": "%s", "name": "%s", "label": "demo persona", "score": %s, "tier": "%s"}%s\n' \
      "$key" "$a" "$name" "$score" "$tier" "$([[ $i -lt $n ]] && echo ,)"
  done
  printf '  ]\n}\n'
} >"$HERE/personas.json"
log "wrote $HERE/personas.json"
