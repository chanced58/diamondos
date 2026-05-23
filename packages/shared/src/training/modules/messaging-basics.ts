import type { TrainingModule } from '../types';

export const messagingBasics: TrainingModule = {
  slug: 'messaging-basics',
  title: 'Messaging Basics',
  estimatedMinutes: 5,
  summary:
    'How channels work, when to use each one, and how RSVPs and push notifications fit in.',
  sections: [
    {
      kind: 'list',
      heading: 'Three channel types',
      items: [
        'Announcement — only coaches can post. Use for game changes, transportation, deadlines.',
        'Topic — threaded discussions visible to everyone in the channel. Use for ongoing conversations.',
        'Direct — one-to-one. Use for anything tied to a specific player or family.',
      ],
    },
    {
      kind: 'prose',
      heading: 'RSVPs',
      body:
        'Game and practice messages can include an RSVP control. Players and parents tap Yes/No/Maybe and the totals appear on the message. Use this before games to plan transportation and lineup choices.',
    },
    {
      kind: 'prose',
      heading: 'Push notifications',
      body:
        'Push notifications are sent automatically for announcement-channel posts and for RSVP reminders 24 hours before a game. Users control their own notification preferences in their profile.',
    },
    {
      kind: 'callout',
      tone: 'info',
      body:
        'Treat announcement channels like email blasts: high signal only. Coaches who over-post lose readership fast.',
    },
  ],
  quiz: [
    {
      id: 'channel-types',
      prompt: 'You need to tell the team that today\'s practice is moved to a new field. Which channel?',
      options: [
        { id: 'a', label: 'Announcement' },
        { id: 'b', label: 'Topic' },
        { id: 'c', label: 'Direct message to each player' },
        { id: 'd', label: 'A new league-wide channel' },
      ],
      correctOptionId: 'a',
      explanation:
        'Announcement channels are coach-only-post and reach every player and parent — exactly the use case for a logistics change.',
    },
    {
      id: 'rsvp-purpose',
      prompt: 'What is the RSVP control on a game message for?',
      options: [
        { id: 'a', label: 'Letting players pick their own batting order spot' },
        { id: 'b', label: 'Collecting Yes/No/Maybe attendance from players and parents' },
        { id: 'c', label: 'Replacing the team\'s official roster' },
        { id: 'd', label: 'Sending texts to the umpire crew' },
      ],
      correctOptionId: 'b',
      explanation:
        'RSVPs give you a fast head count before a game — used for transportation, lineup planning, and reminders.',
    },
    {
      id: 'private-conversation',
      prompt: 'A parent has a question about their child\'s playing time. Best channel?',
      options: [
        { id: 'a', label: 'Announcement channel' },
        { id: 'b', label: 'Topic channel for the season' },
        { id: 'c', label: 'A direct message between coach and parent' },
        { id: 'd', label: 'A public reply on social media' },
      ],
      correctOptionId: 'c',
      explanation:
        'Anything tied to one specific minor belongs in a direct message — never in a shared or public channel.',
    },
  ],
};
