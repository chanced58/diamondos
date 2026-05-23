import type { TrainingModule } from '../types';

export const pitchCountCompliance: TrainingModule = {
  slug: 'pitch-count-compliance',
  title: 'Pitch Count Compliance',
  estimatedMinutes: 9,
  summary:
    'NFHS, Little League, and NCAA pitch-count rules — and how the app keeps you on the right side of them.',
  sections: [
    {
      kind: 'prose',
      heading: 'Why this matters',
      body:
        'Pitch-count rules exist to protect young arms. They are not suggestions: a coach who exceeds the daily limit or skips required rest days can lose forfeits, eligibility, and trust. The Compliance page is where you confirm a pitcher is legal to use today.',
    },
    {
      kind: 'list',
      heading: 'The three rule sets the app supports',
      items: [
        'NFHS — state-by-state daily max plus required rest. Used by most US high schools.',
        'Little League — age-banded daily max plus mandatory rest days by pitch count threshold.',
        'NCAA — different model; primarily innings-pitched limits with intra-week tracking.',
      ],
    },
    {
      kind: 'prose',
      heading: 'How status is calculated',
      body:
        'The compliance engine reads the pitcher\'s pitch counts across recent games, applies the league\'s configured rule set, and returns one of: Available, Restricted (rest required), or Ineligible. Live counts during a game update the projection in real time.',
    },
    {
      kind: 'callout',
      tone: 'warning',
      body:
        'A pitcher who reaches the daily max mid-batter must finish that batter, then must be removed. The app shows a banner at the threshold; do not dismiss it without action.',
    },
  ],
  quiz: [
    {
      id: 'why-pitch-counts',
      prompt: 'What is the primary reason pitch-count rules exist?',
      options: [
        { id: 'a', label: 'To keep games shorter' },
        { id: 'b', label: 'To protect young pitchers\' arms from overuse' },
        { id: 'c', label: 'To make scoring easier' },
        { id: 'd', label: 'To prevent stealing signs' },
      ],
      correctOptionId: 'b',
      explanation:
        'Pitch-count rules are a youth-safety mechanism. Exceeding them risks injury and competitive penalties.',
    },
    {
      id: 'rulesets',
      prompt: 'Which rule sets does the compliance engine support out of the box?',
      options: [
        { id: 'a', label: 'NFHS only' },
        { id: 'b', label: 'NFHS, Little League, and NCAA' },
        { id: 'c', label: 'MLB and NCAA' },
        { id: 'd', label: 'Whatever the coach writes in a text field' },
      ],
      correctOptionId: 'b',
      explanation:
        'NFHS (HS), Little League, and NCAA are the three rule sets shipped. The league picks one in its setup.',
    },
    {
      id: 'mid-batter-threshold',
      prompt: 'Your pitcher hits the daily max while pitching to a batter. What is the rule?',
      options: [
        { id: 'a', label: 'Remove immediately, mid-batter' },
        { id: 'b', label: 'Finish the batter, then remove' },
        { id: 'c', label: 'Finish the inning, then remove' },
        { id: 'd', label: 'Ignore the threshold and finish the game' },
      ],
      correctOptionId: 'b',
      explanation:
        'Standard rule: finish the at-bat in progress, then the pitcher must come out. The app banners this at the threshold.',
    },
  ],
};
