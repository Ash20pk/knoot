// The C4 model of knoot, in three.js: four zoom levels over one system.
//
//   1 Context     who uses knoot and what it talks to
//   2 Containers  the processes and stores
//   3 Components  inside knootd and inside the relay
//   4 Code        the event log, replayed by two copies of one state machine
//
// Same renderer rule as field.ts: WebGPU where there is some, WebGL2 where not;
// when neither exists mountC4 throws and the page falls back to its text diagram.
// Packets running along the links are the story: a request goes out, a brief or
// a refusal comes back. Colour keeps its meaning from the rest of the site —
// green is held / healthy, blue is a message, red is a refusal, amber a warning.
//
// Pointing at a box names it; the camera leans toward the pointer and settles.
// Under prefers-reduced-motion nothing moves by itself and the tour is off.

import {
  BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, EdgesGeometry,
  GridHelper, Group, Line, LineBasicMaterial, LineDashedMaterial, LineSegments, Mesh,
  MeshBasicMaterial, Object3D, PerspectiveCamera, QuadraticBezierCurve3, Quaternion,
  Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGPURenderer,
} from 'three/webgpu';

const HELD = 0x00ff41;
const BLOCKED = 0xff3b3b;
const WIRE = 0x3fa9ff;
const AMBER = 0xffd23f;
const CORE = 0xb9f6c7;
const GRID = 0x0b2e15;
const LINK = 0x1f9c40;

type Kind = 'person' | 'system' | 'container' | 'component' | 'external' | 'db';
const KIND_COLOUR: Record<Kind, number> = {
  person: CORE, system: HELD, container: 0x17c441, component: 0x6be08a, external: 0x6f8f78, db: 0x17c441,
};
const KIND_SIZE: Record<Kind, [number, number, number]> = {
  person: [1, 1, 1.5], system: [3.4, 2, 1.4], container: [2.4, 1.6, 0.9],
  component: [2, 1.3, 0.6], external: [2, 1.2, 0.5], db: [1.7, 1.7, 1],
};

interface NodeDef { id: string; name: string; sub: string; kind: Kind; x: number; z: number; w?: number; d?: number; tip: string }
interface LinkDef { a: string; b: string; label?: string; mode?: 'req' | 'back' | 'both'; bend?: number }
interface BoundDef { name: string; x0: number; x1: number; z0: number; z1: number }
interface LevelDef { name: string; scope: string; text: string; half: number; nodes: NodeDef[]; links: LinkDef[]; bounds: BoundDef[] }

// ---------------------------------------------------------------- the levels

const L1: LevelDef = {
  name: 'Context', scope: 'who uses knoot, and what it talks to', half: 8.6,
  text: 'Developers run coding agents. The agents never call knoot on purpose, their hooks do, on every turn, and knoot answers with a brief to read, or a refusal when a write would collide. It reads the repository only for its identity and file hashes; code never leaves the machine.',
  bounds: [],
  nodes: [
    { id: 'dev', name: 'Developer', sub: 'person', kind: 'person', x: -7, z: 2.2, tip: 'Runs agents on a shared repo. Publishes a fact now and then, or asks knoot why a file is the way it is.' },
    { id: 'admin', name: 'Team admin', sub: 'person', kind: 'person', x: -7, z: -2.8, tip: 'Adds people and keys and defines rooms, from the console.' },
    { id: 'agent', name: 'Coding agent', sub: 'Claude Code · Codex', kind: 'external', x: -2.4, z: 2.2, tip: 'Never calls knoot deliberately. Its hooks fire on every turn, and what comes back lands in its context.' },
    { id: 'knoot', name: 'knoot', sub: 'shared memory · awareness · write arbitration', kind: 'system', x: 2.6, z: 0, w: 3.8, d: 2.2, tip: 'Facts that reach the next agent, a live picture of who holds what, and a gate on colliding writes.' },
    { id: 'git', name: 'Git repository', sub: 'external', kind: 'external', x: 8, z: 0, tip: 'Source of the repo id, the branch and file hashes. Contents are hashed locally and never sent.' },
  ],
  links: [
    { a: 'dev', b: 'agent', label: 'prompts' },
    { a: 'agent', b: 'knoot', label: 'hooks', bend: -0.5 },
    { a: 'knoot', b: 'agent', label: 'briefs · refusals', mode: 'back', bend: -0.5 },
    { a: 'admin', b: 'knoot', label: 'console' },
    { a: 'knoot', b: 'git', label: 'hashes' },
  ],
};

