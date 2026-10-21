/**
 * Finalize a game on behalf of the mobile app.
 *
 * The mobile scorer works offline-first: End Game records a game_end event
 * locally and marks the local games row completed. When connectivity returns,
 * the sync engine pushes the event log, then calls this route to run the
 * server-side finalization that mobile can't (status/score update,
 * dual-scorekeeper reconciliation, league snapshot recompute) — the exact
 * same finalizeGame used by the web endGameAction.
 *
 * Auth: Supabase JWT in the Authorization header (no cookies — the caller is
 * the mobile app). Idempotent: safe under sync-cycle retries and after the
 * coach's game_end event has already been pushed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api/bearer-auth';
import { getAuthorizedCoach, finalizeGame } from '@/lib/games/finalize';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: { gameId: string } },
) {
  try {
    if (!UUID_RE.test(params.gameId)) {
      return NextResponse.json({ error: 'Invalid game id' }, { status: 400 });
    }

    const auth = await requireApiUser(req);
    if (auth.response) return auth.response;
    const { user, db } = auth;

    const authz = await getAuthorizedCoach(db, user.id, params.gameId);
    if ('error' in authz) {
      const status = authz.code === 'not_found' ? 404 : 403;
      return NextResponse.json({ error: authz.error }, { status });
    }

    // Body fields only matter when no game_end event exists yet (the mobile
    // flow pushes its own event first, so these are a fallback).
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // Empty/invalid body is fine — defaults below.
    }

    const result = await finalizeGame(db, {
      gameId: params.gameId,
      userId: user.id,
      clientHomeScore: typeof body.homeScore === 'number' ? body.homeScore : 0,
      clientAwayScore: typeof body.awayScore === 'number' ? body.awayScore : 0,
      inning: typeof body.inning === 'number' ? body.inning : 1,
      isTopOfInning: body.isTopOfInning === true,
      deviceId: typeof body.deviceId === 'string' ? body.deviceId : 'mobile',
    });

    if ('error' in result) {
      console.error(`[finalize route] game=${params.gameId}: ${result.error}`);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never leak internal exception details to the client.
    console.error(`[finalize route] game=${params.gameId} threw:`, err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
