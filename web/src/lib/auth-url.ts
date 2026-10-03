/**
 * Where Neon Auth is, as the browser should reach it.
 *
 * Hosted builds set `VITE_NEON_AUTH_URL=/neon-auth`: Caddy (and the Vite dev
 * proxy) forward that path to the branch's Neon Auth. Served from this origin
 * the session cookie is first-party, so no browser's third-party cookie rules
 * can sign someone out between pages. An absolute URL still works, at the
 * cost of depending on those rules.
 */
export function authUrl(): string | null {
  const raw = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
  if (!raw) return null;
  return new URL(raw, location.origin).href.replace(/\/$/, '');
}