const L2: LevelDef = {
  name: 'Containers', scope: 'the processes and stores that make it up', half: 10,
  text: 'On each machine a short-lived hook turns an agent\'s JSON into one request for knootd, the daemon, over a unix socket. The daemon keeps a local mirror of the log and talks to one relay per team over a WebSocket. The relay numbers every event and keeps the log. One binary plays hook, CLI, daemon and relay.',
  bounds: [
    { name: 'developer machine · one per person', x0: -7.6, x1: 0.2, z0: -3.2, z1: 3.2 },
    { name: 'relay host · one per team', x0: 3, x1: 10.2, z0: -3.2, z1: 3.2 },
  ],
  nodes: [
    { id: 'agent', name: 'Coding agent', sub: 'Claude Code · Codex', kind: 'external', x: -11.2, z: 0, tip: 'Fires a hook on every turn and tool call; reads what the hook prints.' },
    { id: 'hook', name: 'knoot hook', sub: 'one process per hook', kind: 'container', x: -5.2, z: 0, tip: 'Turns the hook payload into a daemon request. Exits 0 on any failure, so it can never block an agent.' },
    { id: 'daemon', name: 'knootd', sub: 'log mirror · brief composer', kind: 'container', x: -1.6, z: 0, tip: 'One per machine. Answers from a local mirror of the log in microseconds, and composes the brief.' },
    { id: 'relay', name: 'knoot relay', sub: 'sequencer · arbiter · memory', kind: 'container', x: 5.4, z: 0, w: 2.2, tip: 'One sequencer per repo orders every event and arbitrates claims. Stores memory it may not be able to read.' },
    { id: 'db', name: 'the log', sub: 'every event, in order', kind: 'db', x: 8.8, z: 0, tip: 'The event log, memory shards, teams and rooms. Plain files on a box you can own, so you can leave with it.' },
  ],
  links: [
    { a: 'agent', b: 'hook', label: 'hook JSON' },
    { a: 'hook', b: 'agent', label: 'brief · refusal', mode: 'back', bend: -0.9 },
    { a: 'hook', b: 'daemon', label: 'unix socket' },
    { a: 'daemon', b: 'relay', label: 'WebSocket', mode: 'both' },
    { a: 'relay', b: 'db', label: 'append' },
  ],
};

