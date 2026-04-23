import type { JSX } from 'react';

interface CountDotsProps {
  balls: number;
  strikes: number;
  outs: number;
  pinged?: 'b' | 's' | 'o' | null;
}

export function CountDots({ balls, strikes, outs, pinged }: CountDotsProps): JSX.Element {
  const make = (count: number, maxDots: number, className: string, pingKey: 'b' | 's' | 'o') =>
    Array.from({ length: maxDots }).map((_, index) => (
      <span
        key={`${pingKey}-${index}`}
        className={`d ${index < count ? className : ''} ${pinged === pingKey && index === count - 1 ? 'ping' : ''}`}
      />
    ));

  return (
    <div style={{ display: 'inline-flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Screen readers get a single concise count; the dot groups are decorative. */}
      <span className="sr-only" role="status">
        Count: {balls} balls, {strikes} strikes, {outs} outs
      </span>
      <div className="count-dots" aria-hidden="true">
        <span className="lbl">B</span>
        {make(balls, 4, 'on-b', 'b')}
      </div>
      <div className="count-dots" aria-hidden="true">
        <span className="lbl">S</span>
        {make(strikes, 3, 'on-s', 's')}
      </div>
      <div className="count-dots" aria-hidden="true">
        <span className="lbl">O</span>
        {make(outs, 3, 'on-o', 'o')}
      </div>
    </div>
  );
}
