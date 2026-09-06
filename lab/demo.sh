#!/usr/bin/env bash
# knoot — one-command visual demo.
#
# Builds the binary, seeds a small repo, starts a relay that hosts three real
# agent terminals in the browser, and opens the lab. Press "Run the scenario"
# in the page: two agents are pointed at the same file on purpose, a third
# works alongside them, and the activity pane on the right shows the claim,
# the block, and the re-plan as they happen — live, nothing faked.
#
#   ./lab/demo.sh          build, seed, open the browser lab
#   ./lab/demo.sh stop     tear it all down
#
# Requires: a working `claude` on PATH (the terminals run it). The panes run
# `claude -p`, so each pane costs whatever a short Haiku turn costs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/target/release/knoot"
LAB="${KNOOT_DEMO_DIR:-$HOME/knoot-demo}"
ADDR="${KNOOT_DEMO_ADDR:-127.0.0.1:7439}"
URL="ws://${ADDR}/ws"
AGENTS="ash,priya,sam"
SHELL_PROG="${KNOOT_DEMO_SHELL:-$(command -v bash || echo /bin/sh)}"

say()  { printf '\033[36m›\033[0m %s\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "stop" ]]; then
  pkill -f "knoot relay --listen ${ADDR}" 2>/dev/null || true
  pkill -f "knoot daemon" 2>/dev/null || true
  say "stopped."
  exit 0
fi

command -v claude >/dev/null || die "the terminals run \`claude\` — install it and log in first."

say "building knoot (release) …"
( cd "$ROOT" && cargo build --release -q ) || die "build failed"

# ---------------------------------------------------------------- seed repo
if [[ ! -d "$LAB/.git" ]]; then
  say "seeding $LAB …"
  mkdir -p "$LAB/src"
  cat > "$LAB/src/auth.js" <<'EOF'
// Authentication and session handling.
const sessions = new Map();

function login(user) {
  const token = Math.random().toString(36).slice(2);
  sessions.set(token, { user, createdAt: Date.now() });
  return token;
}

module.exports = { login };
EOF
  cat > "$LAB/src/billing.js" <<'EOF'
// Invoice calculation.
function lineTotal(item) {
  return item.qty * item.unitPrice;
}

function invoiceTotal(items, taxRate) {
  const subtotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  return subtotal + subtotal * taxRate;
}

module.exports = { lineTotal, invoiceTotal };
EOF
  ( cd "$LAB" && git init -q && git add -A && git -c user.email=demo@knoot -c user.name=demo commit -qm seed )
fi

# ------------------------------------------------------------- relay + daemon
say "starting relay + daemon …"
pkill -f "knoot relay --listen ${ADDR}" 2>/dev/null || true
sleep 0.3
"$BIN" relay --listen "$ADDR" --lab-dir "$LAB" --agents "$AGENTS" \
    --agent-program "$SHELL_PROG" >/tmp/knoot-demo-relay.log 2>&1 &
sleep 0.6
pgrep -f "knoot daemon" >/dev/null || { "$BIN" daemon >/tmp/knoot-demo-daemon.log 2>&1 & sleep 0.5; }

# Enrol the repo against this relay so the pane agents coordinate through it.
[[ -f "$LAB/.knoot.toml" ]] || ( cd "$LAB" && "$BIN" init --relay "$URL" >/dev/null )

OPEN="http://${ADDR/0.0.0.0/127.0.0.1}/lab"
say "lab is up:  $OPEN"
say "in the page, press  ▶ Run the scenario  and watch the pane on the right."
command -v open >/dev/null && open "$OPEN" || say "open $OPEN in your browser."

cat <<EOF

  what you are about to see
  -------------------------
  three REAL agents, one per pane. press ▶ Run the scenario, then:
  ash    holds src/auth.js and edits it — claims stream in the activity pane
  priya  is sent at the same file, finds ash holds it, and re-plans
  sam    edits src/billing.js in parallel — no collision

  every pane is a live agent log; the activity pane is the real event stream.
  (a hard red "blocked" is opportunistic: cooperative agents usually re-plan
  on the brief before the arbiter has to deny anything — that is the point.)
  stop it all with:  ./lab/demo.sh stop
EOF