const L3: LevelDef = {
  name: 'Components', scope: 'inside knootd and inside the relay', half: 12,
  text: 'A hook becomes one request. The handler checks it against the log mirror; the composer turns state into the text an agent reads, peers, files that moved, facts about the files in play. The relay link keeps the mirror current. On the relay, the sequencer orders events and decides who holds a file before anything reaches the log.',
  bounds: [
    { name: 'knootd', x0: -7.2, x1: 2.4, z0: -4.2, z1: 4.2 },
    { name: 'knoot relay', x0: 5, x1: 11.4, z0: -4.2, z1: 4.2 },
  ],
  nodes: [
    { id: 'hook', name: 'knoot hook', sub: 'one process per hook', kind: 'container', x: -10.6, z: 0, tip: 'Detects Claude Code or Codex, parses the payload, and asks the daemon.' },
    { id: 'handler', name: 'Request handler', sub: 'one request in, one answer out', kind: 'component', x: -5, z: 0, tip: 'A patch is checked as a unit: every path is tested before any is claimed. Unknown repos and every error answer allow.' },
    { id: 'view', name: 'Log mirror', sub: 'proto::View', kind: 'component', x: -1.4, z: -2.6, tip: 'The deterministic state machine. Answers who holds this, what moved since, who is waiting.' },
    { id: 'composer', name: 'Brief composer', sub: 'state → text', kind: 'component', x: -1.4, z: 2.6, tip: 'Peers and their plans, files that moved under you, facts about the files you touch. On a refusal the same brief rides along.' },
    { id: 'mem', name: 'Memory', sub: 'facts · staleness by hash', kind: 'component', x: 1.2, z: 2.6, w: 1.6, tip: 'Facts for the areas this member is in. A fact is flagged possibly stale when its files change.' },
    { id: 'link', name: 'Relay link', sub: 'WebSocket · reconnect', kind: 'component', x: 1.2, z: -2.6, w: 1.6, tip: 'Keeps the socket up and reconnects. A rejected token turns coordination off with one stderr line; it never blocks a write.' },
    { id: 'seq', name: 'Sequencer + arbiter', sub: 'per repo', kind: 'component', x: 7, z: 0, w: 2.4, tip: 'Gives every event its number and decides claims. One sequencer per repo: no CRDT, no consensus.' },
    { id: 'db', name: 'the log', sub: 'every event, in order', kind: 'db', x: 10.2, z: 0, tip: 'Where the sequenced events are kept.' },
  ],
  links: [
    { a: 'hook', b: 'handler', label: 'request' },
    { a: 'handler', b: 'hook', label: 'allow · deny + brief', mode: 'back', bend: -0.9 },
    { a: 'handler', b: 'view', label: 'check' },
    { a: 'handler', b: 'composer', label: 'brief' },
    { a: 'composer', b: 'mem', label: 'facts' },
    { a: 'link', b: 'view', label: 'events' },
    { a: 'link', b: 'seq', label: 'WebSocket', mode: 'both' },
    { a: 'seq', b: 'db', label: 'append' },
  ],
};

const DIAGRAMS = [L1, L2, L3];

// Horizontal extent of a level, so the camera can centre it and fit it.
function extent(def: LevelDef): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const n of def.nodes) {
    const w = (n.w ?? KIND_SIZE[n.kind][0]) / 2 + 0.9;
    lo = Math.min(lo, n.x - w); hi = Math.max(hi, n.x + w);
  }
  for (const b of def.bounds) { lo = Math.min(lo, b.x0 - 0.3); hi = Math.max(hi, b.x1 + 0.3); }
  return [lo, hi];
}

const EVENTS: [string, number, string][] = [
  ['ClaimAcquired', HELD, 'A session took a lease on a file.'],
  ['FileWritten', CORE, 'A write landed; sessions that read the file are told it moved.'],
  ['IntentDeclared', 0x6be08a, 'A session said what it is about to do.'],
  ['ClaimDenied', BLOCKED, 'A second session reached for a held file and was refused.'],
  ['Message', WIRE, 'One session wrote to another.'],
  ['StaleRead', AMBER, 'A session read a file a peer has since changed.'],
  ['ClaimReleased', HELD, 'A lease ended; whoever was waiting is told.'],
  ['PathFreed', CORE, 'A path became free.'],
];

const L4 = {
  name: 'Code', scope: 'the log everything is replayed from', half: 13.2,
  text: 'Every state change is one Event, numbered by the relay. The daemon and the relay each replay the same stream through View::apply, so they agree by construction. Agent turns are transactions: a collision aborts and re-plans rather than merging, which is why there is one sequencer per repo, and no CRDT.',
};

// ------------------------------------------------------------------- scene

interface Label { el: HTMLElement; anchor: Object3D; dy: number }
interface Pick { mesh: Mesh; name: string; tip: string; label?: HTMLElement }
interface Built {
  group: Group; labels: Label[]; picks: Pick[];
  update(dt: number): void;
  k: number; target: number;
}

const edgeMat = (c: number, o = 1) => new LineBasicMaterial({ color: c, transparent: o < 1, opacity: o });
const fillMat = (c: number, o = 0.9) => new MeshBasicMaterial({ color: new Color(c).multiplyScalar(0.16), transparent: true, opacity: o });

