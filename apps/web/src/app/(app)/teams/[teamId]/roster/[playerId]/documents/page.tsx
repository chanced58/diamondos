import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { UploadDocumentForm } from './UploadDocumentForm';
import { DocumentsTable } from './DocumentsTable';

export const metadata: Metadata = { title: 'Player Documents' };

export default async function PlayerDocumentsPage({
  params,
}: {
  params: { teamId: string; playerId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const access = await getUserAccess(params.teamId, user.id);
  if (!access.isCoach) {
    // Non-coaches (parents, players) have their own doc views; redirect them there.
    redirect(`/teams/${params.teamId}/roster/${params.playerId}`);
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [playerResult, docTypesResult, documentsResult] = await Promise.all([
    db
      .from('players')
      .select('id, team_id, first_name, last_name, jersey_number')
      .eq('id', params.playerId)
      .eq('team_id', params.teamId)
      .single(),
    db
      .from('player_document_type')
      .select('slug, name, requires_expiration, visibility, team_id')
      .or(`visibility.eq.system,team_id.eq.${params.teamId}`)
      .order('name'),
    db
      .from('player_documents')
      .select('id, document_type, title, signed_on, expires_on, notes, uploaded_at, is_current')
      .eq('player_id', params.playerId)
      .order('uploaded_at', { ascending: false }),
  ]);

  if (!playerResult.data) notFound();
  const player = playerResult.data;
  const docTypes = docTypesResult.data ?? [];
  const documents = documentsResult.data ?? [];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link
          href={`/teams/${params.teamId}/roster/${params.playerId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to player
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Documents — {player.first_name} {player.last_name}
          {player.jersey_number != null && (
            <span className="text-gray-400 font-normal"> #{player.jersey_number}</span>
          )}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Liability waivers, medical releases, and other compliance documents.
        </p>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Upload a document</h2>
        <UploadDocumentForm
          teamId={params.teamId}
          playerId={params.playerId}
          docTypes={docTypes}
        />
      </section>

      <DocumentsTable
        teamId={params.teamId}
        playerId={params.playerId}
        documents={documents}
        docTypes={docTypes}
        today={today}
      />
    </div>
  );
}
