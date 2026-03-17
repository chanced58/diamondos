import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const SALES_EMAIL = 'sales@diamondos.app';

/**
 * Lead capture endpoint — stores interested user email and notifies sales.
 *
 * POST /api/leads
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email } = body as Record<string, unknown>;
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Insert lead into Supabase using the service role key so RLS never blocks
  // a valid submission regardless of future policy changes.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const submittedAt = new Date();

  const { error: insertError } = await db
    .from('leads')
    .insert({ email: normalizedEmail });

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
        subject: `New lead: ${normalizedEmail}`,
        text: [
          'A new prospect submitted their email on the DiamondOS landing page.',
          '',
          `Email:     ${normalizedEmail}`,
          `Submitted: ${submittedAt.toUTCString()}`,
        ].join('\n'),
        html: `
          <p>A new prospect submitted their email on the <strong>DiamondOS</strong> landing page.</p>
          <table cellpadding="4" style="font-family:sans-serif;font-size:14px">
            <tr><td style="color:#6b7280">Email</td><td><a href="mailto:${normalizedEmail}">${normalizedEmail}</a></td></tr>
            <tr><td style="color:#6b7280">Submitted</td><td>${submittedAt.toUTCString()}</td></tr>
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
