import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { authUrl } from './auth-url';

/**
 * Neon holds identity and the team records: who you are, which team you
 * belong to, and the invitations into it. The event log stays on the relay,
 * because that is the thing that has to survive without a network.
 *
 * Both URLs are injected at build time and both are public: the auth URL is
 * where the browser signs in (same-origin on hosted builds; see `auth-url`), and everything the Data API URL can reach is
 * behind row-level security keyed on the signed-in person's JWT. There is no
 * key to leak. A build without them still serves every page; the console just
 * explains that sign-in is not configured rather than throwing on load.
 *
 * The Supabase-shaped adapter keeps the auth calls this console was written
 * against. Password changes are the exception — see `setNewPassword` and
 * `changePassword` below.
 */
const AUTH_URL = authUrl();
const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL as string | undefined;

export const configured = Boolean(AUTH_URL && DATA_API_URL);

export const neon = configured
  ? createClient({
      auth: { url: AUTH_URL!, adapter: SupabaseAuthAdapter() },
      dataApi: { url: DATA_API_URL! },
    })
  : null;

type Client = NonNullable<typeof neon>;

export type Team = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type Member = {
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
};

export type AgentToken = {
  id: string;
  team_id: string;
  label: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

export type Repo = {
  id: string;
  team_id: string;
  repo_key: string;
  last_seen_at: string | null;
};

export function requireClient(): Client {
  if (!neon) throw new Error('Sign-in is not configured on this deployment.');
  return neon;
}

/**
 * Finish a password reset. The emailed link lands on the console with a
 * one-time `token` in the query string; it is not a session, so the person
 * signs in with the new password afterwards. Supabase's `updateUser` did this
 * from a recovery session, and Neon's adapter refuses a password there.
 */
export async function setNewPassword(token: string, newPassword: string): Promise<void> {
  const ba = requireClient().auth.getBetterAuthInstance();
  // Better Auth calls a used or expired link an invalid session token, which
  // is true and no help to someone holding an old email. It may return that
  // or throw it, depending on the client's fetch options.
  const used = new Error('That reset link has expired or was already used. Choose Forgot password for a new one.');
  const { error } = await ba.resetPassword({ newPassword, token }).catch(() => { throw used; });
  if (error) throw used;
}

/**
 * Email a sign-up confirmation code to `email`. The project requires one before
 * an account can sign in, and the code expires after fifteen minutes.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const ba = requireClient().auth.getBetterAuthInstance();
  const { error } = await ba.emailOtp
    .sendVerificationOtp({ email, type: 'email-verification' })
    .catch((e: { message?: string }) => ({ error: e }));
  if (error) throw new Error(error.message ?? 'A code could not be sent. Try again in a minute.');
}

/** Confirm an address with the code that was emailed to it. */
export async function verifyEmailCode(email: string, otp: string): Promise<void> {
  const ba = requireClient().auth.getBetterAuthInstance();
  const wrong = new Error('That code is not right, or it has expired. Send a new one.');
  const { error } = await ba.emailOtp
    .verifyEmail({ email, otp: otp.trim() })
    .catch(() => ({ error: wrong }));
  if (error) throw wrong;
}

/** Change the password of the signed-in person. Needs the current one. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const ba = requireClient().auth.getBetterAuthInstance();
  // A wrong current password comes back as "Invalid email or password", which
  // reads as if the account were the problem. Returned or thrown, as above.
  const wrong = (e: { status?: number; message?: string }): Error =>
    e.status === 400 || e.status === 401
      ? new Error('Your current password is not right.')
      : new Error(e.message ?? 'The password could not be changed.');
  const { error } = await ba
    .changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
    .catch((e: { status?: number; message?: string }) => { throw wrong(e); });
  if (error) throw wrong(error);
}

/** The team this user belongs to, creating one on first sign-in. */
export async function loadTeam(): Promise<{ team: Team; role: Member['role'] } | null> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('team_members')
    .select('role, teams(id, name, slug, created_at)')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const team = (data as unknown as { teams: Team }).teams;
  return { team, role: (data as unknown as { role: Member['role'] }).role };
}

/**
 * Called once after sign-up: makes the team and the owner row in one step.
 *
 * The first Data API call after the Neon compute has scaled to zero can reach
 * Postgres without the JWT's claims applied, so `auth.uid()` is null and the
 * function refuses with "not signed in" though the request carried a valid
 * token. Sign-up is exactly that first call on a quiet project. The same call
 * a moment later succeeds, so that one refusal is retried.
 */
export async function createTeam(name: string): Promise<Team> {
  const sb = requireClient();
  for (const wait of [0, 500, 1000, 2000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const { data, error } = await sb.rpc('create_team', { team_name: name });
    if (!error) return data as Team;
    if (error.message !== 'not signed in') throw new Error(error.message);
  }
  throw new Error('Your account was created, but the team could not be. Reload this page to finish.');
}

export type Invite = {
  id: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  expires_at: string;
};

/**
 * Invite someone by email. Returns the secret once — only its hash is stored,
 * so there is no way to read an outstanding invitation back out afterwards.
 * Whoever invites has to pass the link on themselves; nothing here sends mail.
 */
export async function inviteMember(email: string, role: Invite['role'] = 'member'): Promise<string> {
  const sb = requireClient();
  const { data, error } = await sb.rpc('invite_member', { invite_email: email, invite_role: role });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listInvites(): Promise<Invite[]> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('invites')
    .select('id, email, role, created_at, expires_at')
    .is('accepted_at', null)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Invite[];
}

export async function revokeInvite(id: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc('revoke_invite', { invite_id: id });
  if (error) throw new Error(error.message);
}

/**
 * Join the team an invitation was for. The join and the invitation's closure
 * are one transaction in Postgres, so a failure cannot leave someone signed in
 * with a team they cannot see and a secret they cannot use again.
 */
export async function acceptInvite(token: string): Promise<Team> {
  const sb = requireClient();
  const { data, error } = await sb.rpc('accept_invite', { invite_token: token });
  if (error) throw new Error(error.message);
  return data as Team;
}

/**
 * Take a person out of the team. This is the Neon half; their device keys
 * live on the relay and are revoked through `/api/members/:id/remove`, which
 * the console calls straight afterwards. Two steps, because a relay that
 * accepted a webhook from anywhere would be a worse trade.
 */
export async function removeTeamMember(userId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.rpc('remove_member', { member_user: userId });
  if (error) throw new Error(error.message);
}
