import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { getLatestScoutingCard } from '@baseball/database';
import type {
  AiHitterProfile,
  AiPitcherTendency,
  ScoutingHitterStats,
} from '@baseball/shared';

export const metadata: Metadata = { title: 'Scouting card — print' };

export default async function ScoutingCardPrintPage({
  params,
}: {
  params: Promise<{ opponentTeamId: string }>;
}): Promise<JSX.Element | null> {
  const { opponentTeamId } = await params;

  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/games/opponents');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the opponent belongs to the active team BEFORE loading the card
  // (defense-in-depth; RLS already filters on team_id, but we don't rely on
  // it alone when using the service-role client).
  const { data: oppTeam } = await db
    .from('opponent_teams')
    .select('id, name, city, state_code, team_id')
    .eq('id', opponentTeamId)
    .maybeSingle();

  if (!oppTeam || oppTeam.team_id !== activeTeam.id) {
    redirect('/games/opponents');
  }

  const card = await getLatestScoutingCard(
    db as never,
    opponentTeamId,
    activeTeam.id,
  );

  if (!card) {
    return (
      <div className="p-8">
        <p className="text-gray-600">
          No scouting card has been generated yet.
        </p>
      </div>
    );
  }

  const hitterStatById = new Map<string, ScoutingHitterStats>(
    card.hitterStats.map((h) => [h.opponentPlayerId, h]),
  );

  return (
    <div className="print-page bg-white text-gray-900 p-6 text-xs leading-tight font-sans">
      <style>{`
        @media print {
          body { background: white; }
          .no-print { display: none !important; }
          .print-page { padding: 12mm !important; }
        }
        .print-page h1 { font-size: 14pt; }
        .print-page h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em; color: #4b5563; }
      `}</style>
      <header className="flex items-baseline justify-between border-b border-gray-300 pb-2 mb-3">
        <h1 className="font-bold">{oppTeam.name}</h1>
        <div className="text-[10pt] text-gray-500">
          {card.gameSampleCount} games sampled ·{' '}
          {new Date(card.generatedAt).toLocaleDateString()}
        </div>
      </header>

      <div className="bg-gray-100 border border-gray-300 p-2 mb-3">
        <strong>Takeaway. </strong>
        {card.aiCard.oneLineSummary}
      </div>

      {card.aiCard.teamTendencies.bullets.length > 0 && (
        <section className="mb-3">
          <h2>Team tendencies</h2>
          <ul className="list-disc pl-5 mt-1">
            {card.aiCard.teamTendencies.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4">
        {card.aiCard.pitcherTendencies.length > 0 && (
          <section>
            <h2>Pitchers</h2>
            <div className="space-y-2 mt-1">
              {card.aiCard.pitcherTendencies.map((p, i) => (
                <PrintPitcher key={p.opponentPlayerId ?? `noid-${i}`} ai={p} />
              ))}
            </div>
          </section>
        )}

        {card.aiCard.hitterProfiles.length > 0 && (
          <section>
            <h2>Hitters</h2>
            <div className="space-y-2 mt-1">
              {card.aiCard.hitterProfiles.map((h) => (
                <PrintHitter
                  key={h.opponentPlayerId}
                  ai={h}
                  stats={hitterStatById.get(h.opponentPlayerId)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {card.aiCard.keyMatchups.length > 0 && (
        <section className="mt-3 pt-2 border-t border-gray-300">
          <h2>Key matchups</h2>
          <ul className="mt-1 space-y-1">
            {card.aiCard.keyMatchups.map((m, i) => (
              <li key={i}>
                <strong>
                  {m.ourLabel} vs {m.theirLabel}:
                </strong>{' '}
                {m.note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PrintPitcher({ ai }: { ai: AiPitcherTendency }): JSX.Element {
  return (
    <div>
      <div className="font-semibold">{ai.displayName}</div>
      <div className="text-gray-700">{ai.approach}</div>
      <div className="text-gray-700 italic">Attack: {ai.howToAttack}</div>
    </div>
  );
}

function PrintHitter({
  ai,
  stats,
}: {
  ai: AiHitterProfile;
  stats?: ScoutingHitterStats;
}): JSX.Element {
  return (
    <div>
      <div className="flex justify-between">
        <span className="font-semibold">
          {stats ? stats.displayName : '(player)'}
          {stats?.position && ` · ${stats.position}`}
          {stats?.bats && ` · bats ${stats.bats}`}
        </span>
        {stats && (
          <span className="font-mono tabular-nums text-[9pt] text-gray-500">
            {stats.avg}/{stats.obp}/{stats.slg} · {stats.pa} PA
          </span>
        )}
      </div>
      <div className="text-gray-700">{ai.approach}</div>
      <div className="text-gray-700 italic">Pitch: {ai.howToPitchThem}</div>
      <div className="text-[9pt] text-gray-500 mt-0.5">
        Hot: {ai.hotZones.join(',') || '—'} · Cold: {ai.coldZones.join(',') || '—'} · Steal:{' '}
        {ai.stealRisk} · Bunt: {ai.buntRisk}
      </div>
    </div>
  );
}
