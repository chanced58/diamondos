import type { JSX } from 'react';

interface CountDotsProps {
  balls: number;
  strikes: number;
  outs: number;
  pinged?: 'b' | 's' | 'o' | null;
}

export function CountDots({ balls, strikes, outs, pinged }: CountDotsProps): JSX.Element {
  const make = (n: number, max: number, cls: string, pingKey: 'b' | 's' | 'o') =>
    Array.from({ length: max }).map((_, i) => (
      <span
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        className={`d ${i < n ? cls : ''} ${pinged === pingKey && i === n - 1 ? 'ping' : ''}`}
      />
    ));
  return (
    <div style={{ display: 'inline-flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="count-dots">
        <span className="lbl">B</span>
        {make(balls, 4, 'on-b', 'b')}
      </div>
      <div className="count-dots">
        <span className="lbl">S</span>
        {make(strikes, 3, 'on-s', 's')}
      </div>
      <div className="count-dots">
        <span className="lbl">O</span>
        {make(outs, 3, 'on-o', 'o')}
      </div>
    </div>
  );
}
