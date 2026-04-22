import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { buildIcsFeedUrl } from '@/lib/ics-token';
import { IcsFeedCard } from '@/components/integrations/IcsFeedCard';
import {
  PlayerExternalIdsTable,
  type PlayerExternalIdRow,
} from '@/components/integrations/PlayerExternalIdsTable';
import { ComingSoonCard } from '@/components/integrations/ComingSoonCard';

export const metadata: Metadata = { title: 'Integrations' };

const INITIAL_TOKEN_VERSION = 1;

export default async function IntegrationsPage({
  params,
}: {
  params: { teamId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const { isCoach, isPlatformAdmin } = await getUserAccess(params.teamId, user.id);
  if (!isCoach && !isPlatformAdmin) notFound();

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Self-healing: ensure a calendar_ics integration row exists so the feed URL
  // is immediately usable on first visit. Idempotent — re-running does nothing
  // once a row is present. ignoreDuplicates avoids clobbering an existing
  // config (which may hold a rotated version).
  await db
    .from('team_integrations')
    .upsert(
      {
        team_id: params.teamId,
        service: 'calendar_ics',
        config: { ics_token_version: INITIAL_TOKEN_VERSION },
        is_active: true,
        connected_by: user.id,
      },
      { onConflict: 'team_id,service', ignoreDuplicates: true },
    );

  const [teamResult, integrationResult, externalIdsResult] = await Promise.all([
    db.from('teams').select('name').eq('id', params.teamId).single(),
    db
      .from('team_integrations')
      .select('config')
      .eq('team_id', params.teamId)
      .eq('service', 'calendar_ics')
      .maybeSingle(),
    db
      .from('player_external_ids')
      .select('service, external_id, created_at, players!inner(first_name, last_name, jersey_number, team_id)')
      .eq('players.team_id', params.teamId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const teamName = teamResult.data?.name ?? 'Your Team';
  const config = integrationResult.data?.config as Record<string, unknown> | null;
  const version = Number(config?.ics_token_version ?? INITIAL_TOKEN_VERSION);
  const rotatedAt = (config?.ics_token_rotated_at as string | undefined) ?? null;

  const feedUrl = await buildIcsFeedUrl(params.teamId, version);

  // Shape rows for the read-only table. The embedded `players` relation comes
  // back from supabase-js typed as an array (one-to-many join); in practice a
  // given player_external_ids row has exactly one player, so we take [0].
  type EmbeddedPlayer = {
    first_name: string;
    last_name: string;
    jersey_number: number | null;
  };
  type ExternalIdRow = {
    service: string;
    external_id: string;
    created_at: string;
    players: EmbeddedPlayer | EmbeddedPlayer[] | null;
  };
  const rows: PlayerExternalIdRow[] = ((externalIdsResult.data ?? []) as unknown as ExternalIdRow[])
    .map((r) => {
      const player = Array.isArray(r.players) ? r.players[0] ?? null : r.players;
      if (!player) return null;
      return {
        playerName: `${player.first_name} ${player.last_name}`.trim(),
        jerseyNumber: player.jersey_number,
        service: r.service,
        externalId: r.external_id,
        linkedAt: r.created_at,
      };
    })
    .filter((r): r is PlayerExternalIdRow => r !== null);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Integrations</h1>
      <p className="text-gray-500 mb-8">{teamName}</p>

      <div className="space-y-6">
        <IcsFeedCard teamId={params.teamId} feedUrl={feedUrl} rotatedAt={rotatedAt} />

        <PlayerExternalIdsTable rows={rows} />

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Available in a later release</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ComingSoonCard
              name="Rapsodo"
              description="Import hitting and pitching session CSVs from Rapsodo Cloud."
            />
            <ComingSoonCard
              name="Blast Motion"
              description="Import bat-sensor swing sessions from Blast Connect."
            />
            <ComingSoonCard
              name="HitTrax"
              description="Import cage-session exports from HitTrax."
            />
            <ComingSoonCard
              name="GameChanger"
              description="Import box-score CSV exports from a coach's GameChanger account."
            />
          </div>
        </section>
      </div>
    </div>
  );
}
