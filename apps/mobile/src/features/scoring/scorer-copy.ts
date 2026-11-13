/**
 * Wording for the scorer's sheets and strips that has to name a team. The
 * "+ Batter" button adds to whichever side is batting, so a sheet that only
 * said "their order" read as the opponent's even when it added to ours.
 */

/** "SHAKEDOWN Away" → "SHAKEDOWN Away's", "Cubs" → "Cubs'". */
export function possessive(teamName: string): string {
  const name = teamName.trim();
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** The Add batter / pitching change sheet's lead line and submit button. */
export function addPlayerSheetCopy(noun: 'batter' | 'pitcher', teamName: string): { lead: string; submit: string } {
  if (noun === 'pitcher') return { lead: `Takes the mound for ${teamName.trim()} now.`, submit: 'Put in to pitch' };
  const order = `${possessive(teamName)} order`;
  return { lead: `Goes to the end of ${order}.`, submit: `Add to ${order}` };
}

/**
 * The pitch strip's label while we bat, on phones: the other team's pitcher,
 * tappable to change them. Their pitcher has to be set before our first pitch
 * of a league game, or the pitches credit nobody on their side.
 */
export function theirPitcherStripLabel(pitcherName: string | null): { label: string; needsPitcher: boolean } {
  if (!pitcherName) return { label: 'Set their pitcher ▸', needsPitcher: true };
  return { label: `${pitcherName} ▸`, needsPitcher: false };
}