function label(host: HTMLElement, html: string, cls = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = `c4-label ${cls}`.trim();
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

interface Placed { obj: Object3D; x: number; z: number; hw: number; hd: number; h: number }

// One element: a dark glass box with bright edges (a person is a figure, a
// database a drum). Returns the object, positioned, and how big it is.
function placeNode(g: Group, host: HTMLElement, labels: Label[], picks: Pick[], n: NodeDef): Placed {
  const [dw, dd, dh] = KIND_SIZE[n.kind];
  const w = n.w ?? dw, d = n.d ?? dd, h = dh;
  const colour = KIND_COLOUR[n.kind];
  const obj = new Group();
  obj.position.set(n.x, 0, n.z);
  let body: Mesh;

  if (n.kind === 'person') {
    body = new Mesh(new CylinderGeometry(0.3, 0.46, 0.95, 18), new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(0.5) }));
    body.position.y = 0.475;
    const head = new Mesh(new SphereGeometry(0.31, 18, 14), new MeshBasicMaterial({ color: colour }));
    head.position.y = 1.2;
    obj.add(body, head);
  } else if (n.kind === 'db') {
    const geo = new CylinderGeometry(w / 2, w / 2, h, 28);
    body = new Mesh(geo, fillMat(colour));
    body.position.y = h / 2;
    const edges = new LineSegments(new EdgesGeometry(geo, 30), edgeMat(colour));
    edges.position.y = h / 2;
    obj.add(body, edges);
  } else {
    const geo = new BoxGeometry(w, h, d);
    body = new Mesh(geo, fillMat(colour));
    body.position.y = h / 2;
    const edges = new LineSegments(new EdgesGeometry(geo), edgeMat(colour));
    edges.position.y = h / 2;
    obj.add(body, edges);
  }
  g.add(obj);

  const el = label(host, `<b>${esc(n.name)}</b><i>${esc(n.sub)}</i>`, n.kind);
  labels.push({ el, anchor: obj, dy: h + 0.3 });
  picks.push({ mesh: body, name: n.name, tip: n.tip, label: el });
  return { obj, x: n.x, z: n.z, hw: n.kind === 'person' ? 0.5 : w / 2, hd: n.kind === 'person' ? 0.5 : d / 2, h };
}

// Where a link leaves or meets a box: on its outline, nudged clear of it.
function edgePoint(from: Placed, to: Placed): Vector3 {
  const dx = to.x - from.x, dz = to.z - from.z;
  const s = Math.min(dx === 0 ? Infinity : from.hw / Math.abs(dx), dz === 0 ? Infinity : from.hd / Math.abs(dz));
  const len = Math.hypot(dx, dz) || 1;
  return new Vector3(from.x + dx * s + (dx / len) * 0.14, from.h * 0.5, from.z + dz * s + (dz / len) * 0.14);
}

function arc(a: Vector3, b: Vector3, bend: number): QuadraticBezierCurve3 {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const perp = new Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(bend * 1.6);
  mid.add(perp);
  mid.y += 0.5 + dir.length() * 0.05;
  return new QuadraticBezierCurve3(a, mid, b);
}

const UP = new Vector3(0, 1, 0);
function drawCurve(g: Group, c: QuadraticBezierCurve3, colour: number, dashed: boolean): void {
  const geo = new BufferGeometry().setFromPoints(c.getPoints(32));
  const line = dashed
    ? new Line(geo, new LineDashedMaterial({ color: colour, dashSize: 0.22, gapSize: 0.16 }))
    : new Line(geo, new LineBasicMaterial({ color: colour }));
  if (dashed) line.computeLineDistances();
  g.add(line);
}
function arrowAt(g: Group, c: QuadraticBezierCurve3, end: 0 | 1, colour: number): void {
  const cone = new Mesh(new ConeGeometry(0.11, 0.3, 10), new MeshBasicMaterial({ color: colour }));
  const tan = c.getTangent(end).multiplyScalar(end === 1 ? 1 : -1);
  cone.quaternion.copy(new Quaternion().setFromUnitVectors(UP, tan));
  cone.position.copy(c.getPoint(end)).addScaledVector(tan, -0.15);
  g.add(cone);
}

