export enum UserRole {
  HEAD_COACH = 'head_coach',
  ASSISTANT_COACH = 'assistant_coach',
  SCOREKEEPER = 'scorekeeper',
  STAFF = 'staff',
  PLAYER = 'player',
  PARENT = 'parent',
  ATHLETIC_DIRECTOR = 'athletic_director',
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: UserRole;
  isActive: boolean;
  joinedAt: string;
  profile?: UserProfile;
}
