export type StatTier = 'youth' | 'high_school' | 'college';

export interface Team {
  id: string;
  name: string;
  organization?: string;
  logoUrl?: string;
  stateCode?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  teamId: string;
  name: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}
