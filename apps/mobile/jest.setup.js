// Counter for generating unique UUIDs in tests.
// Using a counter ensures deterministic but unique IDs per call.
// A constant UUID would cause collisions when tests record multiple events,
// resulting in business-logic failures instead of obvious mock issues.
let mockUuidCounter = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    const counter = mockUuidCounter++;
    // Format: 00000000-0000-4000-8000-000000000NNN (counter as last 12 hex digits)
    const hex = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  },
}));

beforeEach(() => {
  mockUuidCounter = 0;
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
