import { RELAY_WS, esc, wireCopyButtons } from './lib/relay';
import { api, type TeamPayload, type RelayEvent, type RelayMember, type Area, type MemoryPayload, type MemoryItem } from './lib/api';
import { LiveRepo, EVENT_CLASS, eventDetail, ago } from './lib/live';
import {
  configured, supabase, loadTeam, createTeam, inviteMember, listInvites, revokeInvite,
  acceptInvite, removeTeamMember, type Team, type Invite,
} from './lib/supabase';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

const authEl = $('#auth')!;
const shellEl = $('#shell')!;
const bootEl = $('#booting')!;
const viewEl = $('#view')!;

let team: Team | null = null;
let role = 'member';
let relayTeam: TeamPayload | null = null;
let live: LiveRepo | null = null;
let currentRepo: string | null = null;

/* ------------------------------------------------------------------ *
 * Auth
 * ------------------------------------------------------------------ */
/**
 * Where a requested team name waits out email confirmation.
 *
 * When a project requires confirmation, sign-up returns no session, so the
 * team cannot be created yet. Without this the name someone typed is lost
 * between clicking the link and signing in, and they land in a team named
 * after their email address instead.
 */
const PENDING_TEAM = 'knoot.pendingTeam';

const rememberTeamName = (name: string): void => {
  try { if (name) localStorage.setItem(PENDING_TEAM, name); } catch { /* private mode */ }
};
const takeTeamName = (): string | null => {
  try {
    const v = localStorage.getItem(PENDING_TEAM);
    localStorage.removeItem(PENDING_TEAM);
    return v;
  } catch { return null; }
};

type Mode = 'signin' | 'signup';
let mode: Mode = location.hash === '#signup' ? 'signup' : 'signin';

function paintAuthMode(): void {
  const signup = mode === 'signup';
  $('#auth-title')!.textContent = signup ? 'Create your account' : 'Sign in';
  $('#auth-sub')!.textContent = signup
    ? 'A team, an agent token, and a live log of every session. No card needed.'
    : 'Manage your team, agent tokens and live sessions.';
  $('#auth-go')!.textContent = signup ? 'Create account' : 'Sign in';
  $('#auth-switch')!.textContent = signup ? 'I already have an account' : 'Create an account';
  ($('#team-field') as HTMLElement).hidden = !signup;
  ($('#auth-team') as HTMLInputElement).required = signup;
  ($('#auth-password') as HTMLInputElement).autocomplete = signup ? 'new-password' : 'current-password';
}

function authMessage(kind: 'err' | 'ok' | 'clear', text = ''): void {
  const err = $('#auth-err') as HTMLElement;
  const ok = $('#auth-ok') as HTMLElement;
  err.hidden = kind !== 'err';
  ok.hidden = kind !== 'ok';
  if (kind === 'err') err.textContent = text;
  if (kind === 'ok') ok.textContent = text;
}

function showAuth(): void {
  bootEl.hidden = true;
  shellEl.hidden = true;
  authEl.hidden = false;
  paintAuthMode();
  if (!configured) {
    authMessage('err', 'Sign-in is not configured on this deployment. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY at build time, or run your own relay and use an agent token.');
    ($('#auth-go') as HTMLButtonElement).disabled = true;
  }
}

$('#auth-switch')!.addEventListener('click', () => {
  mode = mode === 'signup' ? 'signin' : 'signup';
  location.hash = mode === 'signup' ? '#signup' : '';
  authMessage('clear');
  paintAuthMode();
});

$('#auth-reset')!.addEventListener('click', async () => {
  const email = ($('#auth-email') as HTMLInputElement).value.trim();
  if (!email) { authMessage('err', 'Enter your email address first, then choose Forgot password.'); return; }
  try {
    const { error } = await supabase!.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/app/`,
    });
    if (error) throw new Error(error.message);
    authMessage('ok', `Check ${email} for a link to set a new password.`);
  } catch (e) {
    authMessage('err', (e as Error).message);
  }
});

$('#auth-form')!.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = $('#auth-go') as HTMLButtonElement;
  const email = ($('#auth-email') as HTMLInputElement).value.trim();
  const password = ($('#auth-password') as HTMLInputElement).value;
  const teamName = ($('#auth-team') as HTMLInputElement).value.trim();
  authMessage('clear');
  btn.disabled = true;
  btn.textContent = mode === 'signup' ? 'Creating account' : 'Signing in';
  try {
    const sb = supabase!;
    if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        // The address is already an account, usually from an earlier attempt
        // that failed later on. Sign-in is what they want; put them there.
        if (/already|registered|exists/i.test(error.message)) {
          mode = 'signin';
          location.hash = '';
          paintAuthMode();
          authMessage('ok', `${email} already has an account. Sign in with its password, or choose Forgot password.`);
          ($('#auth-password') as HTMLInputElement).focus();
          return;
        }
        throw new Error(error.message);
      }
      rememberTeamName(teamName);
      if (!data.session) {
        // The project requires email confirmation, so there is no session to
        // create a team with yet. It is made on first sign-in instead.
        authMessage('ok', `Check ${email} to confirm your address, then sign in. Your team is created when you first sign in.`);
        mode = 'signin';
        paintAuthMode();
        return;
      }
      await createTeam(teamName || `${email.split('@')[0]}'s team`);
      takeTeamName();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    }
    await boot();
  } catch (e) {
    authMessage('err', (e as Error).message);
  } finally {
    btn.disabled = false;
    paintAuthMode();
  }
});

$('#signout')!.addEventListener('click', async () => {
  live?.close();
  await supabase?.auth.signOut();
  team = null;
  location.hash = '';
  showAuth();
});

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */
const ROUTES = ['start', 'sessions', 'memory', 'history', 'repositories', 'tokens', 'rooms', 'team', 'settings'] as const;
type Route = (typeof ROUTES)[number];

const connected = (): boolean => Boolean(relayTeam?.repos?.length);

/**
 * Until a repository has reached the relay there is nothing for the other
 * tabs to show, so the console opens on the flow that gets one connected.
 * After that, the live log is home and Get started stays a tab.
 */
function route(): Route {
  const h = location.hash.replace('#', '') as Route;
  if (ROUTES.includes(h)) return h;
  return connected() ? 'sessions' : 'start';
}

function paintTabs(): void {
  const r = route();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.tabs a')) {
    a.classList.toggle('on', a.getAttribute('href') === `#${r}`);
  }
  $('#tab-start')?.classList.toggle('done', progress().current === 0);
}

function render(): void {
  paintTabs();
  live?.close();
  live = null;
  stopSetupPoll();
  switch (route()) {
    case 'start': return viewStart();
    case 'sessions': return viewSessions();
    case 'memory': return viewMemory();
    case 'history': return viewHistory();
    case 'repositories': return viewRepositories();
    case 'tokens': return viewTokens();
    case 'rooms': return viewRooms();
    case 'team': return viewTeam();
    case 'settings': return viewSettings();
  }
}

