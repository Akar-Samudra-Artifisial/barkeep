#!/usr/bin/env bash
# Post-live runbook for Barkeep /v0: run once all five packages are enabled.
# Runbook and costs: deployments/POSTLIVE.md.
#
# Usage: scripts/postlive/postlive.sh <check|admin|smoke|seed|all>
#   check  read-only: status of the 5 packages, admin key, admin balance
#   admin  SetSourceTier(questboard|townhall, "verified") when not already verified
#   smoke  read-only render/qeval checks + 1 questboard.Complete from a persona key,
#          then asserts that the persona's score went up
#   seed   scripts/seed/seed.sh with SEED_COUNT personas (default 8)
#   all    check → admin → smoke → seed
#
# Safety:
#   DRY_RUN=1 (default)  print every gnokey tx command, broadcast nothing
#   DRY_RUN=0            broadcast, only when CHAIN_ID and REMOTE are both set
#                        explicitly in the environment (no implicit target)
#   Every tx is simulated first (-simulate only); gas-wanted comes from the
#   simulation (+20%). Passphrases go to gnokey on stdin, never in argv or logs.
#
# Env:
#   CHAIN_ID / REMOTE    target (defaults for read-only: onyx-1 + Onyx RPC)
#   ADMIN_KEY            barkeep-deployer        ADMIN_HOME  gnokey default home
#   ADMIN_PASSPHRASE     else read via: secret get "$ADMIN_SECRET"
#   ADMIN_SECRET         "Gno Onyx — barkeep-deployer keyring passphrase"
#   KEYS_HOME            scripts/seed/.keys (persona keybase, empty passphrase)
#   SMOKE_KEY            smoke   (created in KEYS_HOME and funded when missing)
#   SMOKE_FUND_UGNOT     2000000
#   SEED_COUNT           8
#   GAS_FEE              100000ugnot
#   MIN_ADMIN_UGNOT      60000000 (refuse to start a tx stage below this)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NS="g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p"

# Remember whether the target was given explicitly before applying defaults.
TARGET_EXPLICIT=0
if [[ -n "${CHAIN_ID:-}" && -n "${REMOTE:-}" ]]; then TARGET_EXPLICIT=1; fi
CHAIN_ID="${CHAIN_ID:-onyx-1}"
REMOTE="${REMOTE:-https://rpc.onyx.testnets.gno.land:443}"
DRY_RUN="${DRY_RUN:-1}"
ADMIN_KEY="${ADMIN_KEY:-barkeep-deployer}"
ADMIN_HOME="${ADMIN_HOME:-}"
ADMIN_SECRET="${ADMIN_SECRET:-Gno Onyx — barkeep-deployer keyring passphrase}"
KEYS_HOME="${KEYS_HOME:-$ROOT/scripts/seed/.keys}"
SMOKE_KEY="${SMOKE_KEY:-smoke}"
SMOKE_FUND_UGNOT="${SMOKE_FUND_UGNOT:-2000000}"
SEED_COUNT="${SEED_COUNT:-8}"
GAS_FEE="${GAS_FEE:-100000ugnot}"
MIN_ADMIN_UGNOT="${MIN_ADMIN_UGNOT:-60000000}"
GNOKEY="${GNOKEY:-gnokey}"

PKG_RENOWN="gno.land/p/$NS/renown/v0"
BARKEEP="gno.land/r/$NS/barkeep/v0"
QUESTBOARD="gno.land/r/$NS/questboard/v0"
TOWNHALL="gno.land/r/$NS/townhall/v0"
LOUNGE="gno.land/r/$NS/lounge/v0"
# Order matters for approval: renown → barkeep → dependents.
PACKAGES=("$PKG_RENOWN" "$BARKEEP" "$QUESTBOARD" "$TOWNHALL" "$LOUNGE")
SOURCES=("$QUESTBOARD" "$TOWNHALL")

