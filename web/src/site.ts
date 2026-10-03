import { RELAY_WS, wireCopyButtons } from './lib/relay';

const line = document.querySelector('#relay-line');
if (line) line.textContent = `relay ${RELAY_WS}`;
wireCopyButtons();

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The eyebrow types itself once, the way a terminal would print it.
const eyebrow = document.querySelector<HTMLElement>('.mx-eyebrow[data-type]');
if (eyebrow) {
  const text = eyebrow.dataset.type ?? '';
  if (reduced) eyebrow.textContent = text;
  else {
    let i = 0;
    const tick = () => {
      eyebrow.textContent = text.slice(0, ++i);
      if (i < text.length) setTimeout(tick, text[i - 1] === '.' ? 380 : 42 + Math.random() * 38);
    };
    setTimeout(tick, 500);
  }
}

// Digital rain behind the hero. Plain 2D canvas: it is decoration, so it gets
// none of three.js's weight, runs at ~30 fps, and stops when nobody can see it.
const canvas = document.querySelector<HTMLCanvasElement>('.mx-rain');
if (canvas) rain(canvas);

function rain(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Half-width katakana, digits, and the letters of the thing itself.
  const glyphs = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789knot:=<>*+';
  const size = 16;
  let cols = 0, rows = 0, drops: number[] = [], speed: number[] = [];

  const resize = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / size); rows = Math.ceil(h / size);
    drops = Array.from({ length: cols }, () => Math.random() * -rows);
    speed = Array.from({ length: cols }, () => 0.35 + Math.random() * 0.75);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  };

  const step = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Each frame fades the last a little, which is what leaves the trails.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${size - 2}px 'JetBrains Mono', monospace`;
    for (let c = 0; c < cols; c++) {
      const y = drops[c];
      if (y >= 0) {
        const ch = glyphs[(Math.random() * glyphs.length) | 0];
        // The head is near-white; the trail behind it is the fade.
        ctx.fillStyle = Math.random() < 0.08 ? '#e6ffe9' : '#00ff41';
        ctx.fillText(ch, c * size, y * size);
      }
      drops[c] += speed[c];
      if (drops[c] * size > h && Math.random() > 0.975) drops[c] = Math.random() * -20;
    }
  };

  resize();
  new ResizeObserver(resize).observe(canvas);

  if (reduced) {
    // One still frame of rain, already fallen.
    for (let i = 0; i < rows * 2; i++) step();
    return;
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  let last = 0;
  const loop = (now: number) => {
    if (visible && !document.hidden && now - last > 33) { last = now; step(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// The 3D figure is its own chunk, so the page reads before three.js arrives.
const field = document.querySelector<HTMLElement>('#field');
if (field) import('./lib/field').then(({ mountField }) => mountField(field)).catch(() => field.remove());
