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
AGENTS="ash,priya,sam,jordan"
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
  say "seeding $LAB with the invoice-service project …"
  mkdir -p "$LAB/src"
  cat > "$LAB/GOAL.md" <<'EOF'
# Invoice service — shared goal

Four agents, one codebase, one objective. You depend on each other's files.

Done when POST /invoice validates a session token, computes a total with tax
and discount (money in integer cents), and returns { total, currency };
unauthenticated requests get 401; `node test.js` passes.

Owners (you will still collide — src/types.js is shared by three of you):
- ash    — sessions in src/auth.js  (+ a Session type in src/types.js)
- priya  — money in src/billing.js  (+ a Money type in src/types.js)
- sam     — the endpoint in src/api.js
- jordan — test.js                  (+ an Invoice type in src/types.js)
EOF
  cat > "$LAB/src/auth.js" <<'EOF'
// Authentication and session handling.
const sessions = new Map();
function login(user) {
  const token = Math.random().toString(36).slice(2);
  sessions.set(token, { user, createdAt: Date.now() });
  return token;
}
function validateSession(token) {
  const s = sessions.get(token);
  return s || null;
}
module.exports = { login, validateSession };
EOF
  cat > "$LAB/src/billing.js" <<'EOF'
// Invoice calculation. Money is integer cents.
function lineTotal(item) {
  return item.qtyCents ? item.qty * item.unitPriceCents : item.qty * item.unitPriceCents;
}
function invoiceTotal(items, taxRate) {
  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0);
  return Math.round(subtotal * (1 + taxRate));
}
module.exports = { lineTotal, invoiceTotal };
EOF
  cat > "$LAB/src/api.js" <<'EOF'
// HTTP surface.
const { validateSession } = require('./auth');
const { invoiceTotal } = require('./billing');
function handler(req, res) {
  // POST /invoice goes here.
  res.status(404).end();
}
module.exports = { handler };
EOF
  cat > "$LAB/src/types.js" <<'EOF'
// Shared shapes. auth, billing and tests all add to this file — it is the hub.
module.exports = {};
EOF
  echo '// tests go here' > "$LAB/test.js"
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
if [[ ! -f "$LAB/.knoot.toml" ]]; then
  ( cd "$LAB" && "$BIN" init --relay "$URL" >/dev/null )
  printf 'hubs = ["src/types.js"]\n' >> "$LAB/.knoot.toml"
fi

OPEN="http://${ADDR/0.0.0.0/127.0.0.1}/lab"
say "lab is up:  $OPEN"
say "in the page, press  ▶ Run the scenario  and watch the pane on the right."
command -v open >/dev/null && open "$OPEN" || say "open $OPEN in your browser."

cat <<EOF

  what you are about to see
  -------------------------
  FOUR real agents building one invoice service. press ▶ Run the scenario:
  ash    sessions (src/auth.js) + a Session type in the shared src/types.js
  priya  money    (src/billing.js) + a Money type in src/types.js
  sam     the endpoint (src/api.js), depending on auth + billing
  jordan tests (test.js) + an Invoice type in src/types.js

  three of them need the SAME file, src/types.js — a declared hub. watch one
  take it while the others find it held and re-plan; the endpoint runs free.
  the activity pane is the real event stream. stop with:  ./lab/demo.sh stop
EOF
