'use client';
import { useState, useTransition } from 'react';
import type { JSX } from 'react';
import { deletePlayerDocumentAction, getDocumentDownloadUrl } from './actions';

type DocType = { slug: string; name: string };
type DocumentRow = {
  id: string;
  document_type: string;
  title: string;
  signed_on: string | null;
  expires_on: string | null;
  notes: string | null;
  uploaded_at: string;
  is_current: boolean;
};

function expirationBadge(expires_on: string | null, today: string): JSX.Element | null {
  if (!expires_on) return null;
  const diffDays = Math.floor((new Date(expires_on).getTime() - new Date(today).getTime()) / 86_400_000);
  if (diffDays < 0) {
    return <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">Expired</span>;
  }
  if (diffDays <= 30) {
    return (
      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
        Expires {diffDays}d
      </span>
    );
  }
  return <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">OK</span>;
}

export function DocumentsTable({
  teamId,
  playerId,
  documents,
  docTypes,
  today,
}: {
  teamId: string;
  playerId: string;
  documents: DocumentRow[];
  docTypes: DocType[];
  today: string;
}): JSX.Element {
  const typeLabel = (slug: string) => docTypes.find((t) => t.slug === slug)?.name ?? slug;
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDownload(docId: string) {
    const url = await getDocumentDownloadUrl(docId, teamId);
    if (url) window.open(url, '_blank');
  }

  function handleDelete(docId: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    const fd = new FormData();
    fd.append('teamId', teamId);
    fd.append('playerId', playerId);
    fd.append('docId', docId);
    setDeleteError(null);
    startTransition(() => {
      deletePlayerDocumentAction(null, fd).then((result) => {
        if (result) setDeleteError(result);
      });
    });
  }

  if (documents.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
        <p className="text-gray-500 text-sm">No documents uploaded yet.</p>
      </div>
    );
  }

  return (
    <div>
      {deleteError && <p className="text-sm text-red-600 mb-2">{deleteError}</p>}
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Title</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Type</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Signed</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Expires</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Status</th>
            <th className="text-right font-medium text-gray-700 px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr
              key={d.id}
              className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                d.is_current ? '' : 'text-gray-400'
              }`}
            >
              <td className="px-4 py-2.5 font-medium">{d.title}</td>
              <td className="px-4 py-2.5">{typeLabel(d.document_type)}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.signed_on ?? '—'}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.expires_on ?? '—'}</td>
              <td className="px-4 py-2.5">
                {d.is_current
                  ? expirationBadge(d.expires_on, today) ?? (
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        Current
                      </span>
                    )
                  : <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Superseded</span>}
              </td>
              <td className="px-4 py-2.5 text-right space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownload(d.id)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Download
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(d.id)}
                  className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
