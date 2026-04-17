'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { HANDLE_REGEX, type VideoProvider } from '@baseball/shared';
import {
  upsertProfile,
  addHighlight,
  deleteHighlight,
  addPhoto,
  deletePhoto,
  isHandleAvailable,
  type PlayerProfileUpdate,
} from '@baseball/database';
import { getPlayerPro, PLAYER_MEDIA_BUCKET } from '@/lib/player-pro';

const ALLOWED_IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function safeImageFileMeta(file: File): { ext: string; contentType: string } | null {
  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? '';
  const contentType = ALLOWED_IMAGE_EXTENSIONS[rawExt];
  if (!contentType) return null;
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  return { ext, contentType };
}

type ActionResult = { error: string } | { ok: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;
type UserCtx = { user: User; db: DbClient };

async function requireUser(): Promise<{ error: string } | UserCtx> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated — please sign in.' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { error: 'Server is not configured.' };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  return { user, db };
}

function parseNullableInt(raw: FormDataEntryValue | null): number | null | undefined {
  if (raw === null) return undefined;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function parseNullableFloat(raw: FormDataEntryValue | null): number | null | undefined {
  if (raw === null) return undefined;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function parseNullableString(raw: FormDataEntryValue | null): string | null | undefined {
  if (raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

function parseStringList(raw: FormDataEntryValue | null): string[] | undefined {
  if (raw === null) return undefined;
  const trimmed = String(raw);
  return trimmed
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Profile text updates (open to non-Pro users so they can stage content)
// ---------------------------------------------------------------------------

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  const handleRaw = formData.get('handle');
  const handle =
    typeof handleRaw === 'string' && handleRaw.trim().length > 0
      ? handleRaw.trim().toLowerCase()
      : null;

  const update: PlayerProfileUpdate & { handle?: string } = {
    headline: parseNullableString(formData.get('headline')),
    bio: parseNullableString(formData.get('bio')),
    heightInches: parseNullableInt(formData.get('heightInches')),
    weightLbs: parseNullableInt(formData.get('weightLbs')),
    gpa: parseNullableFloat(formData.get('gpa')),
    satScore: parseNullableInt(formData.get('satScore')),
    actScore: parseNullableInt(formData.get('actScore')),
    sixtyYardDashSeconds: parseNullableFloat(formData.get('sixtyYardDashSeconds')),
    exitVelocityMph: parseNullableInt(formData.get('exitVelocityMph')),
    pitchVelocityMph: parseNullableInt(formData.get('pitchVelocityMph')),
    popTimeSeconds: parseNullableFloat(formData.get('popTimeSeconds')),
    targetMajors: parseStringList(formData.get('targetMajors')),
    achievements: parseStringList(formData.get('achievements')),
  };

  if (handle) {
    if (!HANDLE_REGEX.test(handle)) {
      return { error: 'Handle must be 3–32 characters using lowercase letters, numbers, hyphen, or underscore.' };
    }
    const available = await isHandleAvailable(db, handle, user.id);
    if (!available) return { error: 'That handle is already taken.' };
    update.handle = handle;
  }

  try {
    await upsertProfile(db, user.id, update);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update profile.';
    return { error: message };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profile photo upload (Pro required)
// ---------------------------------------------------------------------------

export async function uploadProfilePhotoAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  const { isPro } = await getPlayerPro(user.id);
  if (!isPro) return { error: 'Photo uploads require a Pro subscription.' };

  const file = formData.get('photo') as File | null;
  if (!file || file.size === 0) return { error: 'No file provided.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'Photo must be under 5 MB.' };

  const meta = safeImageFileMeta(file);
  if (!meta) {
    return { error: 'Only JPG, PNG, GIF, or WebP images are allowed.' };
  }
  const storagePath = `${user.id}/profile.${meta.ext}`;

  const { error: uploadErr } = await db.storage
    .from(PLAYER_MEDIA_BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: meta.contentType });
  if (uploadErr) return { error: `Upload failed: ${uploadErr.message}` };

  const { data: { publicUrl } } = db.storage.from(PLAYER_MEDIA_BUCKET).getPublicUrl(storagePath);
  const cacheBusted = `${publicUrl}?v=${Date.now()}`;

  try {
    await upsertProfile(db, user.id, { profilePhotoUrl: cacheBusted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save photo.';
    return { error: message };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Publish toggle (Pro required to flip to public)
// ---------------------------------------------------------------------------

export async function togglePublicAction(
  makePublic: boolean,
): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  if (makePublic) {
    const { isPro } = await getPlayerPro(user.id);
    if (!isPro) return { error: 'Publishing publicly requires a Pro subscription.' };
  }

  try {
    await upsertProfile(db, user.id, { isPublic: makePublic });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update visibility.';
    return { error: message };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Highlights — add/delete
// ---------------------------------------------------------------------------

const VALID_PROVIDERS: VideoProvider[] = ['youtube', 'hudl', 'vimeo', 'other'];

export async function addHighlightAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  const { isPro } = await getPlayerPro(user.id);
  if (!isPro) return { error: 'Highlights require a Pro subscription.' };

  const title = String(formData.get('title') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  const providerRaw = String(formData.get('provider') ?? '').trim();

  if (!title) return { error: 'Title is required.' };
  if (!url) return { error: 'URL is required.' };

  // Validate URL scheme up front to prevent javascript:/data: vectors
  // that would later be rendered as iframe src or anchor href.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: 'Invalid URL.' };
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return { error: 'URL must use http or https.' };
  }

  let provider: VideoProvider = 'other';
  if (VALID_PROVIDERS.includes(providerRaw as VideoProvider)) {
    provider = providerRaw as VideoProvider;
  } else {
    // Best-effort detect from URL host
    const host = parsedUrl.hostname.toLowerCase();
    if (host.endsWith('youtube.com') || host === 'youtu.be') provider = 'youtube';
    else if (host.endsWith('hudl.com')) provider = 'hudl';
    else if (host.endsWith('vimeo.com')) provider = 'vimeo';
  }

  try {
    await addHighlight(db, user.id, { title, url, provider });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add highlight.' };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

export async function deleteHighlightAction(id: string): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  try {
    await deleteHighlight(db, user.id, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete highlight.' };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Gallery photos — upload/delete
// ---------------------------------------------------------------------------

export async function uploadGalleryPhotoAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  const { isPro } = await getPlayerPro(user.id);
  if (!isPro) return { error: 'Gallery uploads require a Pro subscription.' };

  const file = formData.get('photo') as File | null;
  const caption = parseNullableString(formData.get('caption')) ?? null;

  if (!file || file.size === 0) return { error: 'No file provided.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'Photo must be under 5 MB.' };

  const meta = safeImageFileMeta(file);
  if (!meta) {
    return { error: 'Only JPG, PNG, GIF, or WebP images are allowed.' };
  }
  const storagePath = `${user.id}/gallery/${Date.now()}.${meta.ext}`;

  const { error: uploadErr } = await db.storage
    .from(PLAYER_MEDIA_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: meta.contentType });
  if (uploadErr) return { error: `Upload failed: ${uploadErr.message}` };

  try {
    await addPhoto(db, user.id, { storagePath, caption });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save photo.' };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}

export async function deleteGalleryPhotoAction(id: string): Promise<ActionResult> {
  const ctx = await requireUser();
  if ('error' in ctx) return ctx;
  const { user, db } = ctx;

  // Look up storage path so we can remove the object too
  const { data: row } = await db
    .from('player_profile_photos')
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (row?.storage_path) {
    const { error: removeErr } = await db.storage
      .from(PLAYER_MEDIA_BUCKET)
      .remove([row.storage_path]);
    // Log but proceed — leaving an orphan storage object is cheaper than a
    // stale DB row pointing at a file the user thinks they deleted.
    if (removeErr) {
      console.error('[players/me] gallery object removal failed:', removeErr.message);
    }
  }

  try {
    await deletePhoto(db, user.id, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete photo.' };
  }

  revalidatePath('/players/me');
  revalidatePath('/p/[handle]', 'page');
  return { ok: true };
}
