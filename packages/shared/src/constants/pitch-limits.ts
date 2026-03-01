import type { PitchComplianceRule } from '../types/compliance';

/** Built-in compliance rule presets. teamId is undefined for system-level presets. */
export const DEFAULT_COMPLIANCE_RULES: Omit<PitchComplianceRule, 'id' | 'createdAt'>[] = [
  {
    ruleName: 'NFHS (High School)',
    maxPitchesPerDay: 110,
    restDayThresholds: {
      '1': 0,
      '26': 1,
      '51': 2,
      '76': 3,
      '101': 4,
    },
    isActive: true,
  },
  {
    ruleName: 'Little League (Ages 13-16)',
    maxPitchesPerDay: 95,
    ageMin: 13,
    ageMax: 16,
    restDayThresholds: {
      '1': 0,
      '36': 1,
      '61': 2,
      '76': 3,
    },
    isActive: true,
  },
  {
    ruleName: 'Little League (Ages 11-12)',
    maxPitchesPerDay: 85,
    ageMin: 11,
    ageMax: 12,
    restDayThresholds: {
      '1': 0,
      '26': 1,
      '41': 2,
      '61': 3,
    },
    isActive: true,
  },
  {
    ruleName: 'NCAA',
    maxPitchesPerDay: 105,
    restDayThresholds: {
      '1': 0,
      '31': 1,
      '61': 2,
      '91': 3,
    },
    isActive: true,
  },
];
