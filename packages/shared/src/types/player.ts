export enum PlayerPosition {
  PITCHER = 'pitcher',
  CATCHER = 'catcher',
  FIRST_BASE = 'first_base',
  SECOND_BASE = 'second_base',
  THIRD_BASE = 'third_base',
  SHORTSTOP = 'shortstop',
  INFIELD = 'infield',
  LEFT_FIELD = 'left_field',
  CENTER_FIELD = 'center_field',
  RIGHT_FIELD = 'right_field',
  OUTFIELD = 'outfield',
  DESIGNATED_HITTER = 'designated_hitter',
  UTILITY = 'utility',
}

export enum BatsThrows {
  RIGHT = 'right',
  LEFT = 'left',
  SWITCH = 'switch',
}

export interface Player {
  id: string;
  teamId: string;
  userId?: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: number;
  primaryPosition?: PlayerPosition;
  bats?: BatsThrows;
  throws?: BatsThrows;
  dateOfBirth?: string;
  graduationYear?: number;
  email?: string;
  phone?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
