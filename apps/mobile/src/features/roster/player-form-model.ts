import {
  BatsThrows,
  POSITION_ABBREVIATIONS,
  PlayerPosition,
  rosterPlayerFieldsSchema,
  type RosterPlayer,
  type RosterPlayerFields,
} from '@baseball/shared';

/**
 * The add and edit player form, as the web's: text fields hold what the coach
 * typed, and `toPlayerFields` turns them into the shared contract, validated
 * with the same schema the server uses.
 */

export interface PlayerFormValues {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  primaryPosition: PlayerPosition | null;
  secondaryPositions: PlayerPosition[];
  bats: BatsThrows | null;
  throws: BatsThrows | null;
  graduationYear: string;
  email: string;
  phone: string;
}

export const emptyPlayerForm: PlayerFormValues = {
  firstName: '',
  lastName: '',
  jerseyNumber: '',
  primaryPosition: null,
  secondaryPositions: [],
  bats: null,
  throws: null,
  graduationYear: '',
  email: '',
  phone: '',
};

export const POSITION_OPTIONS = Object.values(PlayerPosition);
/** "SS — shortstop", as the web's position pickers read. */
export const POSITION_LABELS = Object.fromEntries(
  POSITION_OPTIONS.map((p) => [p, `${POSITION_ABBREVIATIONS[p] ?? p} — ${p.replace(/_/g, ' ')}`]),
) as Record<PlayerPosition, string>;
export const POSITION_SHORT_LABELS = Object.fromEntries(POSITION_OPTIONS.map((p) => [p, POSITION_ABBREVIATIONS[p] ?? p])) as Record<
  PlayerPosition,
  string
>;

export const HAND_OPTIONS = Object.values(BatsThrows);
export const HAND_LABELS: Record<BatsThrows, string> = {
  [BatsThrows.RIGHT]: 'Right',
  [BatsThrows.LEFT]: 'Left',
  [BatsThrows.SWITCH]: 'Switch',
};

const isPosition = (value: string | null): value is PlayerPosition => POSITION_OPTIONS.includes(value as PlayerPosition);
const isHand = (value: string | null): value is BatsThrows => HAND_OPTIONS.includes(value as BatsThrows);

/** The form filled in from a player, for editing. Unknown stored values read as unset. */
export function formFromPlayer(player: RosterPlayer): PlayerFormValues {
  return {
    firstName: player.firstName,
    lastName: player.lastName,
    jerseyNumber: player.jerseyNumber == null ? '' : String(player.jerseyNumber),
    primaryPosition: isPosition(player.primaryPosition) ? player.primaryPosition : null,
    secondaryPositions: player.secondaryPositions.filter(isPosition),
    bats: isHand(player.bats) ? player.bats : null,
    throws: isHand(player.throws) ? player.throws : null,
    graduationYear: player.graduationYear == null ? '' : String(player.graduationYear),
    email: player.email ?? '',
    phone: player.phone ?? '',
  };
}

/** A typed whole number, null when blank, NaN (rejected by the schema) when not a number. */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** The secondary positions, without the primary one (the web form leaves it out). */
export function secondaryWithoutPrimary(values: PlayerFormValues): PlayerPosition[] {
  return values.secondaryPositions.filter((p) => p !== values.primaryPosition);
}

/** The form as the shared contract, or the first problem with it. */
export function toPlayerFields(values: PlayerFormValues): { fields: RosterPlayerFields } | { error: string } {
  const parsed = rosterPlayerFieldsSchema.safeParse({
    firstName: values.firstName,
    lastName: values.lastName,
    jerseyNumber: wholeNumber(values.jerseyNumber),
    primaryPosition: values.primaryPosition,
    secondaryPositions: secondaryWithoutPrimary(values),
    bats: values.bats,
    throws: values.throws,
    graduationYear: wholeNumber(values.graduationYear),
    email: values.email,
    phone: values.phone,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue?.path[0] ?? '');
    if (field === 'jerseyNumber') return { error: 'Jersey numbers run 0–99.' };
    if (field === 'graduationYear') return { error: 'Enter a four-digit graduation year.' };
    return { error: issue?.message ?? 'Check the form.' };
  }
  return { fields: parsed.data };
}
