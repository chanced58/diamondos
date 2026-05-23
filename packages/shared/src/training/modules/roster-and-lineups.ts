import type { TrainingModule } from '../types';

export const rosterAndLineups: TrainingModule = {
  slug: 'roster-and-lineups',
  title: 'Roster & Lineups',
  estimatedMinutes: 8,
  summary:
    'Add players, build a season roster, and set up the batting order for a single game.',
  sections: [
    {
      kind: 'prose',
      heading: 'Roster vs lineup',
      body:
        'The roster is every player who could play for your team this season. The lineup is who actually plays in a specific game and in what batting order. The same player exists once on the roster but appears in many lineups across the season.',
    },
    {
      kind: 'list',
      heading: 'Adding a player',
      items: [
        'Open Roster from the sidebar.',
        'Click "Add player" and enter first name, last name, and jersey number.',
        'Choose a primary position — secondary positions can be added later.',
        'If the player has a parent account, link it from the player detail page.',
      ],
    },
    {
      kind: 'prose',
      heading: 'Building a lineup',
      body:
        'Open the game from Schedule and choose "Edit lineup". Drag players into the batting order and assign defensive positions. A standard lineup is nine players; expanded lineups (10 or 11) are allowed only if your league has enabled them in scoring settings.',
    },
    {
      kind: 'callout',
      tone: 'warning',
      body:
        'Jersey numbers must be unique within a roster. The roster page will block duplicates — do not work around this by appending letters; renumber instead.',
    },
  ],
  quiz: [
    {
      id: 'roster-vs-lineup',
      prompt: 'What is the difference between a roster and a lineup?',
      options: [
        { id: 'a', label: 'Roster is for practice, lineup is for games' },
        { id: 'b', label: 'Roster is the season-long player pool; lineup is the per-game batting order' },
        { id: 'c', label: 'They are the same thing' },
        { id: 'd', label: 'Roster is set by the league; lineup is set by the coach' },
      ],
      correctOptionId: 'b',
      explanation:
        'A player appears once on the roster but in many lineups. The lineup is the actual batting order for one specific game.',
    },
    {
      id: 'expanded-lineup',
      prompt: 'Your league allows a 10-player batting order. Where is that controlled?',
      options: [
        { id: 'a', label: 'Each coach configures it per game' },
        { id: 'b', label: 'In the league\'s scoring settings' },
        { id: 'c', label: 'In the player\'s profile' },
        { id: 'd', label: 'It is automatic when there are 10 players on the roster' },
      ],
      correctOptionId: 'b',
      explanation:
        'Expanded lineups are a league-level rule controlled in scoring settings, not per game or per player.',
    },
    {
      id: 'jersey-duplicate',
      prompt: 'Two players on your roster need to wear #7. What should you do?',
      options: [
        { id: 'a', label: 'Add the second as "7a"' },
        { id: 'b', label: 'Leave the jersey field blank for one of them' },
        { id: 'c', label: 'Renumber one of them — jerseys must be unique on a roster' },
        { id: 'd', label: 'Use a guest player entry instead' },
      ],
      correctOptionId: 'c',
      explanation:
        'Roster jerseys must be unique. Working around the validation will corrupt downstream reports — renumber one player.',
    },
  ],
};
