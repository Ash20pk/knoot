// The hero's figure: a lattice of sessions in the round, with facts travelling
// the edges between them. It is the shared-memory half of the story — one node
// learns something and the packet reaches its neighbours — as the field further
// down is the collision half.
//
// Same renderer rule as field.ts: WebGPU where there is some, WebGL2 where not,
// and when the browser has neither the canvas is removed and the rain stands alone.
// It is decoration, so it pauses when off screen and renders one still frame
// under prefers-reduced-motion.

import {
  BufferGeometry, Color, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedMesh, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial,
  Object3D, PerspectiveCamera, Scene, SphereGeometry, Vector3, WebGPURenderer,
} from 'three/webgpu';

const HELD = 0x00ff41;
const WIRE = 0x3fa9ff;
const EDGE = 0x0f5a24;
const CORE = 0xb9f6c7;

const RADIUS = 2.1;
const PACKETS = 16;

type Edge = [number, number];

export async function mountLattice(canvas: HTMLCanvasElement): Promise<void> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: WebGPURenderer;
  try {
    renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    await renderer.init();
  } catch {
    canvas.remove();
    return;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new Scene();
  const cam = new PerspectiveCamera(38, 1, 0.1, 50);
  cam.position.set(0, 0.2, 11.5);

  // Nodes: the vertices of a geodesic sphere, merged where the faces share them.
  const geo = new IcosahedronGeometry(RADIUS, 1);
  const pos = geo.getAttribute('position');
  const nodes: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos, i);
    if (!nodes.some((n) => n.distanceToSquared(v) < 1e-4)) nodes.push(v);
  }

  // Edges: every pair a short hop apart, i.e. the neighbours on the sphere.
  const edges: Edge[] = [];
  const reach = nodes[0].distanceTo(
    nodes.slice(1).reduce((a, b) => (nodes[0].distanceTo(b) < nodes[0].distanceTo(a) ? b : a)),
  ) * 1.15;
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (nodes[i].distanceTo(nodes[j]) < reach) edges.push([i, j]);
  const adj: number[][] = nodes.map(() => []);
  edges.forEach(([a, b], e) => { adj[a].push(e); adj[b].push(e); });

  const world = new Group();
  scene.add(world);

  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new Float32BufferAttribute(
    edges.flatMap(([a, b]) => [...nodes[a].toArray(), ...nodes[b].toArray()]), 3));
  world.add(new LineSegments(lineGeo, new LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0.7 })));

  // A faint inner shell, so the lattice reads as a volume rather than a flat net.
  const shell = new Mesh(
    new IcosahedronGeometry(RADIUS * 0.62, 1),
    new MeshBasicMaterial({ color: EDGE, wireframe: true, transparent: true, opacity: 0.22 }),
  );
  world.add(shell);

  const dot = new SphereGeometry(0.032, 10, 10);
  const nodeMesh = new InstancedMesh(dot, new MeshBasicMaterial({ color: HELD }), nodes.length);
  const m = new Matrix4();
  nodes.forEach((n, i) => nodeMesh.setMatrixAt(i, m.makeTranslation(n.x, n.y, n.z)));
  world.add(nodeMesh);

  // Packets: a fact in flight along an edge. At a node it picks the next edge
  // at random, so a fact wanders the whole lattice the way it reaches the team.
  const packetMesh = new InstancedMesh(new SphereGeometry(0.058, 10, 10), new MeshBasicMaterial({ color: 0xffffff }), PACKETS);
  const tint = new Color();
  const packets = Array.from({ length: PACKETS }, (_, i) => {
    const edge = (Math.random() * edges.length) | 0;
    packetMesh.setColorAt(i, tint.set(i % 5 === 0 ? WIRE : i % 3 === 0 ? CORE : HELD));
    return { edge, from: Math.random() < 0.5 ? edges[edge][0] : edges[edge][1], t: Math.random(), speed: 0.35 + Math.random() * 0.4 };
  });
  world.add(packetMesh);

  const dummy = new Object3D();
  const a = new Vector3(), b = new Vector3();
  const advance = (dt: number) => {
    packets.forEach((p, i) => {
      p.t += p.speed * dt;
      if (p.t >= 1) {
        const [e0, e1] = edges[p.edge];
        const at = p.from === e0 ? e1 : e0;
        const options = adj[at].filter((e) => e !== p.edge);
        p.edge = options[(Math.random() * options.length) | 0];
        p.from = at;
        p.t -= 1;
      }
      const [e0, e1] = edges[p.edge];
      const to = p.from === e0 ? e1 : e0;
      a.copy(nodes[p.from]); b.copy(nodes[to]);
      dummy.position.lerpVectors(a, b, p.t);
      dummy.updateMatrix();
      packetMesh.setMatrixAt(i, dummy.matrix);
    });
    packetMesh.instanceMatrix.needsUpdate = true;
  };

  // The camera does not move; the lattice turns, and leans a few degrees toward
  // the pointer, damped, the way the field below does.
  let leanX = 0, leanY = 0, wantX = 0, wantY = 0;
  addEventListener('pointermove', (e) => {
    wantY = (e.clientX / innerWidth - 0.5) * 0.5;
    wantX = (e.clientY / innerHeight - 0.5) * 0.35;
  }, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // Keep the whole sphere in frame whichever way the box is cut.
    cam.position.z = cam.aspect < 1 ? 11.5 / cam.aspect * 0.8 : 11.5;
    cam.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  const draw = (spin: number) => {
    world.rotation.y = spin + leanY;
    world.rotation.x = 0.28 + leanX;
    shell.rotation.y = -spin * 1.6;
    renderer.render(scene, cam);
  };

  if (reduced) { advance(0.4); draw(0.6); return; }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = performance.now(), spin = 0.6;
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (visible && !document.hidden) {
      spin += dt * 0.16;
      leanX += (wantX - leanX) * Math.min(1, dt * 3);
      leanY += (wantY - leanY) * Math.min(1, dt * 3);
      advance(dt);
      draw(spin);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
