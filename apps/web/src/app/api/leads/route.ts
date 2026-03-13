import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Lead capture endpoint — stores interested user email and notifies sales.
 *
 * POST /api/leads
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Basic email format validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Insert lead into Supabase
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { error: insertError } = await db
    .from('leads')
    .insert({ email: normalizedEmail });

  // Handle duplicate email (unique constraint violation)
  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  // Send notification email to sales (best-effort — don't fail the response)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'DiamondOS <noreply@diamondos.app>',
        to: 'sales@diamondos.app',
        subject: `New Lead: ${normalizedEmail}`,
        text: `${normalizedEmail} expressed interest in DiamondOS on ${new Date().toISOString()}.`,
      });
    } catch {
      // Email send failure is non-critical — the lead is already stored
    }
  }

  return NextResponse.json({ success: true, duplicate: false });
}
