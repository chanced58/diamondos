export interface PitchComplianceRule {
  id: string;
  teamId?: string;
  ruleName: string;
  maxPitchesPerDay: number;
  /** Keys are min pitch thresholds (as strings), values are required rest days */
  restDayThresholds: Record<string, number>;
  ageMin?: number;
  ageMax?: number;
  appliesFrom?: string;
  appliesUntil?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PitchCountSummary {
  playerId: string;
  gameId: string;
  seasonId: string;
  gameDate: string;
  pitchCount: number;
  requiredRestDays?: number;
  canPitchNextDay?: boolean;
}

export interface PitchComplianceStatus {
  playerId: string;
  currentCount: number;
  maxAllowed: number;
  percentUsed: number;
  isAtWarning: boolean;  // >= 75%
  isAtLimit: boolean;    // >= 90%
  isOverLimit: boolean;
  requiredRestDays: number;
  eligibleDate: string;  // ISO date when player can pitch again
}
