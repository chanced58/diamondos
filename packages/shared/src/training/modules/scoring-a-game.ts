import type { TrainingModule } from '../types';

export const scoringAGame: TrainingModule = {
  slug: 'scoring-a-game',
  title: 'Scoring a Game',
  estimatedMinutes: 12,
  summary:
    'Pitch-by-pitch scoring, the immutable event log, substitutions, courtesy runners, and guest players.',
  sections: [
    {
      kind: 'prose',
      heading: 'Event sourcing in plain language',
      body:
        'Every pitch, out, run, and substitution is stored as a separate event. The score and the count are calculated by replaying those events. You never edit the score directly; you correct it by adding or undoing events.',
    },
    {
      kind: 'callout',
      tone: 'warning',
      body:
        'The game event log is append-only. You can undo your most recent event, but past events cannot be edited or deleted. Take a breath before tapping — accuracy now beats cleanup later.',
    },
    {
      kind: 'list',
      heading: 'The scoring screen',
      items: [
        'Pitch buttons (ball, strike, foul) drive the count.',
        'Outcome buttons (single, double, triple, HR, out, walk, K, etc.) end the at-bat.',
        'The On-Deck panel shows the next two batters.',
        'The Sub button opens substitutions — including courtesy runners for catcher/pitcher when the league allows them.',
        'The Guest Player button is enabled only if the league\'s scoring settings allow guest players.',
      ],
    },
    {
      kind: 'prose',
      heading: 'Courtesy runners and guest players',
      body:
        'A courtesy runner pinch-runs for the catcher or pitcher without burning a regular substitution slot — useful in HS and Little League. A guest player is someone not on your team\'s roster who appears in this one lineup; the league must allow guests, and the appearance is tracked separately for statistics.',
    },
    {
      kind: 'prose',
      heading: 'Sacrifice rule',
      body:
        'Neither a sacrifice fly nor a sacrifice bunt can be credited with two outs. The scoring UI enforces this — if you see the option missing in a 2-out scenario, that is by design.',
    },
  ],
  quiz: [
    {
      id: 'event-log-immutable',
      prompt: 'You incorrectly scored a single as a double three innings ago. What should you do?',
      options: [
        { id: 'a', label: 'Open the database and edit the row' },
        { id: 'b', label: 'Add a correction event from the scoring screen' },
        { id: 'c', label: 'Delete the past event and re-enter it' },
        { id: 'd', label: 'Restart the game' },
      ],
      correctOptionId: 'b',
      explanation:
        'Past events are immutable. The event log is corrected by appending, never by editing or deleting earlier rows.',
    },
    {
      id: 'courtesy-runner',
      prompt: 'A courtesy runner is most commonly used for which players?',
      options: [
        { id: 'a', label: 'The leadoff hitter and the cleanup hitter' },
        { id: 'b', label: 'The catcher and the pitcher' },
        { id: 'c', label: 'Any starter the coach wants to rest' },
        { id: 'd', label: 'Only players over 16 years old' },
      ],
      correctOptionId: 'b',
      explanation:
        'In HS and Little League, the courtesy runner exists specifically so the catcher and pitcher can stay fresh without burning a substitution.',
    },
    {
      id: 'sac-with-two-outs',
      prompt: 'There are two outs. The batter hits a fly ball and a runner scores from third. Is this a sacrifice fly?',
      options: [
        { id: 'a', label: 'Yes — a run scored on a fly ball' },
        { id: 'b', label: 'Yes, but only if it is the 7th inning or later' },
        { id: 'c', label: 'No — sacrifice flies and bunts cannot be credited with two outs' },
        { id: 'd', label: 'Only if the runner started moving before the pitch' },
      ],
      correctOptionId: 'c',
      explanation:
        'Sacrifice flies and sacrifice bunts both require fewer than two outs. The scoring engine will not surface the option in a 2-out scenario.',
    },
    {
      id: 'guest-gate',
      prompt: 'The Guest Player button is greyed out. Why?',
      options: [
        { id: 'a', label: 'You need to be signed in as head coach' },
        { id: 'b', label: 'The league has not enabled guest players in scoring settings' },
        { id: 'c', label: 'It only works during the regular season' },
        { id: 'd', label: 'It needs the game to be in progress' },
      ],
      correctOptionId: 'b',
      explanation:
        'Guest players are gated by the league\'s scoring settings. If the league has not enabled them, the button stays disabled.',
    },
  ],
};
