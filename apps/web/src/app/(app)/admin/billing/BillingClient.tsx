'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSubscription, updateSubscription } from './actions';

type Subscription = {
  id: string;
  entityType: 'team' | 'league';
  entityName: string;
  entityId: string;
  tier: string;
  status: string;
  billingContactName: string | null;
  billingContactEmail: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  monthlyPriceCents: number | null;
  notes: string | null;
  zohoAccountId: string | null;
  createdAt: string;
};

type Entity = { id: string; name: string };

const TIERS = ['free', 'starter', 'pro'] as const;
const STATUSES = ['active', 'trial', 'past_due', 'cancelled', 'expired'] as const;

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-50 text-blue-700',
  pro: 'bg-purple-50 text-purple-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  trial: 'bg-blue-50 text-blue-700',
  past_due: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-400',
};

function formatCents(cents: number | null): string {
  if (cents == null) return '--';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface BillingClientProps {
  subscriptions: Subscription[];
  teams: Entity[];
  leagues: Entity[];
}

export function BillingClient({ subscriptions, teams, leagues }: BillingClientProps): JSX.Element {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEntity, setFilterEntity] = useState<string>('all');

  const filtered = subscriptions.filter((s) => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterEntity !== 'all' && s.entityType !== filterEntity) return false;
    return true;
  });

  // Summary stats
  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const trialCount = subscriptions.filter((s) => s.status === 'trial').length;
  const pastDueCount = subscriptions.filter((s) => s.status === 'past_due').length;
  const mrr = subscriptions
    .filter((s) => s.status === 'active' && s.monthlyPriceCents)
    .reduce((sum, s) => sum + (s.monthlyPriceCents ?? 0), 0);

  async function handleCreate(formData: FormData) {
    setError(null);
    setSaving(true);
    try {
      const result = await createSubscription(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setShowCreateForm(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(formData: FormData) {
    setError(null);
    setSaving(true);
    try {
      const result = await updateSubscription(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setEditingId(null);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trials</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{trialCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Past Due</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{pastDueCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">MRR</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{formatCents(mrr)}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <div>
            <label htmlFor="filter-status" className="sr-only">Filter by status</label>
            <select
              id="filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="all">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-entity" className="sr-only">Filter by entity type</label>
            <select
              id="filter-entity"
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="all">All Entities</option>
              <option value="team">Teams</option>
              <option value="league">Leagues</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setEditingId(null); }}
          className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
        >
          {showCreateForm ? 'Cancel' : 'New Subscription'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <SubscriptionForm
          onSubmit={handleCreate}
          teams={teams}
          leagues={leagues}
          isSaving={saving}
        />
      )}

      {/* Subscriptions Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No subscriptions found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-6 py-3">Entity</th>
                <th className="px-6 py-3">Tier</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Billing Contact</th>
                <th className="px-6 py-3">Price</th>
                <th className="px-6 py-3">Dates</th>
                <th className="px-6 py-3">Zoho</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((sub) => (
                editingId === sub.id ? (
                  <tr key={sub.id}>
                    <td colSpan={8} className="px-6 py-4">
                      <SubscriptionForm
                        onSubmit={handleUpdate}
                        teams={teams}
                        leagues={leagues}
                        isSaving={saving}
                        initial={sub}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{sub.entityName}</div>
                      <div className="text-xs text-gray-400 capitalize">{sub.entityType}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${TIER_COLORS[sub.tier] ?? ''}`}>
                        {sub.tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${STATUS_COLORS[sub.status] ?? ''}`}>
                        {sub.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-900">{sub.billingContactName ?? '--'}</div>
                      <div className="text-xs text-gray-400">{sub.billingContactEmail ?? ''}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {formatCents(sub.monthlyPriceCents)}/mo
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-500">
                        {sub.startsAt ? `Start: ${formatDate(sub.startsAt)}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {sub.endsAt ? `End: ${formatDate(sub.endsAt)}` : ''}
                      </div>
                      {sub.trialEndsAt && (
                        <div className="text-xs text-blue-500">
                          Trial ends: {formatDate(sub.trialEndsAt)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-gray-400">
                        {sub.zohoAccountId ? 'Linked' : 'Not linked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => { setEditingId(sub.id); setShowCreateForm(false); }}
                        className="text-xs font-medium text-brand-700 hover:text-brand-800"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SubscriptionForm({
  onSubmit,
  teams,
  leagues,
  isSaving,
  initial,
  onCancel,
}: {
  onSubmit: (formData: FormData) => void;
  teams: Entity[];
  leagues: Entity[];
  isSaving: boolean;
  initial?: Subscription;
  onCancel?: () => void;
}) {
  const [entityType, setEntityType] = useState<'team' | 'league'>(initial?.entityType ?? 'team');

  return (
    <form action={onSubmit} className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      {!initial && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sub-entity-type" className="block text-xs font-medium text-gray-500 mb-1">Entity Type</label>
            <select
              id="sub-entity-type"
              name="entityType"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as 'team' | 'league')}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="team">Team</option>
              <option value="league">League</option>
            </select>
          </div>
          <div>
            <label htmlFor="sub-entity-id" className="block text-xs font-medium text-gray-500 mb-1">
              {entityType === 'team' ? 'Team' : 'League'}
            </label>
            {entityType === 'team' ? (
              <select id="sub-entity-id" name="teamId" required className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">Select a team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <select id="sub-entity-id" name="leagueId" required className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
                <option value="">Select a league...</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="sub-tier" className="block text-xs font-medium text-gray-500 mb-1">Tier</label>
          <select id="sub-tier" name="tier" defaultValue={initial?.tier ?? 'free'} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
            {TIERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sub-status" className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select id="sub-status" name="status" defaultValue={initial?.status ?? 'trial'} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sub-price" className="block text-xs font-medium text-gray-500 mb-1">Monthly Price (cents)</label>
          <input
            id="sub-price"
            type="number"
            name="monthlyPriceCents"
            step="1"
            min="0"
            defaultValue={initial?.monthlyPriceCents ?? ''}
            placeholder="e.g. 2999 = $29.99"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sub-contact-name" className="block text-xs font-medium text-gray-500 mb-1">Billing Contact Name</label>
          <input
            id="sub-contact-name"
            type="text"
            name="billingContactName"
            defaultValue={initial?.billingContactName ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="sub-contact-email" className="block text-xs font-medium text-gray-500 mb-1">Billing Contact Email</label>
          <input
            id="sub-contact-email"
            type="email"
            name="billingContactEmail"
            defaultValue={initial?.billingContactEmail ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="sub-trial-starts" className="block text-xs font-medium text-gray-500 mb-1">Trial Starts</label>
          <input
            id="sub-trial-starts"
            type="date"
            name="trialStartsAt"
            defaultValue={initial?.trialStartsAt?.split('T')[0] ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="sub-trial-ends" className="block text-xs font-medium text-gray-500 mb-1">Trial Ends</label>
          <input
            id="sub-trial-ends"
            type="date"
            name="trialEndsAt"
            defaultValue={initial?.trialEndsAt?.split('T')[0] ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="sub-starts" className="block text-xs font-medium text-gray-500 mb-1">Starts At</label>
          <input
            id="sub-starts"
            type="date"
            name="startsAt"
            defaultValue={initial?.startsAt?.split('T')[0] ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="sub-ends" className="block text-xs font-medium text-gray-500 mb-1">Ends At</label>
          <input
            id="sub-ends"
            type="date"
            name="endsAt"
            defaultValue={initial?.endsAt?.split('T')[0] ?? ''}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label htmlFor="sub-notes" className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
        <textarea
          id="sub-notes"
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSaving}
          className="text-sm font-medium bg-brand-700 text-white px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? 'Saving...' : initial ? 'Update Subscription' : 'Create Subscription'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
