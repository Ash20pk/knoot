// The repository as the relay sees it: every file a slab on a dark plane,
// every session a marker, and the state of each claim as colour. It replays
// the same moment the three terminals underneath show, so the two agree.
//
// Rendered with three.js on WebGPU. WebGPURenderer falls back to WebGL2 on
// its own when the browser has no WebGPU; when it has neither, the figure is
// removed rather than left as a blank panel.

import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, InstancedMesh,
  Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Object3D,
  OrthographicCamera, PlaneGeometry, QuadraticBezierCurve3, RingGeometry,
  Scene, Vector3, WebGPURenderer, BufferGeometry, MeshBasicMaterial, DoubleSide,
} from 'three/webgpu';

const PANEL = 0x171c21;
const SLAB = 0x242b32;
const SLAB_LIT = 0x2e363e;
const HELD = 0x19a974;
const BLOCKED = 0xff4a1f;
const WIRE = 0x3b7bff;
const AGENT = 0xe8ecef;

// The tree, in path order. The three files the scenario touches are named;
// the rest are there so the repository reads as a real one.
const FILES = [
  'package.json', 'README.md', 'src/index.js', 'src/auth.js', 'src/session.js',
  'src/tokens.js', 'src/routes/login.js', 'src/routes/logout.js', 'src/db.js',
  'src/util.js', 'test/auth.test.js', 'test/session.test.js', 'test/db.test.js',
  'scripts/seed.js', 'scripts/migrate.js', 'docs/api.md', 'docs/setup.md',
  '.github/ci.yml', 'Dockerfile', 'src/middleware.js', 'src/mail.js',
  'src/config.js', 'src/errors.js', 'src/log.js',
];
const COLS = 8;
const PITCH = 1.15;
const idx = (p: string) => FILES.indexOf(p);
const slabPos = (i: number, out = new Vector3()) => {
  const c = i % COLS, r = Math.floor(i / COLS);
  const rows = Math.ceil(FILES.length / COLS);
  return out.set((c - (COLS - 1) / 2) * PITCH, 0, (r - (rows - 1) / 2) * PITCH);
};

type Agent = { name: string; home: Vector3; el: HTMLElement; node: Mesh };

// The scenario, as a loop of `LOOP` seconds. Every keyframe is a wall-clock
// offset, so the same file lights at the same moment on every replay.
const LOOP = 16;
const T = {
  claimAuth: 0.8, claimSession: 2.2,        // ash takes two files
  priyaReach: 4.2, priyaDenied: 4.9,        // priya reaches auth.js, is told
  priyaTokens: 7.0,                         // priya claims tokens.js instead
  ask: 9.0, reply: 10.8,                    // sam ↔ ash over the wire
  release: 13.6,                            // ash's lease ends
};

