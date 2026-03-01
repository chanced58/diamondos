import { Metadata } from 'next';
import { AddPlayerForm } from './AddPlayerForm';

export const metadata: Metadata = { title: 'Add Player' };

export default function AddPlayerPage({ params }: { params: { teamId: string } }) {
  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Add Player</h1>
      <p className="text-gray-500 mb-6">Add a new player to the roster.</p>
      <AddPlayerForm teamId={params.teamId} />
    </div>
  );
}
