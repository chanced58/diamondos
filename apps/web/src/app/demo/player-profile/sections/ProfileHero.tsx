import type { JSX } from 'react';
import type { DemoPlayer } from '../mock-data';
import { formatHeight } from '../format';

interface Props {
  player: DemoPlayer;
}

export function ProfileHero({ player }: Props): JSX.Element {
  const name = `${player.firstName} ${player.lastName}`;
  const initials =
    `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
  const headline = `${player.position} · Class of ${player.gradYear} · ${player.school}`;

  const badges = [
    `#${player.jerseyNumber}`,
    `B/T: ${player.bats}/${player.throws}`,
    `${formatHeight(player.heightInches)}, ${player.weightLbs} lbs`,
    player.hometown,
  ];

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-8 flex items-center gap-6">
        <div
          className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold shrink-0"
          aria-hidden="true"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{name}</h1>
          <p className="text-base text-gray-600 mt-1">{headline}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                key={b}
                className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-2.5 py-1 rounded-full"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
