import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PlayerProfile,
  PlayerHighlightVideo,
  PlayerProfilePhoto,
  VideoProvider,
} from '@baseball/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

const PROFILE_COLUMNS = `
  user_id, handle, is_public, headline, bio, profile_photo_url,
  height_inches, weight_lbs, gpa, sat_score, act_score, target_majors,
  sixty_yard_dash_seconds, exit_velocity_mph, pitch_velocity_mph, pop_time_seconds,
  achievements, created_at, updated_at
`;

const HIGHLIGHT_COLUMNS = 'id, user_id, title, url, provider, sort_order, created_at';
const PHOTO_COLUMNS = 'id, user_id, storage_path, caption, sort_order, created_at';

// --- mappers ----------------------------------------------------------------

type ProfileRow = {
  user_id: string;
  handle: string;
  is_public: boolean;
  headline: string | null;
  bio: string | null;
  profile_photo_url: string | null;
  height_inches: number | null;
  weight_lbs: number | null;
  gpa: number | null;
  sat_score: number | null;
  act_score: number | null;
  target_majors: string[] | null;
  sixty_yard_dash_seconds: number | null;
  exit_velocity_mph: number | null;
  pitch_velocity_mph: number | null;
  pop_time_seconds: number | null;
  achievements: string[] | null;
  created_at: string;
  updated_at: string;
};