log() { printf '[postlive] %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }
ok() { log "ok   $*"; }

broadcasting() { [[ "$DRY_RUN" == "0" ]]; }

guard_broadcast() {
  if broadcasting && (( TARGET_EXPLICIT == 0 )); then
    die "DRY_RUN=0 needs CHAIN_ID and REMOTE set explicitly (got CHAIN_ID='${CHAIN_ID}' REMOTE='${REMOTE}' from defaults)"
  fi
  if broadcasting; then log "BROADCAST mode: chain=$CHAIN_ID remote=$REMOTE"
  else log "DRY_RUN mode: tx commands are printed, nothing is sent"; fi
}

# ------------------------------------------------------------------ queries
query_data() { # PATH DATA -> the "data:" payload (may span lines)
  local out
  out="$("$GNOKEY" query "$1" -data "$2" -remote "$REMOTE" 2>&1)" || die "query $1 $2: $(printf '%s' "$out" | tail -1)"
  printf '%s\n' "$out" | sed -n '/^data: /,$p' | sed '1s/^data: //'
}

# qeval EXPR -> raw value inside "(value type)"; strings are unquoted.
qeval() {
  local out
  out="$(query_data vm/qeval "$1")"
  [[ -n "$out" ]] || die "qeval $1 returned no data"
  if [[ "$out" =~ ^\(\"(.*)\"\ string\)$ ]]; then printf '%b' "${BASH_REMATCH[1]}"
  else printf '%s' "$out" | sed -E 's/^\((.*) [^ ]+\)$/\1/; s/^"(.*)"$/\1/'; fi
}

pkg_status() { # PKGPATH -> status ("live", "active", "inert", "absent", ...)
  local out
  out="$("$GNOKEY" query vm/qpkgmeta_json -data "$1" -remote "$REMOTE" 2>&1)" || { echo "query-error"; return; }
  out="$(printf '%s\n' "$out" | sed -n 's/^data: //p')"
  local st
  st="$(printf '%s' "$out" | sed -n 's/.*"status":"\([a-z_-]*\)".*/\1/p')"
  if [[ -z "$st" ]]; then st="absent"; fi
  if [[ "$out" == *'"pending":true'* ]]; then st="$st(pending)"; fi
  printf '%s' "$st"
}

balance() { "$GNOKEY" query "bank/balances/$1" -remote "$REMOTE" 2>/dev/null | sed -n 's/^data: "\([0-9]*\)ugnot".*/\1/p'; }

key_addr() { # KEY HOME
  local homeflag=()
  if [[ -n "$2" ]]; then homeflag=(-home "$2"); fi
  "$GNOKEY" list ${homeflag[@]+"${homeflag[@]}"} 2>/dev/null | sed -n "s/^[0-9]*\. $1 ([a-z]*) - addr: \(g1[0-9a-z]*\).*/\1/p"
}

ugnot_fmt() { awk -v u="${1:-0}" 'BEGIN { printf "%.2f GNOT", u / 1000000 }'; }

# ------------------------------------------------------------------ check
NOT_LIVE=()
check_packages() {
  NOT_LIVE=()
  local p st
  for p in "${PACKAGES[@]}"; do
    st="$(pkg_status "$p")"
    case "$st" in
      live|active) ok "$st  $p" ;;
      *) log "WAIT $st  $p"; NOT_LIVE+=("$p ($st)") ;;
    esac
  done
}

require_live() {
  check_packages
  if (( ${#NOT_LIVE[@]} > 0 )); then
    log "not live yet (${#NOT_LIVE[@]}/${#PACKAGES[@]}):"
    local p; for p in "${NOT_LIVE[@]}"; do log "  - $p"; done
    log "if renown/barkeep are live but a dependent stays inert/absent, it may need a resubmit (gnolang/gno#6519, gpao#6114); see deployments/POSTLIVE.md"
    die "stopping: $1 needs all five packages live"
  fi
}

ADMIN_ADDR=""
check_admin() {
  ADMIN_ADDR="$(key_addr "$ADMIN_KEY" "$ADMIN_HOME")"
  [[ -n "$ADMIN_ADDR" ]] || die "admin key '$ADMIN_KEY' not found in gnokey keybase"
  local bal; bal="$(balance "$ADMIN_ADDR")"; bal="${bal:-0}"
  log "admin $ADMIN_KEY $ADMIN_ADDR balance $(ugnot_fmt "$bal")"
  if (( bal < MIN_ADMIN_UGNOT )); then log "WARN admin balance below MIN_ADMIN_UGNOT ($(ugnot_fmt "$MIN_ADMIN_UGNOT"))"; fi
}

check_onchain_admin() {
  local onchain; onchain="$(qeval "$BARKEEP.Admin()")"
  [[ "$onchain" == "$ADMIN_ADDR" ]] || die "Barkeep admin on chain is $onchain, not $ADMIN_KEY ($ADMIN_ADDR)"
  ok "Barkeep.Admin() == $ADMIN_KEY"
}

cmd_check() {
  log "chain=$CHAIN_ID remote=$REMOTE"
  check_admin
  check_packages
  if (( ${#NOT_LIVE[@]} > 0 )); then
    log "RESULT: ${#NOT_LIVE[@]} package(s) not live — admin/smoke/seed will refuse to run:"
    local p; for p in "${NOT_LIVE[@]}"; do log "  - $p"; done
    return 2
  fi
  check_onchain_admin
  local s; for s in "${SOURCES[@]}"; do log "source $s tier='$(qeval "$BARKEEP.SourceTier(\"$s\")")'"; done
  log "RESULT: all five packages live"
}

# ------------------------------------------------------------------ tx
ADMIN_PASS_LOADED=0
load_admin_pass() {
  (( ADMIN_PASS_LOADED )) && return
  if [[ -z "${ADMIN_PASSPHRASE:-}" ]]; then
    command -v secret >/dev/null || die "ADMIN_PASSPHRASE unset and 'secret' CLI not found"
    ADMIN_PASSPHRASE="$(secret get "$ADMIN_SECRET")" || die "secret get failed for the admin passphrase item"
  fi
  [[ -n "$ADMIN_PASSPHRASE" ]] || die "empty admin passphrase"
  export ADMIN_PASSPHRASE
  ADMIN_PASS_LOADED=1
}

# tx_call KEY HOME PASSKIND PKG FUNC [ARGS...]; PASSKIND = admin|empty.
# Simulates first, then broadcasts with gas-wanted = simulated estimate + 20%.
tx_call() {
  local key="$1" home="$2" passkind="$3" pkg="$4" fn="$5"; shift 5
  local base=() a
  if [[ -n "$home" ]]; then base+=(-home "$home"); fi
  base+=(-insecure-password-stdin -pkgpath "$pkg" -func "$fn")
  for a in "$@"; do base+=(-args "$a"); done
  base+=(-gas-fee "$GAS_FEE" -broadcast -chainid "$CHAIN_ID" -remote "$REMOTE")
  if ! broadcasting; then
    printf 'DRY_RUN: <passphrase on stdin> | %s maketx call' "$GNOKEY"
    printf ' %q' "${base[@]}" -gas-wanted "<simulated+20%>" "$key"; printf '\n'
    return 0
  fi
  local pass=""
  if [[ "$passkind" == admin ]]; then load_admin_pass; pass="$ADMIN_PASSPHRASE"; fi
  local out est
  if ! out="$(printf '%s\n' "$pass" | "$GNOKEY" maketx call "${base[@]}" -gas-wanted 100000000 -simulate only "$key" 2>&1)"; then
    die "simulate $pkg.$fn($*) as $key failed: $(printf '%s\n' "$out" | grep -m1 -iE 'panic|error|Data:' || printf '%s' "$out" | tail -1)"
  fi
  est="$(printf '%s\n' "$out" | sed -n 's/.*estimated gas usage: \([0-9]*\).*/\1/p' | head -1)"
  [[ -n "$est" ]] || die "simulate $pkg.$fn: no gas estimate in output"
  local want=$(( est * 12 / 10 ))
  log "simulated $fn as $key: gas $est → gas-wanted $want"
  if ! out="$(printf '%s\n' "$pass" | "$GNOKEY" maketx call "${base[@]}" -gas-wanted "$want" "$key" 2>&1)"; then
    die "broadcast $pkg.$fn($*) as $key failed: $(printf '%s\n' "$out" | grep -m1 -iE 'panic|error|Data:' || printf '%s' "$out" | tail -1)"
  fi
  log "tx $fn: $(printf '%s\n' "$out" | sed -n 's/^TX HASH: *//p') gas-used $(printf '%s\n' "$out" | sed -n 's/^GAS USED: *//p')"
}

tx_send() { # FROM_KEY TO_ADDR UGNOT (admin)
  local base=()
  if [[ -n "$ADMIN_HOME" ]]; then base+=(-home "$ADMIN_HOME"); fi
  base+=(-insecure-password-stdin -to "$2" -send "${3}ugnot" -gas-fee "$GAS_FEE" -gas-wanted 2000000
         -broadcast -chainid "$CHAIN_ID" -remote "$REMOTE")
  if ! broadcasting; then
    printf 'DRY_RUN: <passphrase on stdin> | %s maketx send' "$GNOKEY"; printf ' %q' "${base[@]}" "$1"; printf '\n'
    return 0
  fi
  load_admin_pass
  local out
  out="$(printf '%s\n' "$ADMIN_PASSPHRASE" | "$GNOKEY" maketx send "${base[@]}" -simulate only "$1" 2>&1)" \
    || die "simulate send to $2 failed: $(printf '%s' "$out" | tail -1)"
  out="$(printf '%s\n' "$ADMIN_PASSPHRASE" | "$GNOKEY" maketx send "${base[@]}" "$1" 2>&1)" \
    || die "send to $2 failed: $(printf '%s' "$out" | tail -1)"
  log "funded $2 with $(ugnot_fmt "$3")"
}

# ------------------------------------------------------------------ admin
cmd_admin() {
  guard_broadcast
  check_admin
  require_live admin
  check_onchain_admin
  local s tier
  for s in "${SOURCES[@]}"; do
    tier="$(qeval "$BARKEEP.SourceTier(\"$s\")")"
    case "$tier" in
      verified) ok "already verified: $s" ;;
      unverified)
        tx_call "$ADMIN_KEY" "$ADMIN_HOME" admin "$BARKEEP" SetSourceTier "$s" verified
        if broadcasting; then
          tier="$(qeval "$BARKEEP.SourceTier(\"$s\")")"
          [[ "$tier" == verified ]] || die "after SetSourceTier, $s is '$tier'"
          ok "verified $s"
        fi ;;
      "") die "source $s is not registered in Barkeep (its init did not run?)" ;;
      *) die "source $s has tier '$tier'; refusing to change it automatically" ;;
    esac
  done
}

# ------------------------------------------------------------------ smoke
cmd_smoke() {
  guard_broadcast
  check_admin
  require_live smoke
  local render s tier lb
  render="$(query_data vm/qrender "$BARKEEP:")"
  [[ "$render" == *"# Barkeep"* ]] || die "Barkeep Render(\"\") has no '# Barkeep' heading"
  ok "Render(\"\") $(printf '%s\n' "$render" | wc -l | tr -d ' ') lines"
  for s in "${SOURCES[@]}"; do
    tier="$(qeval "$BARKEEP.SourceTier(\"$s\")")"
    if [[ "$tier" == verified ]]; then ok "source verified: $s"
    elif broadcasting; then die "source $s tier is '$tier' (run: postlive.sh admin)"
    else log "WARN source $s tier is '$tier' (admin stage would verify it)"; fi
  done
  # qeval keeps the JSON quotes escaped (\"), so drop backslashes before matching.
  lb="$(qeval "$BARKEEP.LeaderboardJSON(0, 5)")"; lb="${lb//\\/}"
  [[ "$lb" == *'"items":['* ]] || die "LeaderboardJSON has no items field: ${lb:0:120}"
  ok "LeaderboardJSON total=$(printf '%s' "$lb" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')"
  [[ "$(query_data vm/qrender "$BARKEEP:sources")" == *questboard* ]] || die "Render(\"sources\") does not list questboard"
  ok "Render(\"sources\") lists questboard"

  # One write: questboard.Complete from the smoke persona must raise its score.
  local addr before after
  addr="$(key_addr "$SMOKE_KEY" "$KEYS_HOME")"
  if [[ -z "$addr" ]]; then
    if ! broadcasting; then
      log "DRY_RUN: would create key '$SMOKE_KEY' in $KEYS_HOME, fund it $(ugnot_fmt "$SMOKE_FUND_UGNOT") and call Complete"
      tx_send "$ADMIN_KEY" "<$SMOKE_KEY address>" "$SMOKE_FUND_UGNOT"
      tx_call "$SMOKE_KEY" "$KEYS_HOME" empty "$QUESTBOARD" Complete smoke-1
      return 0
    fi
    mkdir -p "$KEYS_HOME"; chmod 700 "$KEYS_HOME"
    printf '\n\n' | "$GNOKEY" add -home "$KEYS_HOME" -insecure-password-stdin "$SMOKE_KEY" >/dev/null 2>&1 || die "create key $SMOKE_KEY"
    addr="$(key_addr "$SMOKE_KEY" "$KEYS_HOME")"
    log "created key $SMOKE_KEY $addr"
  fi
  local bal; bal="$(balance "$addr")"; bal="${bal:-0}"
  if (( bal < SMOKE_FUND_UGNOT / 2 )); then tx_send "$ADMIN_KEY" "$addr" "$(( SMOKE_FUND_UGNOT - bal ))"; fi
  before="$(qeval "$BARKEEP.ScoreOf(\"$addr\")")"
  tx_call "$SMOKE_KEY" "$KEYS_HOME" empty "$QUESTBOARD" Complete "smoke-$(date +%s)"
  broadcasting || return 0
  after="$(qeval "$BARKEEP.ScoreOf(\"$addr\")")"
  if (( after > before )); then ok "ScoreOf($SMOKE_KEY) $before → $after"
  else die "ScoreOf($SMOKE_KEY) did not rise: $before → $after (source paused or at cap?)"; fi
}

# ------------------------------------------------------------------ seed
cmd_seed() {
  guard_broadcast
  if ! [[ "$SEED_COUNT" =~ ^[0-9]+$ ]] || (( SEED_COUNT < 2 || SEED_COUNT > 10 )); then
    die "SEED_COUNT must be 2..10 (got '$SEED_COUNT')"
  fi
  check_admin
  require_live seed
  local envs=(CHAIN_ID="$CHAIN_ID" REMOTE="$REMOTE" REALM_BASE="gno.land/r/$NS/{name}/v0" SEED_COUNT="$SEED_COUNT"
              KEYS_HOME="$KEYS_HOME" ADMIN_KEY="$ADMIN_KEY" ADMIN_HOME="$ADMIN_HOME" GAS_FEE="$GAS_FEE")
  if [[ "$CHAIN_ID" != dev ]]; then envs+=(SEED_ALLOW_REMOTE=1); fi
  if ! broadcasting; then
    printf 'DRY_RUN: ADMIN_PASSPHRASE=<from secret store>'; printf ' %q' "${envs[@]}"; printf ' %q\n' "$ROOT/scripts/seed/seed.sh"
    log "seed estimate: $SEED_COUNT personas × ~5 GNOT funding + ~0.1 GNOT fee per tx"
    return 0
  fi
  load_admin_pass
  env "${envs[@]}" "$ROOT/scripts/seed/seed.sh"
  ok "seed finished ($SEED_COUNT personas)"
}

# ------------------------------------------------------------------ main
case "${1:-}" in
  check) cmd_check ;;
  admin) cmd_admin ;;
  smoke) cmd_smoke ;;
  seed)  cmd_seed ;;
  all)   cmd_check && cmd_admin && cmd_smoke && cmd_seed ;;
  *) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 64 ;;
esac