export async function mountField(host: HTMLElement): Promise<void> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'field-canvas';

  let renderer: WebGPURenderer;
  try {
    renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    await renderer.init();
  } catch {
    host.remove();
    return;
  }
  renderer.setClearColor(PANEL, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.querySelector('.field-stage')!.appendChild(canvas);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const note = host.querySelector<HTMLElement>('.field-backend');
  if (note) note.textContent = `three.js on ${backend}`;

  const scene = new Scene();
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.position.set(9, 9, 11);
  cam.lookAt(0, 0.3, 0);

  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 8, 6);
  scene.add(sun);

  // The plane the files sit on, and a fine rule under each row.
  const floor = new Mesh(new PlaneGeometry(80, 80), new MeshStandardMaterial({ color: 0x1b2127, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.09;
  scene.add(floor);

  // Files: one instanced mesh, colour per instance.
  const slabGeo = new BoxGeometry(0.86, 0.12, 0.86);
  const slabMat = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  const slabs = new InstancedMesh(slabGeo, slabMat, FILES.length);
  const dummy = new Object3D(), col = new Color();
  const slabHeight = new Float32Array(FILES.length).fill(0);
  const slabColor = FILES.map(() => new Color(SLAB));
  scene.add(slabs);

  // Lease rings: thin flat rings that shrink as the lease runs down.
  const ringGeo = new RingGeometry(0.52, 0.56, 48);
  const rings = new Map<string, Mesh>();
  const ring = (file: string) => {
    let r = rings.get(file);
    if (!r) {
      r = new Mesh(ringGeo, new MeshBasicMaterial({ color: HELD, transparent: true, opacity: 0, side: DoubleSide }));
      r.rotation.x = -Math.PI / 2;
      slabPos(idx(file), r.position); r.position.y = 0.42;
      rings.set(file, r); scene.add(r);
    }
    return r;
  };
  ring('src/auth.js'); ring('src/session.js'); ring('src/tokens.js');

  // Sessions: a small upright marker each, with an HTML label projected over it.
  const agentGeo = new BoxGeometry(0.16, 0.9, 0.16);
  const labels = host.querySelector<HTMLElement>('.field-labels')!;
  const mkAgent = (name: string, x: number, z: number): Agent => {
    const node = new Mesh(agentGeo, new MeshStandardMaterial({ color: AGENT, roughness: 0.6 }));
    node.position.set(x, 0.45, z);
    scene.add(node);
    const el = document.createElement('span');
    el.className = 'field-label'; el.textContent = name;
    labels.appendChild(el);
    return { name, home: new Vector3(x, 0.45, z), el, node };
  };
  const ash = mkAgent('ash', -5.8, -0.4);
  const priya = mkAgent('priya', 5.8, 0.2);
  const sam = mkAgent('sam', 1.2, 3.2);
  const agents = [ash, priya, sam];
  const fileLabels = ['src/auth.js', 'src/session.js', 'src/tokens.js'].map((f) => {
    const el = document.createElement('span');
    el.className = 'field-label file'; el.textContent = f.slice(4);
    labels.appendChild(el);
    return { el, pos: slabPos(idx(f)).add(new Vector3(0, -0.04, 0.62)) };
  });

  // A wire between two points: claim (green), denial (orange), message (blue).
  const wire = (colour: number) => {
    // Allocated once at full length; setWire only moves the points and sets the draw range.
    const geo = new BufferGeometry().setFromPoints(Array.from({ length: 41 }, () => new Vector3()));
    const line = new Line(geo, new LineBasicMaterial({ color: colour, transparent: true, opacity: 0 }));
    scene.add(line);
    return line;
  };
  const setWire = (line: Line, a: Vector3, b: Vector3, t: number, lift = 1.6) => {
    const mid = a.clone().lerp(b, 0.5); mid.y += lift;
    const curve = new QuadraticBezierCurve3(a, mid, b);
    const pts = curve.getPoints(40);
    const pos = line.geometry.getAttribute('position');
    for (let i = 0; i < pts.length; i++) pos.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
    pos.needsUpdate = true;
    line.geometry.setDrawRange(0, Math.max(2, Math.round(40 * Math.min(1, t)) + 1));
  };
  const wAsh = wire(HELD), wAsh2 = wire(HELD), wPriya = wire(BLOCKED), wPriya2 = wire(HELD), wMsg = wire(WIRE);

  const status = host.querySelector<HTMLElement>('.field-status')!;
  let lastStatus = '';
  const say = (s: string) => { if (s !== lastStatus) { status.textContent = s; lastStatus = s; } };

  const ease = (a: number, b: number, t: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  const above = (file: string) => slabPos(idx(file)).setY(0.2);

  const frame = (t: number) => {
    // Everything below is a pure function of loop time `t`.
    for (const c of slabColor) c.setHex(SLAB);
    slabHeight.fill(0);
    const set = (file: string, c: number, h: number) => { slabColor[idx(file)].setHex(c); slabHeight[idx(file)] = h; };
    for (const r of rings.values()) (r.material as MeshBasicMaterial).opacity = 0;
    for (const w of [wAsh, wAsh2, wPriya, wPriya2, wMsg]) (w.material as LineBasicMaterial).opacity = 0;

    const holding = t >= T.claimAuth && t < T.release;
    const lease = (from: number) => 1 - Math.min(1, (t - from) / (T.release - from));

    // ash: auth.js, then session.js, held until release.
    if (holding) {
      const k = ease(T.claimAuth, T.claimAuth + 0.5, t);
      set('src/auth.js', HELD, 0.22 * k);
      (wAsh.material as LineBasicMaterial).opacity = k * (1 - ease(T.claimAuth + 1.2, T.claimAuth + 1.8, t));
      setWire(wAsh, ash.home, above('src/auth.js'), k);
      const r = ring('src/auth.js'); (r.material as MeshBasicMaterial).opacity = 0.9 * k;
      r.scale.setScalar(0.5 + 0.5 * lease(T.claimAuth));
      say('ash claimed src/auth.js · lease 10m');
    }
    if (t >= T.claimSession && t < T.release) {
      const k = ease(T.claimSession, T.claimSession + 0.5, t);
      set('src/session.js', HELD, 0.22 * k);
      (wAsh2.material as LineBasicMaterial).opacity = k * (1 - ease(T.claimSession + 1.2, T.claimSession + 1.8, t));
      setWire(wAsh2, ash.home, above('src/session.js'), k);
      const r = ring('src/session.js'); (r.material as MeshBasicMaterial).opacity = 0.9 * k;
      r.scale.setScalar(0.5 + 0.5 * lease(T.claimSession));
      say('ash claimed src/session.js · lease 10m');
    }
    // priya reaches auth.js and is refused; the slab flashes, the wire snaps.
    if (t >= T.priyaReach && t < T.priyaTokens) {
      const k = ease(T.priyaReach, T.priyaDenied, t);
      const fade = 1 - ease(T.priyaDenied + 0.6, T.priyaDenied + 1.6, t);
      (wPriya.material as LineBasicMaterial).opacity = fade;
      setWire(wPriya, priya.home, above('src/auth.js'), k);
      if (t >= T.priyaDenied) {
        const pulse = 0.5 + 0.5 * Math.sin((t - T.priyaDenied) * 12);
        slabColor[idx('src/auth.js')].lerpColors(new Color(HELD), new Color(BLOCKED), fade * (0.6 + 0.4 * pulse));
        say('priya denied src/auth.js — held by ash, "refactor session handling…", ~8m left');
      } else say('priya reaches for src/auth.js');
    }
    // priya takes tokens.js instead.
    if (t >= T.priyaTokens && t < LOOP) {
      const k = ease(T.priyaTokens, T.priyaTokens + 0.5, t);
      set('src/tokens.js', HELD, 0.22 * k);
      (wPriya2.material as LineBasicMaterial).opacity = k * (1 - ease(T.priyaTokens + 1.2, T.priyaTokens + 1.8, t));
      setWire(wPriya2, priya.home, above('src/tokens.js'), k);
      const r = ring('src/tokens.js'); (r.material as MeshBasicMaterial).opacity = 0.9 * k;
      r.scale.setScalar(0.5 + 0.5 * (1 - (t - T.priyaTokens) / (LOOP - T.priyaTokens)) * 0.6 + 0.2);
      if (t < T.ask) say('priya claimed src/tokens.js instead');
    }
    // sam asks ash; ash replies. The same blue wire, travelling each way.
    if (t >= T.ask && t < T.release) {
      const out = ease(T.ask, T.ask + 0.9, t);
      const back = ease(T.reply, T.reply + 0.9, t);
      (wMsg.material as LineBasicMaterial).opacity = 1 - ease(T.release - 1, T.release, t);
      if (t < T.reply) { setWire(wMsg, sam.home, ash.home, out, 2.4); say('sam → ash  "are you changing the signature of createSession?"'); }
      else { setWire(wMsg, ash.home, sam.home, back, 2.4); say('ash → sam  "yes, it takes an options object now. Land after me."'); }
    }
    if (t >= T.release) {
      set('src/tokens.js', HELD, 0.22);
      say('ash released src/auth.js, src/session.js — priya and sam are told');
    }
    if (t < T.claimAuth) say('three sessions, one repository');

    for (const r of rings.values()) r.visible = (r.material as MeshBasicMaterial).opacity > 0.01;
    for (const w of [wAsh, wAsh2, wPriya, wPriya2, wMsg]) w.visible = (w.material as LineBasicMaterial).opacity > 0.01;

    // Hovered rows read a touch lighter so the grid has depth without a gradient.
    for (let i = 0; i < FILES.length; i++) {
      slabPos(i, dummy.position); dummy.position.y = slabHeight[i];
      dummy.updateMatrix(); slabs.setMatrixAt(i, dummy.matrix);
      col.copy(slabColor[i]);
      if (col.getHex() === SLAB && Math.floor(i / COLS) === 1) col.setHex(SLAB_LIT);
      slabs.setColorAt(i, col);
    }
    slabs.instanceMatrix.needsUpdate = true;
    if (slabs.instanceColor) slabs.instanceColor.needsUpdate = true;

    // Agents bob very slightly; the one speaking leans toward its file.
    for (const a of agents) {
      a.node.position.copy(a.home);
      a.node.position.y += Math.sin(t * 1.3 + a.home.x) * 0.02;
    }
    // Camera drifts a few degrees over the loop, never enough to feel like motion.
    const drift = Math.sin((t / LOOP) * Math.PI * 2) * 0.35;
    cam.position.set(9 + drift, 9, 11 - drift);
    cam.lookAt(0, 0.3, 0);
  };

  const project = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const a of agents) {
      const p = a.node.position.clone(); p.y += 0.75;
      p.project(cam);
      a.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h}px)`;
    }
    for (const f of fileLabels) {
      const p = f.pos.clone().project(cam);
      f.el.style.transform = `translate(${((p.x + 1) / 2) * w}px, ${((1 - p.y) / 2) * h + 4}px)`;
    }
  };

  const resize = () => {
    const w = host.clientWidth, h = host.querySelector<HTMLElement>('.field-stage')!.clientHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h, half = 4.3;
    cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(host);

  // Reduced motion: one still, at the moment the scenario is fullest.
  if (reduced) {
    frame(T.reply + 0.6);
    renderer.render(scene, cam);
    project();
    return;
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }).observe(host);
  const t0 = performance.now();
  const loop = async () => {
    if (visible && !document.hidden) {
      const t = ((performance.now() - t0) / 1000) % LOOP;
      frame(t);
      renderer.render(scene, cam);
      project();
    }
    requestAnimationFrame(loop);
  };
  loop();
}
