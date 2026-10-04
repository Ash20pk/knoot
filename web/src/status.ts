import { RELAY_HOST, RELAY_WS } from './lib/relay';
import { paintSiteNav } from './lib/account';

void paintSiteNav();

// One question, asked of the relay itself: GET /api/health. It answers for its
// own process and its event log, which is what the page used to approximate
// by probing four endpoints from the browser and counting a refusal as health.

type Health = {
  status: 'ok' | 'degraded';
  version: string;
  uptime_s: number;
  log: string;
  /** `sealed`: encrypted end to end on the laptops; `readable`: the relay can read it. */
  memory?: 'sealed' | 'readable';
};
type State = 'checking' | 'up' | 'degraded' | 'down';

const $ = (id: string) => document.getElementById(id)!;
const EVERY_MS = 30_000;
const TIMEOUT_MS = 8_000;

$('host').textContent = RELAY_HOST;
const line = document.querySelector('#relay-line');
if (line) line.textContent = `relay ${RELAY_WS}`;

const WORDS: Record<State, [string, string]> = {
  checking: ['Checking', 'Asking the relay how it is.'],
  up: ['Operational', 'The relay is up and its event log answers.'],
  degraded: ['Degraded', 'The relay answers, but its event log does not, so claims and memory may not be recorded.'],
  down: ['Unreachable', 'The relay did not answer. Agents keep working, uncoordinated, until it does.'],
};

function uptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return m ? `${m}m` : `${s}s`;
}

function paint(state: State, h: Health | null, ms: number | null): void {
  $('state').dataset.state = state;
  const [word, text] = WORDS[state];
  $('word').textContent = word;
  $('line').textContent = text;
  $('f-ms').textContent = ms === null ? '—' : `${ms} ms`;
  $('f-log').textContent = h ? h.log : '—';
  // Amber only for a real "unavailable", never for the dash shown when the
  // relay could not be asked at all.
  if (h) $('f-log').dataset.ok = String(h.log === 'ok');
  else delete $('f-log').dataset.ok;
  $('f-up').textContent = h ? uptime(h.uptime_s) : '—';
  $('f-ver').textContent = h ? h.version : '—';
  const mem = $('f-mem');
  mem.innerHTML = !h?.memory
    ? '—'
    : h.memory === 'sealed'
      ? '<a href="/docs/#encryption" title="Encrypted on the laptops; the relay stores ciphertext it cannot read">sealed</a>'
      : '<a href="/docs/#encryption" title="This relay can read the memory it stores">readable</a>';
  $('checked').textContent = `checked ${new Date().toLocaleTimeString([], { hour12: false })}`;
  document.title = state === 'checking' ? 'knoot status' : `knoot status · ${word.toLowerCase()}`;
}

let inflight = false;
async function check(): Promise<void> {
  if (inflight) return;
  inflight = true;
  const t0 = performance.now();
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Math.round(performance.now() - t0);
    const h = (await r.json()) as Health;
    paint(r.ok && h.status === 'ok' ? 'up' : 'degraded', h, ms);
  } catch {
    paint('down', null, null);
  } finally {
    inflight = false;
  }
}

$('again').addEventListener('click', () => { void check(); });
void check();
setInterval(() => { if (!document.hidden) void check(); }, EVERY_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
