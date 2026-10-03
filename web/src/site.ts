import { RELAY_WS, wireCopyButtons } from './lib/relay';
import { paintSiteNav } from './lib/account';

void paintSiteNav();

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

// The 3D figure is its own chunk, so the page reads before three.js arrives.
const field = document.querySelector<HTMLElement>('#field');
if (field) import('./lib/field').then(({ mountField }) => mountField(field)).catch(() => field.remove());

// The hero lattice is a second three.js chunk. Phones skip it: it is hidden
// there, so it should not be fetched or run.
const lattice = document.querySelector<HTMLCanvasElement>('.mx-lattice');
if (lattice && matchMedia('(min-width: 761px)').matches)
  import('./lib/lattice').then(({ mountLattice }) => mountLattice(lattice)).catch(() => lattice.remove());

// The C4 explorer is three.js too. With no WebGPU and no WebGL2 it throws, the
// figure goes, and the plain topology diagram that was waiting is shown instead.
const c4 = document.querySelector<HTMLElement>('#c4');
if (c4) {
  const fail = () => { c4.remove(); document.querySelector<HTMLElement>('#c4-fallback')?.removeAttribute('hidden'); };
  import('./lib/c4').then(({ mountC4 }) => mountC4(c4)).catch(fail);
}
