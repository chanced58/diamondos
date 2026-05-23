import type { TrainingModule } from '../types';

export const gettingStarted: TrainingModule = {
  slug: 'getting-started',
  title: 'Getting Started with DiamondOS',
  estimatedMinutes: 6,
  summary:
    'Orient yourself in the app: navigation, switching teams, and what each section is for.',
  sections: [
    {
      kind: 'prose',
      heading: 'Welcome',
      body:
        'DiamondOS is a baseball coaching platform built around five pillars: scoring, communication, practices, administration, and statistics. This module walks you through the layout so you know where each tool lives before you need it.',
    },
    {
      kind: 'list',
      heading: 'The left sidebar',
      items: [
        'Dashboard — your daily summary: next game, recent messages, urgent compliance flags.',
        'Schedule — every upcoming and completed game for the active team.',
        'Stats — team and player performance numbers across the season.',
        'Messages — channels with the team plus direct messages.',
        'Roster — the players on the team, organized by season.',
        'League — visible only if your team belongs to a league.',
        'Admin — billing, branding, and platform settings for your account.',
      ],
    },
    {
      kind: 'prose',
      heading: 'Switching teams',
      body:
        'If you coach more than one team, your active team is shown at the top of the sidebar. The active team controls what Schedule, Stats, Roster, and Messages display. Switch teams from the Admin → Teams page.',
    },
    {
      kind: 'callout',
      tone: 'info',
      body:
        'FERPA reminder: player data here is treated as educational record. Do not share screens that show full rosters in public settings, and use direct messages — never group channels — for anything tied to a specific minor.',
    },
  ],
  quiz: [
    {
      id: 'sidebar-purpose',
      prompt: 'Which sidebar item is the right place to find next week\'s games?',
      options: [
        { id: 'a', label: 'Dashboard' },
        { id: 'b', label: 'Schedule' },
        { id: 'c', label: 'Stats' },
        { id: 'd', label: 'Admin' },
      ],
      correctOptionId: 'b',
      explanation:
        'Schedule lists every upcoming and completed game for the active team. Dashboard only highlights the next one.',
    },
    {
      id: 'active-team',
      prompt: 'You coach two teams. How do most pages know which one to display?',
      options: [
        { id: 'a', label: 'They show all your teams at once' },
        { id: 'b', label: 'They use the active team shown at the top of the sidebar' },
        { id: 'c', label: 'They pick the team with the most recent game' },
        { id: 'd', label: 'They ask you on every page load' },
      ],
      correctOptionId: 'b',
      explanation:
        'The active team in the sidebar drives Schedule, Stats, Roster, and Messages. Switch it from Admin → Teams.',
    },
    {
      id: 'ferpa-basics',
      prompt:
        'A parent asks you to discuss their son\'s academic eligibility. What is the safest channel?',
      options: [
        { id: 'a', label: 'The team announcement channel' },
        { id: 'b', label: 'A topic channel only coaches can see' },
        { id: 'c', label: 'A direct message between you and the parent' },
        { id: 'd', label: 'A screenshot in the public dashboard' },
      ],
      correctOptionId: 'c',
      explanation:
        'Information tied to a specific minor belongs in a 1:1 direct message, not in a shared channel.',
    },
  ],
};
