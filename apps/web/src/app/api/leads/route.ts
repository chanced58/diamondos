import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const SALES_EMAIL = 'sales@diamondos.app';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lead capture endpoint — stores interested user info and notifies sales.
 *
 * POST /api/leads
 * Body: { name: string, email: string, organization: string, state: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { name, email, organization, state } = body as Record<string, unknown>;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!organization || typeof organization !== 'string') {
    return NextResponse.json({ error: 'Organization is required' }, { status: 400 });
  }
  if (!state || typeof state !== 'string') {
    return NextResponse.json({ error: 'State is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = name.trim();
  const normalizedOrg = organization.trim();
  const normalizedState = state.trim().toUpperCase();

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Insert lead into Supabase using the service role key so RLS never blocks
  // a valid submission regardless of future policy changes.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[leads] Missing Supabase environment variables');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  const db = createClient(supabaseUrl, supabaseServiceKey);

  const submittedAt = new Date();

  const { error: insertError } = await db
    .from('leads')
    .insert({
      email: normalizedEmail,
      contact_name: normalizedName,
      organization: normalizedOrg,
      state: normalizedState,
    });

  // Handle duplicate email (unique constraint violation)
  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    console.error('[leads] Supabase insert error:', insertError);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  // Send notification email to sales (best-effort — don't fail the response).
  // Errors are logged so they're visible in Vercel / server logs.
  if (!process.env.RESEND_API_KEY) {
    console.warn('[leads] RESEND_API_KEY is not set — skipping sales notification email');
  } else {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error: sendError } = await resend.emails.send({
        from: 'DiamondOS <noreply@diamondos.app>',
        to: SALES_EMAIL,
        subject: `New lead: ${normalizedName} — ${normalizedOrg} (${normalizedState})`,
        text: [
          'A new prospect submitted their info on the DiamondOS landing page.',
          '',
          `Name:         ${normalizedName}`,
          `Email:        ${normalizedEmail}`,
          `Organization: ${normalizedOrg}`,
          `State:        ${normalizedState}`,
          `Submitted:    ${submittedAt.toUTCString()}`,
        ].join('\n'),
        html: `
          <p>A new prospect submitted their info on the <strong>DiamondOS</strong> landing page.</p>
          <table cellpadding="4" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
            <tr><td style="color:#6b7280;padding-right:16px">Name</td><td>${escapeHtml(normalizedName)}</td></tr>
            <tr><td style="color:#6b7280;padding-right:16px">Email</td><td><a href="mailto:${escapeHtml(normalizedEmail)}">${escapeHtml(normalizedEmail)}</a></td></tr>
            <tr><td style="color:#6b7280;padding-right:16px">Organization</td><td>${escapeHtml(normalizedOrg)}</td></tr>
            <tr><td style="color:#6b7280;padding-right:16px">State</td><td>${escapeHtml(normalizedState)}</td></tr>
            <tr><td style="color:#6b7280;padding-right:16px">Submitted</td><td>${submittedAt.toUTCString()}</td></tr>
          </table>
        `,
      });
      if (sendError) {
        console.error('[leads] Resend send error:', sendError);
      }
    } catch (err) {
      console.error('[leads] Unexpected error sending sales notification:', err);
    }
  }

  return NextResponse.json({ success: true, duplicate: false });
}
