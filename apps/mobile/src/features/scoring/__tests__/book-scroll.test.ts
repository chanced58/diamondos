import { hasMoreBelow, MORE_BELOW_THRESHOLD } from '../book-scroll';

describe('hasMoreBelow', () => {
  it('should show the hint when the book is taller than its viewport', () => {
    expect(hasMoreBelow({ viewportHeight: 200, contentHeight: 520, offsetY: 0 })).toBe(true);
  });

  it('should hide the hint once the scorer has scrolled to the end', () => {
    expect(hasMoreBelow({ viewportHeight: 200, contentHeight: 520, offsetY: 320 })).toBe(false);
  });

  it('should ignore a sliver of hidden content', () => {
    expect(hasMoreBelow({ viewportHeight: 200, contentHeight: 200 + MORE_BELOW_THRESHOLD, offsetY: 0 })).toBe(false);
  });

  it('should show nothing before the viewport has been measured', () => {
    expect(hasMoreBelow({ viewportHeight: 0, contentHeight: 520, offsetY: 0 })).toBe(false);
  });

  it('should show nothing when everything fits', () => {
    expect(hasMoreBelow({ viewportHeight: 400, contentHeight: 380, offsetY: 0 })).toBe(false);
  });
});
