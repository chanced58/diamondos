import { z } from 'zod';
import { rosterPlayerIdInputSchema } from './roster-admin';

/**
 * Contracts for a player's documents (the web
 * /teams/:teamId/roster/:playerId/documents page): waivers, medical releases
 * and other compliance files, shared by its actions and the mobile
 * `/api/m/v1/teams/:teamId/players/:playerId/documents` routes. Roster
 * managers only.
 */

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD.');
const blankToNull = (value: unknown) => (value === '' || value === undefined ? null : value);
const trimmedOrNull = (value: unknown) => (typeof value === 'string' ? blankToNull(value.trim()) : blankToNull(value));

/** The largest file a coach can upload. */
export const PLAYER_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** PDFs and images (a photo of a signed form) are accepted. */
export function isAllowedDocumentContentType(contentType: string): boolean {
  return contentType === 'application/pdf' || contentType.startsWith('image/');
}

/** The file extension a document is stored under. */
export function documentExtension(contentType: string): string {
  switch (contentType) {
    case 'application/pdf':
      return 'pdf';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/heic':
      return 'heic';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

export const uploadPlayerDocumentInputSchema = rosterPlayerIdInputSchema
  .extend({
    documentType: z.string({ required_error: 'Pick a document type.' }).trim().min(1, 'Pick a document type.').max(100),
    title: z.string({ required_error: 'Add a title.' }).trim().min(1, 'Add a title.').max(120, 'Keep the title to 120 characters.'),
    signedOn: z.preprocess(blankToNull, ymd.nullable()),
    expiresOn: z.preprocess(blankToNull, ymd.nullable()),
    notes: z.preprocess(trimmedOrNull, z.string().max(500, 'Keep notes to 500 characters.').nullable()),
  })
  .refine((doc) => !doc.signedOn || !doc.expiresOn || doc.expiresOn >= doc.signedOn, {
    message: 'Expiration must be on or after the signed date.',
    path: ['expiresOn'],
  });
export type UploadPlayerDocumentInput = z.input<typeof uploadPlayerDocumentInputSchema>;

export const playerDocumentIdInputSchema = rosterPlayerIdInputSchema.extend({ documentId: uuid });
export type PlayerDocumentIdInput = z.infer<typeof playerDocumentIdInputSchema>;

export const playerDocumentTypeSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** Waivers and releases lapse, so an expiration date is recommended. */
  requiresExpiration: z.boolean(),
  /** One the team added, rather than the system list. */
  isTeamType: z.boolean(),
});
export type PlayerDocumentType = z.infer<typeof playerDocumentTypeSchema>;

export const playerDocumentSchema = z.object({
  id: z.string(),
  documentType: z.string(),
  title: z.string(),
  signedOn: z.string().nullable(),
  expiresOn: z.string().nullable(),
  notes: z.string().nullable(),
  uploadedAt: z.string(),
  /** False once a newer upload of the same type replaced it. */
  isCurrent: z.boolean(),
});
export type PlayerDocument = z.infer<typeof playerDocumentSchema>;

/** A player's documents, newest first, and the types a coach can upload. */
export const playerDocumentsResponseSchema = z.object({
  player: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    jerseyNumber: z.number().nullable(),
  }),
  documentTypes: z.array(playerDocumentTypeSchema),
  documents: z.array(playerDocumentSchema),
});
export type PlayerDocumentsResponse = z.infer<typeof playerDocumentsResponseSchema>;

export const playerDocumentWriteResponseSchema = z.object({ documentId: z.string() });
export type PlayerDocumentWriteResponse = z.infer<typeof playerDocumentWriteResponseSchema>;

/** A short-lived link to the file. */
export const playerDocumentUrlResponseSchema = z.object({ url: z.string().url() });
export type PlayerDocumentUrlResponse = z.infer<typeof playerDocumentUrlResponseSchema>;

export type PlayerDocumentStatusTone = 'default' | 'safe' | 'warning' | 'danger';

/** Days from `today` to `ymd`, both `YYYY-MM-DD`; negative once it has passed. */
function daysUntil(ymd: string, today: string): number {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(ymd) - toUtc(today)) / 86_400_000);
}

/**
 * A document's status as of `today` (the viewer's local day), as the web
 * table badges it: superseded, expired, expiring within 30 days, OK, or
 * current when it never expires.
 */
export function playerDocumentStatus(
  doc: Pick<PlayerDocument, 'expiresOn' | 'isCurrent'>,
  today: string,
): { label: string; tone: PlayerDocumentStatusTone } {
  if (!doc.isCurrent) return { label: 'Superseded', tone: 'default' };
  if (!doc.expiresOn) return { label: 'Current', tone: 'default' };
  const days = daysUntil(doc.expiresOn, today);
  if (days < 0) return { label: 'Expired', tone: 'danger' };
  if (days === 0) return { label: 'Expires today', tone: 'warning' };
  if (days <= 30) return { label: `Expires in ${days} ${days === 1 ? 'day' : 'days'}`, tone: 'warning' };
  return { label: 'OK', tone: 'safe' };
}
