# Gmail Federated Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let coaches, staff, parents, and players sign in with Google, in addition to the existing invite-only magic-link flow, on both web and mobile.

**Architecture:** A `BEFORE INSERT ON auth.users` Postgres trigger rejects any brand-new signup from a non-`email` provider (i.e. Google) unless the email already has a `team_invitations` row. This is the single enforcement point — web and mobile only need to call Supabase's standard OAuth flow and handle the error it redirects back with; neither needs to know the invite rule itself.

**Tech Stack:** Supabase Auth (Google provider, PKCE flow), Next.js 14 App Router + `@supabase/ssr`, Expo SDK 51 + `expo-web-browser` + `expo-linking` (already present) + `@supabase/supabase-js`.

## Global Constraints

- Google sign-in is invite-only: it must only succeed for an email that already has a `team_invitations` row, or that already has an `auth.users` row (any origin) — never for a wholly unrecognized Gmail account.
- Enforcement lives ONLY in the database trigger. Do not add a duplicate invite check in web or mobile code.
- No changes to the existing magic-link flow, RLS policies, or roster/invite logic.
- No "link Google to my account" settings UI — out of scope (YAGNI).
- No Google Workspace domain restriction (`hd` param) — out of scope.
- Supabase has one environment (prod) — see `project_supabase_prod_only` memory. Confirm with the user before running `apply_migration` against it, even though it is pre-allowlisted (`feedback_confirm_db_target` memory).
- After applying the migration, reconcile `schema_migrations.version` to the filename timestamp (`reference_supabase_migration_bookkeeping` memory).
- Error copy shown to the user must match verbatim on web and mobile: *"That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to."*
- Mobile reuses the existing `baseballcoaches://auth-callback` redirect scheme already used by magic link (`apps/mobile/app/(auth)/sign-in.tsx:22`) — do not introduce a new scheme or path.
- Conventional Commits format; commit after each task.

---

### Task 1: Database — invite-only signup trigger

**Files:**
- Create: `supabase/migrations/20260919000000_enforce_invite_only_oauth_signup.sql`

**Interfaces:**
- Produces: a trigger `enforce_invite_only_signup` on `auth.users` (`BEFORE INSERT`) backed by function `public.enforce_invite_only_signup()`. No application code calls this directly — it fires automatically inside Supabase's own signup path. Later tasks (2, 5) only need to know that a rejected signup surfaces as `?error=server_error` on the OAuth redirect.

- [ ] **Step 1: Write the migration file**

```sql
-- Invite-only enforcement for non-email auth providers (e.g. Google).
--
-- Supabase's OAuth providers always create a new auth.users row on first
-- login — there is no equivalent of signInWithOtp's `shouldCreateUser: false`
-- for OAuth. This trigger rejects that insert unless the email already has a
-- team_invitations row, so an uninvited Google account can never create a
-- new platform account.
--
-- It does NOT affect linking Google to an *existing* auth.users row (a
-- verified-email match links via auth.identities, which never fires this
-- trigger) — so an already-invited/registered user can always complete
-- Google sign-in and lands on the same account their team membership is on.
create or replace function public.enforce_invite_only_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Email/magic-link signups are already invite-gated in application code
  -- (admin.inviteUserByEmail for staff/parents/players, or the Player Pro
  -- self-signup endpoint) — let them through unconditionally.
  if new.raw_app_meta_data->>'provider' = 'email' then
    return new;
  end if;

  if exists (
    select 1
    from public.team_invitations ti
    where lower(ti.email) = lower(new.email)
  ) then
    return new;
  end if;

  raise exception 'signup_requires_invite'
    using errcode = 'P0001';
end;
$$;

create trigger enforce_invite_only_signup
  before insert on auth.users
  for each row
  execute procedure public.enforce_invite_only_signup();
```

- [ ] **Step 2: STOP — confirm the target database with the user**

This is a `BEFORE INSERT` trigger on `auth.users` in production (the only Supabase environment — see `project_supabase_prod_only` memory). Before calling `apply_migration`, explicitly ask the user to confirm it's OK to apply this to prod now, per the `feedback_confirm_db_target` memory. Do not proceed to Step 3 without an explicit yes.

- [ ] **Step 3: Apply the migration via the Supabase MCP**

Use `mcp__2f4b6150-b5bc-4ca3-8996-ec76d8710939__apply_migration` with the file's contents and name `20260919000000_enforce_invite_only_oauth_signup`.

- [ ] **Step 4: Verify the trigger and function are installed correctly**

Run via `mcp__2f4b6150-b5bc-4ca3-8996-ec76d8710939__execute_sql`:

