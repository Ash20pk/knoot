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
  // A real, interdependent project: an invoice endpoint. Three of the four
  // agents must add a shape to the SHARED src/types.js — and they do it FIRST,
  // so the contention shows early: whoever takes types.js holds it, the others
  // find it held and re-plan. The fourth (the endpoint) runs free.
  {
    at: 0, agent: 0, note: 'ash → src/types.js first (Session), then src/auth.js',
    line: cc('Invoice service, and be quick. FIRST: add a `Session` typedef comment to the SHARED file src/types.js as a single Edit. If that edit is refused because a teammate holds the file, tell me who holds it and what they are doing, then skip it. THEN add refreshSession(token) to src/auth.js. One sentence to finish.'),
  },
  {
    at: 2, agent: 1, note: 'priya → src/types.js first (Money), then src/billing.js',
    line: cc('Invoice service, and be quick. FIRST: add a `Money` typedef comment to the SHARED file src/types.js as a single Edit. If that edit is refused because a teammate holds the file, tell me who holds it, then skip it. THEN add discount(items, pct) to src/billing.js. One sentence to finish.'),
  },
  {
    at: 4, agent: 3, note: 'jordan → src/types.js first (Invoice), then test.js',
    line: cc('Invoice service, and be quick. FIRST: add an `Invoice` typedef comment to the SHARED file src/types.js as a single Edit. If that edit is refused because a teammate holds the file, tell me who holds it, then skip it. THEN write a small test.js with a node assert. One sentence to finish.'),
  },
  {
    at: 3, agent: 2, note: 'sam → the endpoint in src/api.js, in parallel — no collision',
    line: cc('Invoice service, and be quick. In src/api.js wire POST /invoice: validate the session token, compute a total, return { total, currency }; 401 if unauthenticated. Edit src/api.js directly. One sentence to finish.'),
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

// type -> [readable label, css class]. The label is what a person reads; the
// class only colours it. Showing the raw event type here was the broken text.
const KIND: Record<string, [string, string]> = {
  session_started: ['joined', 'joined'], intent_declared: ['plans to', 'intent'],
  claim_acquired: ['took', 'claim'], claim_released: ['released', 'released'],
  path_freed: ['freed', 'freed'], message: ['said', 'freed'],
  file_written: ['wrote', 'wrote'], claim_denied: ['BLOCKED', 'blocked'],
  cross_branch_overlap: ['merges', 'merge'],
  path_removed: ['deleted', 'deleted'], stale_read: ['stale', 'stale'],
  create_collision: ['collides', 'create'],
  ungated_write: ['overwrote', 'ungated'], session_ended: ['left', 'left'],
};

const clip = (s: string, n = 52) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
};
const base = (p: string) => String(p).split('/').pop() || p;

function feed(e: any, live: boolean) {
  const [label, cls] = KIND[e.type] || [e.type, 'intent'];
  // Some events carry no user (intent, session end); resolve it from the
  // session we saw start. Never show a raw session hash where a name belongs.
  const who = e.user || sessions.get(e.session)?.user || 'someone';
  let detail = '';
  if (e.type === 'intent_declared') detail = clip(e.text, 60);
  else if (e.type === 'claim_denied') detail = `${base(e.path)} — held by ${e.holder_user}`;
  else if (e.type === 'ungated_write') detail = `${base(e.path)} — over ${e.holder_user}`;
  else if (e.type === 'message') detail = `${e.to || 'all'}: ${clip(e.text || '', 44)}`;
  else if (e.type === 'stale_read') detail = `${base(e.path)} — ${e.peer_user} changed it`;
  else if (e.type === 'create_collision') detail = `${base(e.path)} — also by ${e.peer_user}`;
  else if (e.type === 'session_started' || e.type === 'session_ended') detail = '';
  else if (e.path) detail = e.path;

  const row = document.createElement('div');
  const hot = e.type === 'claim_denied' ? 'blocked' : (e.type === 'ungated_write' ? 'ungated' : '');
  row.className = 'ev ' + hot + (live ? ' new' : '');
  row.innerHTML =
    `<time>${hhmm(e.ts || Date.now())}</time><span class="u" title="${esc(who)}">${esc(who)}</span>` +
    `<span class="k ${cls}">${esc(label)}</span><span class="d" title="${esc(detail)}">${esc(detail)}</span>`;
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