interface Packet { mesh: Mesh; curve: QuadraticBezierCurve3; t: number; speed: number; dir: 1 | -1 }

function buildDiagram(def: LevelDef, host: HTMLElement, still: boolean): Built {
  const group = new Group();
  const labels: Label[] = [];
  const picks: Pick[] = [];

  for (const b of def.bounds) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const geo = new BoxGeometry(w, 0.08, d);
    const slab = new Mesh(geo, new MeshBasicMaterial({ color: 0x041a0b, transparent: true, opacity: 0.75 }));
    slab.position.set((b.x0 + b.x1) / 2, -0.04, (b.z0 + b.z1) / 2);
    const rim = new LineSegments(new EdgesGeometry(geo), edgeMat(0x1f6f35));
    rim.position.copy(slab.position);
    group.add(slab, rim);
    const anchor = new Object3D();
    anchor.position.set(b.x0 + 0.2, 0, b.z1 + 0.12);
    group.add(anchor);
    labels.push({ el: label(host, esc(b.name), 'bound'), anchor, dy: 0 });
  }

  const placed = new Map<string, Placed>();
  for (const n of def.nodes) placed.set(n.id, placeNode(group, host, labels, picks, n));

  const packets: Packet[] = [];
  const dot = new SphereGeometry(0.1, 10, 10);
  def.links.forEach((l, i) => {
    const A = placed.get(l.a)!, B = placed.get(l.b)!;
    const mode = l.mode ?? 'req';
    const c = arc(edgePoint(A, B), edgePoint(B, A), l.bend ?? 0);
    const colour = mode === 'back' ? WIRE : LINK;
    drawCurve(group, c, colour, mode === 'back');
    arrowAt(group, c, 1, colour);
    if (mode === 'both') arrowAt(group, c, 0, colour);

    const at = new Object3D();
    at.position.copy(c.getPoint(0.5));
    group.add(at);
    if (l.label) labels.push({ el: label(host, esc(l.label), mode === 'back' ? 'link back' : 'link'), anchor: at, dy: 0.12 });

    const n = mode === 'both' ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const mesh = new Mesh(dot, new MeshBasicMaterial({ color: mode === 'back' ? WIRE : HELD }));
      group.add(mesh);
      packets.push({ mesh, curve: c, t: (i * 0.37 + j * 0.5) % 1, speed: 0.2 + (i % 4) * 0.035, dir: j === 0 ? 1 : -1 });
    }
  });

  const move = () => {
    for (const p of packets) p.mesh.position.copy(p.curve.getPoint(p.dir === 1 ? p.t : 1 - p.t));
  };
  move();
  return {
    group, labels, picks, k: 0, target: 0,
    update(dt) {
      if (still) return;
      for (const p of packets) p.t = (p.t + p.speed * dt) % 1;
      move();
    },
  };
}