/* ---- sessions: the live instrument ---- */
function viewSessions(): void {
  const repos = relayTeam?.repos ?? [];
  if (!repos.length) { viewNotConnected('Sessions', 'Every agent currently working a repository your team has connected, and the event log behind them.', 'The log fills in on its own the moment a daemon on an enrolled repository reaches the relay.'); return; }
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Sessions</h1>
          <p>Every agent currently working a repository your team has connected, and the event log behind them.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Live</h2>
          ${repos.length
            ? `<select class="picker" id="repo-pick" aria-label="Repository">${repos
                .map((r) => `<option value="${esc(r.repo)}">${esc(r.repo)}</option>`).join('')}</select>`
            : ''}
          <span class="state" id="conn">idle</span>
          <div class="right"><div class="counts" id="counts"></div></div>
        </div>
        <div id="presence"></div>
        <div class="log" id="log">
          <div class="row h"><span>time</span><span>agent</span><span>event</span><span>detail</span></div>
          <div id="log-rows"></div>
        </div>
      </div>
    </div>`;

  viewEl.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('[data-why]');
    if (!a) return;
    ev.preventDefault();
    openHistory(a.dataset.why!);
  });
  const pick = $('#repo-pick') as HTMLSelectElement;
  if (currentRepo && repos.some((r) => r.repo === currentRepo)) pick.value = currentRepo;
  currentRepo = pick.value;
  pick.addEventListener('change', () => { currentRepo = pick.value; startLive(); });
  startLive();
}

/* ---- get started: the one flow, with progress read from the relay ---- */
/**
 * Every step is checked against what the relay actually knows: a key exists,
 * a repository has connected, a second person is on the team. Nothing is
 * ticked because someone clicked "done", so the page is always honest about
 * how far a team has really got.
 */
let setupPoll: ReturnType<typeof setInterval> | null = null;
function stopSetupPoll(): void {
  if (setupPoll) { clearInterval(setupPoll); setupPoll = null; }
}

/** Where a team is in the flow. `current` is 1-based; 0 once everything is done. */
function progress(): { keys: number; repos: number; people: number; current: number; done: number } {
  const tokens = relayTeam?.tokens ?? [];
  const keys = tokens.filter((t) => !t.revoked).length;
  const repos = relayTeam?.repos?.length ?? 0;
  const people = (relayTeam?.members ?? []).filter((m) => !m.unassigned).length;
  const flags = [keys > 0, keys > 0, repos > 0, repos > 0, people > 1];
  const done = flags.filter(Boolean).length;
  const current = flags.indexOf(false) + 1;
  return { keys, repos, people, current, done };
}

function viewNotConnected(title: string, sub: string, note: string): void {
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div></div>
      <div class="panel">
        <div class="panel-body not-yet">
          <p>Nothing is connected yet. ${esc(note)}</p>
          <a class="btn" href="#start">Get started</a>
        </div>
      </div>
    </div>`;
}

