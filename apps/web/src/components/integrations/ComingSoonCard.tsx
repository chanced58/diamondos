import type { JSX } from 'react';

interface Props {
  name: string;
  description: string;
}

export function ComingSoonCard({ name, description }: Props): JSX.Element {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 opacity-75">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-gray-900">{name}</h3>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          Coming soon
        </span>
      </div>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