// Level 4: events come off the sequencer one by one along the log, and each is
// delivered, as a copy, to two independent Views. They always end on the same
// sequence number — that is the whole idea, so that is what is drawn.
function buildLog(host: HTMLElement, still: boolean): Built {
  const group = new Group();
  const labels: Label[] = [];
  const picks: Pick[] = [];

  const track = new Mesh(new BoxGeometry(13.6, 0.05, 1), new MeshBasicMaterial({ color: 0x06220e }));
  track.position.set(-3.2, 0.02, 0);
  const trackRim = new LineSegments(new EdgesGeometry(new BoxGeometry(13.6, 0.05, 1)), edgeMat(0x1f6f35));
  trackRim.position.copy(track.position);
  group.add(track, trackRim);
  const logAt = new Object3D();
  logAt.position.set(-8.2, 0, 0.9);
  group.add(logAt);
  labels.push({ el: label(host, 'the log · proto::Event', 'bound'), anchor: logAt, dy: 0 });

  const seqr = placeNode(group, host, labels, picks, {
    id: 'seq', name: 'Sequencer', sub: 'numbers each event', kind: 'component', x: -11.6, z: 0, w: 2, d: 1.6,
    tip: 'One per repo, on the relay. It takes an event, gives it the next number and appends it. That is the only place order is decided.',
  });
  void seqr;

  const views = [-3, 3].map((z, i) => {
    const p = placeNode(group, host, labels, picks, {
      id: `v${i}`, name: i === 0 ? 'View · relay' : 'View · daemon mirror', sub: 'seq 1039', kind: 'container', x: 8, z, w: 2.4, d: 2,
      tip: 'proto::View. View::apply(&Event) is the only way its state changes, so two Views fed the same log are the same View.',
    });
    const el = labels[labels.length - 1].el;
    el.classList.add('keep');
    return { p, sub: el.querySelector('i')!, pulse: 0 };
  });

  const start = new Vector3(3.5, 0.3, 0);
  const routes = views.map((v) => arc(start, new Vector3(v.p.x - 1.4, 0.5, v.p.z), 0));
  routes.forEach((c) => { drawCurve(group, c, LINK, false); arrowAt(group, c, 1, LINK); });
  const applyAt = new Object3D();
  applyAt.position.set(6.4, 0.9, 0);
  group.add(applyAt);
  labels.push({ el: label(host, 'View::apply(&Event)', 'link'), anchor: applyAt, dy: 0 });

  const SPACING = 1.9, COUNT = 7, X0 = -10, L = SPACING * COUNT, EXIT = X0 + L - 0.1;
  let nextSeq = 1040 + COUNT - 1;
  interface Block { obj: Group; fill: MeshBasicMaterial; edge: LineBasicMaterial; el: HTMLElement; seq: number; type: number; pick: Pick }
  const blockGeo = new BoxGeometry(1.3, 0.55, 0.8);
  const blockEdges = new EdgesGeometry(blockGeo);
  const blocks: Block[] = [];
  const paint = (b: Block, type: number, seq: number) => {
    const [name, colour, tip] = EVENTS[type];
    b.type = type; b.seq = seq;
    b.fill.color.set(colour).multiplyScalar(0.16);
    b.edge.color.set(colour);
    b.el.innerHTML = `<b>${name}</b><i>#${seq}</i>`;
    b.pick.name = name; b.pick.tip = `${tip} Event #${seq} in the log.`;
  };
  for (let i = 0; i < COUNT; i++) {
    const obj = new Group();
    const fill = new MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const edge = new LineBasicMaterial();
    const mesh = new Mesh(blockGeo, fill);
    mesh.position.y = 0.3;
    const lines = new LineSegments(blockEdges, edge);
    lines.position.y = 0.3;
    obj.add(mesh, lines);
    obj.position.set(X0 + i * SPACING, 0, 0);
    group.add(obj);
    const el = label(host, '', 'event');
    labels.push({ el, anchor: obj, dy: i % 2 ? 1.5 : 0.95 });
    const pick: Pick = { mesh, name: '', tip: '', label: el };
    picks.push(pick);
    const b: Block = { obj, fill, edge, el, seq: 0, type: 0, pick };
    paint(b, (i * 3) % EVENTS.length, 1040 + COUNT - 1 - i);
    blocks.push(b);
  }

  interface Flight { mesh: Mesh; mat: MeshBasicMaterial; curve: QuadraticBezierCurve3; t: number; live: boolean; seq: number; view: number }
  const flights: Flight[] = [];
  const dot = new SphereGeometry(0.13, 10, 10);
  for (let i = 0; i < 8; i++) {
    const mat = new MeshBasicMaterial();
    const mesh = new Mesh(dot, mat);
    mesh.visible = false;
    group.add(mesh);
    flights.push({ mesh, mat, curve: routes[0], t: 0, live: false, seq: 0, view: 0 });
  }
  const deliver = (b: Block) => {
    for (let v = 0; v < 2; v++) {
      const f = flights.find((x) => !x.live);
      if (!f) return;
      Object.assign(f, { live: true, t: 0, seq: b.seq, view: v, curve: routes[v] });
      f.mat.color.set(EVENTS[b.type][1]);
      f.mesh.visible = true;
    }
  };

  return {
    group, labels, picks, k: 0, target: 0,
    update(dt) {
      if (still) return;
      for (const b of blocks) {
        b.obj.position.x += 1.25 * dt;
        if (b.obj.position.x > EXIT) {
          deliver(b);
          b.obj.position.x -= L;
          paint(b, (b.type + 3) % EVENTS.length, ++nextSeq);
        }
      }
      for (const f of flights) {
        if (!f.live) continue;
        f.t += dt / 0.9;
        if (f.t >= 1) {
          f.live = false; f.mesh.visible = false;
          const v = views[f.view];
          v.sub.textContent = `seq ${f.seq}`;
          v.pulse = 1;
        } else f.mesh.position.copy(f.curve.getPoint(f.t));
      }
      for (const v of views) {
        v.pulse = Math.max(0, v.pulse - dt * 2.4);
        v.p.obj.scale.set(1 + v.pulse * 0.06, 1 + v.pulse * 0.3, 1 + v.pulse * 0.06);
      }
    },
  };
}