function viewStart(): void {
  const p = progress();
  const cmd = (c: string, id = '') => `<div class="cmd-row"${id ? ` id="${id}"` : ''}><code>${esc(c)}</code><button class="copy" type="button">Copy</button></div>`;
  const cls = (n: number, isDone: boolean) => `step${isDone ? ' done' : n === p.current ? ' now' : ' later'}`;
  const finished = p.current === 0;
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Get started</h1>
          <p>${finished
            ? 'Everything is connected. The live log under Sessions is where the team shows up from here on.'
            : 'Five steps take a team from nothing to a shared log of every agent session. The console watches the relay and ticks each one off as it happens.'}</p>
        </div>
        <div class="actions">${finished ? '<a class="btn" href="#sessions">Open sessions</a>' : ''}</div>
      </div>
      <div class="panel setup">
        <div class="panel-head">
          <h2>${p.done} of 5 done</h2>
          <div class="right">${p.repos
            ? `<span class="state live">${p.repos} repositor${p.repos === 1 ? 'y' : 'ies'} connected</span>`
            : '<span class="state waiting" id="setup-wait"><i></i>waiting for a daemon to reach the relay</span>'}</div>
        </div>
        <div class="panel-body">
          <ol class="steps">
            <li class="${cls(1, p.keys > 0)}">
              <div class="n">1</div>
              <div class="body">
                <h3>Install knoot on the machine where agents run</h3>
                <p>One binary. It is the hook, the daemon and the CLI.</p>
                ${cmd('cargo install --git https://github.com/Ash20pk/knoot')}
              </div>
            </li>
            <li class="${cls(2, p.keys > 0)}" id="step-key">
              <div class="n">2</div>
              <div class="body">
                <h3>Mint a key for that machine</h3>
                <p>${p.keys
                  ? `You have ${p.keys} live key${p.keys === 1 ? '' : 's'}. Use one you saved, or mint another for this machine.`
                  : 'A key names one machine and one person. It is shown once, so keep this tab open until step 3 is done.'}</p>
                <div class="inline-form">
                  <input id="setup-label" maxlength="40" placeholder="Label, such as laptop or ci" value="laptop">
                  <button class="btn${p.keys ? ' quiet' : ''}" id="setup-mint">${p.keys ? 'Mint another' : 'Mint key'}</button>
                </div>
                <div id="setup-key"></div>
                <div class="err" id="setup-err" hidden></div>
              </div>
            </li>
            <li class="${cls(3, p.repos > 0)}">
              <div class="n">3</div>
              <div class="body">
                <h3>Enrol the repository and store the key</h3>
                <p>Run inside the repository. <code>init</code> writes the hook config, which you commit so every clone is enrolled. <code>join</code> checks the key with the relay and stores it for this machine.</p>
                ${cmd(`knoot init --relay ${RELAY_WS}`)}
                ${cmd(`knoot join <key> --relay ${RELAY_WS}`, 'setup-join')}
              </div>
            </li>
            <li class="${cls(4, p.repos > 0)}">
              <div class="n">4</div>
              <div class="body">
                <h3>Start the daemon</h3>
                <p>It answers every hook locally and holds the connection to the relay. Leave it running. ${p.repos ? 'It has reached the relay; the live log is under Sessions.' : 'This page notices the moment it connects.'}</p>
                ${cmd('knoot daemon')}
              </div>
            </li>
            <li class="${cls(5, p.people > 1)}">
              <div class="n">5</div>
              <div class="body">
                <h3>Bring in the rest of the team</h3>
                <p>${p.people > 1
                  ? `${p.people} people are on the team. Each one mints their own key under Agent keys, so nothing is ever attributed to the wrong person.`
                  : 'Each person gets their own key, so the relay can say who wrote what. Invite them under Team; they mint a key when they sign in.'}</p>
                <a class="btn quiet sm" href="#team">${p.people > 1 ? 'Open team' : 'Invite a teammate'}</a>
              </div>
            </li>
          </ol>
        </div>
      </div>
      <p class="setup-foot">Prefer to read first? <a href="/docs/">The docs</a> cover the hook contract and what crosses the wire. Only paths and intent sentences do; never code.</p>
    </div>`;
  wireCopyButtons(viewEl);

  $('#setup-mint')!.addEventListener('click', async () => {
    const btn = $('#setup-mint') as HTMLButtonElement;
    const err = $('#setup-err') as HTMLElement;
    err.hidden = true;
    btn.disabled = true;
    try {
      const label = ($('#setup-label') as HTMLInputElement).value.trim() || 'laptop';
      const j = await api<{ token: string }>('/api/tokens', { method: 'POST', body: JSON.stringify({ label }) });
      $('#setup-key')!.innerHTML = `<div class="reveal">
        <div class="lbl">Your key. This is the only time it is readable; the join command in step 3 now carries it.</div>
        <div class="val">${esc(j.token)}</div></div>`;
      $('#setup-join')!.querySelector('code')!.textContent = `knoot join ${j.token} --relay ${RELAY_WS}`;
      const step = $('#step-key')!;
      step.classList.remove('now', 'later');
      step.classList.add('done');
      btn.textContent = 'Mint another';
      btn.classList.add('quiet');
      await refreshRelayTeam();
      paintTabs();
    } catch (e) {
      err.textContent = (e as Error).message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // The relay is the only thing that knows a repository has arrived, so ask
  // it every few seconds while a step is still waiting on one.
  stopSetupPoll();
  if (!p.repos) {
    setupPoll = setInterval(async () => {
      try {
        await refreshRelayTeam();
        if (relayTeam?.repos?.length) {
          currentRepo = relayTeam.repos[0].repo;
          render();
        }
      } catch { /* keep waiting; the next tick tries again */ }
    }, 4000);
  }
}

function startLive(): void {
  const rowsEl = $('#log-rows')!;
  const logEl = $('#log')!;
  live?.close();
  live = new LiveRepo(
    (e) => appendRow(e, rowsEl, logEl),
    () => { drawPresence(); if (!rowsEl.dataset.seeded) drawLog(rowsEl, logEl); },
    (up) => {
      const el = $('#conn')!;
      el.textContent = up === true ? 'live' : up === false ? 'reconnecting' : 'idle';
      el.className = 'state' + (up === true ? ' live' : up === false ? ' off' : '');
    },
  );
  void live.open(currentRepo!);
}

function rowHtml(e: RelayEvent, entering: boolean): string {
  const k = EVENT_CLASS[e.type] ?? 'plain';
  const t = e.ts ? new Date(e.ts).toLocaleTimeString([], { hour12: false }).slice(0, 8) : '';
  return `<div class="row${k === 'blocked' ? ' is-blocked' : ''}${entering ? ' enter' : ''}">
    <span class="t">${esc(t)}</span><span class="u">${esc(e.user ?? '')}</span>
    <span class="k ${k}">${esc(e.type)}</span><span class="d">${e.path ? `<a href="#history" data-why="${esc(e.path)}">${esc(e.path)}</a>${esc(eventDetail(e).replace(e.path, ''))}` : esc(eventDetail(e))}</span></div>`;
}

function drawLog(rowsEl: Element, logEl: Element): void {
  const evs = live?.events ?? [];
  rowsEl.innerHTML = evs.length
    ? evs.slice(-300).map((e) => rowHtml(e, false)).join('')
    : `<div class="empty">Connected. Nothing has happened in this repository yet.</div>`;
  (rowsEl as HTMLElement).dataset.seeded = '1';
  logEl.scrollTop = logEl.scrollHeight;
}

function appendRow(e: RelayEvent, rowsEl: Element, logEl: Element): void {
  const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
  if (rowsEl.querySelector('.empty')) rowsEl.innerHTML = '';
  rowsEl.insertAdjacentHTML('beforeend', rowHtml(e, true));
  while (rowsEl.children.length > 300) rowsEl.removeChild(rowsEl.firstChild!);
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
}

function drawPresence(): void {
  const box = $('#presence');
  if (!box || !live) return;
  const rows = [...live.sessions.values()];
  const blocked = new Set(
    live.events.slice(-60).filter((e) => e.type === 'claim_denied').map((e) => e.session),
  );
  box.innerHTML = rows.length
    ? `<table class="rows">
        <thead><tr><th>Agent</th><th>Working on</th><th>Holds</th></tr></thead>
        <tbody>${rows.map((s) => {
          const holds = live!.claims.filter((c) => c.session === s.session).map((c) => c.path);
          const isBlocked = blocked.has(s.session) && !holds.length;
          const cls = holds.length ? 'holds' : isBlocked ? 'holds blocked' : 'holds none';
          const txt = holds.length ? holds.join('  ') : isBlocked ? 'blocked, waiting' : 'nothing';
          return `<tr><td class="mono">${esc(s.user ?? s.session.slice(0, 8))}</td>
            <td class="dim intent">${esc(s.intent || 'no stated intent yet')}</td>
            <td class="${cls}">${esc(txt)}</td></tr>`;
        }).join('')}</tbody></table>`
    : '';

  const n = rows.length, c = live.claims.length, b = blocked.size;
  const counts = $('#counts');
  if (counts) {
    counts.innerHTML =
      `<span><b>${n}</b>session${n === 1 ? '' : 's'}</span><span><b>${c}</b>claim${c === 1 ? '' : 's'}</span>` +
      (b ? `<span class="blocked"><b>${b}</b>blocked</span>` : '');
  }
}


/* ---- a repo picker the read-only views share ---- */
function repoPicker(id: string): string {
  const repos = relayTeam?.repos ?? [];
  return `<select class="picker" id="${id}" aria-label="Repository">${repos
    .map((r) => `<option value="${esc(r.repo)}"${r.repo === currentRepo ? ' selected' : ''}>${esc(r.repo)}</option>`).join('')}</select>`;
}
function bindRepoPicker(id: string, then: () => void): void {
  const pick = $(id) as HTMLSelectElement | null;
  if (!pick) return;
  if (!currentRepo || !(relayTeam?.repos ?? []).some((r) => r.repo === currentRepo)) currentRepo = pick.value;
  pick.value = currentRepo!;
  pick.addEventListener('change', () => { currentRepo = pick.value; then(); });
}

/* ---- memory: what the rooms know ---- */
/**
 * The head of every chain the caller's rooms hold, opened by the relay where
 * the deployment lets it. This is the thing the lab proved changes what an
 * agent writes, so it gets a view of its own rather than a footnote on Rooms.
 */
const KIND_LABEL: Record<string, string> = {
  facts: 'fact',
  repo_cache: 'derived',
  session_context: 'session',
};

function viewMemory(): void {
  const repos = relayTeam?.repos ?? [];
  if (!repos.length) { viewNotConnected('Memory', 'What the team has written down about each repository, and who wrote it.', 'Memory is scoped to a repository, so the first fact can only follow the first connection.'); return; }
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Memory</h1>
          <p>What the team has written down about a repository: conventions, decisions, gotchas. Each one names the files it is about and is flagged the moment somebody changes them. Agents read this on the turn they open the same code.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Known</h2>
          ${repoPicker('mem-repo')}
          <input class="picker" id="mem-q" type="search" placeholder="Filter" aria-label="Filter memory">
          <div class="right"><span class="state" id="mem-state"></span></div>
        </div>
        <div id="mem-body"><div class="empty">Loading.</div></div>
      </div>
      <p class="setup-foot">Write one from any enrolled machine: <code>knoot remember --name money --path src/billing.js "all money is integer cents"</code>. Nothing here is derived from a transcript; every line was published on purpose.</p>
    </div>`;

  let all: MemoryPayload | null = null;
  const draw = (): void => {
    const body = $('#mem-body')!;
    const state = $('#mem-state')!;
    if (!all) return;
    const q = (($('#mem-q') as HTMLInputElement).value || '').trim().toLowerCase();
    const items = all.items.filter((i) => !q || JSON.stringify(i).toLowerCase().includes(q));
    const heads = all.items.length;
    state.textContent = all.readable
      ? `${heads} ${heads === 1 ? 'entry' : 'entries'}${all.unreadable ? `, ${all.unreadable} unreadable` : ''}`
      : `${heads} sealed`;
    if (!all.readable) {
      body.innerHTML = `<div class="empty">This relay seals memory end to end (<code>${esc(all.provider)}</code>), so the console can see that ${heads} ${heads === 1 ? 'entry exists' : 'entries exist'} but not what ${heads === 1 ? 'it says' : 'they say'}. Read it on an enrolled machine with <code>knoot recall</code>.</div>${
        heads ? `<table class="rows"><thead><tr><th>Kind</th><th>Written by</th><th>When</th></tr></thead><tbody>${
          items.map((i) => `<tr><td>${esc(KIND_LABEL[i.kind] ?? i.kind)}</td><td>${esc(i.author_email)}</td><td class="dim">${esc(ago(i.created_ts))}</td></tr>`).join('')
        }</tbody></table>` : ''}`;
      return;
    }
    if (!items.length) {
      body.innerHTML = `<div class="empty">${heads
        ? 'Nothing matches that filter.'
        : `Nothing written down for this repository yet. The first fact usually pays for itself the next time somebody opens the file it names.`}</div>`;
      return;
    }
    body.innerHTML = `<div class="facts">${items.map(factHtml).join('')}</div>`;
    for (const a of body.querySelectorAll<HTMLAnchorElement>('[data-why]')) {
      a.addEventListener('click', (ev) => { ev.preventDefault(); openHistory(a.dataset.why!); });
    }
  };

  const load = async (): Promise<void> => {
    $('#mem-body')!.innerHTML = '<div class="empty">Loading.</div>';
    try {
      all = await api<MemoryPayload>(`/api/memory?repo=${encodeURIComponent(currentRepo!)}`);
      draw();
    } catch (e) {
      $('#mem-body')!.innerHTML = `<div class="empty">Could not load memory: ${esc((e as Error).message)}</div>`;
    }
  };
  bindRepoPicker('#mem-repo', () => { void load(); });
  $('#mem-q')!.addEventListener('input', draw);
  void load();
}

