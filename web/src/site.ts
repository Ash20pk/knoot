import { RELAY_WS, wireCopyButtons } from './lib/relay';

const line = document.querySelector('#relay-line');
if (line) line.textContent = `relay ${RELAY_WS}`;
wireCopyButtons();

// The 3D figure is its own chunk, so the page reads before three.js arrives.
const field = document.querySelector<HTMLElement>('#field');
if (field) import('./lib/field').then(({ mountField }) => mountField(field)).catch(() => field.remove());
