import { authUrl } from './auth-url';

/**
 * Whether someone is signed in, for the pages around the console.
 *
 * The site, docs and status pages carry "sign in" and "start free" in their
 * nav. Shown to someone who is already signed in, those read as if the
 * session had been lost. The console leaves a hint here when it boots and
 * clears it on sign-out, so a page can paint the right nav at once; the page
 * then asks Neon Auth, which is served from this origin, and corrects itself.
 *
 * The hint is presentation only. Nothing is authorised by it: the console
 * still checks the session, and the relay still checks the JWT.
 */
const KEY = 'knoot.who';

export function rememberSignedIn(email: string): void {
  try { localStorage.setItem(KEY, email || 'signed-in'); } catch { /* private mode */ }
}

export function forgetSignedIn(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

function hinted(): boolean {
  try { return Boolean(localStorage.getItem(KEY)); } catch { return false; }
}

/**
 * Marked-up nav links switch on sign-in state:
 *
 *   data-auth="signin"  hidden while signed in
 *   data-auth="cta"     points at the console, with its `data-signed-in` text
 */
function paint(signedIn: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-auth="signin"]')) el.hidden = signedIn;
  for (const el of document.querySelectorAll<HTMLAnchorElement>('[data-auth="cta"]')) {
    el.dataset.signedOut ??= el.textContent ?? '';
    el.dataset.signedOutHref ??= el.getAttribute('href') ?? '/app/#signup';
    el.textContent = signedIn ? (el.dataset.signedIn ?? 'Open console') : el.dataset.signedOut;
    el.setAttribute('href', signedIn ? '/app/' : el.dataset.signedOutHref);
  }
}

export async function paintSiteNav(): Promise<void> {
  paint(hinted());
  const base = authUrl();
  if (!base) return;
  try {
    const r = await fetch(`${base}/get-session`, { credentials: 'include' });
    if (!r.ok) return;
    const body = (await r.json().catch(() => null)) as { user?: { email?: string } } | null;
    if (body?.user) rememberSignedIn(body.user.email ?? '');
    else forgetSignedIn();
    paint(Boolean(body?.user));
  } catch { /* offline, or no auth here: keep the hint */ }
}