function factHtml(i: MemoryItem): string {
  const kind = KIND_LABEL[i.kind] ?? i.kind;
  const title = i.kind === 'session_context'
    ? (i.derived ? 'appears to be working on' : 'plan') : (i.name ?? '');
  return `<article class="fact${i.stale ? ' is-stale' : ''}">
    <div class="fact-head">
      <span class="fact-kind ${esc(i.kind)}">${esc(kind)}</span>
      <h3>${esc(title)}</h3>
      <span class="fact-meta">${esc(i.author_email)} · ${esc(ago(i.created_ts))}${i.area && i.area !== '/' ? ` · ${esc(i.area)}` : ''}</span>
    </div>
    <p class="fact-text">${esc(i.text ?? '')}</p>
    ${i.decisions?.length ? `<ul class="fact-decided">${i.decisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
    ${i.paths?.length ? `<div class="fact-paths">${i.paths.map((p) => `<a href="#history" data-why="${esc(p)}">${esc(p)}</a>`).join('')}</div>` : ''}
    ${i.stale ? `<div class="fact-stale">${esc(i.stale)}</div>` : ''}
  </article>`;
}

/* ---- history: one file's story, read back from the log ---- */
/**
 * The console's `knoot why`. The relay returns every event that names a path
 * plus the intents and messages of whoever touched it, and this renders them
 * as sentences in the same words the CLI uses, so a person at a terminal and
 * a person in a browser are told the same story.
 */
let historyPath = '';
function openHistory(path: string): void {
  historyPath = path;
  location.hash = '#history';
}

function viewHistory(): void {
  const repos = relayTeam?.repos ?? [];
  if (!repos.length) { viewNotConnected('History', 'Why a file is the way it is: who took it, who wrote it, who was blocked, and what was said.', 'History is read back from the log, and the log starts with the first connection.'); return; }
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>History</h1>
          <p>Why a file is the way it is: who set out to change it, who took it and when, who was blocked, who wrote it, and what the team said about it along the way. The same answer <code>knoot why</code> prints.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>File</h2>
          ${repoPicker('why-repo')}
          <form class="why-form" id="why-form">
            <input class="picker wide" id="why-path" placeholder="Path inside the repository, such as src/auth.js" value="${esc(historyPath)}" autocomplete="off" spellcheck="false">
            <button class="btn quiet sm" type="submit">Look up</button>
          </form>
        </div>
        <div id="why-body">${historyPath ? '<div class="empty">Loading.</div>' : '<div class="empty">Type a path, or open one from Memory or the live log.</div>'}</div>
      </div>
    </div>`;

  const load = async (): Promise<void> => {
    const body = $('#why-body')!;
    if (!historyPath) return;
    body.innerHTML = '<div class="empty">Loading.</div>';
    try {
      const [events, mem] = await Promise.all([
        api<RelayEvent[]>(`/api/events?repo=${encodeURIComponent(currentRepo!)}&path=${encodeURIComponent(historyPath)}&limit=400`),
        api<MemoryPayload>(`/api/memory?repo=${encodeURIComponent(currentRepo!)}`).catch(() => null),
      ]);
      const about = (mem?.readable ? mem.items : []).filter((i) => (i.paths ?? []).some((p) => p === historyPath || historyPath.startsWith(p.replace(/\/?$/, '/'))));
      body.innerHTML = storyHtml(historyPath, events, about);
      for (const a of body.querySelectorAll<HTMLAnchorElement>('[data-why]')) {
        a.addEventListener('click', (ev) => { ev.preventDefault(); historyPath = a.dataset.why!; ($('#why-path') as HTMLInputElement).value = historyPath; void load(); });
      }
    } catch (e) {
      body.innerHTML = `<div class="empty">Could not read the log: ${esc((e as Error).message)}</div>`;
    }
  };
  bindRepoPicker('#why-repo', () => { void load(); });
  $('#why-form')!.addEventListener('submit', (ev) => {
    ev.preventDefault();
    historyPath = ($('#why-path') as HTMLInputElement).value.trim().replace(/^\.?\//, '');
    void load();
  });
  void load();
}

/** One event as a sentence, in the CLI's words. Presence alone is left out. */
function storyLine(e: RelayEvent & Record<string, unknown>, name: (s: string) => string): { cls: string; text: string } | null {
  const sess = e.session ?? '';
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '');
  switch (e.type) {
    case 'claim_acquired': return { cls: 'held', text: `${name(sess)} took it${e.intent ? ` — “${e.intent}”` : ''}` };
    case 'claim_denied': return { cls: 'blocked', text: `${name(sess)} was blocked; ${e.holder_user ?? 'someone'} held it` };
    case 'claim_released': return { cls: 'plain', text: `${name(sess)} let it go` };
    case 'file_written': return { cls: 'plain', text: `${name(sess)} wrote it` };
    case 'path_removed': return { cls: 'warn', text: `${name(sess)} ${e.moved ? 'moved' : 'deleted'} it` };
    case 'ungated_write': return { cls: 'warn', text: `${name(sess)} wrote it while ${e.holder_user ?? 'someone'} held it (not stopped, only seen)` };
    case 'cross_branch_overlap': return { cls: 'warn', text: `${name(sess)} touched it on ${e.branch ?? '?'}, ${e.peer_user ?? '?'} on ${s('peer_branch') || '?'} — these meet at merge` };
    case 'stale_read': return { cls: 'warn', text: `${name(sess)} was working from a stale read of it (${e.peer_user ?? 'someone'} had changed it)` };
    case 'create_collision': return { cls: 'blocked', text: `${name(sess)} and ${e.peer_user ?? 'someone'} both created it` };
    case 'path_freed': return { cls: 'wire', text: `freed by ${s('by_user') || 'someone'}` };
    case 'message': return { cls: 'wire', text: `${s('from_user') || e.user || 'someone'} said: “${e.text ?? ''}”` };
    case 'intent_declared': return e.text ? { cls: 'plain', text: `${name(sess)} set out to: ${e.text}` } : null;
    default: return null;
  }
}

function storyHtml(path: string, events: RelayEvent[], about: MemoryItem[]): string {
  const who = new Map<string, string>();
  const name = (s: string) => who.get(s) ?? (s ? s.slice(0, 8) : 'someone');
  const lines: string[] = [];
  for (const e of events) {
    if (e.user && e.session) who.set(e.session, e.user);
    const l = storyLine(e as RelayEvent & Record<string, unknown>, name);
    if (!l) continue;
    const t = e.ts ? new Date(e.ts).toLocaleString([], { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    lines.push(`<div class="story-row"><span class="t">${esc(t)}</span><span class="k ${l.cls}"></span><span class="d">${esc(l.text)}</span></div>`);
  }
  const story = lines.length
    ? `<div class="story">${lines.join('')}</div>`
    : `<div class="empty">${events.length ? 'Only presence on the log — nobody has claimed or written it.' : 'Nothing on the log about this file yet.'}</div>`;
  const known = about.length
    ? `<div class="panel-body"><div class="lbl">What the team knows about it</div><div class="facts">${about.map(factHtml).join('')}</div></div>`
    : '';
  return `<div class="story-path"><code>${esc(path)}</code></div>${story}${known}`;
}

/* ---- repositories ---- */
function viewRepositories(): void {
  const repos = relayTeam?.repos ?? [];
  if (!repos.length) { viewNotConnected('Repositories', 'A repository appears here the first time an agent on it reaches the relay. Nothing to create by hand.', 'Your first one shows up here as soon as its daemon connects.'); return; }
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Repositories</h1>
          <p>A repository appears here the first time an agent on it reaches the relay. Nothing to create by hand.</p>
        </div>
      </div>
      <div class="panel">
        <table class="rows">
          <thead><tr><th>Repository</th><th>Last activity</th><th></th></tr></thead>
          <tbody>${repos.map((r) => `<tr>
            <td class="mono">${esc(r.repo)}</td>
            <td class="dim">${esc(ago(r.last_seen_ts ?? null))}</td>
            <td class="right"><a class="btn quiet sm" href="#sessions" data-repo="${esc(r.repo)}">Open log</a></td>
          </tr>`).join('')}</tbody></table>
      </div>
    </div>`;
  for (const a of viewEl.querySelectorAll<HTMLAnchorElement>('[data-repo]')) {
    a.addEventListener('click', () => { currentRepo = a.dataset.repo!; });
  }
  wireCopyButtons(viewEl);
}

/* ---- agent tokens ---- */
function viewTokens(): void {
  const tokens = relayTeam?.tokens ?? [];
  const liveCount = tokens.filter((t) => !t.revoked).length;
  const members = relayTeam?.members ?? [];
  const orphans = members.filter((m) => m.unassigned);
  const me = relayTeam?.me;
  const canAdmin = me?.role === 'owner' || me?.role === 'admin';
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Agent keys</h1>
          <p>A key belongs to one machine and names one person. That is what lets the relay say who wrote something without taking the agent&rsquo;s word for it &mdash; and what lets one laptop be revoked without touching anybody else. Keys are stored as hashes and can never be shown again.</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Tokens</h2><div class="right"><span class="state">${liveCount} live</span></div></div>
        <div class="panel-body">
          <div class="inline-form">
            <input id="mint-label" maxlength="40" placeholder="Label, such as laptop or ci">
            ${canAdmin && members.length > 1 ? `<select id="mint-member">
              ${members.filter((m) => !m.unassigned).map((m) => `<option value="${esc(m.id)}"${
                m.id === me?.member_id ? ' selected' : ''}>${esc(m.email)}</option>`).join('')}
            </select>` : ''}
            <button class="btn" id="mint-go">Mint key</button>
          </div>
          <div id="mint-out"></div>
          <div class="err" id="tok-err" hidden></div>
        </div>
        ${tokens.length ? `<table class="rows">
          <thead><tr><th>Label</th><th>Belongs to</th><th>Created</th><th>Last used</th><th></th></tr></thead>
          <tbody>${tokens.map((t) => `<tr>
            <td><span class="${t.revoked ? 'strike' : ''}">${esc(t.label || 'unlabelled')}</span>${
              t.revoked ? '<span class="tag dead">revoked</span>' : ''}</td>
            <td class="${t.unassigned ? 'dim' : ''}">${t.unassigned
              ? '<span class="tag">unassigned</span>'
              : esc(t.member_email)}</td>
            <td class="dim">${esc(ago(t.created_ts))}</td>
            <td class="dim">${t.revoked ? '' : esc(ago(t.last_seen_ts))}</td>
            <td class="right">${t.revoked ? '' : `<button class="btn danger sm" data-revoke="${esc(t.id)}">Revoke</button>`}</td>
          </tr>`).join('')}</tbody></table>` : ''}
      </div>

      ${orphans.length ? `<div class="panel">
        <div class="panel-head"><h2>Keys with no owner</h2></div>
        <div class="panel-body">
          <p>These were minted before keys named a person, so they still work but nothing they write can be attributed. Attaching one to yourself does not change the key &mdash; the machine using it carries on &mdash; it only records whose it is.</p>
          <table class="rows" style="margin-top:14px">
            <tbody>${orphans.map((m) => `<tr>
              <td class="mono dim">${esc(m.email.replace('@unassigned.invalid', ''))}</td>
              <td class="right"><button class="btn quiet sm" data-attach="${esc(m.id)}">This is mine</button></td>
            </tr>`).join('')}</tbody></table>
        </div>
      </div>` : ''}

      <p class="setup-foot">Putting a key to work on a machine is steps 1 to 4 of <a href="#start">Get started</a>.</p>
    </div>`;

  wireCopyButtons(viewEl);

  $('#mint-go')!.addEventListener('click', async () => {
    const btn = $('#mint-go') as HTMLButtonElement;
    const err = $('#tok-err') as HTMLElement;
    err.hidden = true;
    btn.disabled = true;
    try {
      const label = ($('#mint-label') as HTMLInputElement).value.trim();
      const member = ($('#mint-member') as HTMLSelectElement | null)?.value;
      const j = await api<{ token: string }>('/api/tokens', {
        method: 'POST',
        body: JSON.stringify(member ? { label, member } : { label }),
      });
      $('#mint-out')!.innerHTML = `<div class="reveal">
        <div class="lbl">New key. This is the only time it is readable.</div>
        <div class="val">${esc(j.token)}</div></div>
        <div class="cmd-row"><code>knoot join ${esc(j.token)} --relay ${esc(RELAY_WS)}</code><button class="copy" type="button">Copy</button></div>`;
      wireCopyButtons($('#mint-out')!);
      await refreshRelayTeam();
    } catch (e) {
      err.textContent = (e as Error).message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-attach]')) {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await api('/api/members/attach', {
          method: 'POST',
          body: JSON.stringify({ from: b.dataset.attach }),
        });
        await refreshRelayTeam();
        viewTokens();
      } catch (e) {
        const err = $('#tok-err') as HTMLElement;
        err.textContent = (e as Error).message;
        err.hidden = false;
        b.disabled = false;
      }
    });
  }

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-revoke]')) {
    b.addEventListener('click', async () => {
      if (!confirm('Revoke this key? The machine using it stops coordinating. It fails open, so its agents keep working alone.')) return;
      b.disabled = true;
      try {
        await api(`/api/tokens/${encodeURIComponent(b.dataset.revoke!)}/revoke`, { method: 'POST' });
        await refreshRelayTeam();
        viewTokens();
      } catch (e) {
        const err = $('#tok-err') as HTMLElement;
        err.textContent = (e as Error).message;
        err.hidden = false;
        b.disabled = false;
      }
    });
  }
}

