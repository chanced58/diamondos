import { publicDisplayName, memberDisplayName } from '../player-display-name';

describe('player display name', () => {
  const p = { firstName: 'Alex', lastName: 'Ramirez' };
  it('member view shows full name', () => { expect(memberDisplayName(p)).toBe('Alex Ramirez'); });
  it('public view shows first name + last initial', () => { expect(publicDisplayName(p)).toBe('Alex R.'); });
  it('handles empty last name gracefully', () => { expect(publicDisplayName({ firstName: 'Sam', lastName: '' })).toBe('Sam'); });
});
