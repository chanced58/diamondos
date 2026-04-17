# Supabase email templates

The web app's `/auth/callback` handler accepts three delivery shapes
(PKCE `?code`, OTP `?token_hash`, and implicit `#access_token`) so the
app works regardless of how the Supabase Dashboard templates are set.
For the cleanest sign-in experience (no hash-fragment round-trip),
configure the following templates.

Dashboard → Authentication → Email Templates.

## Magic Link

```html
<h2>Sign in to Diamond OS</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink">
    Sign in
  </a>
</p>
```

## Invite user

```html
<h2>You've been invited to Diamond OS</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite">
    Accept invitation
  </a>
</p>
```

The `invite-member` edge function additionally appends
`&team=<id>&role=<role>` (and `&player=<id>` or `&players=<id,id>`) to
the `redirect_to` URL so the callback can accept the invitation in the
same request. Use `{{ .SiteURL }}` only for the base; the edge function
builds the full URL.

## Confirm signup

```html
<h2>Confirm your email</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">
    Confirm email
  </a>
</p>
```

## Reset password

```html
<h2>Reset your password</h2>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">
    Reset password
  </a>
</p>
```

## Why `{{ .TokenHash }}` instead of `{{ .ConfirmationURL }}`

`{{ .ConfirmationURL }}` routes through `<project>.supabase.co/auth/v1/verify`
and then 302-redirects to the app. When `signInWithOtp` is called
server-side with a service-role client (as the
`/api/auth/send-magic-link` endpoint does to enforce the invite-only
`user_profiles` check), no PKCE `code_verifier` cookie is set in the
user's browser, so Supabase falls back to the implicit flow and
delivers tokens in a URL hash fragment. Hash fragments are invisible
to server routes, which forces a client-side bridge hop.

Using `{{ .TokenHash }}` with our own callback URL keeps the entire
exchange on the server: the browser hits `/auth/callback` once,
`verifyOtp` runs, and session cookies are set on the same response.

## `{{ .SiteURL }}`

Set **Site URL** in Dashboard → Authentication → URL Configuration to
match the `NEXT_PUBLIC_APP_URL` (and `APP_URL`) environment variables.
For the email templates above, `{{ .SiteURL }}` must resolve to the
public origin where the Next.js app is reachable (e.g.
`https://app.diamondos.com`, not the Render internal address).