/* ---- rooms: access groups over areas ---- */
/**
 * A room is a set of people and the `(repo, area)` pairs they work in. Until
 * areas are declared in `.knoot.toml`, every area is `/` — the whole repo —
 * so for most teams this page shows one room called `general` and there is
 * nothing to do here. It earns its keep when a repo is big enough that not
 * everyone should be told about everyone else's edits.
 */
function viewRooms(): void {
  const rooms = relayTeam?.rooms ?? [];
  const members = relayTeam?.members ?? [];
  const repos = relayTeam?.repos ?? [];
  const me = relayTeam?.me;
  const canAdmin = me?.role === 'owner' || me?.role === 'admin';

  const areaLabel = (a: Area): string =>
    a.repo === '*' && a.area === '/' ? 'every repository' : `${a.repo}:${a.area}`;

  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Rooms</h1>
          <p>A room decides who can collide with whom. Everyone in a room sees the live claims, the writes and the shared memory of the areas that room holds. Every team starts with one room over everything, which is the right answer until a repository is big enough to be worth splitting.</p>
        </div>
      </div>

      ${canAdmin ? `<div class="panel">
        <div class="panel-head"><h2>New room</h2></div>
        <div class="panel-body">
          <div class="inline-form">
            <input id="room-name" maxlength="60" placeholder="Room name, such as platform or payments">
            <button class="btn" id="room-go">Create room</button>
          </div>
          <div class="err" id="room-err" hidden></div>
        </div>
      </div>` : ''}

      ${rooms.map((r) => `<div class="panel">
        <div class="panel-head">
          <h2>${esc(r.name)}</h2>
          <div class="right">
            <span class="state">${r.members.length} member${r.members.length === 1 ? '' : 's'}</span>
            ${canAdmin && r.name !== 'general'
              ? `<button class="btn danger sm" data-del-room="${esc(r.id)}">Delete</button>` : ''}
          </div>
        </div>
        <div class="panel-body">
          <div class="lbl">Areas</div>
          <p class="${r.areas.length ? 'mono' : 'dim'}">${r.areas.length
            ? r.areas.map((a) => `${esc(areaLabel(a))}${canAdmin
                ? ` <button class="linkish" data-rm-area="${esc(r.id)}" data-repo="${esc(a.repo)}" data-area="${esc(a.area)}">remove</button>` : ''}`).join(' &middot; ')
            : 'No areas yet &mdash; nobody in this room coordinates on anything.'}</p>
          ${canAdmin ? `<div class="inline-form" style="margin-top:12px">
            <select data-area-repo="${esc(r.id)}">
              <option value="*">every repository</option>
              ${repos.map((x) => `<option value="${esc(x.repo)}">${esc(x.repo)}</option>`).join('')}
            </select>
            <input data-area-path="${esc(r.id)}" maxlength="120" placeholder="Path prefix, or / for the whole repo" value="/">
            <button class="btn quiet" data-add-area="${esc(r.id)}">Add area</button>
          </div>` : ''}

          <div class="lbl" style="margin-top:20px">Members</div>
          ${r.members.length ? `<table class="rows">
            <tbody>${r.members.map((m) => `<tr>
              <td>${esc(m.email)}${m.id === me?.member_id ? '<span class="tag mine">you</span>' : ''}</td>
              <td class="dim">${esc(m.role)}</td>
              <td class="right">${canAdmin
                ? `<button class="btn quiet sm" data-rm-member="${esc(r.id)}" data-member="${esc(m.id)}">Remove</button>` : ''}</td>
            </tr>`).join('')}</tbody></table>` : '<p class="dim">Nobody yet.</p>'}
          ${canAdmin ? (() => {
            const candidates = members.filter((m) => !m.unassigned && !r.members.some((x) => x.id === m.id));
            return candidates.length ? `<div class="inline-form" style="margin-top:12px">
              <select data-member-pick="${esc(r.id)}">
                ${candidates.map((m) => `<option value="${esc(m.id)}">${esc(m.email)}</option>`).join('')}
              </select>
              <button class="btn quiet" data-add-member="${esc(r.id)}">Add to room</button>
            </div>` : '<p class="dim" style="margin-top:10px">Everyone on the team is in this room.</p>';
          })() : ''}
          <div class="err" data-room-err="${esc(r.id)}" hidden></div>
        </div>
      </div>`).join('')}
    </div>`;

  const fail = (room: string, e: unknown): void => {
    const el = viewEl.querySelector<HTMLElement>(`[data-room-err="${room}"]`);
    if (!el) return;
    el.textContent = (e as Error).message;
    el.hidden = false;
  };
  const again = async (): Promise<void> => { await refreshRelayTeam(); viewRooms(); };

  $('#room-go')?.addEventListener('click', async () => {
    const err = $('#room-err') as HTMLElement;
    err.hidden = true;
    const name = ($('#room-name') as HTMLInputElement).value.trim();
    if (!name) { err.textContent = 'A room needs a name.'; err.hidden = false; return; }
    try {
      await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name }) });
      await again();
    } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
  });

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-add-area]')) {
    b.addEventListener('click', async () => {
      const room = b.dataset.addArea!;
      const repo = viewEl.querySelector<HTMLSelectElement>(`[data-area-repo="${room}"]`)!.value;
      const area = viewEl.querySelector<HTMLInputElement>(`[data-area-path="${room}"]`)!.value.trim() || '/';
      try {
        await api(`/api/rooms/${encodeURIComponent(room)}/areas`, {
          method: 'POST', body: JSON.stringify({ repo, area }),
        });
        await again();
      } catch (e) { fail(room, e); }
    });
  }

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-rm-area]')) {
    b.addEventListener('click', async () => {
      const room = b.dataset.rmArea!;
      try {
        await api(`/api/rooms/${encodeURIComponent(room)}/areas`, {
          method: 'POST',
          body: JSON.stringify({ repo: b.dataset.repo, area: b.dataset.area, remove: true }),
        });
        await again();
      } catch (e) { fail(room, e); }
    });
  }

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-add-member]')) {
    b.addEventListener('click', async () => {
      const room = b.dataset.addMember!;
      const member = viewEl.querySelector<HTMLSelectElement>(`[data-member-pick="${room}"]`)?.value;
      if (!member) { fail(room, new Error('Everyone in the team is already in this room.')); return; }
      try {
        await api(`/api/rooms/${encodeURIComponent(room)}/members`, {
          method: 'POST', body: JSON.stringify({ member }),
        });
        await again();
      } catch (e) { fail(room, e); }
    });
  }

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-rm-member]')) {
    b.addEventListener('click', async () => {
      const room = b.dataset.rmMember!;
      try {
        await api(`/api/rooms/${encodeURIComponent(room)}/members`, {
          method: 'POST', body: JSON.stringify({ member: b.dataset.member, remove: true }),
        });
        await again();
      } catch (e) { fail(room, e); }
    });
  }

  for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-del-room]')) {
    b.addEventListener('click', async () => {
      const room = b.dataset.delRoom!;
      if (!confirm('Delete this room? The people in it keep their keys; they stop sharing the areas this room held.')) return;
      try {
        await api(`/api/rooms/${encodeURIComponent(room)}/delete`, { method: 'POST' });
        await again();
      } catch (e) { fail(room, e); }
    });
  }
}

/* ---- team ---- */
async function viewTeam(): Promise<void> {
  const canAdmin = role === 'owner' || role === 'admin';
  const relayMembers = relayTeam?.members ?? [];
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Team</h1>
          <p>Everyone here can see the log and hold keys of their own. You are signed in as ${esc(role)}.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Members</h2></div>
        <div id="members"><div class="empty">Loading members.</div></div>
      </div>
      ${canAdmin && configured ? `<div class="panel">
        <div class="panel-head"><h2>Invite a teammate</h2></div>
        <div class="panel-body">
          <p>An invitation is to a person, not a link anyone can use: it only works for the address it was sent to, and it lapses after seven days. Nothing is emailed from here &mdash; send them the link yourself.</p>
          <div class="inline-form" style="margin-top:14px">
            <input id="inv-email" type="email" placeholder="their@email.com">
            <select id="inv-role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn" id="inv-go">Create invitation</button>
          </div>
          <div id="inv-out"></div>
          <div class="err" id="inv-err" hidden></div>
        </div>
      </div>` : ''}
      ${canAdmin && !configured ? `<div class="panel">
        <div class="panel-head"><h2>Add a teammate</h2></div>
        <div class="panel-body">
          <p>This relay has no sign-in behind it, so there is nobody to invite &mdash; you create the person and hand them a key. The key is shown once and cannot be read again; send it over something private.</p>
          <div class="inline-form" style="margin-top:14px">
            <input id="add-email" type="email" placeholder="their@email.com">
            <input id="add-label" type="text" placeholder="their machine" value="first machine">
            <select id="add-role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn" id="add-go">Add and mint a key</button>
          </div>
          <div id="add-out"></div>
          <div class="err" id="add-err" hidden></div>
        </div>
      </div>` : ''}
      ${configured ? `<div class="panel">
        <div class="panel-head"><h2>Outstanding invitations</h2></div>
        <div id="invites"><div class="empty">Loading invitations.</div></div>
      </div>` : ''}
    </div>`;
  wireCopyButtons(viewEl);

  /** The relay's own member row for a person, which is what holds their keys. */
  const relayMemberFor = (email: string): RelayMember | undefined =>
    relayMembers.find((m) => m.email.toLowerCase() === email.toLowerCase());

  const paintInvites = async (): Promise<void> => {
    try {
      const rows = await listInvites();
      $('#invites')!.innerHTML = rows.length
        ? `<table class="rows"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
           <tbody>${rows.map((i: Invite) => `<tr>
             <td>${esc(i.email)}</td><td class="dim">${esc(i.role)}</td>
             <td class="dim">${esc(ago(Date.parse(i.expires_at)))}</td>
             <td class="right">${canAdmin ? `<button class="btn quiet sm" data-inv-revoke="${esc(i.id)}">Withdraw</button>` : ''}</td>
           </tr>`).join('')}</tbody></table>`
        : `<div class="empty">None outstanding.</div>`;
      for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-inv-revoke]')) {
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await revokeInvite(b.dataset.invRevoke!); await paintInvites(); }
          catch (e) { alert((e as Error).message); b.disabled = false; }
        });
      }
    } catch (e) {
      $('#invites')!.innerHTML = `<div class="empty">Could not load invitations: ${esc((e as Error).message)}</div>`;
    }
  };

  const paintMembers = async (): Promise<void> => {
    try {
      // Where the list comes from depends on what is behind this relay.
      // Supabase owns *people* when there is one; when there is not, the
      // relay's own member rows are the whole truth — which is exactly the
      // case that had no console at all until now.
      const rows: Array<{ user_id: string; email: string; role: string; created_at: string }> =
        configured
          ? await (async () => {
              const sb = supabase!;
              const { data, error } = await sb
                .from('team_members')
                .select('user_id, email, role, created_at');
              if (error) throw new Error(error.message);
              return (data ?? []) as Array<{ user_id: string; email: string; role: string; created_at: string }>;
            })()
          : relayMembers
              .filter((m) => !m.unassigned)
              .map((m) => ({
                // No Supabase user behind them, so no user id. The remove
                // button keys off the relay member id instead.
                user_id: '',
                email: m.email,
                role: m.role,
                created_at: '',
              }));
      $('#members')!.innerHTML = rows.length
        ? `<table class="rows"><thead><tr><th>Email</th><th>Role</th><th>Joined</th><th>Keys</th><th></th></tr></thead>
           <tbody>${rows.map((m) => {
             const rm = relayMemberFor(m.email);
             const keys = (relayTeam?.tokens ?? []).filter((t) => rm && t.member_id === rm.id && !t.revoked).length;
             return `<tr><td>${esc(m.email)}</td><td class="dim">${esc(m.role)}</td>
               <td class="dim">${m.created_at ? esc(ago(Date.parse(m.created_at))) : '&mdash;'}</td>
               <td class="dim">${keys}</td>
               <td class="right">${canAdmin && m.role !== 'owner'
                 ? `<button class="btn danger sm" data-remove="${esc(m.user_id)}" data-email="${esc(m.email)}" data-member="${esc(rm?.id ?? '')}">Remove</button>`
                 : ''}</td></tr>`;
           }).join('')}</tbody></table>`
        : `<div class="empty">Just you so far.</div>`;

      for (const b of viewEl.querySelectorAll<HTMLButtonElement>('[data-remove]')) {
        b.addEventListener('click', async () => {
          if (!confirm(`Remove ${b.dataset.email}? Their keys stop working at once. Nobody else's key changes.`)) return;
          b.disabled = true;
          try {
            // Two systems, two steps: Supabase owns the person, the relay owns
            // their keys and rooms. The relay half is what actually stops a
            // machine coordinating, so it must not be skipped when the member
            // has a row there. With no Supabase there is only the relay half.
            if (configured && b.dataset.remove) await removeTeamMember(b.dataset.remove);
            if (b.dataset.member) {
              await api(`/api/members/${encodeURIComponent(b.dataset.member)}/remove`, { method: 'POST' });
            }
            await refreshRelayTeam();
            await viewTeam();
          } catch (e) { alert((e as Error).message); b.disabled = false; }
        });
      }
    } catch (e) {
      $('#members')!.innerHTML = `<div class="empty">Could not load members: ${esc((e as Error).message)}</div>`;
    }
  };

  $('#add-go')?.addEventListener('click', async () => {
    const err = $('#add-err') as HTMLElement;
    err.hidden = true;
    const email = ($('#add-email') as HTMLInputElement).value.trim();
    const label = ($('#add-label') as HTMLInputElement).value.trim() || 'first machine';
    const addRole = ($('#add-role') as HTMLSelectElement).value;
    if (!email.includes('@')) { err.textContent = 'That does not look like an email address.'; err.hidden = false; return; }
    try {
      const made = await api<{ email: string; role: string; existing: boolean; token: string | null }>(
        '/api/members',
        { method: 'POST', body: JSON.stringify({ email, role: addRole, label }) },
      );
      if (made.existing) {
        err.textContent = `${made.email} is already on this team as ${made.role}. Mint a key for them under Agent keys.`;
        err.hidden = false;
        return;
      }
      $('#add-out')!.innerHTML = `<div class="reveal">
          <div class="lbl">${esc(made.email)}&rsquo;s key. Readable only now.</div>
          <div class="val">${esc(made.token ?? '')}</div>
        </div>
        <div class="cmd-row"><code>knoot join ${esc(made.token ?? '')}</code><button class="copy" type="button">Copy</button></div>`;
      wireCopyButtons($('#add-out')!);
      ($('#add-email') as HTMLInputElement).value = '';
      await refreshRelayTeam();
      await paintMembers();
    } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
  });

  $('#inv-go')?.addEventListener('click', async () => {
    const err = $('#inv-err') as HTMLElement;
    err.hidden = true;
    const email = ($('#inv-email') as HTMLInputElement).value.trim();
    const inviteRole = ($('#inv-role') as HTMLSelectElement).value as Invite['role'];
    if (!email.includes('@')) { err.textContent = 'That does not look like an email address.'; err.hidden = false; return; }
    try {
      const secret = await inviteMember(email, inviteRole);
      const link = `${location.origin}/app/#join=${secret}`;
      $('#inv-out')!.innerHTML = `<div class="reveal">
          <div class="lbl">Send ${esc(email)} this link. It is readable only now.</div>
          <div class="val">${esc(link)}</div>
        </div>
        <div class="cmd-row"><code>${esc(link)}</code><button class="copy" type="button">Copy</button></div>`;
      wireCopyButtons($('#inv-out')!);
      ($('#inv-email') as HTMLInputElement).value = '';
      await paintInvites();
    } catch (e) { err.textContent = (e as Error).message; err.hidden = false; }
  });

  await paintMembers();
  // There are no invitations without a sign-in to invite somebody to, and the
  // panel that would hold them is not rendered.
  if (configured) await paintInvites();
}

