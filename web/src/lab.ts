// The browser lab: real Claude Code / shell sessions in ptys, hosted by the
// relay, with the coordination log beside them. xterm is bundled — not loaded
// from a CDN — so the lab works offline and cannot break when a CDN moves a
// package path (which is exactly what happened with cdnjs's xterm 5.3.0).
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

// A hosted relay requires a token; a browser cannot set headers on a
// WebSocket, so it travels as ?token= — taken from this page's URL and
// remembered so a reload does not need it again.
const TOKEN = (() => {
  const q = new URLSearchParams(location.search).get('token');
  try {
    if (q) { sessionStorage.setItem('knootToken', q); return q; }
    return sessionStorage.getItem('knootToken') || '';
  } catch (_) { return q || ''; }
})();
const withTok = (u: string) =>
  TOKEN ? u + (u.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(TOKEN) : u;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: any) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const hhmm = (ts: number) => new Date(ts).toLocaleTimeString([], { hour12: false });
const short = (s: any) => String(s).slice(0, 8);

let repo: string | null = null;
let sessions = new Map<string, any>();
let claims: any[] = [];
let agents: string[] = [];
const stats = { writes: 0, blocked: 0, ungated: 0 };
const blockedFlash = new Map<string, number>();     // agent name -> until ts
const panes: { term: any; send: (s: string) => void; fitNow: () => void }[] = [];

const THEME = {
  background: '#12161a', foreground: '#e8ecef', cursor: '#3b7bff',
  black: '#12161a', red: '#ff4a1f', green: '#19a974', yellow: '#f0b429',
  blue: '#3b7bff', magenta: '#b48eff', cyan: '#39c5cf', white: '#e8ecef',
  brightBlack: '#7d868f', brightRed: '#ff7b5c', brightGreen: '#3fc98f',
  brightYellow: '#f5c85c', brightBlue: '#6d9cff', brightMagenta: '#cbb0ff',
  brightCyan: '#5ed5dd', brightWhite: '#ffffff',
};

function mountTerm(idx: number, name: string) {
  const wrap = document.createElement('div');
  wrap.className = 'term';
  wrap.id = `term-${idx}`;
  wrap.innerHTML = `<div class="term-bar">
      <span class="who">${esc(name)}</span><span class="tag" id="tag-${idx}">shell</span>
      <span class="holding" id="hold-${idx}"><span class="chip idle">holding nothing</span></span>
    </div><div class="screen" id="screen-${idx}"></div>`;
  $('terms').appendChild(wrap);

  const term = new Terminal({
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 12, lineHeight: 1.15, cursorBlink: true, scrollback: 6000,
    theme: THEME, allowProposedApi: true,
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open($(`screen-${idx}`));

  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  let ws: WebSocket, dead = false;
  const openWs = () => {
    ws = new WebSocket(withTok(`${proto}${location.host}/term/ws/${idx}`));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => fitNow();
    ws.onmessage = (e) => term.write(new Uint8Array(e.data as ArrayBuffer));
    ws.onclose = () => { if (!dead) setTimeout(openWs, 1500); };
  };
  const fitNow = () => {
    try { fit.fit(); } catch {}
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }));
  };
  const send = (s: string) => { if (ws && ws.readyState === 1) ws.send(new TextEncoder().encode(s)); };
  term.onData((d: string) => send(d));
  new ResizeObserver(() => fitNow()).observe($(`screen-${idx}`));
  openWs();
  panes[idx] = { term, send, fitNow };
}

// ------------------------------------------------------------- the scenario
//
// Driven into the real terminals, so what you watch is genuine agent output
// and the ledger on the right is genuine coordination — nothing is faked.
// Times are seconds from pressing Run.

const MODEL = 'haiku';
const cc = (prompt: string) =>
  `claude -p --permission-mode acceptEdits --model ${MODEL} ${JSON.stringify(prompt)}\r`;