// -------------------------------------------------------------------- mount

export async function mountC4(host: HTMLElement): Promise<void> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = host.querySelector<HTMLElement>('.c4-stage')!;
  const labelHost = host.querySelector<HTMLElement>('.c4-labels')!;
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('.c4-tab')];
  const title = host.querySelector<HTMLElement>('.c4-title')!;
  const scope = host.querySelector<HTMLElement>('.c4-scope')!;
  const text = host.querySelector<HTMLElement>('.c4-text')!;
  const tip = host.querySelector<HTMLElement>('.c4-tip')!;

  const canvas = document.createElement('canvas');
  canvas.className = 'c4-canvas';
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
  await renderer.init(); // throws with neither WebGPU nor WebGL2; the caller shows the text diagram
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.insertBefore(canvas, labelHost);

  const scene = new Scene();
  const cam = new PerspectiveCamera(36, 1, 0.1, 120);
  const grid = new GridHelper(60, 60, GRID, GRID);
  grid.position.y = -0.1;
  scene.add(grid);
  const root = new Group();
  scene.add(root);

  const levels: Built[] = [
    ...DIAGRAMS.map((d) => buildDiagram(d, labelHost, reduced)),
    buildLog(labelHost, reduced),
  ];
  const meta = [...DIAGRAMS, L4];
  const spans = [...DIAGRAMS.map(extent), [-13.4, 11.6] as [number, number]];
  levels.forEach((b) => { root.add(b.group); b.group.visible = false; });

  let active = 0;
  let dist = 20, distTarget = 20, shift = 0, shiftTarget = 0;
  const hint = 'point at a box to read what it is';
  const setLevel = (i: number, instant = false) => {
    active = i;
    levels.forEach((b, j) => { b.target = j === i ? 1 : 0; if (instant) b.k = b.target; });
    tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === i)); t.tabIndex = j === i ? 0 : -1; });
    title.textContent = `Level ${i + 1} · ${meta[i].name}`;
    scope.textContent = meta[i].scope;
    text.textContent = meta[i].text;
    tip.textContent = hint;
    host.dataset.level = String(i);
    fit();
    dirty = true;
  };

  let dirty = true;
  const fit = () => {
    const aspect = cam.aspect || 2;
    const [lo, hi] = spans[active];
    shiftTarget = -(lo + hi) / 2;
    distTarget = Math.max(13, ((hi - lo) / 2) / (Math.tan((cam.fov * Math.PI) / 360) * aspect) * 1.2);
  };
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    fit();
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);

  // Pointer: lean toward it, and name whatever box is under it.
  let wantX = 0, wantY = 0, leanX = 0, leanY = 0, inside = false;
  const ray = new Raycaster(), ndc = new Vector2();
  let hovered: Pick | null = null;
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    wantY = ndc.x * 0.22;
    wantX = ndc.y * 0.1;
    inside = true;
    dirty = true;
    pickAt();
  });
  stage.addEventListener('pointerleave', () => { inside = false; wantX = wantY = 0; setHover(null); });
  const pickAt = () => {
    const b = levels[active];
    if (b.k < 0.9) return setHover(null);
    ray.setFromCamera(ndc, cam);
    const hit = ray.intersectObjects(b.picks.map((p) => p.mesh), false)[0];
    setHover(hit ? b.picks.find((p) => p.mesh === hit.object) ?? null : null);
  };
  const setHover = (p: Pick | null) => {
    if (p === hovered) return;
    hovered?.label?.classList.remove('hot');
    hovered = p;
    p?.label?.classList.add('hot');
    tip.innerHTML = p ? `<b>${esc(p.name)}</b>: ${esc(p.tip)}` : hint;
    stage.style.cursor = p ? 'help' : '';
  };

  // The tour walks the four levels until a person takes over.
  let touring = !reduced;
  let tourClock = 0;
  const TOUR = 9;
  tabs.forEach((t, j) => {
    t.addEventListener('click', () => { touring = false; setLevel(j, reduced); });
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      touring = false;
      const n = (j + d + tabs.length) % tabs.length;
      tabs[n].focus();
      setLevel(n, reduced);
    });
  });
  host.querySelector('.c4-tour')?.addEventListener('click', () => { touring = !touring; tourClock = 0; });

  const v = new Vector3();
  const project = () => {
    scene.updateMatrixWorld(true);
    const w = stage.clientWidth, h = stage.clientHeight;
    levels.forEach((b, i) => {
      const e = b.k * b.k * (3 - 2 * b.k);
      const show = i === active ? e > 0.55 : false;
      for (const l of b.labels) {
        if (!show) { l.el.style.opacity = '0'; continue; }
        l.anchor.getWorldPosition(v);
        v.y += l.dy;
        v.project(cam);
        l.el.style.opacity = String(Math.min(1, (e - 0.55) / 0.45));
        l.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      }
    });
  };

  const frame = (dt: number, now: number) => {
    let moving = false;
    levels.forEach((b) => {
      const was = b.k;
      b.k += Math.sign(b.target - b.k) * Math.min(Math.abs(b.target - b.k), dt / 0.7);
      if (b.k !== was) moving = true;
      const e = b.k * b.k * (3 - 2 * b.k);
      b.group.visible = e > 0.002;
      b.group.scale.setScalar(Math.max(e, 0.0001));
      if (b.group.visible) b.update(dt);
    });
    if (moving) dirty = true;
    leanX += (wantX - leanX) * Math.min(1, dt * 3);
    leanY += (wantY - leanY) * Math.min(1, dt * 3);
    dist += (distTarget - dist) * Math.min(1, dt * 3);
    shift += (shiftTarget - shift) * Math.min(1, dt * 3);
    root.position.x = shift;
    const sway = reduced ? 0 : Math.sin(now / 1000 * 0.18) * 0.12;
    root.rotation.y = sway + leanY;
    const elev = 0.62 + leanX;
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, 0, 0);
    project();
    renderer.render(scene, cam);
  };

  setLevel(0, true);
  resize();
  if (reduced) {
    // Still frames only: render on a change, never on a clock.
    const tick = () => { if (dirty) { dirty = false; frame(1, 0); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return;
  }

  let visible = false, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) last = performance.now(); }, { threshold: 0.15 }).observe(stage);
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (visible && !document.hidden) {
      if (touring && !inside) {
        tourClock += dt;
        if (tourClock > TOUR) { tourClock = 0; setLevel((active + 1) % levels.length); }
      }
      host.classList.toggle('touring', touring);
      frame(dt, now);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