/* ---- settings ---- */
function viewSettings(): void {
  viewEl.innerHTML = `
    <div class="page">
      <div class="page-head"><div><h1>Settings</h1><p>Account and relay details.</p></div></div>
      <div class="panel">
        <div class="panel-head"><h2>Relay</h2></div>
        <div class="panel-body">
          <p>Your agents connect to this address. It is the same host that served this page.</p>
          <div class="cmd-row" style="margin-top:14px"><code>${esc(RELAY_WS)}</code><button class="copy" type="button">Copy</button></div>
          <p style="margin-top:16px">Team id <code>${esc(relayTeam?.team_id ?? '')}</code></p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Password</h2></div>
        <div class="panel-body">
          <label class="field" style="max-width:400px;margin-top:0">
            <span>New password</span>
            <input id="new-password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters">
          </label>
          <button class="btn" id="pw-go" style="margin-top:14px">Change password</button>
          <div class="err" id="pw-err" hidden></div>
          <div class="ok" id="pw-ok" hidden></div>
        </div>
      </div>
    </div>`;
  wireCopyButtons(viewEl);

  $('#pw-go')!.addEventListener('click', async () => {
    const err = $('#pw-err') as HTMLElement;
    const ok = $('#pw-ok') as HTMLElement;
    err.hidden = true; ok.hidden = true;
    const password = ($('#new-password') as HTMLInputElement).value;
    if (password.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) { err.textContent = error.message; err.hidden = false; return; }
    ok.textContent = 'Password changed.';
    ok.hidden = false;
    ($('#new-password') as HTMLInputElement).value = '';
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
async function refreshRelayTeam(): Promise<void> {
  relayTeam = await api<TeamPayload>('/api/team');
}

/**
 * An invitation secret parked in the URL fragment.
 *
 * Someone following an invite link is usually not signed in yet, so the token
 * has to survive a sign-up, an email confirmation and a redirect back here.
 * The fragment never reaches the server, and the value is taken out of both
 * the URL and storage the moment it is used.
 */
const PENDING_INVITE = 'knoot.pendingInvite';

function stashInvite(): void {
  const m = location.hash.match(/^#join=(.+)$/);
  if (!m) return;
  try { localStorage.setItem(PENDING_INVITE, m[1]); } catch { /* private mode */ }
  history.replaceState(null, '', `${location.pathname}#team`);
}

function takeInvite(): string | null {
  const m = location.hash.match(/^#join=(.+)$/);
  if (m) {
    history.replaceState(null, '', `${location.pathname}#team`);
    try { localStorage.removeItem(PENDING_INVITE); } catch { /* ignore */ }
    return m[1];
  }
  try {
    const v = localStorage.getItem(PENDING_INVITE);
    localStorage.removeItem(PENDING_INVITE);
    return v;
  } catch { return null; }
}

async function boot(): Promise<void> {
  if (!configured) { showAuth(); return; }
  const { data } = await supabase!.auth.getSession();
  if (!data.session) { stashInvite(); showAuth(); return; }

  bootEl.hidden = false;
  authEl.hidden = true;
  try {
    const invite = takeInvite();
    let found = await loadTeam();
    if (!found && invite) {
      // An invited person must join the team that invited them. Falling
      // through to `createTeam` here would put them in a team of one with the
      // same name they were expecting, which looks like it worked.
      try {
        await acceptInvite(invite);
        found = await loadTeam();
      } catch (e) {
        bootEl.textContent = `That invitation could not be used: ${(e as Error).message}`;
        return;
      }
    }
    if (!found) {
      // First sign-in after confirming: make the team, using the name asked
      // for at sign-up if it survived in this browser.
      const email = data.session.user.email ?? 'your';
      team = await createTeam(takeTeamName() || `${email.split('@')[0]}'s team`);
      role = 'owner';
    } else {
      team = found.team;
      role = found.role;
    }
    await refreshRelayTeam();
  } catch (e) {
    bootEl.textContent = `Could not load your console: ${(e as Error).message}`;
    return;
  }

  $('#team-name')!.textContent = team!.name;
  $('#who-email')!.textContent = data.session.user.email ?? '';
  bootEl.hidden = true;
  shellEl.hidden = false;
  render();
}

addEventListener('hashchange', () => {
  if (shellEl.hidden) { mode = location.hash === '#signup' ? 'signup' : 'signin'; paintAuthMode(); return; }
  render();
});

// Repositories appear as agents connect, so refresh rather than making
// someone reload to find their first one.
setInterval(async () => {
  if (shellEl.hidden || !team) return;
  try {
    const before = (relayTeam?.repos ?? []).map((r) => r.repo).join();
    await refreshRelayTeam();
    const after = (relayTeam?.repos ?? []).map((r) => r.repo).join();
    if (before !== after && route() !== 'sessions') render();
    else if (before !== after && !currentRepo) render();
    paintTabs();
  } catch { /* transient; the next tick tries again */ }
}, 20000);

void boot();
