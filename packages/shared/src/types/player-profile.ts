export type VideoProvider = 'youtube' | 'hudl' | 'vimeo' | 'other';

export interface PlayerProfile {
  userId: string;
  handle: string;
  isPublic: boolean;
  headline?: string | null;
  bio?: string | null;
  profilePhotoUrl?: string | null;
  heightInches?: number | null;
  weightLbs?: number | null;
  gpa?: number | null;
  satScore?: number | null;
  actScore?: number | null;
  targetMajors: string[];
  sixtyYardDashSeconds?: number | null;
  exitVelocityMph?: number | null;
  pitchVelocityMph?: number | null;
  popTimeSeconds?: number | null;
  achievements: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerHighlightVideo {
  id: string;
  userId: string;
  title: string;
  url: string;
  provider: VideoProvider;
  sortOrder: number;
  createdAt: string;
}

export interface PlayerProfilePhoto {
  id: string;
  userId: string;
  storagePath: string;
  caption?: string | null;
  sortOrder: number;
  createdAt: string;
}

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 32;
export const HANDLE_REGEX = new RegExp(
  `^[a-z0-9_-]{${HANDLE_MIN_LENGTH},${HANDLE_MAX_LENGTH}}$`,
);