```sql
select tgname, tgrelid::regclass, tgenabled
from pg_trigger
where tgname = 'enforce_invite_only_signup';
```

Expected: one row, `tgrelid` = `auth.users`, `tgenabled` = `'O'` (enabled).

- [ ] **Step 5: Verify the invite-lookup logic against real data (read-only, no mutation)**

Run via `execute_sql` (adjust the two literals to a real pending/accepted invite email and a definitely-unused one, both read-only):

```sql
select
  exists (select 1 from public.team_invitations where lower(email) = lower('<a real invited email from team_invitations>')) as should_be_true,
  exists (select 1 from public.team_invitations where lower(email) = lower('definitely-not-invited-zzz@example.com')) as should_be_false;
```

Expected: `should_be_true = true`, `should_be_false = false`. This confirms the exact WHERE-clause the trigger uses behaves correctly against live data, without inserting synthetic rows into `auth.users` in production. (Full end-to-end coverage — an actual rejected/accepted Google sign-in — happens in Task 5's manual QA once the Google provider is configured in the Supabase Dashboard.)

- [ ] **Step 6: Regenerate TypeScript types and reconcile migration bookkeeping**

```bash
pnpm --filter @baseball/database gen-types
```

This migration only adds a trigger/function on `auth.users` (not a `public` table/column), so expect little or no diff in `packages/database/src/types/supabase.ts` — commit anyway if `gen-types` changes anything. Then reconcile `schema_migrations.version` in Supabase to the `20260919000000` timestamp per `reference_supabase_migration_bookkeeping`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260919000000_enforce_invite_only_oauth_signup.sql packages/database/src/types/supabase.ts
git commit -m "feat(auth): reject uninvited OAuth signups via DB trigger

Adds a BEFORE INSERT trigger on auth.users that blocks any non-email-
provider signup (i.e. Google) unless the email already has a
team_invitations row. Linking Google to an existing account is
unaffected — that only inserts into auth.identities.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Web — surface a rejected Google sign-in as a friendly error

**Files:**
- Modify: `apps/web/src/app/auth/callback/route.ts:24-59`
- Modify: `apps/web/src/app/(auth)/login/page.tsx:10-16`

**Interfaces:**
- Consumes: Supabase's OAuth redirect, which carries `?error=server_error&error_description=...` when Task 1's trigger rejects the signup (Supabase's generic bucket for any trigger exception during signup — there is no distinct code for this specific case).
- Produces: a redirect to `/login?error=google_not_invited`, rendered via the existing `ERROR_MESSAGES` lookup in `login/page.tsx`. Task 3's button relies on this mapping already existing.

- [ ] **Step 1: Add `?error=` handling to the callback route, before the hash-bridge fallback**

In `apps/web/src/app/auth/callback/route.ts`, insert this block right after `const origin = getAppOrigin(request.nextUrl.origin);` and before the `if (!code && !(tokenHash && type)) {` hash-bridge check:

```ts
  // Supabase redirects here with ?error=... when the OAuth sign-in was
  // rejected upstream — most commonly the enforce_invite_only_signup DB
  // trigger blocking an unrecognized Google email. Handle it explicitly so
  // it doesn't fall through to the hash-bridge branch below (which expects
  // either no params, or a successful auth response).
  const oauthError = searchParams.get('error');
  if (oauthError) {
    console.error(
      '[auth/callback] OAuth error:',
      oauthError,
      searchParams.get('error_description'),
    );
    const errorCode = oauthError === 'server_error' ? 'google_not_invited' : 'auth_failed';
    return NextResponse.redirect(new URL(`/login?error=${errorCode}`, origin));
  }

```

- [ ] **Step 2: Add the error copy to the login page**

In `apps/web/src/app/(auth)/login/page.tsx`, add a new entry to `ERROR_MESSAGES`:

```ts
const ERROR_MESSAGES: Record<string, string> = {
  auth_failed:
    'Your sign-in link has expired or was already used. Please request a new one.',
  link_wrong_browser:
    'It looks like you opened the sign-in link in a different browser or app. Please request a new link below.',
  session_expired: 'Your session has expired. Please sign in again.',
  google_not_invited:
    "That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to.",
};
```

- [ ] **Step 3: Verify manually**

Run the web dev server (`pnpm dev:web`), navigate to `http://localhost:3000/login?error=google_not_invited`, and confirm the red error banner shows the new copy. (This confirms the display path works; triggering it for real requires Task 3's button plus the Google provider being configured in the Supabase Dashboard — external setup, not part of this plan.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/auth/callback/route.ts apps/web/src/app/\(auth\)/login/page.tsx
git commit -m "feat(auth): show a friendly error for rejected Google sign-ins

The auth callback now handles Supabase's ?error= redirect (emitted
when the invite-only DB trigger rejects an OAuth signup) instead of
falling through to the hash-bridge branch.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Web — "Continue with Google" button

**Files:**
- Modify: `apps/web/src/components/auth/LoginForm.tsx`

**Interfaces:**
- Consumes: `createBrowserClient()` from `apps/web/src/lib/supabase/client.ts` (existing, unmodified) — `.auth.signInWithOAuth({ provider, options: { redirectTo } })`.
- Consumes: the `/auth/callback` route and `google_not_invited` error mapping from Task 2.

- [ ] **Step 1: Rewrite `LoginForm.tsx` to add the Google button above the email form**

```tsx
'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

type Mode = 'email' | 'sent';

export function LoginForm(): JSX.Element | null {
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    const supabase = createBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
    // On success the browser navigates away to Google's consent screen —
    // no further local state change needed.
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Server verifies the email is registered and sends the OTP in one step.
      // No browser-side signInWithOtp() — the email template uses token_hash
      // directly, so no PKCE code_verifier cookie is needed.
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to send sign-in link');
        setLoading(false);
        return;
      }

      setMode('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link');
    }
    setLoading(false);
  }

  if (mode === 'sent') {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500">
          We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.
        </p>
        <button
          className="mt-6 text-sm text-brand-600 hover:underline"
          onClick={() => {
            setMode('email');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <GoogleIcon />
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400 uppercase">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleMagicLink} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="coach@school.edu"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Sending…' : 'Send sign-in link'}
        </button>

        <p className="text-xs text-center text-gray-400">
          Enter your email to receive a one-click sign-in link.
        </p>
      </form>
    </div>
  );
}

function GoogleIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.99 2.34C4.66 5.16 6.65 3.58 9 3.58z" />
    </svg>
  );
}
```

Note the error banner moved out of the `<form>` (it's now shared between the Google button and the magic-link form, since both write to the same `error` state).

- [ ] **Step 2: Type-check and lint**

```bash
pnpm type-check
pnpm lint
```

Expected: no new errors from `LoginForm.tsx`.

- [ ] **Step 3: Verify manually**

Run `pnpm dev:web`, open `/login`, confirm: the Google button renders above an "or" divider above the existing email field; clicking it navigates to Google's OAuth consent screen (this will show Google's own error until the Cloud/Supabase Dashboard setup described in the design spec's "External setup" section is done — that's expected and outside this plan's scope). Confirm the existing magic-link flow still works unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/auth/LoginForm.tsx
git commit -m "feat(auth): add Continue with Google button to web login

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Mobile — add the `expo-web-browser` dependency

**Files:**
- Modify: `apps/mobile/package.json` (via `pnpm add`, not hand-edited)
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: the `expo-web-browser` package, whose `openAuthSessionAsync(url, redirectUrl)` Task 5 uses. `expo-linking` (already a dependency) is reused for parsing the returned redirect URL — no other new dependency is needed.

- [ ] **Step 1: Install the dependency at the SDK 51-compatible version**

```bash
pnpm add expo-web-browser@~13.0.3 --filter mobile
```

- [ ] **Step 2: Verify it installed cleanly**

```bash
grep '"expo-web-browser"' apps/mobile/package.json
```

Expected: `"expo-web-browser": "~13.0.3"` present under `dependencies`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml
git commit -m "chore(mobile): add expo-web-browser for Google OAuth

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Mobile — "Continue with Google" button

**Files:**
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `expo-web-browser`'s `WebBrowser.openAuthSessionAsync(url, redirectUrl): Promise<{ type: 'success', url: string } | { type: 'cancel' } | { type: 'dismiss' }>` (Task 4).
- Consumes: `expo-linking`'s `Linking.parse(url): { queryParams?: Record<string, string | string[]> }` (already a dependency, unmodified).
- Consumes: `getSupabaseClient()` from `apps/mobile/src/lib/supabase.ts` (existing, unmodified) — `.auth.signInWithOAuth(...)` and `.auth.exchangeCodeForSession(code)`.

- [ ] **Step 1: Rewrite `sign-in.tsx` to add the Google button and handler**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getSupabaseClient } from '../../src/lib/supabase';

const GOOGLE_REDIRECT_URI = 'baseballcoaches://auth-callback';
const GOOGLE_NOT_INVITED_MESSAGE =
  "That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to.";

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  async function handleSignIn() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: 'baseballcoaches://auth-callback',
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: GOOGLE_REDIRECT_URI, skipBrowserRedirect: true },
    });

    if (oauthError || !data?.url) {
      setError(oauthError?.message ?? 'Unable to start Google sign-in.');
      setGoogleLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT_URI);

    if (result.type !== 'success') {
      // User cancelled or dismissed the browser — not an error.
      setGoogleLoading(false);
      return;
    }

    const { queryParams } = Linking.parse(result.url);

    if (queryParams?.error) {
      setError(GOOGLE_NOT_INVITED_MESSAGE);
      setGoogleLoading(false);
      return;
    }

    const code = queryParams?.code;
    if (typeof code === 'string') {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) setError(exchangeError.message);
    }
    setGoogleLoading(false);
  }

  if (sent) {
    return (
      <View className="flex-1 bg-brand-900 items-center justify-center px-6">
        <Text className="text-5xl mb-4">📧</Text>
        <Text className="text-white text-2xl font-bold mb-2">Check your email</Text>
        <Text className="text-blue-300 text-center mb-8">
          We sent a magic link to {email}. Tap the link to sign in.
        </Text>
        <TouchableOpacity onPress={() => setSent(false)}>
          <Text className="text-blue-300 underline text-sm">Use a different email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-brand-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-white text-3xl font-bold mb-2">Baseball Coaches</Text>
        <Text className="text-blue-300 mb-10">Sign in to your account</Text>

        <TouchableOpacity
          className={`w-full bg-white rounded-xl py-3.5 items-center mb-4 ${
            googleLoading ? 'opacity-50' : ''
          }`}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
        >
          <Text className="text-brand-700 font-bold text-base">
            {googleLoading ? 'Opening Google…' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        <Text className="text-blue-400 text-xs mb-6">or sign in with email</Text>

        <View className="w-full mb-4">
          <Text className="text-blue-200 text-sm font-medium mb-1">Email address</Text>
          <TextInput
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-base"
            placeholder="coach@school.edu"
            placeholderTextColor="rgba(147,197,253,0.5)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {error && (
          <View className="w-full bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-300 text-sm">{error}</Text>
          </View>
        )}

        <TouchableOpacity
          className={`w-full bg-white rounded-xl py-3.5 items-center ${
            loading || !email ? 'opacity-50' : ''
          }`}
          onPress={handleSignIn}
          disabled={loading || !email.trim()}
        >
          <Text className="text-brand-700 font-bold text-base">
            {loading ? 'Sending...' : 'Send magic link'}
          </Text>
        </TouchableOpacity>

        <Text className="text-blue-400 text-xs text-center mt-6">
          No password needed. We'll email you a one-click sign-in link.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
```

Note: `router` from `expo-router` was imported but unused in the original file too — left as-is to keep this a minimal, focused diff (not this task's concern to clean up).

- [ ] **Step 2: Type-check**

```bash
pnpm --filter mobile exec tsc --noEmit
```

Expected: no new errors from `sign-in.tsx`.

- [ ] **Step 3: Verify manually in the iOS Simulator**

Boot/attach the simulator, launch the app, navigate to the sign-in screen, confirm: the "Continue with Google" button renders above the "or sign in with email" divider; tapping it opens an in-app browser sheet pointed at Google's OAuth consent screen (this will show Google's own error until the external Cloud/Supabase Dashboard setup from the design spec is done — expected, outside this plan's scope); confirm the existing magic-link flow still works unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(auth\)/sign-in.tsx
git commit -m "feat(auth): add Continue with Google button to mobile sign-in

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- DB trigger enforcement → Task 1. ✅
- Web callback error handling + copy → Task 2. ✅
- Web Google button → Task 3. ✅
- Mobile dependency → Task 4. ✅
- Mobile Google button + error handling → Task 5. ✅
- External setup (Google Cloud, Supabase Dashboard) → intentionally excluded from tasks; called out as a prerequisite for full manual QA in Tasks 3 and 5, matching the spec's "External setup (outside the repo)" section, which is explicitly the user's responsibility, not code.
- Testing section of the spec → covered by Task 1 Steps 4–5 (DB-level, adapted to avoid unsafe synthetic `auth.users` inserts in prod — see Task 1 Step 5's note) and the manual QA steps in Tasks 3 and 5.

**Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.

**Type consistency:** `signInWithOAuth({ provider: 'google', options: { redirectTo, ... } })` and `exchangeCodeForSession(code: string)` are used identically in Tasks 3 and 5 (both call directly into `@supabase/supabase-js`, no custom wrapper introduced — consistent with the codebase's existing pattern of calling the Supabase client directly from screens/components rather than through a shared auth abstraction).
