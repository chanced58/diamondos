export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export type TrainingSection =
  | { kind: 'prose'; heading: string; body: string }
  | { kind: 'callout'; tone: 'info' | 'warning'; body: string }
  | { kind: 'list'; heading: string; items: string[] };

export interface TrainingModule {
  slug: string;
  title: string;
  estimatedMinutes: number;
  summary: string;
  sections: TrainingSection[];
  quiz: QuizQuestion[];
}

export interface TrainingProgress {
  completedSlugs: string[];
  isCertified: boolean;
  curriculumVersion: string;
}