function mapProfile(row: ProfileRow): PlayerProfile {
  return {
    userId: row.user_id,
    handle: row.handle,
    isPublic: row.is_public,
    headline: row.headline,
    bio: row.bio,
    profilePhotoUrl: row.profile_photo_url,
    heightInches: row.height_inches,
    weightLbs: row.weight_lbs,
    gpa: row.gpa !== null ? Number(row.gpa) : null,
    satScore: row.sat_score,
    actScore: row.act_score,
    targetMajors: row.target_majors ?? [],
    sixtyYardDashSeconds:
      row.sixty_yard_dash_seconds !== null ? Number(row.sixty_yard_dash_seconds) : null,
    exitVelocityMph: row.exit_velocity_mph,
    pitchVelocityMph: row.pitch_velocity_mph,
    popTimeSeconds: row.pop_time_seconds !== null ? Number(row.pop_time_seconds) : null,
    achievements: row.achievements ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type HighlightRow = {
  id: string;
  user_id: string;
  title: string;
  url: string;
  provider: VideoProvider;
  sort_order: number;
  created_at: string;
};

function mapHighlight(row: HighlightRow): PlayerHighlightVideo {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    url: row.url,
    provider: row.provider,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

type PhotoRow = {
  id: string;
  user_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

function mapPhoto(row: PhotoRow): PlayerProfilePhoto {
  return {
    id: row.id,
    userId: row.user_id,
    storagePath: row.storage_path,
    caption: row.caption,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// --- profile queries --------------------------------------------------------

export async function getProfileByUserId(
  client: AnyClient,
  userId: string,
): Promise<PlayerProfile | null> {
  const { data, error } = await client
    .from('player_profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function getProfileByHandle(
  client: AnyClient,
  handle: string,
): Promise<{
  profile: PlayerProfile;
  highlights: PlayerHighlightVideo[];
  photos: PlayerProfilePhoto[];
} | null> {
  // Handles are stored lowercase (enforced by CHECK constraint). Use exact
  // equality on the lowercased value — ilike would treat underscores as
  // single-character wildcards and match too broadly.
  const { data: profileRow, error: profileErr } = await client
    .from('player_profiles')
    .select(PROFILE_COLUMNS)
    .eq('handle', handle.toLowerCase())
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profileRow) return null;

  const profile = mapProfile(profileRow as ProfileRow);
  const [highlights, photos] = await Promise.all([
    listHighlights(client, profile.userId),
    listPhotos(client, profile.userId),
  ]);
  return { profile, highlights, photos };
}

export type PlayerProfileUpdate = Partial<{
  handle: string;
  isPublic: boolean;
  headline: string | null;
  bio: string | null;
  profilePhotoUrl: string | null;
  heightInches: number | null;
  weightLbs: number | null;
  gpa: number | null;
  satScore: number | null;
  actScore: number | null;
  targetMajors: string[];
  sixtyYardDashSeconds: number | null;
  exitVelocityMph: number | null;
  pitchVelocityMph: number | null;
  popTimeSeconds: number | null;
  achievements: string[];
}>;

function toRow(update: PlayerProfileUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (update.handle !== undefined) row.handle = update.handle;
  if (update.isPublic !== undefined) row.is_public = update.isPublic;
  if (update.headline !== undefined) row.headline = update.headline;
  if (update.bio !== undefined) row.bio = update.bio;
  if (update.profilePhotoUrl !== undefined) row.profile_photo_url = update.profilePhotoUrl;
  if (update.heightInches !== undefined) row.height_inches = update.heightInches;
  if (update.weightLbs !== undefined) row.weight_lbs = update.weightLbs;
  if (update.gpa !== undefined) row.gpa = update.gpa;
  if (update.satScore !== undefined) row.sat_score = update.satScore;
  if (update.actScore !== undefined) row.act_score = update.actScore;
  if (update.targetMajors !== undefined) row.target_majors = update.targetMajors;
  if (update.sixtyYardDashSeconds !== undefined)
    row.sixty_yard_dash_seconds = update.sixtyYardDashSeconds;
  if (update.exitVelocityMph !== undefined) row.exit_velocity_mph = update.exitVelocityMph;
  if (update.pitchVelocityMph !== undefined) row.pitch_velocity_mph = update.pitchVelocityMph;
  if (update.popTimeSeconds !== undefined) row.pop_time_seconds = update.popTimeSeconds;
  if (update.achievements !== undefined) row.achievements = update.achievements;
  return row;
}

export async function upsertProfile(
  client: AnyClient,
  userId: string,
  update: PlayerProfileUpdate & { handle?: string },
): Promise<PlayerProfile> {
  // Check once whether a row already exists — on new profiles the caller must
  // provide a handle (INSERT without one violates NOT NULL); on existing rows
  // a partial update is allowed.
  const { data: existing } = await client
    .from('player_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing && !update.handle) {
    throw new Error('Handle is required to create a profile');
  }

  const payload = { ...toRow(update), user_id: userId } as Record<string, unknown>;
  if (!existing) payload.handle = update.handle;

  const { data, error } = await client
    .from('player_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

export async function isHandleAvailable(
  client: AnyClient,
  handle: string,
  excludeUserId?: string,
): Promise<boolean> {
  let query = client
    .from('player_profiles')
    .select('user_id')
    .eq('handle', handle.toLowerCase());
  if (excludeUserId) query = query.neq('user_id', excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data === null;
}

// --- highlights -------------------------------------------------------------

export async function listHighlights(
  client: AnyClient,
  userId: string,
): Promise<PlayerHighlightVideo[]> {
  const { data, error } = await client
    .from('player_highlight_videos')
    .select(HIGHLIGHT_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapHighlight(r as HighlightRow));
}

export async function addHighlight(
  client: AnyClient,
  userId: string,
  input: { title: string; url: string; provider: VideoProvider; sortOrder?: number },
): Promise<PlayerHighlightVideo> {
  const { data, error } = await client
    .from('player_highlight_videos')
    .insert({
      user_id: userId,
      title: input.title,
      url: input.url,
      provider: input.provider,
      sort_order: input.sortOrder ?? 0,
    })
    .select(HIGHLIGHT_COLUMNS)
    .single();
  if (error) throw error;
  return mapHighlight(data as HighlightRow);
}

export async function deleteHighlight(
  client: AnyClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('player_highlight_videos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// --- photos -----------------------------------------------------------------

export async function listPhotos(
  client: AnyClient,
  userId: string,
): Promise<PlayerProfilePhoto[]> {
  const { data, error } = await client
    .from('player_profile_photos')
    .select(PHOTO_COLUMNS)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapPhoto(r as PhotoRow));
}

export async function addPhoto(
  client: AnyClient,
  userId: string,
  input: { storagePath: string; caption?: string | null; sortOrder?: number },
): Promise<PlayerProfilePhoto> {
  const { data, error } = await client
    .from('player_profile_photos')
    .insert({
      user_id: userId,
      storage_path: input.storagePath,
      caption: input.caption ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select(PHOTO_COLUMNS)
    .single();
  if (error) throw error;
  return mapPhoto(data as PhotoRow);
}

export async function deletePhoto(
  client: AnyClient,
  userId: string,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('player_profile_photos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

// --- career stats aggregation ----------------------------------------------

/** Every players.id row linked to this user (across any team they've joined). */
export async function getPlayerIdsForUser(
  client: AnyClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('players')
    .select('id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

/**
 * Columns we read from game_events for stat derivations. Listed explicitly so
 * schema changes surface at the query boundary rather than silently flowing
 * into `event as any` at the call site.
 */
const GAME_EVENT_COLUMNS = [
  'id',
  'game_id',
  'sequence_number',
  'event_type',
  'player_id',
  'pitcher_id',
  'batter_id',
  'event_data',
  'timestamp',
].join(', ');

/**
 * Relevant game_events for all of a user's player rows across every team.
 * Filters events server-side by player_id/pitcher_id and event_type, then
 * loads only the games those events touched so this scales with one user's
 * activity rather than the whole database.
 */
export async function getCareerEventsForUser(
  client: AnyClient,
  userId: string,
): Promise<CareerEventRow[]> {
  const playerIds = await getPlayerIdsForUser(client, userId);
  if (playerIds.length === 0) return [];

  const playerIdsCsv = playerIds.join(',');
  const { data: events, error: eventsErr } = await client
    .from('game_events')
    .select(GAME_EVENT_COLUMNS)
    .in('event_type', RELEVANT_EVENT_TYPES as unknown as string[])
    .or(`player_id.in.(${playerIdsCsv}),pitcher_id.in.(${playerIdsCsv})`)
    .order('game_id', { ascending: true })
    .order('sequence_number', { ascending: true });
  if (eventsErr) throw eventsErr;

  type RawEvent = Record<string, unknown> & { game_id: string };
  const eventRows = ((events as unknown) as RawEvent[] | null) ?? [];
  if (eventRows.length === 0) return [];

  const gameIds = [...new Set(eventRows.map((e) => e.game_id))];
  const { data: games, error: gamesErr } = await client
    .from('games')
    .select('id, season_id, team_id, game_date, teams(id, name), seasons(id, name)')
    .in('id', gameIds);
  if (gamesErr) throw gamesErr;

  type GameJoinRow = {
    id: string;
    season_id: string | null;
    team_id: string | null;
    game_date: string | null;
    teams: { id: string; name: string } | { id: string; name: string }[] | null;
    seasons: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const gameIndex = new Map<
    string,
    {
      seasonId: string | null;
      seasonName: string | null;
      teamId: string | null;
      teamName: string | null;
      gameDate: string | null;
    }
  >();
  for (const g of (games as GameJoinRow[] | null) ?? []) {
    const team = Array.isArray(g.teams) ? g.teams[0] : g.teams;
    const season = Array.isArray(g.seasons) ? g.seasons[0] : g.seasons;
    gameIndex.set(g.id, {
      seasonId: g.season_id,
      seasonName: season?.name ?? null,
      teamId: g.team_id,
      teamName: team?.name ?? null,
      gameDate: g.game_date,
    });
  }

  const result: CareerEventRow[] = [];
  for (const e of eventRows) {
    const meta = gameIndex.get(e.game_id);
    if (!meta) continue;
    result.push({
      event: e,
      gameId: e.game_id,
      seasonId: meta.seasonId,
      seasonName: meta.seasonName,
      teamId: meta.teamId,
      teamName: meta.teamName,
      gameDate: meta.gameDate,
    });
  }
  return result;
}

export type CareerEventRow = {
  event: Record<string, unknown>;
  gameId: string;
  seasonId: string | null;
  seasonName: string | null;
  teamId: string | null;
  teamName: string | null;
  gameDate: string | null;
};

const RELEVANT_EVENT_TYPES = [
  'pitch_thrown',
  'hit',
  'out',
  'strikeout',
  'walk',
  'hit_by_pitch',
  'score',
  'pitching_change',
  'inning_change',
  'game_start',
  'double_play',
  'sacrifice_bunt',
  'sacrifice_fly',
  'field_error',
  'stolen_base',
  'caught_stealing',
  'baserunner_advance',
  'substitution',
  'game_reset',
  'pitch_reverted',
] as const;