const SCENARIO: { at: number; agent: number; note: string; line: string }[] = [
  // Every pane runs a real `claude -p` session. ash and priya are pointed at
  // the SAME file at the same moment: a genuine race. Whichever claims first
  // holds it; the other's edit meets the live arbiter and it re-plans — which
  // you watch happen in its own pane, and which the activity log records.
  {
    at: 0, agent: 0, note: 'ash takes src/auth.js and starts editing',
    line: cc('Add SEVEN functions to src/auth.js — logout(), revoke(token), rotateKey(), listSessions(), verifyMfa(user), lockAccount(user) and auditLog(event) — each with a JSDoc block and each as its OWN separate Edit call, pausing to re-read the file between edits. Do not batch them. One sentence to finish.'),
  },
  {
    at: 16, agent: 1, note: 'priya is sent at the same file — she finds ash holds it, and re-plans',
    line: cc('Add a rateLimit(user) function to src/auth.js with the Edit tool. If the edit is refused because a teammate is holding the file, tell me who holds it and what they are doing, then stop.'),
  },
  {
    at: 3, agent: 2, note: 'sam works src/billing.js in parallel — no collision',
    line: cc('Add a discount(items, pct) function to src/billing.js and use it in invoiceTotal. Edit the file directly, then stop.'),
  },
];

let running = false;
function runScenario() {
  if (running || !panes.length) return;
  running = true;
  const btn = $('run') as HTMLButtonElement;
  btn.disabled = true; btn.textContent = '● Running…';
  for (const step of SCENARIO) {
    const target = Math.min(step.agent, panes.length - 1);
    setTimeout(() => {
      $('stage').textContent = step.note;
      panes[target]?.send(step.line);
      const bar = $(`term-${target}`);
      bar?.classList.add('active');
      setTimeout(() => bar?.classList.remove('active'), 2000);
    }, step.at * 1000);
  }
  const end = Math.max(...SCENARIO.map((s) => s.at)) + 45;
  setTimeout(() => {
    running = false; btn.disabled = false; btn.textContent = '▶ Run it again';
    $('stage').textContent = '';
  }, end * 1000);
}

// ---------------------------------------------------------------- live wiring

async function boot() {
  const info = await fetch(withTok('/api/terms')).then((r) => r.json()).catch(() => ({ agents: [] }));
  agents = info.agents || [];
  if (!agents.length) {
    $('terms').innerHTML =
      '<div class="empty">No terminals. Start the relay with <code>--lab-dir</code> — or run <code>./lab/demo.sh</code>.</div>';
    ($('run') as HTMLButtonElement).disabled = true;
  } else {
    const box = $('terms');
    if (agents.length > 2) {
      box.classList.add('quad');
      box.style.gridTemplateRows = `repeat(${Math.ceil(agents.length / 2)}, 1fr)`;
    } else {
      box.style.gridTemplateRows = `repeat(${agents.length}, 1fr)`;
    }
    agents.forEach((n, i) => mountTerm(i, n));
    ($('run') as HTMLButtonElement).addEventListener('click', runScenario);
  }

  // The relay tells us the lab's repo id directly, so the activity pane can
  // subscribe before any event exists. `/api/repos` is the fallback for a
  // relay not hosting a lab.
  repo = info.repo || (await fetch(withTok('/api/repos')).then((r) => r.json()).catch(() => []))[0] || null;
  $('repo').textContent = info.dir ? info.dir : (repo || '');
  if (repo) { await history(); connect(); }
  else $('feed').innerHTML = '<div class="empty">No repo yet — start the relay with <code>--lab-dir</code>.</div>';
}

async function history() {
  const evs = await fetch(withTok('/api/events?repo=' + encodeURIComponent(repo!)))
    .then((r) => r.json()).catch(() => []);
  for (const e of evs) apply(e, false);
  render();
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  const ws = new WebSocket(withTok(proto + location.host + '/ws'));
  ws.onopen = () => {
    $('dot').classList.add('on'); $('dot').textContent = 'live';
    $('live-tag').textContent = 'live'; $('live-tag').className = 'tag live';
    ws.send(JSON.stringify({ type: 'hello', repo, daemon: 'lab-web' }));
  };
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.type === 'welcome') {
      sessions = new Map((msg.sessions || []).map((s: any) => [s.session, s]));
      claims = msg.claims || [];
    } else if (msg.type === 'event') {
      apply(msg.event, true);
    }
    render();
  };
  ws.onclose = () => {
    $('dot').classList.remove('on'); $('dot').textContent = 'reconnecting';
    $('live-tag').textContent = 'reconnecting'; $('live-tag').className = 'tag';
    setTimeout(connect, 2000);
  };
}

