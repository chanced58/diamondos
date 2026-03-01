import { Metadata } from 'next';
import { CreateTeamForm } from '@/components/admin/CreateTeamForm';

export const metadata: Metadata = { title: 'Create Team' };

export default function CreateTeamPage() {
  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Create a team</h1>
      <p className="text-gray-500 mb-8">Set up your team to start managing your roster and games.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CreateTeamForm />
      </div>
    </div>
  );
}