function apply(e: any, live: boolean) {
  const t = e.type;
  if (t === 'session_started')
    sessions.set(e.session, { session: e.session, user: e.user, branch: e.branch, intent: '', last_seen: e.ts });
  else if (t === 'intent_declared') {
    const s = sessions.get(e.session); if (s) { s.intent = e.text; s.last_seen = e.ts; }
  } else if (t === 'claim_acquired') {
    const c = claims.find((c) => c.session === e.session && c.path === e.path);
    if (c) c.lease_until = e.lease_until;
    else claims.push({ session: e.session, user: e.user, path: e.path, lease_until: e.lease_until });
  } else if (t === 'claim_released')
    claims = claims.filter((c) => !(c.session === e.session && c.path === e.path));
  else if (t === 'file_written') stats.writes++;
  else if (t === 'claim_denied') {
    stats.blocked++;
    if (live) blockedFlash.set(e.user, Date.now() + 9000);
  } else if (t === 'ungated_write') stats.ungated++;
  else if (t === 'session_ended') {
    sessions.delete(e.session);
    claims = claims.filter((c) => c.session !== e.session);
  }
  feed(e, live);
}

const KIND: Record<string, [string, string]> = {
  session_started: ['joined', 'session_started'], intent_declared: ['intent', 'intent_declared'],
  claim_acquired: ['claim', 'claim_acquired'], claim_released: ['released', 'claim_released'],
  path_freed: ['freed', 'path_freed'], message: ['freed', 'message'],
  file_written: ['wrote', 'file_written'], claim_denied: ['blocked', 'claim_denied'],
  cross_branch_overlap: ['merge', 'cross_branch_overlap'],
  path_removed: ['deleted', 'path_removed'], stale_read: ['stale', 'stale_read'],
  create_collision: ['create', 'create_collision'],
  ungated_write: ['ungated', 'ungated_write'], session_ended: ['left', 'session_ended'],
};

function feed(e: any, live: boolean) {
  const [cls, label] = KIND[e.type] || ['intent', e.type];
  const who = e.user || sessions.get(e.session)?.user || short(e.session);
  let detail = '';
  if (e.type === 'intent_declared') detail = e.text;
  else if (e.type === 'claim_denied') detail = `${e.path} — held by ${e.holder_user}`;
  else if (e.type === 'ungated_write') detail = `${e.path} — wrote over ${e.holder_user}`;
  else if (e.type === 'message') detail = `to ${e.to || 'all'}: ${e.text || ''}`;
  else if (e.type === 'stale_read') detail = `${e.path} — ${e.peer_user} changed it`;
  else if (e.type === 'create_collision') detail = `${e.path} — also created by ${e.peer_user}`;
  else if (e.path) detail = e.path;
  else if (e.type === 'session_started') detail = e.branch;

  const row = document.createElement('div');
  const hot = e.type === 'claim_denied' ? 'blocked' : (e.type === 'ungated_write' ? 'ungated' : '');
  row.className = 'ev ' + hot + (live ? ' new' : '');
  row.innerHTML =
    `<time>${hhmm(e.ts || Date.now())}</time><span class="u">${esc(who)}</span>` +
    `<span class="k ${cls}">${label}</span><span class="d">${esc(detail)}</span>`;
  const f = $('feed');
  if (f.querySelector('.empty')) f.innerHTML = '';
  f.appendChild(row);
  while (f.children.length > 500) f.removeChild(f.firstChild!);
  f.scrollTop = f.scrollHeight;
}

function render() {
  const now = Date.now();
  claims = claims.filter((c) => c.lease_until > now);
  $('s-claims').textContent = String(claims.length);
  $('s-writes').textContent = String(stats.writes);
  $('s-blocked').textContent = String(stats.blocked);
  $('s-ungated').textContent = String(stats.ungated);
  $('w-blocked').className = stats.blocked ? 'hot' : '';
  $('w-ungated').className = stats.ungated ? 'warn' : '';

  agents.forEach((name, i) => {
    const box = $(`hold-${i}`); if (!box) return;
    const mine = claims.filter((c) => c.user === name);
    const flash = (blockedFlash.get(name) || 0) > now;
    const pane = $(`term-${i}`);
    if (pane) pane.classList.toggle('blocked', flash);
    let html = mine.length
      ? mine
          .map((c) => `<span class="chip">${esc(c.path)} · ${Math.max(0, Math.round((c.lease_until - now) / 60000))}m</span>`)
          .join('')
      : '<span class="chip idle">holding nothing</span>';
    if (flash) html = '<span class="chip blocked">blocked, re-planning</span>' + html;
    box.innerHTML = html;
  });
}

setInterval(render, 1000);
boot();
